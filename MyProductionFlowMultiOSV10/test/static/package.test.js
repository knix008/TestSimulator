// Packaging checks without building: icons, the .mpf file type on every OS,
// installer resources, the popup kinds the backend allows, the build commands,
// the shipped samples and the About author.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const text = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const json = (file) => JSON.parse(text(file));
const conf = json('src-tauri/tauri.conf.json');
const pkg = json('package.json');

test('product identity: name, identifier, binary', () => {
  assert.equal(pkg.productName, 'MyProductionFlow');
  assert.equal(conf.productName, 'MyProductionFlow');
  assert.equal(conf.identifier, 'com.shkwon.myproductionflow');
  assert.equal(conf.mainBinaryName, 'MyProductionFlow');
  assert.match(text('src-tauri/Cargo.toml'), /name = "myproductionflow"/);
});

test('icons exist for every platform and the file type', () => {
  for (const file of ['assets/icon.svg', 'assets/icon.png', 'assets/icon-256.png', 'assets/project.svg', 'public/icon.png',
    'src-tauri/icons/icon.ico', 'src-tauri/icons/icon.icns', 'src-tauri/icons/32x32.png', 'src-tauri/icons/128x128.png', 'src-tauri/icons/project.ico', 'src-tauri/icons/project.icns', 'src-tauri/icons/project.png',
    'src-tauri/windows/installerHeader.bmp', 'src-tauri/windows/installerSidebar.bmp']) assert.ok(fs.existsSync(path.join(root, file)), file);
  for (const icon of conf.bundle.icon) assert.ok(fs.existsSync(path.join(root, 'src-tauri', icon)), icon);
});

test('.mpf is the document type on Windows, macOS and Linux', () => {
  assert.deepEqual(conf.bundle.fileAssociations.map((a) => a.ext), [['mpf']]);
  assert.match(text('src-tauri/windows/hooks.nsh'), /MyProductionFlow\.Project\\DefaultIcon/);
  assert.match(text('src-tauri/Info.plist'), /<string>mpf<\/string>/);
  assert.match(text('src-tauri/linux/myproductionflow.xml'), /<glob pattern="\*\.mpf"\/>/);
  assert.match(text('src-tauri/src/files.rs'), /DIAGRAM_EXTENSIONS: \[&str; 1\] = \["mpf"\]/);
});

test('installer resources exist: doc, samples, licenses', () => {
  for (const [from] of Object.entries(conf.bundle.resources)) assert.ok(fs.existsSync(path.join(root, 'src-tauri', from)), from);
  assert.deepEqual(conf.bundle.windows.nsis.languages, ['Korean', 'English']);
});

test('the backend allows every popup kind the page opens', async () => {
  const { POPUPS } = await import(pathToFileURL(path.join(root, 'src/platform/popups.js')).href).catch(() => ({ POPUPS: null }));
  const kinds = POPUPS ? Object.keys(POPUPS) : [...text('src/platform/popups.js').matchAll(/^ {2}([a-z]+): \{ width/gm)].map((m) => m[1]);
  const rust = text('src-tauri/src/lib.rs');
  for (const kind of kinds) assert.match(rust, new RegExp(`"${kind}"`), kind);
});

test('build and clean commands', () => {
  for (const s of ['start', 'test', 'build:win', 'build:mac', 'build:linux', 'build:all', 'build:web', 'build:docs', 'samples', 'clean', 'clean:all', 'tutorial:docs']) assert.ok(pkg.scripts[s], s);
  assert.match(pkg.scripts['clean:all'], /--all/);
});

test('samples are shipped in both languages and open', async () => {
  const { parseModel } = await import(pathToFileURL(path.join(root, 'src/sim/model.js')).href);
  const { SAMPLE_PROJECTS } = await import(pathToFileURL(path.join(root, 'src/sim/samples.js')).href);
  const ko = fs.readdirSync(path.join(root, 'samples')).filter((f) => f.endsWith('.mpf'));
  const en = fs.readdirSync(path.join(root, 'samples', 'en')).filter((f) => f.endsWith('.mpf'));
  assert.equal(ko.length, SAMPLE_PROJECTS.length);
  assert.equal(en.length, SAMPLE_PROJECTS.length);
  for (const f of ko) assert.ok(parseModel(text(`samples/${f}`)).blocks.length > 0, f);
});

test('About names the author', () => {
  assert.match(text('src/popup.js'), /SHKWON\(knix008@naver\.com\)/);
});
