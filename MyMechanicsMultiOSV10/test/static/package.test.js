// Packaging checks without building: names and identifier, the .mymech file type on every OS, the icons,
// installed resources, the popup kinds the frontend opens, the docs, and every UI text in both languages.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const conf = json('src-tauri/tauri.conf.json');
const pkg = json('package.json');

test('product name, identifier and version agree', () => {
  assert.equal(pkg.productName, 'MyMechanics');
  assert.equal(conf.productName, 'MyMechanics');
  assert.equal(conf.identifier, 'com.shkwon.mymechanics');
  assert.equal(conf.version, '../package.json');
  assert.match(read('src-tauri/Cargo.toml'), /name = "mymechanics"/);
  assert.equal(conf.build.devUrl, 'http://127.0.0.1:5494');
});

test('the .mymech document type is registered on Windows, macOS and Linux', () => {
  const assoc = conf.bundle.fileAssociations;
  assert.deepEqual(assoc.map((a) => a.ext).flat(), ['mymech']);
  assert.match(read('src-tauri/linux/mymechanics.xml'), /\*\.mymech/);
  assert.match(read('src-tauri/windows/hooks.nsh'), /\.mymech/);
  assert.match(read('src-tauri/src/files.rs'), /"mymech"/);
  for (const p of conf.bundle.linux.deb.files ? Object.values(conf.bundle.linux.deb.files) : []) assert.ok(fs.existsSync(path.join(root, 'src-tauri', p)), p);
});

test('icons and installed resources exist', () => {
  for (const icon of conf.bundle.icon) assert.ok(fs.existsSync(path.join(root, 'src-tauri', icon)), icon);
  for (const source of Object.keys(conf.bundle.resources)) assert.ok(fs.existsSync(path.join(root, 'src-tauri', source)), source);
  for (const file of ['assets/icon.svg', 'assets/icon-256.png', 'assets/project.svg', 'public/icon.png']) assert.ok(fs.existsSync(path.join(root, file)), file);
  assert.match(read('assets/icon.svg'), /MyMechanics app icon/);
});

test('every popup the app opens has a size', async () => {
  const { POPUPS } = await import(pathToFileURL(path.join(root, 'src/platform/popups.js')).href).catch(() => ({ POPUPS: null }));
  const source = read('src/platform/popups.js');
  const declared = new Set([...source.matchAll(/^\s{2}(\w+): \{ width/gm)].map((m) => m[1]));
  void POPUPS;
  const used = new Set();
  for (const file of ['src/app.js', 'src/popup.js']) for (const m of read(file).matchAll(/popups\.open\('(\w+)'/g)) used.add(m[1]);
  for (const kind of used) assert.ok(declared.has(kind), `popup "${kind}" has no size`);
});

test('the user guide exists in Korean and English and is built for the viewer', () => {
  for (const f of ['doc/UsersGuide.md', 'doc/UsersGuide.en.md']) assert.ok(read(f).length > 3000, f);
  const ko = read('doc/UsersGuide.md'); const en = read('doc/UsersGuide.en.md');
  assert.equal((ko.match(/^## /gm) ?? []).length, (en.match(/^## /gm) ?? []).length, 'same chapters');
  for (const f of ['public/doc/UsersGuide.html', 'public/doc/UsersGuide.en.html']) assert.match(read(f), /<nav class="toc">/);
});

test('the tutorial exists in both languages, is built, and every picture of the documents is there', () => {
  const ko = read('doc/Tutorial.md'); const en = read('doc/Tutorial.en.md');
  assert.equal((ko.match(/^## /gm) ?? []).length, (en.match(/^## /gm) ?? []).length, 'same lessons');
  for (const f of ['public/doc/Tutorial.html', 'public/doc/Tutorial.en.html']) assert.match(read(f), /<nav class="toc">/);
  for (const name of ['UsersGuide', 'Tutorial']) {
    for (const [lang, suffix] of [['ko', ''], ['en', '.en']]) {
      const md = read(`doc/${name}${suffix}.md`);
      const pictures = [...md.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]);
      assert.ok(pictures.length >= 10, `${name}${suffix}.md has pictures`);
      for (const p of pictures) {
        assert.ok(p.startsWith(`images/${lang}/`), `${name}${suffix}.md: ${p} is a ${lang} picture`);
        for (const dir of ['doc', 'public/doc']) assert.ok(fs.existsSync(path.join(root, dir, p)), `${dir}/${p}`);
      }
      assert.match(read(`public/doc/${name}${suffix}.html`), /<figure><img src="images\//);
    }
  }
  // Every chapter of the guide has a picture.
  for (const f of ['doc/UsersGuide.md', 'doc/UsersGuide.en.md']) {
    for (const chapter of read(f).split(/^## /m).slice(1)) assert.match(chapter, /!\[/, `${f}: ${chapter.split('\n')[0]}`);
  }
});

test('every UI text key used in the code has Korean and English text', () => {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/i18n-check.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('no leftovers from the interior design app the shell came from', () => {
  for (const file of ['src/app.js', 'src/popup.js', 'src/ui/startpage.js', 'index.html', 'src-tauri/tauri.conf.json']) {
    // Identifiers only (a comment may say where the shell came from).
    assert.doesNotMatch(read(file), /mysketchbook|MYSKETCHBOOK|\.msk\b/, file);
  }
});
