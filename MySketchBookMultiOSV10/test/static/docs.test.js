// Documentation checks: the HTML pages scripts/build-docs.mjs makes (and their copies for the
// web build), the links and pictures inside them and inside the Markdown documents, the README's
// commands, the Korean and English guides having the same chapters, the guides' shortcut tables
// covering every shortcut of Settings › Shortcuts (src/popup.js SHORTCUT_LIST), and the tutorial
// documents following the in-app tutorial (src/ui/tutorial.js) step by step.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const docs = path.join(root, 'doc');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const PAGES = ['UsersGuide.html', 'UsersGuide.en.html', 'Tutorial.html', 'Tutorial.en.html'];
const GUIDES = [['doc/UsersGuide.md', 'ko'], ['doc/UsersGuide.en.md', 'en']];
const { DICTIONARIES } = await import(pathToFileURL(path.join(root, 'src', 'i18n.js')).href);
const { tutorialSteps } = await import(pathToFileURL(path.join(root, 'scripts', 'build-docs.mjs')).href);
const helpdocs = await import(pathToFileURL(path.join(root, 'src', 'domain', 'helpdocs.js')).href);
const { steps, chapters } = tutorialSteps();
const ui = (language, key) => {
  const text = DICTIONARIES[language][key];
  assert.ok(text, `src/i18n has ${key} (${language})`);
  return text;
};

/** h2 headings outside fenced code. */
function headings(markdown, level = 2) {
  let fenced = false;
  const out = [];
  const pattern = new RegExp(`^#{${level}}\\s+\\S`);
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    else if (!fenced && pattern.test(line)) out.push(line.replace(/^#+\s+/, '').trim());
  }
  return out;
}

/** Relative href / src values of an HTML page (no web addresses, mail links or anchors). */
function relativeTargets(html) {
  const out = [];
  for (const match of html.matchAll(/\s(href|src)="([^"]*)"/g)) {
    const value = match[2].replace(/&amp;/g, '&');
    if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) continue;
    out.push({ kind: match[1], value: decodeURI(value.split('#')[0]) });
  }
  return out;
}

/** Relative link and picture targets of a Markdown file (outside code). */
function markdownTargets(markdown) {
  const text = markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  return [...text.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)]
    .map((m) => m[1])
    .filter((url) => !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url))
    .map((url) => decodeURI(url.split('#')[0]));
}

test('the four HTML documents exist and are complete pages', () => {
  for (const name of PAGES) {
    const file = path.join(docs, name);
    assert.ok(fs.existsSync(file), `doc/${name} is missing — run npm run build:docs`);
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, /^<!doctype html>/i, `${name} starts with a doctype`);
    assert.match(html, /<title>[^<]+<\/title>/, `${name} has a title`);
    assert.match(html, /<main>[\s\S]*<h1[^>]*>/, `${name} has a heading`);
    assert.match(html, /prefers-color-scheme: dark/, `${name} has dark colours`);
    assert.match(html, /<nav class="toc"[^>]*>[\s\S]*<li class="h2">/, `${name} has a table of contents`);
    assert.match(html, new RegExp(`<html lang="${name.includes('.en.') ? 'en' : 'ko'}">`), `${name} declares its language`);
  }
  for (const name of ['UsersGuide.html', 'UsersGuide.en.html']) {
    assert.ok(fs.readFileSync(path.join(docs, name), 'utf8').length > 60000, `${name} holds the whole guide`);
  }
});

test('the HTML guides are up to date with the Markdown guides', () => {
  for (const [file] of GUIDES) {
    const html = fs.readFileSync(path.join(root, file.replace(/\.md$/, '.html')), 'utf8');
    for (const heading of headings(read(file), 2)) {
      const text = heading.replace(/[`*]/g, '').replace(/&/g, '&amp;').replace(/'/g, '&#39;');
      assert.ok(html.includes(text), `${file}: chapter "${heading}" is missing from the HTML — run npm run build:docs`);
    }
  }
});

test('the web build gets the same documents (public/doc)', () => {
  for (const name of PAGES) {
    const copy = path.join(root, 'public', 'doc', name);
    assert.ok(fs.existsSync(copy), `public/doc/${name} is missing — run npm run build:docs`);
    assert.equal(fs.readFileSync(copy, 'utf8'), fs.readFileSync(path.join(docs, name), 'utf8'), `public/doc/${name} is out of date`);
  }
  for (const target of PAGES.flatMap((name) => relativeTargets(fs.readFileSync(path.join(docs, name), 'utf8')))) {
    if (target.value.startsWith('tutorial/images/')) assert.ok(fs.existsSync(path.join(root, 'public', 'doc', target.value)), `public/doc/${target.value} is missing`);
  }
});

test('every relative link and picture in the HTML documents resolves', () => {
  for (const name of PAGES) {
    const targets = relativeTargets(fs.readFileSync(path.join(docs, name), 'utf8'));
    const missing = targets.filter((target) => !fs.existsSync(path.join(docs, target.value))).map((target) => `${target.kind}="${target.value}"`);
    assert.deepEqual(missing, [], `${name}: links or pictures that do not exist`);
  }
});

test('every relative link and picture in the Markdown documents resolves', () => {
  for (const file of ['README.md', 'ARCHITECTURE.md', 'doc/UsersGuide.md', 'doc/UsersGuide.en.md']) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} exists`);
    const missing = markdownTargets(read(file)).filter((target) => !fs.existsSync(path.resolve(root, path.dirname(file), target)));
    assert.deepEqual(missing, [], `${file}: links or pictures that do not exist`);
  }
});

test('anchor links inside the guides point at their own headings', async () => {
  const { slugify } = await import(pathToFileURL(path.join(root, 'scripts', 'build-docs.mjs')).href);
  for (const [file] of GUIDES) {
    const markdown = read(file);
    const ids = new Set([...markdown.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => slugify(m[1].replace(/[`*]/g, ''))));
    const anchors = [...markdown.matchAll(/\]\(#([^)]+)\)/g)].map((m) => decodeURIComponent(m[1]));
    for (const anchor of anchors) assert.ok(ids.has(anchor), `${file}: #${anchor} has no heading`);
  }
});

test('the guides use tutorial pictures by the current step order and language', () => {
  for (const [file, language] of GUIDES) {
    const pictures = [...read(file).matchAll(/tutorial\/images\/((?:en\/)?)(\d\d)-([A-Za-z0-9_]+)\.jpg/g)];
    assert.ok(pictures.length >= 10, `${file} shows the program (${pictures.length} pictures)`);
    for (const [whole, folder, number, id] of pictures) {
      const index = steps.findIndex((step) => step.id === id);
      assert.ok(index >= 0, `${file}: no tutorial step "${id}"`);
      assert.equal(number, String(index + 1).padStart(2, '0'), `${file}: ${whole} should be numbered ${String(index + 1).padStart(2, '0')}`);
      assert.equal(folder, language === 'en' ? 'en/' : '', `${file}: ${whole} is a picture of the ${language === 'en' ? 'English' : 'Korean'} screen`);
    }
  }
});

test('README names how to install, run, test and build', () => {
  const readme = read('README.md');
  const scripts = JSON.parse(read('package.json')).scripts;
  for (const command of ['install', 'run assets', 'start', 'run dev', 'test', 'run build:win', 'run build:mac', 'run build:linux', 'run build:all', 'run build:web', 'run build:docs', 'run tutorial:docs']) {
    assert.ok(readme.includes(`npm ${command}`), `README.md mentions npm ${command}`);
    const script = command.replace(/^run /, '');
    if (!['install', 'test', 'start'].includes(script)) assert.ok(scripts[script], `package.json has the script ${script}`);
  }
  assert.ok(scripts.start && scripts.test, 'package.json has start and test');
  assert.match(readme, /library\/LICENSES\.md/, 'README points to the asset licences');
  assert.match(readme, /CC0/, 'README names the CC0 licence of the assets');
});

test('the Korean and English guides have the same chapters', () => {
  const ko = headings(read('doc/UsersGuide.md'), 2);
  const en = headings(read('doc/UsersGuide.en.md'), 2);
  assert.ok(ko.length >= 15, `UsersGuide.md has its chapters (${ko.length})`);
  assert.equal(en.length, ko.length, `chapters: ko ${ko.length} (${ko.join(' | ')}) vs en ${en.length} (${en.join(' | ')})`);
  const numbers = (list) => list.map((h) => /^(\d+)\./.exec(h)?.[1] ?? null);
  assert.deepEqual(numbers(en), numbers(ko), 'chapter numbers match');
  const sub = (file) => headings(read(file), 3).map((h) => /^(\d+\.\d+)/.exec(h)?.[1]).filter(Boolean);
  assert.deepEqual(sub('doc/UsersGuide.en.md'), sub('doc/UsersGuide.md'), 'numbered sections match');
});

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
  for (const [file, language] of GUIDES) {
    const rows = read(file).split(/\r?\n/).filter((line) => line.trim().startsWith('|'));
    const missing = [];
    for (const { key, label } of list) {
      const keyText = key.startsWith('shortcut.') ? ui(language, key) : key;
      const labelText = ui(language, label).replace(/…$/, '');
      if (!rows.some((row) => row.includes(`\`${keyText}\``) && row.includes(labelText))) missing.push(`${keyText} → ${labelText}`);
    }
    assert.deepEqual(missing, [], `${file}: shortcut rows missing`);
  }
});

test('the guides list every single-key tool shortcut of the commands', () => {
  // Single keys come from the commands' `key` in src/app.js (toolCommand(id, glyph, 'X') and key: 'X').
  const source = read('src/app.js');
  const keys = new Set([...source.matchAll(/toolCommand\('[A-Za-z]+',\s*'[A-Za-z0-9]+',\s*'((?:Shift\+)?[A-Z]|Space)'\)/g)].map((m) => m[1]));
  for (const m of source.matchAll(/key:\s*'((?:Shift\+)?[A-Z]|F\d+)'/g)) keys.add(m[1]);
  assert.ok(keys.size > 20, `single-key shortcuts found (${keys.size})`);
  for (const [file] of GUIDES) {
    const rows = read(file).split(/\r?\n/).filter((line) => line.trim().startsWith('|'));
    const missing = [...keys].filter((key) => !rows.some((row) => row.includes(`\`${key}\``)));
    assert.deepEqual(missing, [], `${file}: keys not in a table`);
  }
});

test('the guides give the tutorial its real number of chapters and steps', () => {
  assert.ok(steps.length > 20 && chapters.length > 4, `tutorial parsed (${chapters.length} chapters, ${steps.length} steps)`);
  for (const step of steps) assert.ok(chapters.includes(step.chapter), `step ${step.id}: chapter ${step.chapter} is listed in CHAPTERS`);
  // "8개 장, 30단계" / "8 chapters and 30 steps", "8 chapters, 30 steps" (other step counts, e.g. 100 undo steps, are not the tutorial's).
  for (const [file, pattern] of [['doc/UsersGuide.md', /(\d+)개 장, (\d+)단계/g], ['doc/UsersGuide.en.md', /(\d+) chapters(?:,| and) (\d+) steps/g]]) {
    const found = [...read(file).matchAll(pattern)];
    const stepCounts = found.map((m) => Number(m[2]));
    const chapterCounts = found.map((m) => Number(m[1]));
    assert.ok(stepCounts.length, `${file} says how many chapters and steps the tutorial has`);
    assert.deepEqual([...new Set(stepCounts)], [steps.length], `${file}: the tutorial has ${steps.length} steps`);
    assert.deepEqual([...new Set(chapterCounts)], [chapters.length], `${file}: the tutorial has ${chapters.length} chapters`);
  }
});

test('the tutorial documents follow the in-app tutorial step by step', () => {
  for (const [name, language] of [['Tutorial.html', 'ko'], ['Tutorial.en.html', 'en']]) {
    const html = fs.readFileSync(path.join(docs, name), 'utf8');
    const h2 = [...html.matchAll(/<h2 id="[^"]+">([\s\S]*?)<\/h2>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s*#\s*$/, '').trim());
    const h3 = [...html.matchAll(/<h3 id="[^"]+">([\s\S]*?)<\/h3>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s*#\s*$/, '').trim());
    const unescape = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    chapters.forEach((id, i) => assert.ok(h2.map(unescape).includes(`${i + 1}. ${ui(language, `tutorial.chapter.${id}`)}`), `${name}: chapter ${i + 1} (${id})`));
    assert.equal(h3.length, steps.length, `${name}: one section per step`);
    steps.forEach((step, i) => {
      assert.equal(unescape(h3[i]), `${i + 1}. ${ui(language, `tutorial.${step.id}.title`)}`, `${name}: step ${i + 1} (${step.id})`);
      const text = ui(language, `tutorial.${step.id}.text`).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
      assert.ok(html.includes(text), `${name}: the text of step ${i + 1} (${step.id})`);
    });
    // Pictures, when captured, are in step order and of the page's language.
    const pictures = [...html.matchAll(/src="tutorial\/images\/((?:en\/)?)(\d\d)-([A-Za-z0-9_]+)\.jpg"/g)];
    for (const [, folder, number, id] of pictures) {
      assert.equal(number, String(steps.findIndex((step) => step.id === id) + 1).padStart(2, '0'), `${name}: picture ${number}-${id}`);
      if (language === 'ko') assert.equal(folder, '', `${name}: Korean pictures`);
    }
  }
});

test('every tutorial step has its picture in both languages', () => {
  for (const folder of ['', 'en']) {
    const dir = path.join(docs, 'tutorial', 'images', folder);
    const missing = steps.map((step, i) => `${String(i + 1).padStart(2, '0')}-${step.id}.jpg`).filter((name) => !fs.existsSync(path.join(dir, name)));
    assert.deepEqual(missing, [], `doc/tutorial/images/${folder}: pictures missing — run npm run tutorial:docs`);
    const expected = new Set(steps.map((step, i) => `${String(i + 1).padStart(2, '0')}-${step.id}.jpg`));
    const stale = fs.readdirSync(dir).filter((name) => name.endsWith('.jpg') && !expected.has(name));
    assert.deepEqual(stale, [], `doc/tutorial/images/${folder}: pictures of steps that no longer exist`);
  }
});

test('the in-app document windows find the generated pages (src/domain/helpdocs.js)', () => {
  for (const [kind, info] of Object.entries(helpdocs.DOC_KINDS)) {
    if (!info.file) continue;
    for (const language of ['ko', 'en']) {
      const url = helpdocs.docUrl(kind, language);
      assert.ok(url.startsWith('doc/'), `${kind} (${language}) is served from doc/`);
      assert.ok(fs.existsSync(path.join(root, url)), `${url} exists (the ${kind} window opens it)`);
      assert.ok(fs.existsSync(path.join(root, 'public', url)), `public/${url} exists (web build)`);
    }
  }
  const titles = Object.values(helpdocs.DOC_KINDS).map((info) => info.title);
  for (const key of titles) for (const language of ['ko', 'en']) ui(language, key);
});
