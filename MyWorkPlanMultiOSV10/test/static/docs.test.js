// Documentation checks: the generated HTML pages (scripts/build-docs.mjs), the
// links and pictures inside them, the README build commands, the Korean and
// English guides having the same chapters, and the shortcut table in the
// guides covering every shortcut the Settings › Shortcuts tab lists.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const docs = path.join(root, 'docs');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const PAGES = ['UsersGuide.html', 'UsersGuide.en.html', 'Tutorial.html', 'Tutorial.en.html'];
const imagesDir = path.join(docs, 'tutorial', 'images');
const haveTutorialImages = () => fs.existsSync(imagesDir) && fs.readdirSync(imagesDir).some((name) => name.toLowerCase().endsWith('.jpg'));

test('the four HTML documents exist and are complete pages', () => {
  for (const name of PAGES) {
    const file = path.join(docs, name);
    assert.ok(fs.existsSync(file), `${name} is missing — run npm run build:docs`);
    const html = fs.readFileSync(file, 'utf8');
    assert.ok(html.length > 2000, `${name} is too small (${html.length} bytes)`);
    assert.match(html, /^<!doctype html>/i, `${name} starts with a doctype`);
    assert.match(html, /<title>[^<]+<\/title>/, `${name} has a title`);
    assert.match(html, /<main>[\s\S]*<h1[^>]*>/, `${name} has a heading`);
    assert.match(html, /prefers-color-scheme: dark/, `${name} has dark colours`);
  }
  for (const name of ['UsersGuide.html', 'UsersGuide.en.html']) {
    const html = fs.readFileSync(path.join(docs, name), 'utf8');
    assert.ok(html.length > 30000, `${name} holds the whole guide`);
    assert.match(html, /<nav class="toc"[^>]*>[\s\S]*<li class="h2">/, `${name} has a table of contents`);
  }
});

test('the web build gets the same documents (public/docs)', () => {
  for (const name of PAGES) {
    const copy = path.join(root, 'public', 'docs', name);
    assert.ok(fs.existsSync(copy), `public/docs/${name} is missing — run npm run build:docs`);
    assert.equal(fs.readFileSync(copy, 'utf8'), fs.readFileSync(path.join(docs, name), 'utf8'), `public/docs/${name} is out of date`);
  }
});

/** Relative href / src values of a page (no web addresses, mail links or anchors). */
function relativeTargets(html) {
  const out = [];
  for (const match of html.matchAll(/\s(href|src)="([^"]*)"/g)) {
    const value = match[2].replace(/&amp;/g, '&');
    if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) continue;
    out.push({ kind: match[1], value: decodeURI(value.split('#')[0]) });
  }
  return out;
}

test('every relative link and picture in the documents resolves', async (t) => {
  for (const name of PAGES) {
    const html = fs.readFileSync(path.join(docs, name), 'utf8');
    const targets = relativeTargets(html);
    const tutorialImages = targets.filter((target) => target.value.startsWith('tutorial/images/'));
    const others = targets.filter((target) => !target.value.startsWith('tutorial/images/'));
    await t.test(`${name}: links`, () => {
      for (const target of others) assert.ok(fs.existsSync(path.join(docs, target.value)), `${name}: ${target.kind}="${target.value}" does not exist`);
    });
    await t.test(`${name}: tutorial pictures`, (sub) => {
      if (!tutorialImages.length) return;
      if (!haveTutorialImages()) {
        sub.skip('docs/tutorial/images has no pictures yet — run npm run tutorial:docs');
        return;
      }
      const missing = tutorialImages.filter((target) => !fs.existsSync(path.join(docs, target.value))).map((target) => target.value);
      assert.deepEqual(missing, [], `${name}: pictures not captured`);
    });
  }
});

test('the guides refer to tutorial pictures by the current step order', () => {
  const source = read('src/ui/tutorial.js');
  const ids = [...source.slice(source.indexOf('export const STEPS')).matchAll(/^\s*\{\s*id:\s*'([A-Za-z0-9_]+)'/gm)].map((m) => m[1]);
  assert.ok(ids.length > 10, 'STEPS found in src/ui/tutorial.js');
  for (const file of ['UsersGuide.md', 'UsersGuide.en.md']) {
    for (const match of read(file).matchAll(/docs\/tutorial\/images\/(\d\d)-([A-Za-z0-9_]+)\.jpg/g)) {
      const index = ids.indexOf(match[2]);
      assert.ok(index >= 0, `${file}: no tutorial step "${match[2]}"`);
      assert.equal(match[1], String(index + 1).padStart(2, '0'), `${file}: ${match[0]} should be numbered ${String(index + 1).padStart(2, '0')}`);
    }
  }
});

test('README names the build commands', () => {
  const readme = read('README.md');
  for (const command of ['build:win', 'build:mac', 'build:linux', 'build:all']) {
    assert.ok(readme.includes(`npm run ${command}`), `README.md mentions npm run ${command}`);
  }
  const scripts = JSON.parse(read('package.json')).scripts;
  for (const command of ['build:win', 'build:mac', 'build:linux', 'build:all']) assert.ok(scripts[command], `package.json has ${command}`);
});

/** h2 headings outside fenced code. */
function chapters(markdown) {
  let fenced = false;
  const out = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    else if (!fenced && /^##\s+\S/.test(line)) out.push(line.replace(/^##\s+/, '').trim());
  }
  return out;
}

test('the Korean and English guides have the same chapters', () => {
  const ko = chapters(read('UsersGuide.md'));
  const en = chapters(read('UsersGuide.en.md'));
  assert.ok(ko.length >= 10, `UsersGuide.md has its chapters (${ko.length})`);
  assert.equal(en.length, ko.length, `chapters: ko ${ko.length} (${ko.join(' | ')}) vs en ${en.length} (${en.join(' | ')})`);
});

/** A UI string from src/i18n/<language>.js, read as text (the files are browser modules). */
function uiString(language, key) {
  const source = read(`src/i18n/${language}.js`);
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`'${escaped}'\\s*:\\s*(['"])((?:\\\\.|(?!\\1).)*)\\1`).exec(source);
  assert.ok(match, `${language}.js has ${key}`);
  return match[2].replace(/\\(.)/g, '$1');
}

/** SHORTCUT_LIST of src/popup.js, parsed from the text (popup.js only runs in a browser). */
function shortcutList() {
  const source = read('src/popup.js');
  const block = /export const SHORTCUT_LIST\s*=\s*\[([\s\S]*?)\n\];/.exec(source);
  assert.ok(block, 'SHORTCUT_LIST found in src/popup.js');
  const pairs = [...block[1].matchAll(/\[\s*'([^']+)'\s*,\s*'([^']+)'\s*\]/g)].map((m) => ({ key: m[1], label: m[2] }));
  assert.ok(pairs.length > 20, `SHORTCUT_LIST parsed (${pairs.length} entries)`);
  return pairs;
}

test('the shortcut table of each guide lists every shortcut of Settings › Shortcuts', () => {
  const list = shortcutList();
  for (const [file, language] of [['UsersGuide.md', 'ko'], ['UsersGuide.en.md', 'en']]) {
    const rows = read(file).split(/\r?\n/).filter((line) => line.trim().startsWith('|'));
    const missing = [];
    for (const { key, label } of list) {
      const keyText = key.startsWith('shortcut.') ? uiString(language, key) : key;
      const labelText = uiString(language, label).replace(/…$/, '');
      const found = rows.some((row) => row.includes(`\`${keyText}\``) && row.includes(labelText));
      if (!found) missing.push(`${keyText} → ${labelText}`);
    }
    assert.deepEqual(missing, [], `${file}: shortcut rows missing`);
  }
});

test('the guides give the tutorial its real number of steps', () => {
  const src = read('src/ui/tutorial.js');
  const steps = [...src.slice(src.indexOf('export const STEPS')).matchAll(/^\s*\{\s*id:\s*'[A-Za-z0-9_]+'/gm)].length;
  for (const [file, pattern] of [['UsersGuide.md', /(\d+)단계/g], ['UsersGuide.en.md', /(\d+) steps/g]]) {
    const counts = [...read(file).matchAll(pattern)].map((m) => Number(m[1])).filter((n) => n > 20);
    assert.ok(counts.length, `${file} says how many steps`);
    assert.deepEqual([...new Set(counts)], [steps], `${file}: the tutorial has ${steps} steps`);
  }
});
