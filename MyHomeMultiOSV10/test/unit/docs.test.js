// The user's guide and the tutorial document: Korean and English pairs in doc/, every picture
// they show exists, the built pages are up to date in public/docs/, and the help windows know them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOC_KINDS, docUrl } from '../../src/domain/helpdocs.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOCS = ['UsersGuide', 'Tutorial'];

test('doc/ holds the guide and the tutorial in Korean and English', () => {
  for (const name of DOCS) for (const suffix of ['', '.en']) assert.ok(fs.existsSync(path.join(root, 'doc', `${name}${suffix}.md`)), `${name}${suffix}.md`);
});

test('every picture of the documents exists, and Korean and English show the same pictures', () => {
  for (const name of DOCS) {
    const pictures = {};
    for (const [lang, suffix] of [['ko', ''], ['en', '.en']]) {
      const text = fs.readFileSync(path.join(root, 'doc', `${name}${suffix}.md`), 'utf8');
      pictures[lang] = [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
      for (const picture of pictures[lang]) assert.ok(fs.existsSync(path.join(root, 'doc', picture)), `${name}${suffix}: ${picture}`);
      for (const picture of pictures[lang]) assert.ok(picture.startsWith(`images/${lang}/`), `${name}${suffix}: ${picture} is not a ${lang} picture`);
    }
    assert.deepEqual(pictures.ko.map((p) => path.basename(p)), pictures.en.map((p) => path.basename(p)), name);
  }
});

test('the built pages are newer than their sources and link their pictures', () => {
  for (const name of DOCS) {
    for (const suffix of ['', '.en']) {
      const source = path.join(root, 'doc', `${name}${suffix}.md`);
      const page = path.join(root, 'public', 'docs', `${name}${suffix}.html`);
      assert.ok(fs.existsSync(page), `${page} (npm run build:docs)`);
      assert.ok(fs.statSync(page).mtimeMs >= fs.statSync(source).mtimeMs - 1000, `${name}${suffix}.html is older than its source (npm run build:docs)`);
      const html = fs.readFileSync(page, 'utf8');
      for (const [, src] of html.matchAll(/<img src="([^"]+)"/g)) assert.ok(fs.existsSync(path.join(root, 'public', 'docs', decodeURI(src))), `${name}${suffix}.html: ${src}`);
    }
  }
});

test('the help windows open these pages', () => {
  assert.deepEqual(Object.keys(DOC_KINDS).sort(), ['guide', 'tutorial']);
  assert.equal(docUrl('guide', 'en'), 'docs/UsersGuide.en.html');
  assert.equal(docUrl('tutorial', 'ko'), 'docs/Tutorial.html');
});

test('the guide names the installer commands', () => {
  for (const suffix of ['', '.en']) {
    const text = fs.readFileSync(path.join(root, 'doc', `UsersGuide${suffix}.md`), 'utf8');
    for (const command of ['npm run build:win', 'npm run build:mac', 'npm run build:linux', 'npm run build:webapp', 'npm run build:all']) assert.ok(text.includes(command), `${command} in UsersGuide${suffix}.md`);
  }
});
