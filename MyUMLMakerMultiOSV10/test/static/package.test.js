// Packaging checks without building: icons (3D look, transparent border, glowing
// top-left, centred), the .myuml / .mumlt document icons and their registration,
// installer languages, data/reinstall hooks, docs in the installer, title bar,
// single instance and the build commands.
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

test('installer hooks: preferences reset at the next start (user data kept), an old install removed completely', () => {
  const buffer = read('src-tauri/windows/hooks.nsh');
  assert.deepEqual([...buffer.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 BOM (NSIS reads Korean correctly)');
  const hooks = buffer.toString();
  assert.match(hooks, /NSIS_HOOK_PREINSTALL/);
  assert.doesNotMatch(hooks, /MessageBox/, 'no question about saved data any more');
  assert.doesNotMatch(hooks, /RMDir \/r "\$(LOCAL)?APPDATA/, 'the saved data folders are never deleted as a whole');
  assert.match(hooks, /Delete "\$APPDATA\\\$\{BUNDLEID\}\\window-state\.json"/, 'the window place is forgotten');
  assert.match(hooks, /FileOpen \$R9 "\$APPDATA\\\$\{BUNDLEID\}\\install-reset" w/, 'marker for the app: reset the preferences');
  assert.ok(hooks.indexOf('install-reset" w') > hooks.indexOf('NSIS_HOOK_POSTINSTALL'), 'written after the old uninstaller ran');
  assert.match(hooks, /uninstall\.exe" \/S _\?=/, 'old uninstaller runs silently');
  assert.match(hooks, /RMDir \/r "\$R6"/, 'old folder deleted');
});

test('the documents and samples are installed with the program', () => {
  const resources = conf.bundle.resources;
  for (const doc of ['docs/UsersGuide.html', 'docs/UsersGuide.en.html', 'docs/Tutorial.html', 'docs/Tutorial.en.html', 'docs/UsersGuide.md', 'docs/README.md', 'docs/tutorial/images/', 'samples/']) {
    assert.ok(Object.values(resources).includes(doc), `${doc} is installed`);
  }
  for (const source of Object.keys(resources)) assert.ok(fs.existsSync(path.join(root, 'src-tauri', source)), `${source} exists`);
  assert.match(read('src-tauri/windows/hooks.nsh').toString(), /CreateShortCut .*UsersGuide\.html/, 'Start-menu shortcut to the guide');
});

test('title bar: program name and version', () => {
  const lib = read('src-tauri/src/lib.rs').toString();
  assert.match(lib, /format!\("MyUMLMaker v\{\}", info\.version\)/);
  assert.equal(conf.version, '../package.json');
  assert.equal(conf.productName, 'MyUMLMaker');
  assert.match(read('src-tauri/Cargo.toml').toString(), new RegExp(`version = "${pkg.version.replace(/\./g, '\\.')}"`), 'Cargo version matches package.json');
  assert.match(read('src/popup.js').toString(), /— MyUMLMaker v\$\{VERSION\}/, 'popup windows show the name and version too');
});

test('a second start reports that the program is running and quits', () => {
  const lib = read('src-tauri/src/lib.rs').toString();
  assert.match(lib, /instance::acquire\(\)[\s\S]{0,200}report_already_running\(\)[\s\S]{0,80}std::process::exit/);
  const instance = read('src-tauri/src/instance.rs').toString();
  assert.match(instance, /이미 실행 중입니다/);
  assert.match(instance, /already running/);
  assert.match(instance, /MessageLevel::Error/);
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

test('author is shown in the About window', () => {
  assert.match(read('src/popup.js').toString(), /SHKWON\(knix008@naver\.com\)/);
});
