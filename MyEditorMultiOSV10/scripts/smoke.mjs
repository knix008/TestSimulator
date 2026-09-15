// Smoke test: seeds a temp folder with sample files and a session that has
// them open, launches the packaged-style app (dist/ must exist) with a
// private profile, drives it through window.__med (edit, save, find, menus,
// dialogs…), screenshots into .smoke/<scenario>.png and quits; then does the
// same against the web server.
//
//   npm run build && npm run smoke                 # desktop + web, default scenarios
//   npm run smoke -- --scenario find               # one scenario (desktop)
//   npm run smoke -- --scenario find --web         # the same in the web version
//   npm run smoke -- --scenario all                # every scenario (desktop)
//   npm run smoke -- --desktop-only | --web-only
//   npm run smoke -- --scenario markdown_preview --dev   # against the running dev server
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const smokeDir = path.join(root, '.smoke');
// One private profile per scenario: Chromium may still hold the previous
// one for a moment after the app exits, so profiles are never reused.
const profilesDir = path.join(smokeDir, 'profiles');
const profileFor = (name) => path.join(profilesDir, name);
const work = path.join(smokeDir, 'work');

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };

if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('[smoke] dist/ missing — run `npm run build` first.');
  process.exit(1);
}

// ── Fixtures ──
const SAMPLE_JS = `// Sample module opened by the smoke test
import { readFile } from 'node:fs/promises';

const GREETING = '안녕하세요, My Editor!';

/**
 * Counts the lines of a text file.
 * @param {string} file
 */
export async function countLines(file) {
  const text = await readFile(file, 'utf-8');
  const lines = text.split(/\\r?\\n/);
  return { file, lines: lines.length, longest: Math.max(...lines.map((l) => l.length)) };
}

export default class Greeter {
  #name;
  constructor(name = 'world') { this.#name = name; }
  greet() { return \`\${GREETING} \${this.#name} \${42 * 2}\`; }
}
`;
const SAMPLE_MD = `# My Editor

A **tabbed** text / code editor for Windows, macOS, Linux and the web.

- Syntax highlighting for 150+ languages
- Find & replace with regex
- Encodings: UTF-8, UTF-16, EUC-KR …

\`\`\`js
console.log('hello');
\`\`\`

> 인용문입니다. [link](https://example.com)
`;
const SAMPLE_PY = `import sys
from pathlib import Path


def main(argv: list[str]) -> int:
    """Print the size of every file given on the command line."""
    for name in argv[1:]:
        p = Path(name)
        print(f"{p.name}: {p.stat().st_size} bytes")  # noqa
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
`;

function seed() {
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  try { fs.rmSync(profilesDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch { /* a previous run's profile is still locked — harmless */ }
  fs.mkdirSync(path.join(work, 'src', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(work, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(work, 'src', 'app.js'), SAMPLE_JS);
  fs.writeFileSync(path.join(work, 'src', 'lib', 'util.py'), SAMPLE_PY);
  fs.writeFileSync(path.join(work, 'src', 'test.c'), ['#include <stdio.h>', '/* a commnt with a misteak */', 'int main(void) { printf("helo wrld\\n"); retrn 0; }', ''].join('\n'));
  fs.writeFileSync(path.join(work, 'docs', 'README.md'), SAMPLE_MD);
  fs.writeFileSync(path.join(work, 'notes.txt'), 'first line\r\nsecond line\r\n한글 메모\r\n', 'utf-8');
  fs.writeFileSync(path.join(work, 'legacy.txt'), Buffer.from([0xbe, 0xc8, 0xb3, 0xe7, 0x20, 0x45, 0x55, 0x43, 0x2d, 0x4b, 0x52, 0x0a]));   // "안녕 EUC-KR\n" in CP949
  fs.writeFileSync(path.join(work, 'data.json'), JSON.stringify({ name: 'smoke', ok: true, list: [1, 2, 3] }, null, 2));
}

function seedProfile(name) {
  const profile = profileFor(name);
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'session.json'), JSON.stringify({
    language: opt('lang') || 'ko', theme: opt('theme') || 'midnight', folder: work, sidebarVisible: true,
    tabs: [
      { path: path.join(work, 'src', 'app.js'), cursor: { anchor: 120, head: 120 } },
      { path: path.join(work, 'docs', 'README.md') },
      { path: path.join(work, 'notes.txt') },
      { untitledNo: 1, draft: 'unsaved draft text\n' },
      // files that no longer exist: dropped on restore (the draft of the second one becomes a new untitled document)
      ...(name === 'restore_missing' ? [{ path: path.join(work, 'gone.txt') }, { path: path.join(work, 'gone-draft.txt'), draft: 'draft of a deleted file\n' }] : []),
    ],
    activeTab: 0,
    recent: [path.join(work, 'src', 'app.js'), path.join(work, 'docs', 'README.md')],
  }, null, 2));
}

// ── Page scripts (run inside the renderer; `window.__med` is the hook) ──
const PRELUDE = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timeout: ' + fn.toString()); await wait(50); } };
  await until(() => window.__med && window.__med.state.docs.length > 0);
  await wait(400);
`;
const wp = (p) => JSON.stringify(p);

const SCENARIOS = {
  probe: `(async () => { ${PRELUDE} await wait(1500); const v = window.__med.view(); return JSON.stringify({ head: v.state.selection.main.head, status: document.querySelector('.st-field').textContent, active: document.querySelector('.cm-activeLineGutter') && document.querySelector('.cm-activeLineGutter').textContent, docs: window.__med.state.docs.length }); })()`,
  main: `(async () => { ${PRELUDE} const s = window.__med.state; return JSON.stringify({ docs: s.docs.map((d) => [d.name, d.langName, d.encoding, d.eol, d.dirty]), active: s.docs.find((d) => d.id === s.activeId).name }); })()`,
  edit_save: `(async () => { ${PRELUDE}
    const s = window.__med.state; const notes = s.docs.find((d) => d.name === 'notes.txt'); window.__med.activate(notes.id); await wait(200);
    window.__med.setText('edited by smoke\\n한글 저장 테스트\\n'); await wait(100);
    if (!window.__med.state.docs.find((d) => d.name === 'notes.txt').dirty) throw new Error('not dirty after edit');
    await window.__med.action('save'); await wait(300);
    const d = window.__med.state.docs.find((d) => d.name === 'notes.txt');
    return JSON.stringify({ dirty: d.dirty, eol: d.eol, encoding: d.encoding });
  })()`,
  find: `(async () => { ${PRELUDE} window.__med.action('find'); await wait(300); const inp = document.querySelector('.findbar input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(inp, 'lines'); inp.dispatchEvent(new Event('input', { bubbles: true })); await wait(300); return document.querySelector('.fb-count').textContent; })()`,
  replace: `(async () => { ${PRELUDE} window.__med.action('replace'); await wait(300); const inputs = document.querySelectorAll('.findbar input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(inputs[0], 'const'); inputs[0].dispatchEvent(new Event('input', { bubbles: true })); set.call(inputs[1], 'let'); inputs[1].dispatchEvent(new Event('input', { bubbles: true })); await wait(300); document.querySelectorAll('.fb-btn.text')[1].click(); await wait(300); return JSON.stringify({ count: document.querySelector('.fb-count').textContent, text: window.__med.getText().slice(0, 120) }); })()`,
  menu_file: `(async () => { ${PRELUDE} const b = document.querySelector('.menu-btn'); b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); await wait(200); return Array.from(document.querySelectorAll('.menu-drop .ctx-label')).map((e) => e.textContent).slice(0, 8).join(' | '); })()`,
  menu_edit: `(async () => { ${PRELUDE} const b = document.querySelectorAll('.menu-btn')[1]; b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); await wait(200); const items = [...document.querySelectorAll('.menu-drop .ctx-item')]; return JSON.stringify({ items: items.length, noIcon: items.filter((e) => !e.querySelector('.ctx-icon svg, .ctx-icon .lang-icon')).map((e) => e.textContent) }); })()`,
  menu_view: `(async () => { ${PRELUDE} const b = document.querySelectorAll('.menu-btn')[3]; b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); await wait(200); const items = [...document.querySelectorAll('.menu-drop .ctx-item')]; return JSON.stringify({ items: items.length, noIcon: items.filter((e) => !e.querySelector('.ctx-icon svg, .ctx-icon .lang-icon')).map((e) => e.textContent) }); })()`,
  menu_enc: `(async () => { ${PRELUDE} const b = document.querySelectorAll('.menu-btn')[5]; b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); await wait(200); const items = [...document.querySelectorAll('.menu-drop .ctx-item')]; return JSON.stringify({ items: items.length, noIcon: items.filter((e) => !e.querySelector('.ctx-icon svg, .ctx-icon .lang-icon')).map((e) => e.textContent) }); })()`,
  menu_lang: `(async () => { ${PRELUDE} const b = document.querySelectorAll('.menu-btn')[4]; b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); await wait(200); return JSON.stringify({ items: document.querySelectorAll('.menu-drop .ctx-item').length, badges: document.querySelectorAll('.menu-drop .lang-icon').length, js: (document.querySelector('.menu-drop .lang-icon') || {}).textContent }); })()`,
  encoding_menu: `(async () => { ${PRELUDE} document.querySelectorAll('.st-btn')[2].click(); await wait(200); return Array.from(document.querySelectorAll('.st-menu .ctx-label')).map((e) => e.textContent).join(' | '); })()`,
  goto: `(async () => { ${PRELUDE} window.__med.action('gotoLine'); await wait(200); return document.querySelector('.dlg-title span').textContent; })()`,
  settings: `(async () => { ${PRELUDE} window.__med.action('settings'); await wait(200); return 'settings'; })()`,
  about: `(async () => { ${PRELUDE} window.__med.action('about'); await wait(200); return 'about'; })()`,
  shortcuts: `(async () => { ${PRELUDE} window.__med.action('shortcuts'); await wait(200); return 'shortcuts'; })()`,
  dirty_close: `(async () => { ${PRELUDE} window.__med.setText('changed'); await wait(100); window.__med.action('close'); await wait(300); return document.querySelector('.dlg .pre').textContent; })()`,
  light_en: `(async () => { ${PRELUDE} window.__med.action('theme:daylight'); window.__med.action('toggleLanguage'); await wait(300); return document.querySelector('.menu-btn').textContent; })()`,
  theme_monokai: `(async () => { ${PRELUDE} window.__med.action('theme:monokai'); await wait(300); return 'monokai'; })()`,
  markdown: `(async () => { ${PRELUDE} const s = window.__med.state; window.__med.activate(s.docs.find((d) => d.name === 'README.md').id); await wait(400); return window.__med.state.docs.find((d) => d.name === 'README.md').langName; })()`,
  python: `(async () => { ${PRELUDE} await window.__med.openPath(${wp(path.join(work, 'src', 'lib', 'util.py'))}); await wait(400); const d = window.__med.state.docs.find((x) => x.name === 'util.py'); return JSON.stringify({ lang: d.langName, count: window.__med.state.docs.length }); })()`,
  legacy: `(async () => { ${PRELUDE} await window.__med.openPath(${wp(path.join(work, 'legacy.txt'))}); await wait(400); const d = window.__med.state.docs.find((x) => x.name === 'legacy.txt'); return JSON.stringify({ enc: d.encoding, text: window.__med.getText() }); })()`,
  wrap_ws: `(async () => { ${PRELUDE} window.__med.action('toggle:wordWrap'); window.__med.action('toggle:showWhitespace'); window.__med.action('zoomIn'); await wait(300); return JSON.stringify({ wrap: window.__med.state.settings.wordWrap, ws: window.__med.state.settings.showWhitespace, fs: window.__med.state.settings.fontSize }); })()`,
  tab_context: `(async () => { ${PRELUDE} const tab = document.querySelectorAll('.tab')[1]; tab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 90 })); await wait(200); return document.querySelectorAll('.ctx-item').length; })()`,
  tree_context: `(async () => { ${PRELUDE} await until(() => document.querySelectorAll('.tree-row').length > 2); const row = document.querySelectorAll('.tree-row')[1]; row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 120, clientY: 160 })); await wait(200); return document.querySelectorAll('.ctx-item').length; })()`,
  editor_context: `(async () => { ${PRELUDE} const c = document.querySelector('.cm-content'); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 500, clientY: 300 })); await wait(200); return document.querySelectorAll('.ctx-item').length; })()`,
  lang_picker: `(async () => { ${PRELUDE} window.__med.action('languagePicker'); await wait(200); return document.querySelectorAll('.listbox-item').length; })()`,
  file_dialog: `(async () => { ${PRELUDE} window.__med.action('open'); await wait(600); return document.querySelector('.file-dialog') ? 'web file dialog' : 'native dialog'; })()`,
  many_tabs: `(async () => { ${PRELUDE} for (let i = 0; i < 14; i++) window.__med.newUntitled('tab ' + i); await wait(500); const ctl = document.querySelectorAll('.tab-ctl'); return JSON.stringify({ tabs: document.querySelectorAll('.tab').length, controls: ctl.length, leftEnabled: !ctl[1].disabled, rightEnabled: !ctl[2].disabled }); })()`,
  many_tabs_left: `(async () => { ${PRELUDE} for (let i = 0; i < 14; i++) window.__med.newUntitled('tab ' + i); await wait(500); for (let i = 0; i < 12; i++) { document.querySelectorAll('.tab-ctl')[1].click(); await wait(120); } await wait(400); const ctl = document.querySelectorAll('.tab-ctl'); return JSON.stringify({ leftEnabled: !ctl[1].disabled, rightEnabled: !ctl[2].disabled }); })()`,
  markdown_preview: `(async () => { ${PRELUDE} const s = window.__med.state; window.__med.activate(s.docs.find((d) => d.name === 'README.md').id); await wait(400);
    if (!window.__med.state.settings.mdPreview) window.__med.action('toggle:mdPreview'); await wait(500);
    const v = window.__med.view(); const pos = v.state.doc.toString().indexOf('tabbed'); v.dispatch({ selection: { anchor: pos, head: pos + 6 } });
    window.__med.action('md:bold'); await wait(100);          // **tabbed** → toggles the existing bold off
    const line3 = v.state.doc.line(3); v.dispatch({ selection: { anchor: line3.from } }); window.__med.action('md:heading:2'); await wait(100);
    const last = v.state.doc.line(v.state.doc.lines); v.dispatch({ selection: { anchor: last.from } }); window.__med.action('md:taskList'); await wait(400);
    return JSON.stringify({ bar: !!document.querySelector('.mdbar'), preview: !!document.querySelector('.md-preview'), h1: document.querySelector('.md-preview h1') && document.querySelector('.md-preview h1').textContent, line3: v.state.doc.line(3).text, unbold: v.state.doc.toString().includes('A tabbed text'), task: v.state.doc.line(v.state.doc.lines).text });
  })()`,
  dedupe: `(async () => { ${PRELUDE} const n0 = window.__med.state.docs.length; const p = ${wp(path.join(work, 'src', 'app.js'))};
    await Promise.all([window.__med.openPath(p), window.__med.openPath(p.toUpperCase()), window.__med.openPath(p.split(String.fromCharCode(92)).join('/'))]);
    await window.__med.openFiles([p, ${wp(path.join(work, 'notes.txt'))}, ${wp(path.join(work, 'data.json'))}, ${wp(path.join(work, 'data.json'))}]);
    await wait(300); const names = window.__med.state.docs.map((d) => d.name); return JSON.stringify({ before: n0, after: names.length, names }); })()`,
  wysiwyg_toggle: `(async () => { ${PRELUDE} const s = window.__med.state; window.__med.activate(s.docs.find((d) => d.name === 'README.md').id); await wait(500);
    const count = () => document.querySelectorAll('.md-bullet').length; const a = count();
    window.__med.action('toggle:mdWysiwyg'); await wait(400); const b = count();
    window.__med.action('toggle:mdWysiwyg'); await wait(400); const c = count();
    return JSON.stringify({ on: a, off: b, onAgain: c, setting: window.__med.state.settings.mdWysiwyg }); })()`,
  spell: `(async () => { ${PRELUDE} window.__med.newUntitled('This sentense has a misspeled word and a correct one.' + String.fromCharCode(10) + 'Another lne here. URL http://exmple.com and code_ident and NASA.'); await wait(1500);
    return JSON.stringify({ errors: Array.from(document.querySelectorAll('.cm-spell-error')).map((e) => e.textContent), on: window.__med.state.settings.spellCheck }); })()`,
  spell_off: `(async () => { ${PRELUDE} window.__med.newUntitled('This sentense has a misspeled word.'); await wait(1200); window.__med.action('toggle:spellCheck'); await wait(300);
    return JSON.stringify({ errors: document.querySelectorAll('.cm-spell-error').length, on: window.__med.state.settings.spellCheck }); })()`,
  spell_menu: `(async () => { ${PRELUDE} window.__med.newUntitled('This sentense has a misspeled word.'); await wait(1500); const el = document.querySelector('.cm-spell-error'); const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 4, clientY: r.top + 4 })); await wait(300);
    return Array.from(document.querySelectorAll('.ctx-item .ctx-label')).slice(0, 8).map((e) => e.textContent).join(' | '); })()`,
  tree_expand: `(async () => { ${PRELUDE} await until(() => document.querySelectorAll('.tree-row').length >= 6); const rowsBefore = document.querySelectorAll('.tree-row').length;
    const byName = (n) => Array.from(document.querySelectorAll('.tree-row')).find((r) => r.querySelector('.tree-name').textContent === n);
    byName('src').click(); await until(() => byName('lib')); byName('lib').click(); await until(() => byName('util.py')); byName('docs').click(); await until(() => byName('README.md'));
    byName('src').click(); await wait(200);   // collapse src: docs stays open
    const names = Array.from(document.querySelectorAll('.tree-row .tree-name')).map((e) => e.textContent);
    byName('src').click(); await wait(200);   // re-open: lib is still expanded inside
    const names2 = Array.from(document.querySelectorAll('.tree-row .tree-name')).map((e) => e.textContent);
    return JSON.stringify({ rowsBefore, afterCollapse: names, afterReopen: names2, guides: document.querySelectorAll('.guide').length }); })()`,
  auto_indent: `(async () => { ${PRELUDE} window.__med.newUntitled('    indented'); await wait(300); const v = window.__med.view();
    const enter = () => { v.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true })); };
    v.dispatch({ selection: { anchor: v.state.doc.length } }); v.focus(); enter(); await wait(100); const withOn = v.state.doc.line(2).text;
    window.__med.action('toggle:autoIndent'); await wait(200); v.dispatch({ selection: { anchor: v.state.doc.line(1).to } }); v.focus(); enter(); await wait(100); const withOff = v.state.doc.line(2).text;
    window.__med.action('toggle:autoIndent'); await wait(200);
    return JSON.stringify({ on: JSON.stringify(withOn), off: JSON.stringify(withOff), lines: v.state.doc.lines }); })()`,
  settings_editor: `(async () => { ${PRELUDE} window.__med.action('settings'); await wait(200); document.querySelectorAll('.settings-tab')[1].click(); await wait(200); return 'editor tab'; })()`,
  terminal_gitbash: `(async () => { ${PRELUDE} window.__med.setFolder(${wp(root)}); await wait(300); window.__med.action('newTerminal', 'gitbash'); await until(() => document.querySelector('.term-out input')); await wait(1500); const inp = document.querySelector('.term-out input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(inp, 'ls src'); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await wait(2000); return JSON.stringify({ prompts: document.querySelectorAll('.term-prompt').length, tab: document.querySelector('.term-tab').textContent, text: document.querySelector('.term-out').textContent.slice(0, 300) }); })()`,
  restore_missing: `(async () => { ${PRELUDE} await wait(500); const docs = window.__med.state.docs; return JSON.stringify({ names: docs.map((d) => d.name), missing: docs.filter((d) => d.missing).length, gone: docs.filter((d) => d.path && /gone/.test(d.path)).length }); })()`,
  settings_terminal: `(async () => { ${PRELUDE} window.__med.action('settings'); await wait(200); document.querySelectorAll('.settings-tab')[3].click(); await wait(300); return JSON.stringify({ shells: document.querySelectorAll('.settings-grid select option').length, cwd: !!document.querySelector('.settings-grid input[type=text]') }); })()`,
  tree_collapse_all: `(async () => { ${PRELUDE} await until(() => document.querySelectorAll('.tree-row').length >= 6);
    const byName = (n) => Array.from(document.querySelectorAll('.tree-row')).find((r) => r.querySelector('.tree-name').textContent === n);
    byName('src').click(); await until(() => byName('lib')); byName('lib').click(); await until(() => byName('util.py')); byName('docs').click(); await until(() => byName('README.md'));
    const expanded = Array.from(document.querySelectorAll('.tree-row .tree-name')).map((e) => e.textContent);
    document.querySelector('.sb-head button[title="' + '${'모두 접기'}' + '"]').click(); await wait(300);
    const collapsed = Array.from(document.querySelectorAll('.tree-row .tree-name')).map((e) => e.textContent);
    byName('src').click(); await wait(300);   // reopening src after collapse-all: lib must be closed too
    const reopened = Array.from(document.querySelectorAll('.tree-row .tree-name')).map((e) => e.textContent);
    return JSON.stringify({ expanded, collapsed, reopened }); })()`,
  tree_expand_all: `(async () => { ${PRELUDE} await until(() => document.querySelectorAll('.tree-row').length >= 6);
    document.querySelector('.sb-head button[title="모두 펼치기"]').click(); await until(() => document.querySelectorAll('.tree-row').length >= 10);
    const all = Array.from(document.querySelectorAll('.tree-row .tree-name')).map((e) => e.textContent);
    document.querySelector('.sb-head button[title="모두 접기"]').click(); await wait(300);
    return JSON.stringify({ all, collapsed: document.querySelectorAll('.tree-row').length }); })()`,
  spell_c: `(async () => { ${PRELUDE} const p = ${wp(path.join(work, 'src', 'test.c'))}; await window.__med.openPath(p); await wait(2000);
    const errs = () => Array.from(document.querySelectorAll('.cm-spell-error')).map((e) => e.textContent);
    const inComments = errs(); window.__med.action('toggle:spellCodeAll'); await wait(500); const all = errs();
    return JSON.stringify({ lang: window.__med.state.docs.find((d) => d.name === 'test.c').langName, inComments, all }); })()`,
  fonts: `(async () => { ${PRELUDE} const inp = document.querySelector('.tb-font input'); inp.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await wait(1500);
    const n = document.querySelectorAll('#tb-font-list option').length; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(inp, 'Consolas'); inp.dispatchEvent(new Event('input', { bubbles: true })); await wait(200);
    document.querySelectorAll('.tb-size .tool-btn')[1].click(); document.querySelectorAll('.tb-size .tool-btn')[1].click(); await wait(300);
    return JSON.stringify({ fonts: n, hasMalgun: Array.from(document.querySelectorAll('#tb-font-list option')).some((o) => /Malgun|맑은/i.test(o.value)), family: window.__med.state.settings.fontFamily, size: window.__med.state.settings.fontSize, css: getComputedStyle(document.querySelector('.cm-scroller')).fontFamily.slice(0, 40) }); })()`,
  source_view: `(async () => { ${PRELUDE} const s = window.__med.state; window.__med.activate(s.docs.find((d) => d.name === 'README.md').id); await wait(400);
    const h1 = () => getComputedStyle(document.querySelector('.cm-line')).fontSize; const live = h1(); window.__med.action('toggle:mdWysiwyg'); await wait(400); const src = h1();
    return JSON.stringify({ live, source: src, body: getComputedStyle(document.querySelectorAll('.cm-line')[2]).fontSize }); })()`,
  // Commands are typed at the oh-my-posh style prompt drawn at the end of the output (directory ▶ git branch ▶ >);
  // the typed line stays there with its prompt, `cd` moves the prompt, Tab completes a path.
  terminal: `(async () => { ${PRELUDE} window.__med.setFolder(${wp(root)}); await wait(300); window.__med.action('newTerminal'); await until(() => document.querySelector('.term-out input')); await wait(800);
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const inp = () => document.querySelector('.term-view:not(.hidden) .term-out input');
    const type = (text, key) => { const el = inp(); set.call(el, text); el.dispatchEvent(new Event('input', { bubbles: true })); if (key) el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); };
    const out = () => document.querySelector('.term-view:not(.hidden) .term-out').textContent;
    const prompts = () => [...document.querySelectorAll('.term-view:not(.hidden) .term-prompt')]; const last = () => { const p = prompts(); return p.length ? p[p.length - 1] : null; };
    const pathOf = () => (last() && last().querySelector('.seg-path') || {}).textContent || ''; const gitOf = () => (last() && last().querySelector('.seg-git') || {}).textContent || '';
    await until(() => gitOf().includes('main'), 8000); const p0 = pathOf();
    type('echo hello-from-terminal', 'Enter'); await until(() => out().includes('echo hello-from-terminal\\nhello-from-terminal'), 8000);
    type('cd ..', 'Enter'); await until(() => pathOf() && pathOf() !== p0, 8000); const p1 = pathOf();
    type('cd MyEd', 'Tab'); await until(() => inp().value.startsWith('cd MyEditorMultiOSV10'), 4000); const completed = inp().value; type('', null);
    type('type READ', 'Tab'); await until(() => inp().value === 'type README.md ', 4000); type('', null);
    window.__med.action('newTerminal'); await wait(1200); document.querySelector('.term-tab').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await wait(300); type('echo typing', null); await wait(300);
    return JSON.stringify({ tabs: document.querySelectorAll('.term-tab').length, git: gitOf(), p0, p1, completed, prompts: prompts().length, typing: inp().value === 'echo typing' }); })()`,
  font_picker: `(async () => { ${PRELUDE} document.querySelector('.font-picker .fp-caret').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await wait(1500);
    const list = document.querySelector('.fp-list'); const r = list.getBoundingClientRect();
    return JSON.stringify({ items: list.querySelectorAll('.fp-item').length, height: Math.round(r.height), scrollable: list.scrollHeight > list.clientHeight, insideWindow: r.bottom <= window.innerHeight }); })()`,
  no_sidebar: `(async () => { ${PRELUDE} window.__med.action('toggle:sidebarVisible'); window.__med.action('toggle:toolbarVisible'); await wait(300); return 'plain'; })()`,
};

async function electronShot(name = 'main', script = null, url = null) {
  const electronPath = require('electron');
  seedProfile(name);
  const env = { ...process.env, MED_USER_DATA: profileFor(name) };
  delete env.ELECTRON_RUN_AS_NODE;
  // --dev: load the running Vite dev server (npm run dev / npm start) instead of dist/.
  if (args.includes('--dev')) env.ELECTRON_DEV = '1';
  const shot = path.join(smokeDir, `${name}.png`);
  const extra = [];
  if (url) extra.push(`--smoke-url=${url}`);
  if (script) {
    const file = path.join(smokeDir, `${name}.script.js`);
    // Errors inside the page come back as text instead of a generic executeJavaScript failure.
    fs.writeFileSync(file, `(async () => { try { return await (${script}); } catch (e) { return 'SCRIPT ERROR: ' + ((e && e.stack) || e); } })()`);
    extra.push(`--smoke-script=${file}`, `--smoke-settle=${opt('settle') || 600}`);
  }
  let output = '';
  await new Promise((resolve, reject) => {
    const child = spawn(electronPath, ['.', `--smoke-shot=${shot}`, `--smoke-delay=${opt('delay') || 1500}`, ...extra], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'], env });
    child.stdout.on('data', (d) => { output += d; process.stdout.write(d); });
    const timer = setTimeout(() => { child.kill(); reject(new Error('electron smoke timed out')); }, 90_000);
    child.on('exit', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`electron exited ${code}`)); });
    child.on('error', reject);
  });
  if (!fs.existsSync(shot)) throw new Error('screenshot not written');
  if (/\[smoke\] capture failed|SCRIPT ERROR/.test(output)) throw new Error(`scenario ${name} failed`);
  console.log(`[smoke] ${url ? 'web-ui' : 'desktop'} OK → ${path.relative(root, shot)} (${fs.statSync(shot).size} bytes)`);
  return output;
}

function post(port, name, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {});
    const req = http.request({ host: '127.0.0.1', port, path: `/api/${name}`, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end(data);
  });
}

async function webSmoke(scenario = null) {
  const port = 5199;
  seedProfile('web');
  const child = spawn(process.execPath, [path.join(root, 'server', 'server.js'), '--port', String(port), '--no-open', '--config', profileFor('web')], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, MED_SMOKE: '1' } });
  try {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('server did not start')), 10_000);
      child.stdout.on('data', (d) => { process.stdout.write(`[web] ${d}`); if (String(d).includes('http://')) { clearTimeout(t); resolve(); } });
      child.on('exit', (c) => reject(new Error(`server exited ${c}`)));
    });
    const info = await post(port, 'app.info');
    if (!info.ok || info.data.host !== 'web') throw new Error('app.info failed');
    const list = await post(port, 'fs.list', { path: work });
    if (!list.ok || !list.data.entries.some((e) => e.name === 'notes.txt')) throw new Error('fs.list failed');
    const read = await post(port, 'file.read', { path: path.join(work, 'notes.txt') });
    if (!read.ok || read.data.eol !== 'crlf') throw new Error('file.read failed');
    const wr = await post(port, 'file.write', { path: path.join(work, 'web.txt'), text: 'from web\n', encoding: 'utf8bom', eol: 'lf' });
    if (!wr.ok || fs.readFileSync(path.join(work, 'web.txt'))[0] !== 0xef) throw new Error('file.write failed');
    const html = await new Promise((resolve, reject) => http.get(`http://127.0.0.1:${port}/`, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => resolve(b)); }).on('error', reject));
    if (!html.includes('<div id="root">')) throw new Error('index.html not served');
    console.log('[smoke] web OK → api (info, list, read, write) + static');
    // The UI itself in browser mode: a window without the preload script pointed at the server.
    await electronShot(scenario ? `web_${scenario}` : 'web_main', SCENARIOS[scenario || 'main'], `http://127.0.0.1:${port}/`);
  } finally {
    child.kill();
  }
}

(async () => {
  seed();
  const scenario = opt('scenario');
  if (scenario) {
    if (args.includes('--web')) await webSmoke(scenario);
    // file_dialog opens a native (modal) dialog on the desktop — only meaningful with --web.
    else if (scenario === 'all') { for (const [k, v] of Object.entries(SCENARIOS)) { if (k === 'file_dialog' || k === 'probe') continue; seed(); await electronShot(k, v); } }
    else await electronShot(scenario, SCENARIOS[scenario]);
    console.log('[smoke] scenario done');
    return;
  }
  if (!args.includes('--web-only')) {
    const out = await electronShot('main', SCENARIOS.main);
    if (!/app\.js/.test(out) || !/JavaScript/.test(out)) throw new Error('session tabs not restored with languages');
    const saved = await electronShot('edit_save', SCENARIOS.edit_save);
    if (!/"dirty":false/.test(saved)) throw new Error('save did not clear the dirty flag');
    const written = fs.readFileSync(path.join(work, 'notes.txt'), 'utf-8');
    if (written !== 'edited by smoke\r\n한글 저장 테스트\r\n') throw new Error(`saved content wrong: ${JSON.stringify(written)}`);
    console.log('[smoke] desktop edit + save verified (CRLF kept, UTF-8 Korean)');
    seed();
    await electronShot('find', SCENARIOS.find);
    await electronShot('legacy', SCENARIOS.legacy);
  }
  if (!args.includes('--desktop-only')) await webSmoke();
  console.log('[smoke] all good');
})().catch((err) => { console.error('[smoke] FAILED:', err.message); process.exit(1); });
