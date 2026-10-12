// Packaging checks without building: icons (3D look, transparent border, glowing
// top-left), the .mkanban document icon and its registration, installer
// languages, data/reinstall hooks, title bar, and the build commands.
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

test('app icon: 3D tile, transparent border, glowing top-left', () => {
  checkIcon('assets/icon.png');
  checkIcon('src-tauri/icons/icon.png');
});

test('document (.mkanban) and project (.mkproj) icons: same style, their own images', () => {
  for (const name of ['board', 'project']) {
    checkIcon(`assets/${name}.png`);
    assert.notDeepEqual(read(`assets/${name}.png`), read('assets/icon.png'));
    assert.equal(decodePng(read(`src-tauri/icons/${name}.png`)).width, 256);
  }
  assert.notDeepEqual(read('assets/board.png'), read('assets/project.png'));
});

test('ICO files carry every size Windows needs', () => {
  for (const file of ['src-tauri/icons/icon.ico', 'src-tauri/icons/board.ico', 'src-tauri/icons/project.ico']) {
    const sizes = icoSizes(file);
    for (const size of [16, 32, 48, 256]) assert.ok(sizes.includes(size), `${file} has ${size}px (${sizes})`);
  }
  for (const file of ['src-tauri/icons/icon.icns', 'src-tauri/icons/board.icns', 'src-tauri/icons/project.icns']) assert.equal(read(file).subarray(0, 4).toString(), 'icns');
});

test('installer, app window and program all use the same icon', () => {
  assert.equal(conf.bundle.windows.nsis.installerIcon, 'icons/icon.ico');
  assert.ok(conf.bundle.icon.includes('icons/icon.ico') && conf.bundle.icon.includes('icons/icon.icns'));
  assert.deepEqual(read('assets/icon.ico'), read('src-tauri/icons/icon.ico'));
  assert.ok(fs.existsSync(path.join(root, 'public', 'icon.png')), 'web favicon');
  assert.deepEqual(read('public/icon.png'), read('assets/icon.png'));
  for (const bmp of ['installerHeader.bmp', 'installerSidebar.bmp']) assert.equal(read(`src-tauri/windows/${bmp}`).subarray(0, 2).toString(), 'BM');
});

test('.mkanban is registered with its own icon on every OS', () => {
  const association = conf.bundle.fileAssociations.find((item) => item.ext.includes('mkanban'));
  assert.ok(association, 'file association');
  assert.equal(association.name, 'MyKanbanBoard.Board');
  assert.ok(conf.bundle.resources['icons/board.ico'], 'board.ico installed');
  const hooks = read('src-tauri/windows/hooks.nsh').toString();
  assert.match(hooks, /Software\\Classes\\MyKanbanBoard\.Board\\DefaultIcon" "" "\$INSTDIR\\board\.ico"/, 'Windows: DefaultIcon → board.ico');
  const plist = read('src-tauri/Info.plist').toString();
  assert.match(plist, /<string>mkanban<\/string>/);
  assert.match(plist, /CFBundleTypeIconFile<\/key>\s*<string>board\.icns<\/string>/, 'macOS: document icon');
  const mime = read('src-tauri/linux/mykanbanboard.xml').toString();
  assert.match(mime, /glob pattern="\*\.mkanban"/);
  assert.equal(conf.bundle.linux.deb.files['/usr/share/icons/hicolor/256x256/mimetypes/application-x-mykanban.png'], 'icons/board.png', 'Linux: mime icon');
  assert.match(read('src-tauri/linux/postinst.sh').toString(), /update-mime-database/);
});

test('.mkproj projects are registered with their own icon on every OS', () => {
  const association = conf.bundle.fileAssociations.find((item) => item.ext.includes('mkproj'));
  assert.ok(association, 'file association');
  assert.equal(association.name, 'MyKanbanBoard.Project');
  assert.ok(conf.bundle.resources['icons/project.ico'], 'project.ico installed');
  assert.match(read('src-tauri/windows/hooks.nsh').toString(), /Software\\Classes\\MyKanbanBoard\.Project\\DefaultIcon" "" "\$INSTDIR\\project\.ico"/);
  assert.match(read('src-tauri/Info.plist').toString(), /CFBundleTypeIconFile<\/key>\s*<string>project\.icns<\/string>/);
  assert.match(read('src-tauri/linux/mykanbanboard.xml').toString(), /glob pattern="\*\.mkproj"/);
  assert.equal(conf.bundle.linux.rpm.files['/usr/share/icons/hicolor/256x256/mimetypes/application-x-mykanban-project.png'], 'icons/project.png');
});

test('installer languages: Korean and English, user selectable', () => {
  const nsis = conf.bundle.windows.nsis;
  assert.deepEqual(nsis.languages, ['Korean', 'English']);
  assert.equal(nsis.displayLanguageSelector, true);
});

test('installer hooks: ask about saved data, remove an old install completely', () => {
  const buffer = read('src-tauri/windows/hooks.nsh');
  assert.deepEqual([...buffer.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 BOM (NSIS reads Korean correctly)');
  const hooks = buffer.toString();
  assert.match(hooks, /NSIS_HOOK_PREINSTALL/);
  assert.match(hooks, /MessageBox MB_YESNO/);
  assert.match(hooks, /\$LANGUAGE == 1042/, 'Korean question for the Korean installer');
  assert.match(hooks, /삭제하시겠습니까/);
  assert.match(hooks, /Do you want to delete it\?/);
  assert.match(hooks, /RMDir \/r "\$APPDATA\\\$\{BUNDLEID\}"/);
  assert.match(hooks, /RMDir \/r "\$LOCALAPPDATA\\\$\{BUNDLEID\}"/);
  assert.match(hooks, /uninstall\.exe" \/S _\?=/, 'old uninstaller runs silently');
  assert.match(hooks, /RMDir \/r "\$R6"/, 'old folder deleted');
});

test('title bar: program name and version', () => {
  const lib = read('src-tauri/src/lib.rs').toString();
  assert.match(lib, /format!\("MyKanbanBoard v\{\}", info\.version\)/);
  assert.equal(conf.version, '../package.json');
  assert.equal(conf.productName, 'MyKanbanBoard');
  assert.match(read('src-tauri/Cargo.toml').toString(), new RegExp(`version = "${pkg.version.replace(/\./g, '\\.')}"`), 'Cargo version matches package.json');
});

test('build commands for every OS and the web', () => {
  for (const script of ['build:win', 'build:mac', 'build:linux', 'build:all', 'build:web', 'test']) assert.ok(pkg.scripts[script], script);
  assert.ok(conf.bundle.active);
  assert.ok(conf.bundle.linux.deb && conf.bundle.linux.rpm && conf.bundle.macOS);
  const build = read('scripts/build.mjs').toString();
  for (const bundle of ['nsis', 'dmg', 'deb', 'rpm', 'appimage']) assert.ok(build.includes(`'${bundle}'`), bundle);
});

test('popups close with the main window (owned windows, exit on destroy)', () => {
  const lib = read('src-tauri/src/lib.rs').toString();
  assert.match(lib, /builder\.parent\(&main\)/);
  assert.match(lib, /WindowEvent::Destroyed[\s\S]{0,60}handle\.exit\(0\)/);
  assert.match(lib, /\.resizable\(false\)/, 'popups have a fixed size');
});

test('author is shown in the About window', () => {
  assert.match(read('src/popup.js').toString(), /SHKWON\(knix008@naver\.com\)/);
});
