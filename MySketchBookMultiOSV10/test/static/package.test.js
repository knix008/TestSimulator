// Packaging checks without building: the app icon (an interior room on a raised
// 3D tile), the .msk document icon and its registration on every OS, installer
// languages, one-installation / user-data hooks, installed resources (library,
// doc, samples), the asset protocol, the popup kinds the backend allows, title
// bar, several copies at once, build commands and the About author.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file));
const text = (file) => read(file).toString().replace(/\r\n/g, '\n');
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

/** Transparent border and a soft drop shadow (the raised 3D look). */
function checkIcon(file) {
  const image = decodePng(read(file));
  assert.equal(image.width, image.height, 'square');
  for (const [x, y] of [[0, 0], [image.width - 1, 0], [0, image.height - 1], [image.width - 1, image.height - 1]]) {
    assert.equal(image.pixels[(y * image.width + x) * 4 + 3], 0, `${file}: corner (${x},${y}) is transparent`);
  }
  assert.ok(region(image, 0, 0, 1, 0.04).alpha < 5, `${file}: top edge transparent`);
  assert.ok(region(image, 0, 0, 0.04, 1).alpha < 5, `${file}: left edge transparent`);
  let soft = 0;
  for (let y = Math.floor(image.height * 0.85); y < image.height * 0.99; y++) {
    for (let x = Math.floor(image.width * 0.2); x < image.width * 0.8; x++) {
      const a = image.pixels[(y * image.width + x) * 4 + 3];
      if (a > 8 && a < 200) soft += 1;
    }
  }
  assert.ok(soft > image.width, `${file}: soft drop shadow under the tile (${soft} semi-transparent pixels)`);
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

const UML_WORDS = /\b(uml|class diagram|sequence diagram|use case|actor|lifeline|myuml|mumlt|StarUML|PlantUML|Mermaid)\b/i;

test('app icon (assets/icon.svg): an interior room on a raised 3D tile, nothing of UML', () => {
  const svg = text('assets/icon.svg');
  assert.match(svg, /^<svg[^>]*viewBox="0 0 1024 1024"/);
  assert.match(svg, /<!--[\s\S]*?(room|interior)[\s\S]*?-->/i, 'the comment says what it shows');
  assert.match(svg, /<!--[\s\S]*?(tile)[\s\S]*?-->/i, 'on a raised tile');
  assert.doesNotMatch(svg, UML_WORDS, 'no UML pictures or words');
  // Room parts are drawn (ids / comments name them): floor, wall, window, furniture.
  for (const part of ['floor', 'wall', 'window', 'sofa']) assert.match(svg, new RegExp(part, 'i'), `the icon draws a ${part}`);
});

test('app icon PNGs: 3D tile, transparent border, glowing top-left, in the exact centre', () => {
  for (const file of ['assets/icon.png', 'src-tauri/icons/icon.png']) {
    const image = checkIcon(file);
    const box = opaqueBox(image);
    const cx = (box.left + box.right) / 2;
    const cy = (box.top + box.bottom) / 2;
    assert.ok(Math.abs(cx - 0.5) < 0.02, `${file}: centred horizontally (${cx.toFixed(3)})`);
    assert.ok(Math.abs(cy - 0.5) < 0.03, `${file}: centred vertically (${cy.toFixed(3)})`);
    assert.ok(box.left > 0.05 && box.top > 0.05 && box.right < 0.95 && box.bottom < 0.97, `${file}: transparent margin all round`);
    const topLeft = region(image, 0.16, 0.12, 0.34, 0.3);
    const bottomRight = region(image, 0.66, 0.66, 0.84, 0.84);
    assert.ok(topLeft.light > bottomRight.light, `${file}: top-left (${topLeft.light.toFixed(0)}) is lighter than bottom-right (${bottomRight.light.toFixed(0)})`);
  }
  });

test('.msk document icon (assets/project.svg): its own picture in the same style', () => {
  const svg = text('assets/project.svg');
  assert.match(svg, /\.msk/, 'the comment names the .msk document');
  assert.doesNotMatch(svg, UML_WORDS);
  const image = checkIcon('assets/project.png');
  const box = opaqueBox(image);
  assert.ok(Math.abs((box.left + box.right) / 2 - 0.5) < 0.03, 'centred horizontally');
  assert.ok(!read('assets/project.png').equals(read('assets/icon.png')), 'differs from the app icon');
  assert.equal(decodePng(read('src-tauri/icons/project.png')).width, 256);
});

test('ICO files carry every size Windows needs; ICNS files are ICNS', () => {
  for (const file of ['src-tauri/icons/icon.ico', 'src-tauri/icons/project.ico', 'assets/icon.ico']) {
    const sizes = icoSizes(file);
    for (const size of [16, 24, 32, 48, 64, 256]) assert.ok(sizes.includes(size), `${file} has ${size}px (${sizes})`);
  }
  for (const file of ['src-tauri/icons/icon.icns', 'src-tauri/icons/project.icns']) assert.equal(read(file).subarray(0, 4).toString(), 'icns');
});

test('installer, program and running window all use the same icon', () => {
  assert.equal(conf.bundle.windows.nsis.installerIcon, 'icons/icon.ico');
  assert.ok(conf.bundle.icon.includes('icons/icon.ico') && conf.bundle.icon.includes('icons/icon.icns'));
  assert.ok(read('assets/icon.ico').equals(read('src-tauri/icons/icon.ico')), 'assets/icon.ico = src-tauri/icons/icon.ico');
  assert.ok(fs.existsSync(path.join(root, 'public', 'icon.png')), 'web favicon');
  assert.ok(read('public/icon.png').equals(read('assets/icon.png')), 'favicon = app icon');
  for (const bmp of ['installerHeader.bmp', 'installerSidebar.bmp']) assert.equal(read(`src-tauri/windows/${bmp}`).subarray(0, 2).toString(), 'BM');
});

test('tauri.conf.json: product MySketchBook, identifier com.shkwon.mysketchbook, version from package.json', () => {
  assert.equal(conf.productName, 'MySketchBook');
  assert.equal(conf.identifier, 'com.shkwon.mysketchbook');
  assert.equal(conf.version, '../package.json');
  assert.equal(pkg.productName, 'MySketchBook');
  assert.match(text('src-tauri/Cargo.toml'), new RegExp(`version = "${pkg.version.replace(/\./g, '\\.')}"`), 'Cargo version matches package.json');
});

test('.msk is the only document type, registered with its own icon on Windows (NSIS DefaultIcon)', () => {
  const associations = conf.bundle.fileAssociations;
  assert.equal(associations.length, 1, 'one document type');
  const msk = associations[0];
  assert.deepEqual(msk.ext, ['msk']);
  assert.equal(msk.name, 'MySketchBook.Project');
  assert.equal(msk.mimeType, 'application/x-mysketchbook');
  assert.equal(conf.bundle.resources['icons/project.ico'], 'project.ico', 'project.ico installed next to the program');
  const hooks = text('src-tauri/windows/hooks.nsh');
  assert.ok(hooks.includes('WriteRegStr SHCTX "Software\\Classes\\MySketchBook.Project\\DefaultIcon" "" "$INSTDIR\\project.ico"'), 'Windows: DefaultIcon = project.ico');
});

test('no left-over UML document types (.myuml / .mumlt / template icon) in the installer hooks', () => {
  const hooks = text('src-tauri/windows/hooks.nsh');
  assert.doesNotMatch(hooks, /myuml|mumlt/i, 'hooks.nsh names no UML file types');
  assert.doesNotMatch(hooks, /MySketchBook\.Template|template\.ico/, 'hooks.nsh registers no "Template" document type (there is none)');
});

test('.msk on macOS: Info.plist gives .msk the project.icns document icon', () => {
  assert.equal(conf.bundle.resources['icons/project.icns'], 'project.icns', 'project.icns is in the bundle');
  const plist = text('src-tauri/Info.plist');
  assert.match(plist, /<string>msk<\/string>/, 'CFBundleTypeExtensions has msk');
  assert.match(plist, /CFBundleTypeExtensions<\/key>\s*<array>\s*<string>msk<\/string>\s*<\/array>\s*<key>CFBundleTypeIconFile<\/key>\s*<string>project\.icns<\/string>/, 'macOS: .msk → project.icns');
  assert.doesNotMatch(plist, /myuml|mumlt/i, 'no UML file types');
});

test('.msk on Linux: shared-mime-info glob *.msk and the mime icon for deb and rpm', () => {
  const xml = text('src-tauri/linux/mysketchbook.xml');
  assert.match(xml, /<mime-type type="application\/x-mysketchbook">/);
  assert.match(xml, /<glob pattern="\*\.msk"\/>/);
  assert.match(xml, /<icon name="application-x-mysketchbook"\/>/);
  for (const kind of ['deb', 'rpm']) {
    const files = conf.bundle.linux[kind].files;
    assert.equal(files['/usr/share/mime/packages/mysketchbook.xml'], 'linux/mysketchbook.xml', `${kind}: mime xml`);
    assert.equal(files['/usr/share/icons/hicolor/256x256/mimetypes/application-x-mysketchbook.png'], 'icons/project.png', `${kind}: mime icon`);
    assert.ok(conf.bundle.linux[kind].postInstallScript && conf.bundle.linux[kind].postRemoveScript, `${kind}: mime database refreshed`);
  }
  for (const script of ['postinst.sh', 'postrm.sh']) assert.match(text(`src-tauri/linux/${script}`), /update-mime-database/);
});

test('resources: the library, the documents and the samples are installed', () => {
  const resources = conf.bundle.resources;
  assert.equal(resources['../library/'], 'library/');
  assert.equal(resources['../doc/'], 'doc/', 'the documentation folder is doc/');
  assert.ok(!Object.keys(resources).some((source) => /(^|\/)docs\//.test(source)) && !Object.values(resources).some((dst) => /^docs\//.test(dst)), 'no old docs/ folder is installed');
  assert.equal(resources['../samples/'], 'samples/');
  for (const source of Object.keys(resources)) assert.ok(fs.existsSync(path.join(root, 'src-tauri', source)), `${source} exists`);
  // The furniture models, textures and HDRIs live in library/ (not in the web bundle only).
  for (const dir of ['models', 'textures', 'hdri']) assert.ok(fs.existsSync(path.join(root, 'library', dir)), `library/${dir}`);
  const samples = fs.readdirSync(path.join(root, 'samples')).filter((f) => f.endsWith('.msk'));
  assert.ok(samples.length >= 2, `sample projects (${samples.length})`);
  for (const file of samples) assert.equal(read(`samples/${file}`).subarray(0, 2).toString(), 'PK', `${file} is a .msk (ZIP)`);
});

test('asset protocol: enabled, the installed library ($RESOURCE/library/**) may be read', () => {
  const asset = conf.app.security.assetProtocol;
  assert.equal(asset.enable, true);
  assert.ok(asset.scope.includes('$RESOURCE/library/**'), 'library');
  assert.match(text('src/app.js'), /resolveResource\('library'\)[\s\S]{0,300}convertFileSrc/, 'the app reads the installed library through the asset protocol');
});

test('every popup kind the app opens is allowed by the backend (POPUP_KINDS)', () => {
  const allowed = /const POPUP_KINDS: &\[&str\] = &\[([\s\S]*?)\];/.exec(text('src-tauri/src/lib.rs'))?.[1] ?? assert.fail('POPUP_KINDS');
  const kinds = [...allowed.matchAll(/"(\w+)"/g)].map((m) => m[1]);
  // Kinds opened in the code: popups.open('kind' …) anywhere in src/, plus every sized popup (popups.js).
  const opened = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.(js|mjs)$/.test(entry.name)) for (const m of fs.readFileSync(file, 'utf8').matchAll(/popups\.open\('(\w+)'/g)) opened.add(m[1]);
    }
  };
  walk(path.join(root, 'src'));
  for (const m of text('src/platform/popups.js').matchAll(/^ {2}(\w+): \{ width/gm)) opened.add(m[1]);
  assert.ok(opened.size >= 15, `popup kinds found (${[...opened]})`);
  assert.deepEqual([...opened].filter((kind) => !kinds.includes(kind)), [], 'popups the desktop backend would refuse to open');
});

test('installer languages: Korean and English, user selectable', () => {
  const nsis = conf.bundle.windows.nsis;
  assert.deepEqual(nsis.languages, ['Korean', 'English']);
  assert.equal(nsis.displayLanguageSelector, true);
  const hooks = text('src-tauri/windows/hooks.nsh');
  assert.match(hooks, /^!define MUI_LANGDLL_ALWAYSSHOW/m);
  assert.match(hooks, /^!define MUI_LANGDLL_ALLLANGUAGES/m);
  const post = /!macro NSIS_HOOK_POSTINSTALL[\s\S]*?!macroend/.exec(hooks)[0];
  assert.ok(post.indexOf('Call MumWipeData') < post.indexOf('Call MumWriteLanguage'), 'written after the data is deleted');
  assert.match(post, /\$\{IfNot\} \$\{Silent\}\s*\$\{AndIf\} \$PassiveMode <> 1\s*Call MumWriteLanguage/);
  assert.match(hooks, /\$LANGUAGE == 1042\s*FileWrite \$0 "ko"[\s\S]*FileWrite \$0 "en"/);
  assert.match(text('src-tauri/src/window_state.rs'), /LANGUAGE_MARKER: &str = "install-language"/);
  assert.match(text('src-tauri/src/lib.rs'), /__MYSKETCHBOOK_INSTALL_LANGUAGE__/);
  const main = text('src/main.js');
  assert.ok(main.indexOf('resetForNewInstall(globalThis') < main.indexOf('applyInstallLanguage(globalThis') && main.indexOf('applyInstallLanguage(globalThis') < main.indexOf('loadSettings(globalThis'), 'after the reset, before the settings are read');
});

test('installer hooks: one installation only (an old one removed completely), the user is asked whether to delete the user data', () => {
  const buffer = read('src-tauri/windows/hooks.nsh');
  assert.deepEqual([...buffer.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 BOM (NSIS reads Korean correctly)');
  const hooks = buffer.toString().replace(/\r\n/g, '\n');
  const fn = (name) => new RegExp(`\\nFunction ${name}\\n([\\s\\S]*?)\\nFunctionEnd`).exec(hooks)?.[1] ?? assert.fail(`Function ${name}`);
  const macro = (name) => new RegExp(`!macro ${name}\\n([\\s\\S]*?)\\n!macroend`).exec(hooks)?.[1] ?? assert.fail(`!macro ${name}`);
  assert.ok(hooks.includes(`"$APPDATA\\${conf.identifier}"`) && hooks.includes(`"$LOCALAPPDATA\\${conf.identifier}"`), 'the data folders of tauri.conf.json identifier');
  assert.match(hooks, /!define MUI_CUSTOMFUNCTION_GUIINIT MumGuiInit/);
  for (const lang of ['1042', '1033']) for (const name of ['MumAskReinstall', 'MumAskData', 'MumRunning', 'MumShortcutDesktop', 'MumShortcutStartMenu']) assert.match(hooks, new RegExp(`LangString ${name} ${lang} "`), `${name} for ${lang}`);
  assert.match(hooks, /LangString MumAskData 1042 "이전에 사용하던 사용자 데이터\([^)]*설정[^)]*\)를 삭제할까요\?/, 'the Korean question');
  assert.ok(hooks.includes('완전히 삭제하고 다시 설치할까요?'), 'the Korean reinstall question');
  const gui = fn('MumGuiInit');
  assert.match(gui, /MessageBox MB_YESNO\|MB_ICONQUESTION "\$\(MumAskReinstall\)"[^\n]*IDYES \+2\s*Quit/, 'reinstall: Yes / No (stop)');
  assert.match(gui, /MessageBox MB_YESNOCANCEL\|MB_ICONQUESTION\|MB_DEFBUTTON2 "\$\(MumAskData\)"/, 'user data: Yes / No (default) / Cancel');
  assert.ok(gui.indexOf('MumAskReinstall') < gui.indexOf('MumAskData'), 'the reinstall question comes first');
  assert.match(hooks, /!macroundef MUI_PAGE_STARTMENU[\s\S]*Page custom MumShortcutsShow MumShortcutsLeave/);
  assert.match(hooks, /!macroundef MUI_PAGE_FINISH[\s\S]*MUI_UNSET MUI_FINISHPAGE_SHOWREADME\b/, 'no second desktop check box on the finish page');
  assert.match(fn('MumRemoveOld'), /Call MumRemoveOldShortcuts/);
  assert.match(gui, /"\$MumOldUser\$MumOldMachine" != ""\s*\$\{OrIf\} \$2 == 1\s*MessageBox/, 'asked only with a previous installation or existing user data');
  assert.ok(gui.indexOf('MumRunningApps') > gui.indexOf('MB_YESNOCANCEL') && gui.indexOf('Call MumRemoveOld', gui.indexOf('MB_YESNOCANCEL')) > gui.indexOf('"close"'), 'ask, then close the running windows, then remove the old copy');
  for (const name of [...hooks.matchAll(/\nFunction (\w+)\n/g)].map((m) => m[1])) {
    assert.doesNotMatch(fn(name), /\$(PassiveMode|UpdateMode|NoShortcutMode|DeleteAppDataCheckboxState)\b|\$\{(BUNDLEID|PRODUCTNAME|MAINBINARYNAME|UNINSTKEY|MANUPRODUCTKEY|INSTALLMODE)\}/, `Function ${name} uses only its own defines and variables`);
  }
  assert.match(fn('MumFindOld'), /MUM_FIND_IN HKCU[\s\S]*MUM_FIND_IN HKLM/);
  assert.match(fn('MumRemoveOld'), /ExecWait '"\$MumOldUser\\uninstall\.exe" \/S \/UPDATE _\?=\$MumOldUser'/);
  assert.match(fn('MumSweep'), /RMDir \/r "\$0"/, 'old folder deleted');
  assert.match(fn('MumRunningApps'), /RmGetList[\s\S]*RmShutdown/, 'all running copies counted and closed');
  assert.match(macro('NSIS_HOOK_PREINSTALL'), /\$MumDone != 1[\s\S]*Call MumFindOld[\s\S]*Call MumRemoveOld/);
  assert.match(fn('MumWipeData'), /RMDir \/r "\$\{MUM_ROAMING\}"\s*RMDir \/r "\$\{MUM_LOCAL\}"/);
  const post = macro('NSIS_HOOK_POSTINSTALL');
  assert.match(post, /\$\{If\} \$MumWipe == 1\s*;[^\n]*\n\s*Call MumWipeData\s*\$\{Else\}/, 'Yes: the data is deleted');
  assert.match(post, /Delete "\$APPDATA\\\$\{BUNDLEID\}\\window-state\.json"/, 'the window place is forgotten');
  assert.match(post, /FileOpen \$R9 "\$APPDATA\\\$\{BUNDLEID\}\\install-reset" w/, 'marker for the app: reset the preferences');
  assert.match(post, /CreateShortCut [^\n]*"\$INSTDIR\\doc\\UsersGuide\.html"/, 'Start-menu shortcut to the guide in doc\\');
  assert.doesNotMatch(post, /\$INSTDIR\\docs\\/, 'no path into the old docs\\ folder');
});

test('the user-data question lists MySketchBook\'s own data (no UML-era "database connection")', () => {
  const hooks = text('src-tauri/windows/hooks.nsh');
  for (const lang of ['1042', '1033']) {
    const question = new RegExp(`LangString MumAskData ${lang} "([^\\n]*)"`).exec(hooks)?.[1] ?? assert.fail(`MumAskData ${lang}`);
    assert.doesNotMatch(question, /데이터베이스|database/i, `MumAskData ${lang} mentions a database connection MySketchBook does not have`);
  }
});

test('title bar and popups: program name and version', () => {
  const lib = text('src-tauri/src/lib.rs');
  assert.match(lib, /format!\("MySketchBook v\{\}", info\.version\)/);
  assert.match(text('src/popup.js'), /— MySketchBook v\$\{VERSION\}/, 'popup windows show the name and version too');
  assert.match(text('src/app.js'), /document\.title = `MySketchBook v\$\{state\.info\?\.version \?\? VERSION\}`/, 'the page title');
  assert.match(text('src/app.js'), /app-brand-name[^>]*>MySketchBook<\/span><span class="app-brand-version"[^>]*>v\$\{escapeHtml\(VERSION\)\}/, 'the menu bar (title bar) shows name and version');
});

test('a second start opens a second window (several copies may run)', () => {
  const lib = text('src-tauri/src/lib.rs');
  assert.doesNotMatch(lib, /report_already_running|std::process::exit\(3\)/, 'no "already running" refusal');
  assert.match(lib, /instance::register\(\)/, 'each copy registers itself (to know whether it is the first)');
  assert.match(lib, /MYSKETCHBOOK_MULTI/, 'tests and npm start skip the counting');
  assert.match(lib, /instance_info,/, 'the page can ask whether it is the first copy');
  assert.doesNotMatch(text('src-tauri/src/instance.rs'), /이미 실행 중|already running/);
  assert.equal([...lib.matchAll(/additional_browser_args\(([^)]*)\)/g)].filter((m) => m[1] !== 'BROWSER_ARGS').length, 0, 'every builder uses BROWSER_ARGS');
  const app = text('src/app.js');
  assert.match(app, /async function restoreSession\(\) \{[\s\S]{0,300}state\.instance && !state\.instance\.first\) return;/, 'only the first copy restores the session');
  assert.match(app, /function persistSession\(\) \{[\s\S]{0,300}state\.instance && !state\.instance\.first\) return;/, 'a later copy does not overwrite it');
  assert.match(app, /addRecent\(loadRecent\(globalThis\.localStorage\), entry\)/, 'recent files are re-read before adding');
});

test('build commands for every OS and the web; the installer is copied to the project root', () => {
  for (const script of ['build:win', 'build:mac', 'build:linux', 'build:all', 'build:web', 'build:webapp', 'test', 'test:quick', 'test:web', 'test:unit']) assert.ok(pkg.scripts[script], script);
  assert.ok(conf.bundle.active);
  assert.ok(conf.bundle.linux.deb && conf.bundle.linux.rpm && conf.bundle.macOS);
  const build = text('scripts/build.mjs');
  for (const bundle of ['nsis', 'dmg', 'deb', 'rpm', 'appimage']) assert.ok(build.includes(`'${bundle}'`), bundle);
  assert.match(build, /fs\.copyFileSync\(path\.join\(directory, file\), path\.join\(root, target\)\)/, 'copied to the project root');
  assert.equal(conf.build.beforeBuildCommand, 'npm run build:web');
  assert.equal(conf.build.frontendDist, '../dist');
});

test('popups close with the main window (owned windows, exit on destroy), fixed size', () => {
  const lib = text('src-tauri/src/lib.rs');
  assert.match(lib, /\.parent\(&main\)/);
  assert.match(lib, /WindowEvent::Destroyed[\s\S]{0,60}handle\.exit\(0\)/);
  assert.match(lib, /\.resizable\(false\)/, 'popups have a fixed size');
  const capability = json('src-tauri/capabilities/default.json');
  for (const label of ['main', 'popup-*', 'doc-*']) assert.ok(capability.windows.includes(label), `capability covers ${label}`);
});

test('document windows: the kinds the page opens are the backend\'s', () => {
  const lib = text('src-tauri/src/lib.rs');
  const kinds = /const DOC_KINDS: &\[&str\] = &\[([^\]]*)\];/.exec(lib)?.[1] ?? '';
  const helpdocs = text('src/domain/helpdocs.js');
  for (const [, kind] of /export const DOC_KINDS = \{([\s\S]*?)\n\};/.exec(helpdocs)[1].matchAll(/^ {2}(\w+):/gm)) assert.ok(kinds.includes(`"${kind}"`), `${kind}: the page's kinds match the backend's`);
  const scope = conf.app.security.assetProtocol.scope;
  assert.ok(scope.includes('$RESOURCE/doc/video/**'), 'the player may load the installed video (doc/video)');
  assert.ok(!scope.some((entry) => entry.includes('$RESOURCE/docs/')), 'no asset scope for the old docs/ folder');
  // The pages the app opens are in doc/ too.
  assert.match(helpdocs, /return `doc\/\$\{info\.file\}/, 'docUrl points into doc/');
});

test('author is shown in the About window', () => {
  assert.match(text('src/popup.js'), /SHKWON\(knix008@naver\.com\)/);
  assert.equal(pkg.author, 'SHKWON <knix008@naver.com>');
  assert.equal(conf.bundle.publisher, 'SHKWON');
});
