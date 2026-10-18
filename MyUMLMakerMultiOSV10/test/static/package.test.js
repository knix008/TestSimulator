// Packaging checks without building: icons (3D look, transparent border, glowing
// top-left, centred), the .myuml / .mumlt document icons and their registration,
// installer languages, data/reinstall hooks, docs in the installer, title bar,
// several copies at once and the build commands.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file));
const json = (file) => JSON.parse(read(file).toString());
const conf = json('src-tauri/tauri.conf.json');
const pkg = json('package.json');

/** Minimal PNG decoder (8-bit RGBA / RGB, non-interlaced) → { width, height, pixels }. */
function decodePng(buffer) {
  assert.equal(buffer.subarray(1, 4).toString(), 'PNG');
  let offset = 8;
  let width; let height; let colorType; let bitDepth;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString();
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
  }
  assert.equal(bitDepth, 8);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : null;
  assert.ok(channels, `unsupported PNG colour type ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = previous[x];
      const c = x >= channels ? previous[x - channels] : 0;
      const p = a + b - c;
      const predictor = filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1
        : filter === 4 ? (Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c) : 0;
      line[x] = (line[x] + predictor) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      pixels[(y * width + x) * 4] = line[x * channels];
      pixels[(y * width + x) * 4 + 1] = line[x * channels + 1];
      pixels[(y * width + x) * 4 + 2] = line[x * channels + 2];
      pixels[(y * width + x) * 4 + 3] = channels === 4 ? line[x * channels + 3] : 255;
    }
    previous = line;
  }
  return { width, height, pixels };
}

/** Average luminance and alpha over a box (fractions of the image). */
function region(image, x0, y0, x1, y1) {
  let light = 0; let alpha = 0; let count = 0;
  for (let y = Math.floor(y0 * image.height); y < y1 * image.height; y++) {
    for (let x = Math.floor(x0 * image.width); x < x1 * image.width; x++) {
      const i = (y * image.width + x) * 4;
      const a = image.pixels[i + 3];
      alpha += a;
      if (a > 200) light += 0.2126 * image.pixels[i] + 0.7152 * image.pixels[i + 1] + 0.0722 * image.pixels[i + 2];
      count += 1;
    }
  }
  return { alpha: alpha / count, light: light / Math.max(1, count) };
}

function checkIcon(file) {
  const image = decodePng(read(file));
  assert.equal(image.width, image.height, 'square');
  // Transparent border: the corners and the outer edge are fully transparent.
  for (const [x, y] of [[0, 0], [image.width - 1, 0], [0, image.height - 1], [image.width - 1, image.height - 1]]) {
    assert.equal(image.pixels[(y * image.width + x) * 4 + 3], 0, `${file}: corner (${x},${y}) is transparent`);
  }
  assert.ok(region(image, 0, 0, 1, 0.04).alpha < 5, `${file}: top edge transparent`);
  assert.ok(region(image, 0, 0, 0.04, 1).alpha < 5, `${file}: left edge transparent`);
  // Glowing top-left: much brighter than the bottom-right of the face.
  const topLeft = region(image, 0.16, 0.12, 0.34, 0.3);
  const bottomRight = region(image, 0.66, 0.66, 0.84, 0.84);
  assert.ok(topLeft.light > bottomRight.light + 40, `${file}: top-left (${topLeft.light.toFixed(0)}) glows over bottom-right (${bottomRight.light.toFixed(0)})`);
  // 3D: a soft, semi-transparent drop shadow under the object, and depth shading on the body.
  let soft = 0;
  for (let y = Math.floor(image.height * 0.88); y < image.height * 0.99; y++) {
    for (let x = Math.floor(image.width * 0.3); x < image.width * 0.7; x++) {
      const a = image.pixels[(y * image.width + x) * 4 + 3];
      if (a > 8 && a < 200) soft += 1;
    }
  }
  assert.ok(soft > image.width * 2, `${file}: soft drop shadow (${soft} semi-transparent pixels)`);
  return image;
}

function icoSizes(file) {
  const buffer = read(file);
  assert.equal(buffer.readUInt16LE(2), 1, 'ICO type');
  const count = buffer.readUInt16LE(4);
  return Array.from({ length: count }, (_, i) => buffer[6 + i * 16] || 256);
}

/** Bounding box of the clearly opaque pixels (alpha > 200) as fractions of the image. */
function opaqueBox(image) {
  let left = image.width; let right = 0; let top = image.height; let bottom = 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.pixels[(y * image.width + x) * 4 + 3] > 200) {
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
  }
  return { left: left / image.width, right: (right + 1) / image.width, top: top / image.height, bottom: (bottom + 1) / image.height };
}

test('app icon: 3D tile, transparent border, glowing top-left, in the exact centre', () => {
  for (const file of ['assets/icon.png', 'src-tauri/icons/icon.png']) {
    const image = checkIcon(file);
    const box = opaqueBox(image);
    const cx = (box.left + box.right) / 2;
    const cy = (box.top + box.bottom) / 2;
    assert.ok(Math.abs(cx - 0.5) < 0.012, `${file}: centred horizontally (${cx.toFixed(3)})`);
    assert.ok(Math.abs(cy - 0.5) < 0.012, `${file}: centred vertically (${cy.toFixed(3)})`);
    assert.ok(box.left > 0.05 && box.top > 0.05 && box.right < 0.95 && box.bottom < 0.95, `${file}: transparent margin all round`);
  }
});

test('document icons (.myuml project, .mumlt template): same style, their own pictures, centred', () => {
  for (const name of ['project', 'template']) {
    const image = checkIcon(`assets/${name}.png`);
    const box = opaqueBox(image);
    assert.ok(Math.abs((box.left + box.right) / 2 - 0.5) < 0.02, `${name}: centred horizontally`);
    assert.notDeepEqual(read(`assets/${name}.png`), read('assets/icon.png'));
    assert.equal(decodePng(read(`src-tauri/icons/${name}.png`)).width, 256);
  }
  assert.notDeepEqual(read('assets/project.png'), read('assets/template.png'));
});

test('ICO files carry every size Windows needs', () => {
  for (const file of ['src-tauri/icons/icon.ico', 'src-tauri/icons/project.ico', 'src-tauri/icons/template.ico']) {
    const sizes = icoSizes(file);
    for (const size of [16, 32, 48, 256]) assert.ok(sizes.includes(size), `${file} has ${size}px (${sizes})`);
  }
  for (const file of ['src-tauri/icons/icon.icns', 'src-tauri/icons/project.icns', 'src-tauri/icons/template.icns']) assert.equal(read(file).subarray(0, 4).toString(), 'icns');
});

test('installer, program and running window all use the same icon', () => {
  assert.equal(conf.bundle.windows.nsis.installerIcon, 'icons/icon.ico');
  assert.ok(conf.bundle.icon.includes('icons/icon.ico') && conf.bundle.icon.includes('icons/icon.icns'));
  assert.deepEqual(read('assets/icon.ico'), read('src-tauri/icons/icon.ico'));
  assert.ok(fs.existsSync(path.join(root, 'public', 'icon.png')), 'web favicon');
  assert.deepEqual(read('public/icon.png'), read('assets/icon.png'));
  for (const bmp of ['installerHeader.bmp', 'installerSidebar.bmp']) assert.equal(read(`src-tauri/windows/${bmp}`).subarray(0, 2).toString(), 'BM');
});

for (const [ext, name, iconName, mime] of [['myuml', 'MyUMLMaker.Project', 'project', 'application-x-myumlmaker'], ['mumlt', 'MyUMLMaker.Template', 'template', 'application-x-myumlmaker-template']]) {
  test(`.${ext} is registered with its own icon on every OS`, () => {
    const association = conf.bundle.fileAssociations.find((item) => item.ext.includes(ext));
    assert.ok(association, 'file association');
    assert.equal(association.name, name);
    assert.ok(conf.bundle.resources[`icons/${iconName}.ico`], `${iconName}.ico installed`);
    const hooks = read('src-tauri/windows/hooks.nsh').toString();
    assert.ok(hooks.includes(`Software\\Classes\\${name}\\DefaultIcon" "" "$INSTDIR\\${iconName}.ico"`), 'Windows: DefaultIcon');
    const plist = read('src-tauri/Info.plist').toString();
    assert.match(plist, new RegExp(`<string>${ext}</string>`));
    assert.match(plist, new RegExp(`CFBundleTypeIconFile</key>\\s*<string>${iconName}\\.icns</string>`), 'macOS: document icon');
    const xml = read('src-tauri/linux/myumlmaker.xml').toString();
    assert.match(xml, new RegExp(`glob pattern="\\*\\.${ext}"`));
    assert.equal(conf.bundle.linux.deb.files[`/usr/share/icons/hicolor/256x256/mimetypes/${mime}.png`], `icons/${iconName}.png`, 'Linux: mime icon');
    assert.equal(conf.bundle.linux.rpm.files[`/usr/share/icons/hicolor/256x256/mimetypes/${mime}.png`], `icons/${iconName}.png`);
  });
}

test('installer languages: Korean and English, user selectable', () => {
  const nsis = conf.bundle.windows.nsis;
  assert.deepEqual(nsis.languages, ['Korean', 'English']);
  assert.equal(nsis.displayLanguageSelector, true);
});

test('installer hooks: one installation only (an old one removed completely), the user is asked whether to delete the user data', () => {
  const buffer = read('src-tauri/windows/hooks.nsh');
  assert.deepEqual([...buffer.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 BOM (NSIS reads Korean correctly)');
  const hooks = buffer.toString();
  const fn = (name) => new RegExp(`\\nFunction ${name}\\n([\\s\\S]*?)\\nFunctionEnd`).exec(hooks)?.[1] ?? assert.fail(`Function ${name}`);
  const macro = (name) => new RegExp(`!macro ${name}\\n([\\s\\S]*?)\\n!macroend`).exec(hooks)?.[1] ?? assert.fail(`!macro ${name}`);
  // The data folders are those of the real identifier.
  assert.ok(hooks.includes(`"$APPDATA\\${conf.identifier}"`) && hooks.includes(`"$LOCALAPPDATA\\${conf.identifier}"`), 'the data folders of tauri.conf.json identifier');
  // Asked before the first page (MUI GUI init), in the installer language.
  assert.match(hooks, /!define MUI_CUSTOMFUNCTION_GUIINIT MumGuiInit/);
  for (const lang of ['1042', '1033']) for (const name of ['MumAskData', 'MumOldFound', 'MumRunning']) assert.match(hooks, new RegExp(`LangString ${name} ${lang} "`), `${name} for ${lang}`);
  assert.ok(hooks.includes('LangString MumAskData 1042 "이전에 사용하던 사용자 데이터(설정, 최근 파일·폴더, 열린 프로젝트 목록, 데이터베이스 연결, 배경 그림, 튜토리얼 기록, 창 위치)를 삭제할까요?'), 'the Korean question');
  const gui = fn('MumGuiInit');
  assert.match(gui, /MessageBox MB_YESNOCANCEL\|MB_ICONQUESTION\|MB_DEFBUTTON2 "\$3"/, 'Yes / No (default) / Cancel');
  assert.match(gui, /"\$MumOldUser\$MumOldMachine" != ""\s*\$\{OrIf\} \$2 == 1\s*MessageBox/, 'asked only with a previous installation or existing user data');
  assert.ok(gui.indexOf('MumRunningApps') > gui.indexOf('MB_YESNOCANCEL') && gui.indexOf('Call MumRemoveOld', gui.indexOf('MB_YESNOCANCEL')) > gui.indexOf('"close"'), 'ask, then close the running windows, then remove the old copy');
  // Functions in the hooks file are compiled before the template's variables and defines exist.
  for (const name of [...hooks.matchAll(/\nFunction (\w+)\n/g)].map((m) => m[1])) {
    assert.doesNotMatch(fn(name), /\$(PassiveMode|UpdateMode|NoShortcutMode|DeleteAppDataCheckboxState)\b|\$\{(BUNDLEID|PRODUCTNAME|MAINBINARYNAME|UNINSTKEY|MANUPRODUCTKEY|INSTALLMODE)\}/, `Function ${name} uses only its own defines and variables`);
  }
  // Old copies: current-user and per-machine, closed (every running copy), uninstalled in place keeping data, folder deleted.
  assert.match(fn('MumFindOld'), /MUM_FIND_IN HKCU[\s\S]*MUM_FIND_IN HKLM/);
  assert.match(fn('MumRemoveOld'), /ExecWait '"\$MumOldUser\\uninstall\.exe" \/S \/UPDATE _\?=\$MumOldUser'/);
  assert.match(fn('MumSweep'), /RMDir \/r "\$0"/, 'old folder deleted');
  assert.match(fn('MumRunningApps'), /RmGetList[\s\S]*RmShutdown/, 'all running copies counted and closed');
  // Silent installs: no question, data kept, old copy still removed.
  assert.match(macro('NSIS_HOOK_PREINSTALL'), /\$MumDone != 1[\s\S]*Call MumFindOld[\s\S]*Call MumRemoveOld/);
  assert.match(fn('MumWipeData'), /RMDir \/r "\$\{MUM_ROAMING\}"\s*RMDir \/r "\$\{MUM_LOCAL\}"/);
  const post = macro('NSIS_HOOK_POSTINSTALL');
  assert.match(post, /\$\{If\} \$MumWipe == 1\s*;[^\n]*\n\s*Call MumWipeData\s*\$\{Else\}/, 'Yes: the data is deleted');
  // No: preferences reset at the next start (marker), window place forgotten.
  assert.match(post, /Delete "\$APPDATA\\\$\{BUNDLEID\}\\window-state\.json"/, 'the window place is forgotten');
  assert.match(post, /FileOpen \$R9 "\$APPDATA\\\$\{BUNDLEID\}\\install-reset" w/, 'marker for the app: reset the preferences');
});

test('the documents and samples are installed with the program', () => {
  const resources = conf.bundle.resources;
  for (const doc of ['docs/UsersGuide.html', 'docs/UsersGuide.en.html', 'docs/Tutorial.html', 'docs/Tutorial.en.html', 'docs/tutorial/images/', 'samples/']) {
    assert.ok(Object.values(resources).includes(doc), `${doc} is installed`);
  }
  // The Markdown copies duplicated the HTML guide and linked to files that are not installed.
  for (const doc of ['docs/UsersGuide.md', 'docs/README.md']) assert.ok(!Object.values(resources).includes(doc), `${doc} is not installed (the HTML pages are the documents)`);
  for (const source of Object.keys(resources)) assert.ok(fs.existsSync(path.join(root, 'src-tauri', source)), `${source} exists`);
  assert.match(read('src-tauri/windows/hooks.nsh').toString(), /CreateShortCut .*UsersGuide\.html/, 'Start-menu shortcut to the guide');
});

test('every help entry opens an installed document, and the installed documents link only to installed files', () => {
  const installed = Object.values(conf.bundle.resources).map((dst) => dst.replace(/\/$/, ''));
  const isInstalled = (target) => installed.some((dst) => target === dst || target.startsWith(`${dst}/`));
  // Documents the app opens: Help › User's guide (ko/en) and the in-app tutorial document (ko/en).
  const app = read('src/app.js').toString();
  const opened = app.split('\n').filter((line) => line.includes('openDocument(')).flatMap((line) => [...line.matchAll(/'([\w.]+\.html)'/g)].map((m) => m[1]));
  for (const [, file] of app.matchAll(/READER_DOCS = \{[^}]*?file: '(\w+)'/g)) opened.push(`${file}.html`, `${file}.en.html`);
  assert.ok(opened.length >= 4, `documents opened by the app: ${opened.join(', ')}`);
  for (const name of opened) assert.ok(isInstalled(`docs/${name}`), `docs/${name} (opened from Help) is installed`);
  // Links and pictures inside the installed pages.
  for (const page of installed.filter((dst) => dst.startsWith('docs/') && dst.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(root, page)).toString();
    for (const match of html.matchAll(/\s(?:href|src)="([^"#][^"]*)"/g)) {
      if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(match[1])) continue;
      const target = path.posix.normalize(`docs/${decodeURI(match[1].split('#')[0])}`);
      assert.ok(isInstalled(target), `${page} links to ${target}, which is not installed`);
    }
  }
});

test('title bar: program name and version', () => {
  const lib = read('src-tauri/src/lib.rs').toString();
  assert.match(lib, /format!\("MyUMLMaker v\{\}", info\.version\)/);
  assert.equal(conf.version, '../package.json');
  assert.equal(conf.productName, 'MyUMLMaker');
  assert.match(read('src-tauri/Cargo.toml').toString(), new RegExp(`version = "${pkg.version.replace(/\./g, '\\.')}"`), 'Cargo version matches package.json');
  assert.match(read('src/popup.js').toString(), /— MyUMLMaker v\$\{VERSION\}/, 'popup windows show the name and version too');
});

test('a second start opens a second window (several copies may run)', () => {
  const lib = read('src-tauri/src/lib.rs').toString();
  assert.doesNotMatch(lib, /report_already_running|std::process::exit\(3\)/, 'no "already running" refusal');
  assert.match(lib, /instance::register\(\)/, 'each copy registers itself (to know whether it is the first)');
  assert.match(lib, /\.maximized\(state\.maximized && others == 0\)/, 'a later copy is not maximized over the first');
  assert.match(lib, /if others > 0 \{\s*offset_window\(&main, others\);/, 'a later copy opens its window offset');
  assert.match(lib, /instance_info,/, 'the page can ask whether it is the first copy');
  const instance = read('src-tauri/src/instance.rs').toString();
  assert.doesNotMatch(instance, /이미 실행 중|already running/);
  // Every webview uses the same browser arguments, so all copies share one WebView2 profile.
  assert.equal([...lib.matchAll(/additional_browser_args\(([^)]*)\)/g)].filter((m) => m[1] !== 'BROWSER_ARGS').length, 0, 'every builder uses BROWSER_ARGS');
  const app = read('src/app.js').toString();
  assert.match(app, /async function restoreSession\(\) \{[\s\S]{0,300}state\.instance && !state\.instance\.first\) return;/, 'only the first copy restores the session');
  assert.match(app, /function persistSession\(\) \{[\s\S]{0,300}state\.instance && !state\.instance\.first\) return;/, 'a later copy does not overwrite it');
  assert.match(app, /addRecent\(loadRecent\(globalThis\.localStorage\), entry\)/, 'recent files are re-read before adding (another window may have added some)');
  // The window place file is replaced atomically, with a temporary file per process.
  assert.match(read('src-tauri/src/window_state.rs').toString(), /std::process::id\(\)[\s\S]{0,200}std::fs::rename\(&temporary, path\)/);
});

test('build commands for every OS and the web; the installer is copied to the project root', () => {
  for (const script of ['build:win', 'build:mac', 'build:linux', 'build:all', 'build:web', 'test', 'tutorial:video', 'tutorial:docs']) assert.ok(pkg.scripts[script], script);
  assert.ok(conf.bundle.active);
  assert.ok(conf.bundle.linux.deb && conf.bundle.linux.rpm && conf.bundle.macOS);
  const build = read('scripts/build.mjs').toString();
  for (const bundle of ['nsis', 'dmg', 'deb', 'rpm', 'appimage']) assert.ok(build.includes(`'${bundle}'`), bundle);
  assert.match(build, /fs\.copyFileSync\(path\.join\(directory, file\), path\.join\(root, target\)\)/, 'copied to the project root');
});

test('popups close with the main window (owned windows, exit on destroy), fixed size', () => {
  const lib = read('src-tauri/src/lib.rs').toString();
  assert.match(lib, /builder\.parent\(&main\)/);
  assert.match(lib, /WindowEvent::Destroyed[\s\S]{0,60}handle\.exit\(0\)/);
  assert.match(lib, /\.resizable\(false\)/, 'popups have a fixed size');
});

test('every popup the app opens is allowed by the backend (POPUP_KINDS)', () => {
  const kinds = [...read('src/platform/popups.js').toString().matchAll(/^ {2}(\w+): \{ width/gm)].map((m) => m[1]);
  const allowed = /const POPUP_KINDS: &\[&str\] = &\[([\s\S]*?)\];/.exec(read('src-tauri/src/lib.rs').toString())?.[1] ?? '';
  assert.ok(kinds.length > 15, 'popup sizes found');
  assert.deepEqual(kinds.filter((kind) => !allowed.includes(`"${kind}"`)), [], 'popups the desktop backend would refuse to open');
});

test('author is shown in the About window', () => {
  assert.match(read('src/popup.js').toString(), /SHKWON\(knix008@naver\.com\)/);
});
