// The main window's pure parts: settings, sample vaults (read by the real Rust core), the file tree, the
// palette's matcher, every icon and text the UI names, and the core's API through WebAssembly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCore } from './helpers/core.mjs';
import { defaultSettings, normalizeSettings } from '../../src/domain/settings.js';
import { SAMPLE_IDS, sampleFiles, sampleStart } from '../../src/domain/samples.js';
import { fuzzy, highlight } from '../../src/ui/palette.js';
import { VaultIndex } from '../../src/vault/index.js';

test('settings: defaults survive normalisation, bad values are repaired', () => {
  const d = defaultSettings('ko');
  assert.equal(normalizeSettings(d).defaultMode, 'live');
  const s = normalizeSettings({ defaultMode: 'nope', splitShare: 300, readingTheme: 'x', focusMode: 'line', autosaveDelay: 5, exportOptions: { toc: true }, ai: null });
  assert.equal(s.defaultMode, 'live');
  assert.equal(s.splitShare, 85);
  assert.equal(s.readingTheme, 'app');
  assert.equal(s.focusMode, 'line');
  assert.equal(s.autosaveDelay, 300);
  assert.equal(s.exportOptions.toc, true);
  assert.equal(s.exportOptions.embedImages, true);
  assert.ok(s.ai && typeof s.ai.provider === 'string');
});

test('sample vaults: every link resolves (except the deliberate ones) and the start note exists', () => {
  for (const id of SAMPLE_IDS) {
    for (const lang of ['ko', 'en']) {
      const core = createCore();
      const files = sampleFiles(id, lang);
      core('setFiles', { files: Object.keys(files).map((path) => ({ path, kind: 'file' })) });
      core('setTexts', { items: Object.entries(files) });
      const snap = core('snapshot');
      assert.ok(files[sampleStart(id, lang)] !== undefined, `${id}/${lang}: start note ${sampleStart(id, lang)}`);
      const unresolved = Object.entries(snap.notes).flatMap(([path, m]) => m.links.filter((l) => l.target && !l.resolved).map((l) => `${path} → ${l.target}`));
      const allowed = /나중에 쓸 메모|Someday note/;
      assert.deepEqual(unresolved.filter((u) => !allowed.test(u)), [], `${id}/${lang}`);
      for (const [path, m] of Object.entries(snap.notes)) assert.equal(m.frontmatterError, null, `${id}/${lang} ${path}: ${m.frontmatterError}`);
      const rendered = core('render', { path: sampleStart(id, lang) });
      assert.ok(rendered.html.length > 100);
    }
  }
});

test('the index view: backlinks, tags, orphans and quick resolution from the core snapshot', () => {
  const core = createCore();
  core('setTexts', { items: [['A.md', 'See [[B]] #x/y'], ['B.md', 'Back [[A]]'], ['Lonely.md', 'alone'], ['dir/C.md', '---\naliases: [See]\n---\n']] });
  const index = new VaultIndex();
  index.load(core('snapshot'));
  assert.deepEqual(index.backlinks('A.md').map((b) => b.from), ['B.md']);
  assert.deepEqual(index.tags().map((x) => x.tag), ['#x/y']);
  assert.ok(index.orphans().includes('Lonely.md'));
  assert.equal(index.resolveQuick('C', 'A.md'), 'dir/C.md');
  assert.equal(index.resolveQuick('See', ''), 'dir/C.md');
});

test('palette matching', () => {
  assert.deepEqual(fuzzy('gv', 'graph view'), [0, 6]);
  assert.equal(fuzzy('zz', 'graph'), null);
  assert.equal(highlight('ab<', [0]), '<b>a</b>b&lt;');
});

test('the core API: search, render, rename with link updates, export through WebAssembly', () => {
  const core = createCore();
  core('setTexts', { items: [['Home.md', '# Home\n[[Plan]] ![[Plan#Goals]]'], ['Plan.md', '# Plan\n## Goals\nship it #work']] });
  assert.equal(core('search', { query: 'tag:#work' })[0].path, 'Plan.md');
  const html = core('render', { path: 'Home.md' }).html;
  assert.ok(html.includes('ship it') && html.includes('internal-link'));
  const edits = core('rename', { from: 'Plan.md', to: 'Projects/Roadmap.md' });
  assert.ok(edits.some((e) => e.path === 'Home.md' && e.text.includes('[[Roadmap]]') && e.text.includes('![[Roadmap#Goals]]')));
  const docx = core('export', { format: 'docx', path: 'Home.md', title: 'Home' });
  assert.ok(typeof docx === 'string' && docx.startsWith('UEsD'), 'a zip (PK) as base64');
  const md = core('flatten', { path: 'Home.md' });
  assert.ok(md.includes('ship it'));
  assert.equal(core('formatDate', { format: 'YYYY-MM-DD', now: Date.UTC(2026, 10, 27, 12), offset: 0 }), '2026-11-27');
  assert.ok(core('exportFormats').length >= 17);
});

test('every icon the main window names exists', async () => {
  const { hasIcon } = await import('../../src/icons.js');
  await import('../../src/icons-app.js');
  await import('../../src/ai/ai-icons.js');
  await import('../../src/render/render-icons.js');
  await import('../../src/editor/editor-icons.js');
  const src = ['src/app.js', 'src/panels/panels.js', 'src/features.js', 'src/ui/startpage.js', 'src/views/note-view.js'].map((f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8')).join('\n');
  const names = new Set();
  for (const m of src.matchAll(/icon\(\s*'([a-zA-Z][a-zA-Z0-9]+)'/g)) names.add(m[1]);
  for (const m of src.matchAll(/\bicon:\s*'([a-zA-Z][a-zA-Z0-9]+)'/g)) names.add(m[1]);
  for (const m of src.matchAll(/(?:fmt|modeCommand)\('[^']+',\s*'([a-zA-Z][a-zA-Z0-9]+)'/g)) names.add(m[1]);
  const missing = [...names].filter((n) => !hasIcon(n));
  assert.deepEqual(missing, []);
});
