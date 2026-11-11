// UI shell unit tests (node:test, no browser): icons, IconRefs, the icon catalogue, the emoji list,
// texts, settings, recent list, undo history, starters, the API client and the live channel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = path.join(root, 'src');
const walk = (dir, out = []) => { for (const n of readdirSync(dir)) { const f = path.join(dir, n); if (statSync(f).isDirectory()) walk(f, out); else if (/\.js$/.test(n)) out.push(f); } return out; };
const sources = walk(src).filter((f) => !/i18n[\\/]|emoji-data|icons-catalog/.test(f));

const { hasIcon, ICON_NAMES } = await import('../../src/icons.js');
const { CATALOG, CATALOG_CATEGORIES, CATALOG_NAMES } = await import('../../src/icons-catalog.js');
const { EMOJI, EMOJI_CATEGORIES } = await import('../../src/ui/emoji-data.js');
const { parseIconRef, makeIconRef, renderIconRef, renderIconRefsInHtml, normalizeColor, readableOn } = await import('../../src/ui/iconref.js');
const { searchBuiltin, searchEmoji, fitSize, isAnimated, pictureType } = await import('../../src/ui/iconpicker.js');
const { DICTIONARIES } = await import('../../src/i18n.js');
const { collectKeys } = await import('../../scripts/i18n-check.mjs');

test('every app icon the shell names exists', () => {
  const missing = new Set();
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\bicon\(\s*'([A-Za-z0-9]+)'/g)) if (!hasIcon(m[1])) missing.add(`${m[1]} (${path.basename(file)})`);
    for (const m of text.matchAll(/\bicon:\s*'([A-Za-z0-9]+)'/g)) if (!hasIcon(m[1]) && !m[0].includes('b:')) missing.add(`${m[1]} (${path.basename(file)})`);
    for (const m of text.matchAll(/\bglyph:\s*'([A-Za-z0-9]+)'/g)) if (!hasIcon(m[1])) missing.add(`${m[1]} (${path.basename(file)})`);
  }
  assert.deepEqual([...missing], []);
  assert.ok(ICON_NAMES.length > 200);
});

test('the built-in catalogue has ≥300 icons in categories, with every name ARCHITECTURE §4 lists', () => {
  assert.ok(CATALOG_NAMES.length >= 300, `${CATALOG_NAMES.length} icons`);
  const categories = new Set(CATALOG_CATEGORIES.map((c) => c.id));
  for (const [name, e] of Object.entries(CATALOG)) {
    assert.match(name, /^[a-z][a-zA-Z0-9]*$/);
    assert.ok(categories.has(e.c), `${name}: category ${e.c}`);
    assert.ok(e.ko && e.en && e.d, name);
    assert.doesNotMatch(e.d, /<script|on[a-z]+=|href|<text|<svg/i, name);
  }
  const contract = readFileSync(path.join(root, 'ARCHITECTURE.md'), 'utf8');
  const required = ['bug', 'story', 'task', 'epic', 'subtask', 'check', 'flag', 'star', 'rocket', 'bolt', 'user', 'folder', 'calendar', 'clock', 'tag', 'link', 'comment', 'paperclip', 'chart', 'shield', 'gear', 'home', 'heart', 'fire', 'bookmark', 'lightning', 'cloud', 'database', 'code', 'globe', 'lock', 'bell', 'search', 'layers', 'target', 'trophy'];
  // Names quoted as b:<name> in the contract count too.
  for (const m of contract.matchAll(/`b:([a-z][a-zA-Z0-9]*)`/g)) if (m[1] !== 'name') required.push(m[1]);
  for (const name of required) assert.ok(CATALOG[name], `catalogue lacks ${name}`);
  // Every b:<name> the core writes (templates, priorities, types) resolves to a catalogue icon.
  const coreFiles = ['core', 'server'].flatMap((dir) => { try { return walk(path.join(root, dir)); } catch { return []; } });
  for (const file of coreFiles) for (const m of readFileSync(file, 'utf8').matchAll(/['"`]b:([a-zA-Z0-9_-]+)/g)) assert.ok(parseIconRef(`b:${m[1]}`).known, `${path.basename(file)}: b:${m[1]} is not in the catalogue`);
});

test('the emoji list is large, unique and fully tagged', () => {
  assert.ok(EMOJI.length >= 600);
  const ids = new Set(EMOJI_CATEGORIES.map((c) => c.id));
  const seen = new Set();
  for (const [emoji, cat, en, ko] of EMOJI) {
    assert.ok(!seen.has(emoji), `duplicate ${emoji}`);
    seen.add(emoji);
    assert.ok(ids.has(cat) && en && ko, emoji);
  }
  assert.ok(searchEmoji('bug').some(([e]) => e === '🐛'));
  assert.ok(searchEmoji('로켓').some(([e]) => e === '🚀'));
});

test('IconRefs parse, build and render safely', () => {
  assert.deepEqual(parseIconRef('b:bug#E5484D'), { kind: 'builtin', name: 'bug', color: '#e5484d', known: true });
  assert.equal(parseIconRef('e:🚀').emoji, '🚀');
  assert.equal(parseIconRef('u:abc123').id, 'abc123');
  assert.equal(parseIconRef('u:../x').kind, 'none');
  assert.deepEqual(parseIconRef('l:ab#123'), { kind: 'letters', text: 'AB', color: '#112233' });
  assert.equal(parseIconRef('').kind, 'none');
  assert.equal(parseIconRef('b:priority-highest').name, 'highest');
  assert.equal(parseIconRef('b:in-progress').name, 'inProgress');
  assert.equal(parseIconRef('b:no-such-icon').known, false);
  assert.equal(makeIconRef({ kind: 'builtin', name: 'star', color: '#fa0' }), 'b:star#ffaa00');
  assert.equal(makeIconRef({ kind: 'letters', text: 'kim', color: '#000' }), 'l:ki#000000');
  assert.equal(normalizeColor('nope'), null);
  assert.equal(readableOn('#ffffff'), '#1b1f24');
  assert.equal(readableOn('#000000'), '#ffffff');
  assert.match(renderIconRef('b:bug'), /<svg[^>]+iconref/);
  assert.match(renderIconRef('u:abc'), /src="\/api\/icons\/abc"/);
  assert.doesNotMatch(renderIconRef('e:<img onerror=x>'), /<img onerror/);
  assert.doesNotMatch(renderIconRef('l:<b>#ff0000'), /<b>/);
  assert.match(renderIconRef('', { fallback: 'l:MB' }), /iconref-l/);
  assert.match(renderIconRefsInHtml('Fixed :icon[b:check#2f9e8f] today'), /<svg/);
});

test('the icon picker searches in Korean and English and sizes uploads', () => {
  assert.ok(searchBuiltin('bug').includes('bug'));
  assert.ok(searchBuiltin('버그').includes('bug'));
  assert.ok(searchBuiltin('', 'priority').every((n) => CATALOG[n].c === 'priority'));
  assert.deepEqual(fitSize(1024, 512), { width: 256, height: 128 });
  assert.deepEqual(fitSize(64, 32), { width: 64, height: 32 });
  assert.equal(pictureType({ name: 'a.ICO', type: '' }), 'image/x-icon');
  assert.equal(pictureType({ name: 'a.txt', type: 'text/plain' }), '');
  const riff = new Uint8Array(40); riff.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0); riff.set([...'WEBPVP8X'].map((c) => c.charCodeAt(0)), 8); riff[20] = 0x02;
  assert.equal(isAnimated(riff, 'image/webp'), true);
});

test('every text the UI uses exists in Korean and English', async () => {
  // Views register their own texts (src/views/**/texts.js → registerTexts), as scripts/i18n-check.mjs reads them.
  const { registerTexts } = await import('../../src/i18n.js');
  for (const file of walk(path.join(src, 'views')).filter((f) => path.basename(f) === 'texts.js')) {
    const mod = await import(pathToFileURL(file).href);
    registerTexts(mod.TEXTS ?? mod.default ?? mod);
  }
  const { used } = collectKeys(sources);
  const missing = [...used].filter((k) => !(k in DICTIONARIES.ko) || !(k in DICTIONARIES.en));
  assert.deepEqual(missing, []);
  assert.deepEqual(Object.keys(DICTIONARIES.ko).filter((k) => !(k in DICTIONARIES.en)), []);
  assert.deepEqual(Object.keys(DICTIONARIES.en).filter((k) => !(k in DICTIONARIES.ko)), []);
});

test('no 3D / interior / other-product leftovers in the shell sources', () => {
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    // MySketchBook may be named in comments (where the shell comes from); its code and file types may not.
    assert.ok(!/from 'three'|three\/examples|mysketchbook|\.msk\b/.test(text), `${path.basename(file)}: 3D / MySketchBook code`);
    // Another board app's export format is read (import), but its names are not shown anywhere.
    const shown = text.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
    assert.ok(!/\b(Jira|Atlassian|Trello)\b/.test(shown), `${path.basename(file)}: another product's name`);
  }
});

test('every popup kind has a size, and the desktop backend allows the same kinds', async () => {
  const { POPUPS } = await import('../../src/platform/popups.js');
  const popupSource = readFileSync(path.join(src, 'popup.js'), 'utf8');
  const rendered = [...popupSource.matchAll(/\b([a-z]+): render[A-Z]\w*/g)].map((m) => m[1]);
  for (const kind of rendered) assert.ok(POPUPS[kind], `POPUPS.${kind} (size)`);
  const lib = readFileSync(path.join(root, 'src-tauri', 'src', 'lib.rs'), 'utf8');
  const kinds = /const POPUP_KINDS: &\[&str\] = &\[([^\]]+)\]/.exec(lib)[1].match(/"([a-z]+)"/g).map((k) => k.slice(1, -1));
  assert.deepEqual([...kinds].sort(), Object.keys(POPUPS).sort());
  const app = readFileSync(path.join(src, 'app.js'), 'utf8');
  for (const m of app.matchAll(/popups\.open\('([a-z]+)'/g)) assert.ok(POPUPS[m[1]], `app.js opens ${m[1]}`);
});
