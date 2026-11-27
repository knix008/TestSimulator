// Lists the text keys the main window's modules use that no dictionary defines (they would show as the key).
// Dynamic keys (t(`panel.${id}`)) are expanded from the lists they come from where known.
// node scripts/text-audit.mjs [--ko-only]  → exit code 1 when something is missing.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const files = ['src/app.js', 'src/panels/panels.js', 'src/features.js', 'src/ui/startpage.js', 'src/views/note-view.js', 'src/ui/palette.js', 'src/popup.js', 'src/ui/tutorial.js', 'src/viewer.js'];
const keys = new Set();
for (const f of files) {
  let s = '';
  try { s = readFileSync(path.join(root, f), 'utf8'); } catch { continue; }
  for (const m of s.matchAll(/\bt\(\s*'([a-zA-Z0-9_.:-]+)'/g)) keys.add(m[1]);
  for (const m of s.matchAll(/(?:label|labelKey|title):\s*'([a-z][a-zA-Z0-9]*\.[a-zA-Z0-9_.-]+)'/g)) keys.add(m[1]);
  for (const m of s.matchAll(/(?:fmt|modeCommand)\(\s*'([a-z][a-zA-Z0-9]*\.[a-zA-Z0-9_.-]+)'/g)) keys.add(m[1]);
}
const expand = (prefix, ids, suffix = '') => ids.forEach((id) => keys.add(`${prefix}${id}${suffix}`));
const P = await import(pathToFileURL(path.join(root, 'src/panels/panels.js')).href);
expand('panel.', P.LEFT_TABS.map(([id]) => id)); expand('panel.', P.LEFT_TABS.map(([id]) => id), 'Short'); expand('panel.', P.RIGHT_TABS.map(([id]) => id));
expand('notes.filter.', P.NOTE_FILTERS.map(([id]) => id)); expand('sort.', [...P.SORT_ORDERS, 'relevance']);
expand('props.type.', ['text', 'list', 'number', 'checkbox', 'date', 'datetime']);
expand('style.kind.', ['filler', 'redundancy', 'cliche', 'hedge', 'passive', 'long-sentence', 'repeated-word', 'double-space']);
expand('mode.', ['live', 'source', 'reading', 'split']); expand('mode.', ['live', 'source', 'reading', 'split'], '.tip');
expand('readingTheme.', ['app', 'original', 'dark', 'creamy', 'solarized', 'contrast']); expand('readingFont.', ['system', 'inter', 'open-sans', 'lora', 'roboto-slab', 'serif', 'mono']); expand('readingPadding.', ['compact', 'normal', 'roomy']);
expand('export.', ['pdf', 'html', 'html-plain', 'docx', 'odt', 'epub', 'rtf', 'latex', 'markdown', 'text', 'djot', 'rst', 'asciidoc', 'mediawiki', 'textile', 'opml', 'org', 'json']);
expand('slash.', ['h1', 'h2', 'h3', 'task', 'bullet', 'numbered', 'quote', 'callout', 'table', 'code', 'math', 'mermaid', 'chart', 'rule', 'footnote', 'link', 'toc', 'date', 'time', 'template', 'embed']);
expand('submenu.', ['newMore', 'exportAs', 'fileOps', 'headings', 'lists', 'tables', 'modes', 'panes', 'leftTabs', 'rightTabs', 'show', 'zoom', 'appearance', 'focus', 'present', 'workspaces', 'composer', 'folding']);
expand('menu.', ['file', 'edit', 'format', 'view', 'notes', 'tools', 'help', 'home']);
expand('bottom.', ['problems', 'messages', 'info']); expand('vault.kind.', ['desktop', 'folder', 'browser']);
const { SAMPLE_IDS } = await import(pathToFileURL(path.join(root, 'src/domain/samples.js')).href);
expand('sample.', SAMPLE_IDS); expand('sample.', SAMPLE_IDS, '.desc');
const { DICTIONARIES } = await import(pathToFileURL(path.join(root, 'src/i18n.js')).href);
for (const extra of ['src/i18n/app-texts.js', 'src/ai/texts.js', 'src/editor/texts.js', 'src/render/texts.js', 'src/views/graph-texts.js', 'src/views/canvas/texts.js']) await import(pathToFileURL(path.join(root, extra)).href).catch(() => null);
const missing = { ko: [], en: [] };
for (const key of [...keys].sort()) for (const lang of ['ko', 'en']) if (DICTIONARIES[lang][key] == null) missing[lang].push(key);
const both = missing.ko.filter((k) => missing.en.includes(k));
console.log(both.join('\n'));
console.log(`--- ${both.length} missing in both; ko-only ${missing.ko.length - both.length}; en-only ${missing.en.length - both.length}; of ${keys.size}`);
if (process.argv.includes('--detail')) { console.log('ko only:', missing.ko.filter((k) => !both.includes(k)).join(' ')); console.log('en only:', missing.en.filter((k) => !both.includes(k)).join(' ')); }
process.exit(missing.ko.length + missing.en.length ? 1 : 0);
