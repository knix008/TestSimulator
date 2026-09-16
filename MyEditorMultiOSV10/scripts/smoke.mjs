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
import zlib from 'node:zlib';

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

## Images

Local file: ![logo](logo.png)

Sized tag: <img src="logo.png" alt="logo" width="60">

Embedded: ![dot](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==)
`;

// A solid-colour PNG (the image fixtures), built by hand: IHDR + one IDAT + IEND.
function makePng(w, h, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; const edge = x < 4 || y < 4 || x >= w - 4 || y >= h - 4; raw[o] = edge ? 255 : r; raw[o + 1] = edge ? 255 : g; raw[o + 2] = edge ? 255 : b; } }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
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

function seed(scenario = opt('scenario')) {
  fs.rmSync(work, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  try { fs.rmSync(profilesDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch { /* a previous run's profile is still locked — harmless */ }
  fs.mkdirSync(path.join(work, 'src', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(work, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(work, 'src', 'app.js'), SAMPLE_JS);
  fs.writeFileSync(path.join(work, 'src', 'lib', 'util.py'), SAMPLE_PY);
  fs.writeFileSync(path.join(work, 'src', 'test.c'), ['#include <stdio.h>', '/* a commnt with a misteak */', 'int main(void) { printf("helo wrld\\n"); retrn 0; }', ''].join('\n'));
  fs.writeFileSync(path.join(work, 'docs', 'README.md'), SAMPLE_MD);
  fs.writeFileSync(path.join(work, 'docs', 'logo.png'), makePng(160, 90, [58, 134, 255]));
  fs.writeFileSync(path.join(work, 'notes.txt'), 'first line\r\nsecond line\r\n한글 메모\r\n', 'utf-8');
  fs.writeFileSync(path.join(work, 'legacy.txt'), Buffer.from([0xbe, 0xc8, 0xb3, 0xe7, 0x20, 0x45, 0x55, 0x43, 0x2d, 0x4b, 0x52, 0x0a]));   // "안녕 EUC-KR\n" in CP949
  fs.writeFileSync(path.join(work, 'data.json'), JSON.stringify({ name: 'smoke', ok: true, list: [1, 2, 3] }, null, 2));
  fs.writeFileSync(path.join(work, 'docs', 'style.css'), 'body { font-family: sans-serif; } h1 { color: #3a86ff; }\n');
  fs.writeFileSync(path.join(work, 'docs', 'page.html'), '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>Smoke page</title>\n<link rel="stylesheet" href="style.css">\n</head>\n<body>\n<h1 id="title">Hello preview</h1>\n<p>An image: <img src="logo.png" alt="logo"></p>\n<script>document.getElementById("title").textContent += " (scripted)";</script>\n</body>\n</html>\n');
  fs.writeFileSync(path.join(work, 'src', 'nul.js'), Buffer.concat([Buffer.from("// a source file with a literal NUL placeholder\nconst SEP = '"), Buffer.from([0]), Buffer.from("';\nexport default SEP;\n")]));
  if (scenario === 'hex_big') { const big = Buffer.alloc(200 * 1024 * 1024); for (let i = 0; i < big.length; i += 4096) big.writeUInt32LE(i, i); fs.writeFileSync(path.join(work, 'big.bin'), big); }   // 200 MB, the offset written every 4 KB
}

function seedProfile(name) {
  const profile = profileFor(name);
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'session.json'), JSON.stringify({
    language: opt('lang') || 'ko', theme: opt('theme') || 'midnight', folder: work, sidebarVisible: true, ...(opt('font') ? { fontFamily: opt('font') } : {}),
    tabs: [
      { path: path.join(work, 'src', 'app.js'), cursor: { anchor: 120, head: 120 } },
      { path: path.join(work, 'docs', 'README.md') },
      { path: path.join(work, 'notes.txt') },
      { untitledNo: 1, draft: 'unsaved draft text\n' },
      // files that no longer exist: dropped on restore (the draft of the second one becomes a new untitled document)
      ...(name === 'restore_missing' ? [{ path: path.join(work, 'gone.txt') }, { path: path.join(work, 'gone-draft.txt'), draft: 'draft of a deleted file\n' }] : []),
    ],
    activeTab: 0,
    ...(name === 'split_restore' ? { split: 'cols', paneDocs: [0, 1], activePane: 1 } : {}),
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
  menu_editor: `(async () => { ${PRELUDE} const b = document.querySelectorAll('.menu-btn')[3]; b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); await wait(200); return JSON.stringify(Array.from(document.querySelectorAll('.ctx-item .ctx-label')).map((e) => e.textContent)); })()`,
  menu_view: `(async () => { ${PRELUDE} const b = document.querySelectorAll('.menu-btn')[4]; b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); await wait(200); const items = [...document.querySelectorAll('.menu-drop .ctx-item')]; return JSON.stringify({ items: items.length, noIcon: items.filter((e) => !e.querySelector('.ctx-icon svg, .ctx-icon .lang-icon')).map((e) => e.textContent) }); })()`,
  menu_enc: `(async () => { ${PRELUDE} const b = document.querySelectorAll('.menu-btn')[6]; b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); await wait(200); const items = [...document.querySelectorAll('.menu-drop .ctx-item')]; return JSON.stringify({ items: items.length, noIcon: items.filter((e) => !e.querySelector('.ctx-icon svg, .ctx-icon .lang-icon')).map((e) => e.textContent) }); })()`,
  menu_columns: `(async () => { ${PRELUDE} const b = document.querySelectorAll('.menu-btn')[5]; b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); await wait(800); const m = document.querySelector('.ctx-menu'); if (!m) return JSON.stringify({ menu: null, err: window.__lastError || null }); const r = m.getBoundingClientRect(); const its = [...m.querySelectorAll('.ctx-item')]; const last = its[its.length - 1].getBoundingClientRect(); return JSON.stringify({ cls: m.className, rows: m.style.gridTemplateRows, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], win: [window.innerWidth, window.innerHeight], lastVisible: last.bottom <= window.innerHeight && last.right <= window.innerWidth, cols: new Set(its.map((e) => Math.round(e.getBoundingClientRect().x))).size }); })()`,
  // Desktop: every menu bar dropdown also builds as a native OS menu (accelerators, checks, radios, separators) — popped up and closed again.
  native_menus: `(async () => { ${PRELUDE} if (!window.myEditor || !window.myEditor.popupMenu) return 'no native menus (web)'; const out = {}; for (const m of window.__med.menus) { const plain = await window.__med.menuIcons(m.items.map((it) => (it.sep ? { sep: true } : it.header ? { header: it.header } : { id: it.id, label: String(it.label), checked: it.checked, radio: !!it.radio, disabled: !!it.disabled, shortcut: it.shortcut || '', meta: it.meta || '', icon: it.icon, badge: it.badge }))); const t0 = Date.now(); const r = await window.myEditor.popupMenu(plain, { x: 20, y: 60, autoClose: 400 }); out[m.id] = { items: plain.length, icons: plain.filter((x) => x.png).length, picked: r, ms: Date.now() - t0 }; } return JSON.stringify(out); })()`,
  menu_lang: `(async () => { ${PRELUDE} const b = document.querySelectorAll('.menu-btn')[5]; b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); await wait(200); return JSON.stringify({ items: document.querySelectorAll('.menu-drop .ctx-item').length, badges: document.querySelectorAll('.menu-drop .lang-icon').length, js: (document.querySelector('.menu-drop .lang-icon') || {}).textContent }); })()`,
  encoding_menu: `(async () => { ${PRELUDE} document.querySelectorAll('.st-btn')[2].click(); await wait(200); return Array.from(document.querySelectorAll('.st-menu .ctx-label')).map((e) => e.textContent).join(' | '); })()`,
  goto: `(async () => { ${PRELUDE} window.__med.action('gotoLine'); await wait(200); return document.querySelector('.dlg-title span').textContent; })()`,
  settings: `(async () => { ${PRELUDE} window.__med.action('settings'); await wait(200); return 'settings'; })()`,
  settings_terminal: `(async () => { ${PRELUDE} window.__med.action('termSettings'); await until(() => document.querySelector('.dlg.settings .pe-presets')); await wait(400); const b = document.querySelector('.dlg-body');
    const scrolls = () => [...document.querySelectorAll('.dlg.settings *')].filter((e) => e !== b && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1) && getComputedStyle(e).overflowY !== 'visible' && !e.matches('textarea, select, input')).map((e) => e.className);
    const inner = {}; let tallest = ['', 0]; for (const btn of [...document.querySelectorAll('.pe-preset')]) { btn.click(); await wait(150); for (const r of [...document.querySelectorAll('.pe-list-row')]) { r.click(); await wait(60); const s = scrolls().filter((c) => !/pe-preset/.test(c)); if (s.length) inner[btn.title + ':' + r.textContent] = s; const h = document.querySelector('.dlg-body').scrollHeight; if (h > tallest[1]) tallest = [btn.title + ':' + r.textContent, h]; } }
    const b2 = document.querySelector('.dlg-body'); const d = document.querySelector('.dlg'); const r = d.getBoundingClientRect(); return JSON.stringify({ tab: document.querySelector('.settings-tab.active').textContent, presets: document.querySelectorAll('.pe-preset').length, scroll: b2.scrollHeight > b2.clientHeight, body: [b2.clientHeight, b2.scrollHeight], innerScrolls: inner, tallest, dlg: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }); })()`,
  about: `(async () => { ${PRELUDE} window.__med.action('about'); await wait(200); return 'about'; })()`,
  // A binary file opens in the hex view: offset · bytes · text, PNG signature in the first row, a click selects a byte.
  hex: `(async () => { ${PRELUDE} await window.__med.openPath(window.__med.state.folder + '/docs/logo.png'); await wait(600);
    const v = document.querySelector('.hex-view'); if (!v) throw new Error('no hex view');
    const row = v.querySelector('.hex-row'); const off = row.querySelector('.hex-off').textContent; const hex = Array.from(row.querySelectorAll('.hx')).map((e) => e.textContent).join(' ');
    if (!hex.startsWith('89 50 4E 47 0D 0A 1A 0A')) throw new Error('not a PNG header: ' + hex);
    row.querySelectorAll('.hx')[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await wait(100);
    const foot = v.querySelector('.hex-foot').textContent;
    const doc = window.__med.state.docs.find((d) => d.name === 'logo.png');
    // whatever the editor font, the view is monospace and every row's columns start at the same x
    const font = getComputedStyle(v.querySelector('.hx')).fontFamily, editorFont = window.__med.state.settings.fontFamily || '(default)';
    const xs = Array.from(v.querySelectorAll('.hex-row')).map((r) => ['.hex-off', '.hex-bytes', '.hex-ascii'].map((c) => Math.round(r.querySelector(c).getBoundingClientRect().left)).join(','));
    if (new Set(xs).size !== 1) throw new Error('columns drift: ' + [...new Set(xs)].join(' | '));
    return JSON.stringify({ off, hex: hex.slice(0, 23), sel: v.querySelectorAll('.sel').length, foot, kind: doc && doc.kind, readonly: doc && doc.readonly, rows: v.querySelectorAll('.hex-row').length, font, editorFont, columnsAt: xs[0] });
  })()`,
  hex_big: `(async () => { ${PRELUDE} const t0 = Date.now(); await window.__med.openPath(window.__med.state.folder + '/big.bin'); await wait(600);
    const err = document.querySelector('.dlg-title span'); if (err) throw new Error('dialog: ' + err.textContent + ' / ' + (document.querySelector('.dlg-body') || {}).textContent);
    const v = document.querySelector('.hex-view'); if (!v) throw new Error('no hex view');
    // to the very end: the last row must be the file's last 16 bytes, its offset word (written every 4 KB) readable
    const sc = v.querySelector('.hex-scroll'); sc.scrollTop = sc.scrollHeight; await wait(800);
    const all = Array.from(v.querySelectorAll('.hex-row')); const lastRow = all[all.length - 1]; const off = parseInt(lastRow.querySelector('.hex-off').textContent, 16);
    const expectLast = Math.floor((200 * 1024 * 1024 - 1) / 16) * 16; if (off !== expectLast) throw new Error('last row is ' + off.toString(16) + ', expected ' + expectLast.toString(16));
    const bytes = () => Array.from(lastRow.querySelectorAll('.hx')).map((e) => e.textContent); let tries = 0; while (bytes().includes('··') && tries++ < 20) await wait(100);
    // then to the row 0x0C7FF000 (a 4 KB boundary: the word written there is 00 F0 7F 0C, little-endian)
    const rowH = lastRow.getBoundingClientRect().height, rows = Math.ceil(200 * 1024 * 1024 / 16), fileH = rows * rowH + rowH - sc.clientHeight, maxTop = sc.scrollHeight - sc.clientHeight;
    sc.scrollTop = (0x0C7FF000 / 16 * rowH) / fileH * maxTop; await wait(800);
    let target = null; tries = 0; while (!target && tries++ < 20) { target = Array.from(v.querySelectorAll('.hex-row')).find((r) => parseInt(r.querySelector('.hex-off').textContent, 16) === 0x0C7FF000); if (!target) await wait(100); }
    if (!target) throw new Error('row 0C7FF000 not shown; first is ' + v.querySelector('.hex-row').querySelector('.hex-off').textContent);
    tries = 0; while (target.textContent.includes('··') && tries++ < 20) await wait(100);
    const hex = Array.from(target.querySelectorAll('.hx')).slice(0, 4).map((e) => e.textContent).join(' ');
    if (hex !== '00 F0 7F 0C') throw new Error('bytes at 0x0C7FF000: ' + hex);
    return JSON.stringify({ ms: Date.now() - t0, rows: all.length, scrollHeight: sc.scrollHeight, lastOff: off.toString(16).toUpperCase(), hex });
  })()`,
  // The minimap: drawn for the active document; a click on its lower part moves the cursor down the document, a drag scrolls with the pointer, hovering does nothing.
  minimap: `(async () => { ${PRELUDE} window.__med.setText(Array.from({ length: 400 }, (_, i) => 'function f' + i + '(a, b) { // line ' + i + '\\n  return a + b * ' + i + '; // "str"\\n}').join('\\n')); await wait(500);
    const mm = document.querySelector('.pane.active .minimap'); if (!mm) throw new Error('no minimap');
    const r = mm.getBoundingClientRect(); const before = window.__med.state.cursor.line;
    mm.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: r.left + 10, clientY: r.top + r.height * 0.6, buttons: 1 })); window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); await wait(300);
    const after = window.__med.state.cursor.line; if (!(after > before + 100)) throw new Error('click did not move the cursor: ' + before + ' → ' + after);
    const sd = document.querySelector('.pane.active .cm-scroller'); const st0 = sd.scrollTop;
    mm.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + 10, clientY: r.top + 4, buttons: 0 })); await wait(300);
    if (sd.scrollTop !== st0) throw new Error('hover scrolled: ' + st0 + ' → ' + sd.scrollTop);
    // drag from the middle to the top: the editor scrolls up with the pointer, the cursor stays
    mm.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: r.left + 10, clientY: r.top + r.height * 0.5, button: 0, buttons: 1 })); await wait(200);
    const pressed = sd.scrollTop;
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + 10, clientY: r.top + 4, buttons: 1 })); await wait(300);
    const dragged = sd.scrollTop; window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: r.left + 10, clientY: r.top + 4 })); await wait(200);
    if (!(dragged < pressed)) throw new Error('drag did not scroll up: ' + pressed + ' → ' + dragged);
    if (window.__med.state.cursor.line !== after) throw new Error('drag moved the cursor');
    const ctx = mm.getContext('2d'); const px = ctx.getImageData(0, 0, mm.width, mm.height).data; let painted = 0; for (let i = 3; i < px.length; i += 4) if (px[i]) painted++;
    return JSON.stringify({ width: Math.round(r.width), height: Math.round(r.height), before, after, clickScroll: st0, pressScroll: pressed, dragScroll: dragged, paintedPixels: painted });
  })()`,
  // Markdown structure panel: opened from the bar, lists the headings as a tree; a click on a heading moves the cursor there.
  outline: `(async () => { ${PRELUDE} const s = window.__med.state; const md = s.docs.find((d) => d.name === 'README.md'); window.__med.activate(md.id); await wait(300);
    window.__med.setText('# Title\\n\\ntext\\n\\n## Part one\\n\\ntext\\n\\n### Detail A\\n\\n\`\`\`\\n# not a heading\\n\`\`\`\\n\\n## Part two\\n\\nSetext heading\\n--------------\\n\\ntext\\n'); await wait(300);
    const btn = Array.from(document.querySelectorAll('.mdbar .md-toggle')).find((b) => b.textContent.includes('구조')); if (!btn) throw new Error('no structure button'); btn.click(); await wait(300);
    const panel = document.querySelector('.md-outline'); if (!panel) throw new Error('no outline panel');
    const rows = Array.from(panel.querySelectorAll('.tree-row')); const names = rows.map((r) => r.querySelector('.tree-name').textContent);
    if (names.join('|') !== 'Title|Part one|Detail A|Part two|Setext heading') throw new Error('headings: ' + names.join('|'));
    const depths = rows.map((r) => r.querySelectorAll('.guide').length);
    rows[3].click(); await wait(200);
    const line = window.__med.state.cursor.line; if (line !== 15) throw new Error('click went to line ' + line);
    rows[1].querySelector('.tree-expander').click(); await wait(200);
    const foldedNames = Array.from(panel.querySelectorAll('.tree-row .tree-name')).map((e) => e.textContent);
    return JSON.stringify({ names, depths, line, active: rows[3].className.includes('active'), afterFold: foldedNames });
  })()`,
  // A split pane with nothing in it can be closed from its own "닫기": the split goes away.
  close_pane: `(async () => { ${PRELUDE} window.__med.action('split:grid'); await wait(400);
    // four documents fill the four panes; closing one of them (not dirty) leaves its pane empty
    const notes = window.__med.state.docs.find((d) => d.name === 'notes.txt'); await window.__med.action('close', notes.id); await wait(400);
    const empties = document.querySelectorAll('.pane-empty'); if (empties.length !== 1) throw new Error('expected 1 empty pane, got ' + empties.length);
    const closeBtn = Array.from(empties[0].querySelectorAll('button')).find((b) => b.textContent.includes('닫기')); if (!closeBtn) throw new Error('no close button');
    closeBtn.click(); await wait(400);
    return JSON.stringify({ panes: window.__med.panes.length, split: window.__med.state.settings.split, emptiesNow: document.querySelectorAll('.pane-empty').length });
  })()`,
  // The window shrunk as far as it goes: no toolbar / menu-bar control may be cut off (the minimum width follows the bars, src/lib/backend.js),
  // and switching the UI language must not change that width (the bars are as wide as their widest translation, components/Widest.jsx).
  min_width: `(async () => { ${PRELUDE} window.myEditor.setWindowSize(400, 600); await wait(800);
    const measure = () => { const bars = ['.toolbar.menubar', '.icon-toolbar'].map((sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); let right = 0; for (const c of el.children) { const cr = c.getBoundingClientRect(); if (cr.width) right = Math.max(right, cr.right); } return { sel, width: Math.round(r.width), right: Math.round(right), overflow: el.scrollWidth > el.clientWidth + 1 }; }).filter(Boolean);
      const cut = bars.filter((b) => b.overflow || b.right > b.width); if (cut.length) throw new Error('cut off: ' + JSON.stringify(cut)); return { innerWidth: window.innerWidth, bars }; };
    const first = measure();
    window.__med.action('toggleLanguage'); await wait(800); const other = measure();
    window.__med.action('toggleLanguage'); await wait(800); const back = measure();
    if (other.innerWidth !== first.innerWidth || back.innerWidth !== first.innerWidth) throw new Error('width changed with the language: ' + JSON.stringify([first.innerWidth, other.innerWidth, back.innerWidth]));
    return JSON.stringify({ innerWidth: first.innerWidth, bars: first.bars });
  })()`,
  shortcuts: `(async () => { ${PRELUDE} window.__med.action('shortcuts'); await wait(300); const d = document.querySelector('.dlg'); const b = d.querySelector('.dlg-body'); return JSON.stringify({ cols: document.querySelectorAll('.shortcut-cols .shortcut-grid').length, rows: document.querySelectorAll('.shortcut-grid kbd').length, width: d.clientWidth, height: d.clientHeight, win: window.innerHeight, scrollbar: b.scrollHeight > b.clientHeight }); })()`,
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
  // Images in the WYSIWYG view: the local file and the data URL are shown as pictures, the <img width> tag at its
  // width — also on the cursor's line (no syntax); dragging the handle rewrites the syntax as an <img … width> tag; a dropped image file is embedded as a data URL.
  markdown_images: `(async () => { ${PRELUDE} const s = window.__med.state; window.__med.activate(s.docs.find((d) => d.name === 'README.md').id); await wait(600);
    await until(() => document.querySelectorAll('.md-image img[src^="data:"]').length >= 3, 8000);
    const imgs = [...document.querySelectorAll('.md-image img')]; const widths = imgs.map((i) => Math.round(i.getBoundingClientRect().width));
    const handle = document.querySelectorAll('.md-image .md-image-handle')[0]; const r = handle.getBoundingClientRect();
    handle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: r.x + 4, clientY: r.y + 4 }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: r.x - 56, clientY: r.y + 4 })); window.dispatchEvent(new MouseEvent('mouseup', { clientX: r.x - 56, clientY: r.y + 4 })); await wait(400);
    const text = window.__med.getText(); const resized = /Local file: <img src="logo.png" alt="logo" width="(\\d+)">/.exec(text);
    const dt = new DataTransfer(); dt.items.add(new File([Uint8Array.from(atob('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=='), (c) => c.charCodeAt(0))], 'tiny.gif', { type: 'image/gif' }));
    const pane = document.querySelector('.editor-pane'); const last = document.querySelector('.cm-content').getBoundingClientRect();
    pane.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: last.x + 20, clientY: last.bottom - 10 })); await wait(600);
    const dropped = window.__med.getText().includes('![tiny](data:image/gif;base64,'); await until(() => document.querySelectorAll('.md-image img[src^="data:"]').length >= 4, 4000);
    const v = window.__med.view(); const l21 = v.state.doc.line(21); v.dispatch({ selection: { anchor: l21.to } }); await wait(300); const onLine = { images: document.querySelectorAll('.md-image img').length, syntaxShown: document.querySelector('.cm-content').textContent.includes('![dot]') };
    return JSON.stringify({ onLine, images: imgs.length, widths, resized: resized ? Number(resized[1]) : null, dropped, docs: window.__med.state.docs.length }); })()`,
  // Markdown toolbar › image: dialog with file / alt / link-or-embed / width; link = path relative to the document's folder.
  markdown_image_dialog: `(async () => { ${PRELUDE} const s = window.__med.state; window.__med.activate(s.docs.find((d) => d.name === 'README.md').id); await wait(500); const v = window.__med.view(); v.dispatch({ selection: { anchor: v.state.doc.length } });
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; const type = (el, text) => { set.call(el, text); el.dispatchEvent(new Event('input', { bubbles: true })); };
    const open = async () => { window.__med.action('md:image'); await until(() => document.querySelector('.dlg .img-preview')); await wait(100); };
    await open(); const inputs = () => document.querySelectorAll('.dlg input'); type(inputs()[0], ${wp(path.join(work, 'docs', 'logo.png'))}); await until(() => document.querySelector('.img-preview img'), 6000); const alt = inputs()[1].value; const radios = document.querySelectorAll('.dlg input[type=radio]');
    document.querySelector('.dlg .btn.primary').click(); await wait(400); const t1 = window.__med.getText();
    await open(); type(inputs()[0], 'logo.png'); await until(() => document.querySelector('.img-preview img'), 6000); document.querySelectorAll('.dlg input[type=radio]')[1].click(); type(document.querySelector('.dlg input[type=number]'), '80'); await wait(100); document.querySelector('.dlg .btn.primary').click(); await until(() => window.__med.getText().includes('width="80"'), 6000); const t2 = window.__med.getText();
    await open(); type(inputs()[0], 'logo.png'); await until(() => document.querySelector('.img-preview img'), 6000); await wait(300); return JSON.stringify({ alt, radios: radios.length, link: t1.includes(String.fromCharCode(33) + "[logo](logo.png)"), embed: t2.includes('<img src="data:image/png;base64,') && t2.includes('" alt="logo" width="80">'), pics: document.querySelectorAll('.md-image img').length }); })()`,
  // Lint: the C fixture has a typo (retrn) — gcc's findings become gutter markers, underlines and the status-bar count; typing re-runs it in the background.
  lint: `(async () => { ${PRELUDE} await window.__med.openPath(${wp(path.join(work, 'src', 'test.c'))}); await wait(300); await until(() => document.querySelector('.cm-lint-marker'), 20000); await wait(300);
    const markers = document.querySelectorAll('.cm-lint-marker').length; const ranges = document.querySelectorAll('.cm-lintRange').length; const st = (document.querySelector('.st-lint') || {}).textContent; const tool = (window.__med.state.docs.find((d) => d.name === 'test.c').lint || {}).tool;
    const gutters = [...document.querySelectorAll('.cm-gutter')].map((g) => g.className.replace('cm-gutter ', ''));
    window.__med.setText('#include <stdio.h>' + String.fromCharCode(10) + 'int main(void) { return 0; }' + String.fromCharCode(10) + ''); await until(() => (document.querySelector('.st-lint') || {}).textContent === '✓', 20000); const stClean = (document.querySelector('.st-lint') || {}).textContent;
    window.__med.setText('int main(void) { retrn 0; }' + String.fromCharCode(10) + ''); await until(() => document.querySelector('.cm-lint-marker'), 20000); await wait(300);
    return JSON.stringify({ markers, ranges, st, tool, gutters, stClean }); })()`,
  // Split view: two panes with different documents; the clicked pane is the active one (tab bar follows), typing goes there,
  // a tab already shown in the other pane activates that pane, closing a pane's doc gives it another, back to one pane keeps everything.
  split: `(async () => { ${PRELUDE} const S = () => window.__med.state; const names = () => window.__med.panes.map((p) => { const d = S().docs.find((x) => x.id === p.docId); return (d ? d.name : null) + (p.active ? '*' : ''); });
    window.__med.action('split:cols'); await wait(800); const two = names(); const paneEls = document.querySelectorAll('.pane').length; 
    const second = document.querySelectorAll('.pane')[1]; second.querySelector('.cm-content').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await wait(200); const afterClick = names(); const activeTab = (document.querySelector('.tab.active') || {}).textContent;
    const v = window.__med.view(); v.dispatch({ changes: { from: 0, insert: 'typed-in-pane-2 ' } }); await wait(200); const typedDoc = S().docs.find((d) => d.id === S().activeId); const typedOk = window.__med.getText().startsWith('typed-in-pane-2');
    const first = S().docs[0]; window.__med.activate(first.id); await wait(200); const backToFirst = names();
    window.__med.action('split:none'); await wait(400); const one = names(); window.__med.action('split:grid'); await wait(500); const four = names();
    return JSON.stringify({ two, paneEls, afterClick, activeTab, typed: typedDoc && typedDoc.name, typedOk, dirty: typedDoc && typedDoc.dirty, backToFirst, four, one, docs: S().docs.length }); })()`,
  // Split view, closing: pane ×, tab × of the other pane, + new tab — the panes take other documents and the app stays up.
  split_close: `(async () => { ${PRELUDE} const S = () => window.__med.state; const names = () => window.__med.panes.map((p) => { const d = S().docs.find((x) => x.id === p.docId); return (d ? d.name : null) + (p.active ? '*' : ''); }); const alive = () => (document.querySelector('.app') ? 'ok' : 'blank'); const md = (el) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); const out = {};
    window.__med.action('split:cols'); await wait(500); const paneEl = (i) => document.querySelectorAll('.pane')[i];
    md(paneEl(1).querySelector('.cm-content')); await wait(200); out.s1 = names();
    // tab of the doc shown in the left pane (real mousedown)
    const left = S().docs.find((d) => d.id === window.__med.panes[0].docId); md([...document.querySelectorAll('.tab')].find((t) => t.textContent.includes(left.name))); await wait(300); out.s2 = names(); out.a2 = alive();
    // tab of a doc shown nowhere → into the active (left) pane
    const other = S().docs.find((d) => !window.__med.panes.some((p) => p.docId === d.id)); md([...document.querySelectorAll('.tab')].find((t) => t.textContent.includes(other.name))); await wait(300); out.s3 = names(); out.a3 = alive();
    // + new tab
    document.querySelector('.tab-ctl').click(); await wait(300); out.s4 = names(); out.a4 = alive();
    // × on the right (non-active) pane head
    paneEl(1).querySelector('.pane-head .icon-btn').click(); await wait(500); out.s5 = names(); out.a5 = alive();
    // × on the right pane again (now active? no) then click it and close via tab ×
    md(paneEl(1).querySelector('.cm-content')); await wait(200); const cur = S().docs.find((d) => d.id === S().activeId); const tb = [...document.querySelectorAll('.tab')].find((t) => cur && t.textContent.includes(cur.name)); if (tb) tb.querySelector('.tab-close').click(); await wait(500); out.s6 = names(); out.a6 = alive();
    out.docs = S().docs.map((d) => d.name); return JSON.stringify(out); })()`,
  split_restore: `(async () => { ${PRELUDE} await wait(800); const S = () => window.__med.state; const names = () => window.__med.panes.map((p) => { const d = S().docs.find((x) => x.id === p.docId); return (d ? d.name : null) + (p.active ? '*' : ''); }); const before = names(); if (document.querySelectorAll('.pane').length < 2) return JSON.stringify({ before, split: S().settings.split, panes: document.querySelectorAll('.pane').length, alive: document.querySelector('.app') ? 'ok' : 'blank' });
    document.querySelectorAll('.pane')[1].querySelector('.pane-head .icon-btn').click(); await wait(600); const after = names(); const alive = document.querySelector('.app') ? 'ok' : 'blank';
    return JSON.stringify({ before, after, alive, panes: document.querySelectorAll('.pane').length }); })()`,
  // Only two documents, both shown: closing the right pane's document collapses the split (the remaining one fills the editor); closing the last document leaves a new empty one.
  split_close2: `(async () => { ${PRELUDE} const S = () => window.__med.state; const names = () => window.__med.panes.map((p) => { const d = S().docs.find((x) => x.id === p.docId); return (d ? d.name : null) + (p.active ? '*' : ''); }); const alive = () => (document.querySelector('.app') ? 'ok' : 'blank'); const md = (el) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); const out = {};
    while (S().docs.length > 2) { const d = S().docs[S().docs.length - 1]; window.__med.action('close', d.id); await wait(300); const dc = [...document.querySelectorAll('.dlg .btn')].find((b) => /저장 안 함|Don/.test(b.textContent)); if (dc) { dc.click(); await wait(300); } }
    window.__med.action('split:cols'); await wait(500); const paneEl = (i) => document.querySelectorAll('.pane')[i]; md(paneEl(1).querySelector('.cm-content')); await wait(200); out.s1 = names();
    paneEl(1).querySelector('.pane-head .icon-btn').click(); await wait(800); out.s2 = names(); out.panes2 = document.querySelectorAll('.pane').length; out.split2 = S().settings.split; out.a2 = alive(); out.text2 = window.__med.getText().slice(0, 20);
    window.__med.action('close', S().docs[0].id); await wait(600); out.s3 = names(); out.a3 = alive(); out.docs3 = S().docs.map((d) => d.name);
    return JSON.stringify(out); })()`,
  // Empty panes (4 panes, 2 documents): the pane's document picker moves a document over, Ctrl+N and the tab bar's + open a new document in the active empty pane.
  split_empty_new: `(async () => { ${PRELUDE} const S = () => window.__med.state; const names = () => window.__med.panes.map((p) => { const d = S().docs.find((x) => x.id === p.docId); return (d ? d.name : null) + (p.active ? '*' : ''); }); const alive = () => (document.querySelector('.app') ? 'ok' : 'blank'); const md = (el) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); const out = {};
    while (S().docs.length > 2) { const d = S().docs[S().docs.length - 1]; window.__med.action('close', d.id); await wait(300); const dc = [...document.querySelectorAll('.dlg .btn')].find((b) => /저장 안 함|Don/.test(b.textContent)); if (dc) { dc.click(); await wait(300); } }
    window.__med.action('split:grid'); await wait(600); out.s1 = names(); const paneEl = (i) => document.querySelectorAll('.pane')[i];
    // "pick a document" in the empty pane 3 → menu → the doc shown in pane 1 moves here
    paneEl(2).querySelector('.pane-empty .btn').click(); await until(() => [...document.querySelectorAll('.ctx-menu .ctx-item')].some((e) => e.textContent.includes('data.json')), 4000); out.menu = [...document.querySelectorAll('.ctx-menu .ctx-item')].map((e) => e.textContent); out.headers = [...document.querySelectorAll('.ctx-menu .ctx-header')].map((e) => e.textContent); const item = [...document.querySelectorAll('.ctx-menu .ctx-item')].find((e) => e.textContent.includes('app.js')); item.click(); await wait(500); out.s2 = names(); out.a2 = alive();
    paneEl(3).querySelector('.pane-empty .btn').click(); await until(() => [...document.querySelectorAll('.ctx-menu .ctx-item')].some((e) => e.textContent.includes('data.json')), 4000); [...document.querySelectorAll('.ctx-menu .ctx-item')].find((e) => e.textContent.includes('data.json')).click(); await until(() => S().docs.some((d) => d.name === 'data.json'), 6000); await wait(300); out.s2b = names();
    // Ctrl+N in the now empty pane 2
    md(paneEl(1)); await wait(200); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true })); await wait(500); out.s3 = names(); out.a3 = alive();
    // tab + button while pane 4 (empty) is active
    md(paneEl(3)); await wait(200); document.querySelector('.tab-ctl').click(); await wait(500); out.s4 = names(); out.a4 = alive();
    // folder tree click on data.json while an empty pane is active: reduce to cols → then open
    window.__med.action('split:cols'); await wait(500); out.s5 = names();
    return JSON.stringify(out); })()`,
  // Search panel: Ctrl+Shift+F searches the folder (results grouped by file), a hit opens the file at the match; the open-documents scope finds unsaved text.
  search_files: `(async () => { ${PRELUDE} const S = () => window.__med.state; const out = {}; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    window.__med.action('findInFiles'); await until(() => document.querySelector('.search-panel input'), 4000); await wait(200);
    const inp = document.querySelector('.search-input input'); set.call(inp, 'readFile'); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await until(() => document.querySelector('.sr-hit'), 8000); await wait(200); out.files = [...document.querySelectorAll('.sr-name')].map((e) => e.textContent); out.hits = document.querySelectorAll('.sr-hit').length; out.summary = document.querySelector('.search-actions .muted').textContent;
    document.querySelector('.sr-hit').click(); await wait(600); const v = window.__med.view(); const sel = v.state.selection.main; out.opened = S().docs.find((d) => d.id === S().activeId).name; out.selected = v.state.sliceDoc(sel.from, sel.to);
    // open-documents scope finds text typed but not saved
    window.__med.newUntitled('needle-in-open-doc'); await wait(300); document.querySelector('.search-scope .seg-btn').click(); await wait(100); set.call(inp, 'needle-in-open'); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await wait(400);
    out.openHits = [...document.querySelectorAll('.sr-name')].map((e) => e.textContent); const sp = document.querySelector('.search-panel > .h-splitter'); const h0 = document.querySelector('.search-panel').getBoundingClientRect().height; const r0 = sp.getBoundingClientRect(); sp.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: r0.x + 50, clientY: r0.y + 3 })); window.dispatchEvent(new MouseEvent('mousemove', { clientX: r0.x + 50, clientY: r0.y - 120 })); window.dispatchEvent(new MouseEvent('mouseup', { clientX: r0.x + 50, clientY: r0.y - 120 })); await wait(300); out.resized = Math.round(document.querySelector('.search-panel').getBoundingClientRect().height - h0); out.halfBefore = Math.round(h0 / document.querySelector('.sidebar-column').getBoundingClientRect().height * 100); out.treeAbove = !!document.querySelector('.sidebar-column .sidebar .sb-tree, .sidebar-column .sidebar') && document.querySelector('.sidebar-column .sidebar').getBoundingClientRect().bottom <= document.querySelector('.search-panel').getBoundingClientRect().top + 1; out.searchVisible = S().settings.searchVisible;
    return JSON.stringify(out); })()`,
  // Preview sync: the preview shows the block under the cursor at the cursor's screen position, and follows the editor's scroll.
  markdown_sync: `(async () => { ${PRELUDE} const S = () => window.__med.state; const out = {};
    const md = Array.from({ length: 1500 }, (_, i) => '## Section ' + (i + 1) + String.fromCharCode(10) + String.fromCharCode(10) + 'Paragraph of section ' + (i + 1) + ' with some text.' + String.fromCharCode(10)).join(String.fromCharCode(10));
    window.__med.newUntitled(md); await wait(300); window.__med.action('lang:Markdown'); await wait(400); if (!S().settings.mdPreview) window.__med.action('toggle:mdPreview'); await until(() => document.querySelectorAll('.md-preview .md-block').length > 100, 6000); await wait(300);
    out.blocks = document.querySelectorAll('.md-preview .md-block').length;
    const v = window.__med.view(); const pos = v.state.doc.toString().indexOf('## Section 1200'); v.dispatch({ selection: { anchor: pos }, scrollIntoView: true }); await wait(400);
    const pv = document.querySelector('.md-preview'); const h = [...pv.querySelectorAll('h2')].find((e) => e.textContent === 'Section 1200'); const hr = h.getBoundingClientRect(); const pr = pv.getBoundingClientRect(); const cr = v.coordsAtPos(pos); const er = v.scrollDOM.getBoundingClientRect();
    out.headingVisible = hr.top >= pr.top - 2 && hr.bottom <= pr.bottom; out.wysiwyg = S().settings.mdWysiwyg;
    window.__med.action('toggle:mdWysiwyg'); await wait(300); const pos2 = v.state.doc.toString().indexOf('## Section 700'); v.dispatch({ selection: { anchor: pos2 }, scrollIntoView: true }); await wait(500); const h2 = [...pv.querySelectorAll('h2')].find((e) => e.textContent === 'Section 700'); const r2 = h2.getBoundingClientRect(); out.sourceViewVisible = r2.top >= pr.top - 2 && r2.bottom <= pr.bottom; window.__med.action('toggle:mdWysiwyg'); out.editorRatio = Math.round((cr.top - er.top) / er.height * 100); out.previewRatio = Math.round((hr.top - pr.top) / pr.height * 100);
    // scroll the editor to the top: the preview follows
    await wait(400); out.edTopBefore = Math.round(v.scrollDOM.scrollTop); out.pvBefore = Math.round(pv.scrollTop); v.scrollDOM.scrollTop = 0; await wait(400); out.previewTopAfter = Math.round(pv.scrollTop);
    // inside one big block (a 600-line code fence) the preview follows by line
    window.__med.setText('# Code' + String.fromCharCode(10) + String.fromCharCode(10) + String.fromCharCode(96, 96, 96) + 'js' + String.fromCharCode(10) + Array.from({ length: 600 }, (_, i) => 'const v' + i + ' = ' + i + ';').join(String.fromCharCode(10)) + String.fromCharCode(10) + String.fromCharCode(96, 96, 96) + String.fromCharCode(10)); await wait(500); const l400 = v.state.doc.line(400); v.dispatch({ selection: { anchor: l400.from }, scrollIntoView: true }); await wait(500); const pre = pv.querySelector('pre'); const prr = pre.getBoundingClientRect(); const ppr = pv.getBoundingClientRect(); out.codeScrolled = Math.round(pv.scrollTop); out.codeBlockSpansView = prr.top < ppr.top && prr.bottom > ppr.bottom; out.codeLineVisible = (() => { const idx = pre.textContent.indexOf('const v399 '); const rng = document.createRange(); const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT); let n, acc = 0; while ((n = walker.nextNode())) { if (acc + n.data.length > idx) { rng.setStart(n, idx - acc); rng.setEnd(n, idx - acc + 5); break; } acc += n.data.length; } const rr = rng.getBoundingClientRect(); out.lineRel = Math.round((rr.top - ppr.top) / ppr.height * 100); out.edLineRel = Math.round((v.coordsAtPos(l400.from).top - v.scrollDOM.getBoundingClientRect().top) / v.scrollDOM.getBoundingClientRect().height * 100); return rr.top >= ppr.top && rr.bottom <= ppr.bottom; })();
    return JSON.stringify(out); })()`,
  readme_sync: `(async () => { ${PRELUDE} const S = () => window.__med.state; const out = {}; await window.__med.openPath(${wp(path.join(root, 'README.md'))}); await wait(300); if (!S().settings.mdPreview) window.__med.action('toggle:mdPreview'); await wait(600); out.blocks = document.querySelectorAll('.md-preview .md-block').length; const v = window.__med.view(); const txt = v.state.doc.toString(); const heads = [...txt.matchAll(/^#+ .*$/gm)]; const last = heads[heads.length - 1]; v.dispatch({ selection: { anchor: last.index }, scrollIntoView: true }); await wait(600); const pv = document.querySelector('.md-preview'); out.pvScroll = Math.round(pv.scrollTop); out.pvMax = pv.scrollHeight - pv.clientHeight; const cur = pv.querySelector('.md-block.current'); out.current = cur ? cur.textContent.slice(0, 30) : null; out.lastHeading = last[0].slice(0, 30); const cr = cur.getBoundingClientRect(); const pr = pv.getBoundingClientRect(); out.curTopRel = Math.round((cr.top - pr.top) / pr.height * 100); out.edRel = Math.round((v.coordsAtPos(last.index).top - v.scrollDOM.getBoundingClientRect().top) / v.scrollDOM.getBoundingClientRect().height * 100); out.lines = v.state.doc.lines;
    // wheel-scroll the editor to the middle: the block at the editor's top should be at the preview's top
    const sd = v.scrollDOM; sd.scrollTop = (sd.scrollHeight - sd.clientHeight) / 2; await wait(500); const er = sd.getBoundingClientRect(); const topPos = v.posAtCoords({ x: er.left + 80, y: er.top + 2 }, false); const topLine = v.state.doc.lineAt(topPos); out.edTopLine = topLine.number; const blk = [...pv.querySelectorAll('[data-from]')].filter((b) => topPos >= Number(b.dataset.from) && topPos < Number(b.dataset.to)).pop(); out.topBlockRel = blk ? Math.round((blk.getBoundingClientRect().top - pr.top) / pr.height * 100) : null; out.topBlockBottomRel = blk ? Math.round((blk.getBoundingClientRect().bottom - pr.top) / pr.height * 100) : null; out.pvScroll2 = Math.round(pv.scrollTop); return JSON.stringify(out); })()`,
  // The git block's colour follows the repository through modify → add → commit → push (a throw-away repo with a bare "remote").
  terminal_gitstate: `(async () => { ${PRELUDE} window.__med.setFolder(${wp(work)}); await wait(300); window.__med.action('newTerminal', 'cmd'); await until(() => document.querySelector('.term-out input')); await wait(800);
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const type = (text) => { const el = document.querySelector('.term-view:not(.hidden) .term-out input'); set.call(el, text); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); };
    const prompts = () => [...document.querySelectorAll('.term-view:not(.hidden) .term-prompt')]; const state = () => { const p = prompts(); const g = p.length && p[p.length - 1].dataset.git; return g && g !== 'none' ? g : null; };
    const run = async (cmd, want) => { const n = prompts().length; type(cmd); await until(() => prompts().length > n && (!want || state() === want), 15000); return state(); };
    const out = {};
    out.init = await run('git init -q repo && cd repo && git config user.email a@b.c && git config user.name t && echo a> f.txt && git add . && git commit -qm init && git branch -M main && git init -q --bare ../remote.git && git remote add origin ../remote.git && git push -q -u origin main', 'uptodate');
    out.modified = await run('echo b>> f.txt', 'modified');
    out.staged = await run('git add .', 'staged');
    out.committed = await run('git commit -qm c2', 'ahead');
    out.pushed = await run('git push -q', 'uptodate');
    out.untracked = await run('echo x> new.txt', 'uptodate'); out.untrackedSymbol = (() => { const p = document.querySelectorAll('.term-view:not(.hidden) .term-prompt'); return p[p.length - 1].querySelector('.pseg[data-type=git]').textContent.includes('?'); })(); out.commitWithUntracked = await run('echo d>> f.txt && git commit -qam c3', 'ahead'); out.pushWithUntracked = await run('git push -q', 'uptodate');
    out.gitSegment = (() => { const p = prompts(); const g = p[p.length - 1].querySelector('.pseg[data-type=git]'); return g ? { text: g.textContent, bg: g.style.background } : null; })();
    return JSON.stringify(out); })()`,
  // Format document: the bundled Prettier tidies a JavaScript document (cursor line kept), JSON with the built-in
  // formatter, a language without a formatter falls back to re-indenting; the settings tab lists a select per language.
  format_doc: `(async () => { ${PRELUDE} const S = () => window.__med.state; const out = {};
    window.__med.newUntitled('const a={b:1,c:[1,2,3]};' + String.fromCharCode(10) + 'function f(x){return x*2}' + String.fromCharCode(10)); await wait(300); window.__med.action('lang:JavaScript'); await wait(400);
    const v = window.__med.view(); v.dispatch({ selection: { anchor: v.state.doc.line(2).from + 9 } }); await window.__med.formatDoc(); await wait(300);
    out.js = window.__med.getText(); out.cursorLine = v.state.doc.lineAt(v.state.selection.main.head).number; out.msg = document.querySelector('.status-text').textContent;
    window.__med.newUntitled('{"a":1,"b":[1,2]}'); await wait(300); window.__med.action('lang:JSON'); await wait(400); await window.__med.formatDoc(); await wait(300); out.json = window.__med.getText();
    window.__med.newUntitled('int main(){' + String.fromCharCode(10) + 'return 0;' + String.fromCharCode(10) + '}' + String.fromCharCode(10)); await wait(300); window.__med.action('lang:C'); await wait(500); await window.__med.formatDoc(); await wait(300); out.c = window.__med.getText(); out.cMsg = document.querySelector('.status-text').textContent;
    window.__med.action('settings'); await wait(300); [...document.querySelectorAll('.settings-tab')].find((b) => /정렬|Format/.test(b.textContent)).click(); await until(() => document.querySelectorAll('.format-grid select').length > 5, 6000);
    out.selects = document.querySelectorAll('.format-grid select').length; out.jsOptions = [...document.querySelectorAll('.format-grid select')[0].options].map((o) => o.textContent); out.dlgHeight = document.querySelector('.dlg').clientHeight;
    return JSON.stringify(out); })()`,
  context_format: `(async () => { ${PRELUDE} const el = document.querySelector('.cm-content'); const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.x + 40, clientY: r.y + 20 })); await wait(300); const items = [...document.querySelectorAll('.ctx-menu .ctx-item')].map((e) => e.textContent); return JSON.stringify({ items, hasFormat: items.some((x) => /정렬|Format/.test(x)) }); })()`,
  toolbar_format: `(async () => { ${PRELUDE} window.__med.newUntitled('const a={b:1};function f(x){return x*2}' + String.fromCharCode(10)); await wait(300); window.__med.action('lang:JavaScript'); await wait(400); const btn = [...document.querySelectorAll('.icon-toolbar .tool-btn')].find((b) => /정렬|Format/.test(b.title)); const before = btn.className; btn.click(); await wait(800); return JSON.stringify({ found: !!btn, classBefore: before, classAfter: btn.className, text: window.__med.getText(), msg: document.querySelector('.status-text').textContent }); })()`,
  dialog_drag: `(async () => { ${PRELUDE} window.__med.action('settings'); await wait(300); const d = document.querySelector('.dlg'); const tt = d.querySelector('.dlg-title'); const r0 = d.getBoundingClientRect(); const tr = tt.getBoundingClientRect(); tt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: tr.x + 60, clientY: tr.y + 10 })); window.dispatchEvent(new MouseEvent('mousemove', { clientX: tr.x + 260, clientY: tr.y + 110 })); window.dispatchEvent(new MouseEvent('mouseup', { clientX: tr.x + 260, clientY: tr.y + 110 })); await wait(200); const r1 = d.getBoundingClientRect(); const cm = document.querySelector('.cm-content'); const el = document.elementFromPoint(20, 300); const editorReachable = !!(el && el.closest('.editor-area, .sidebar-column, .cm-editor')); [...document.querySelectorAll('.settings-tab')].find((b) => /정렬|Format/.test(b.textContent)).click(); await until(() => document.querySelectorAll('.format-grid select').length > 5, 6000); const b = d.querySelector('.dlg-body'); return JSON.stringify({ moved: [Math.round(r1.x - r0.x), Math.round(r1.y - r0.y)], editorReachable, width: d.clientWidth, height: d.clientHeight, formatScroll: b.scrollHeight > b.clientHeight, gridRows: Math.ceil(document.querySelectorAll('.format-grid select').length / 3) }); })()`,
  settings_tabs_size: `(async () => { ${PRELUDE} window.__med.action('settings'); await wait(200); const out = { win: [window.innerWidth, window.innerHeight], tabs: [] }; for (const tab of document.querySelectorAll('.settings-tab')) { tab.click(); await wait(300); if (/테마|Theme/.test(tab.textContent)) { document.querySelector('.dlg.settings .pe-quick .btn.small').click(); await wait(300); } if (/정렬|Format/.test(tab.textContent)) await until(() => document.querySelectorAll('.format-grid select').length > 5, 6000); const d = document.querySelector('.dlg'); const b = d.querySelector('.dlg-body'); const cs = getComputedStyle(b); out.tabs.push({ tab: tab.textContent, dlg: [d.clientWidth, d.clientHeight], body: [b.clientHeight, b.scrollHeight], content: b.scrollHeight - b.clientHeight, need: d.clientHeight - b.clientHeight + b.scrollHeight, scroll: b.scrollHeight > b.clientHeight, padTop: cs.paddingTop }); } return JSON.stringify(out); })()`,
  // Print + preview context menu: a Markdown document prints as rendered with its images embedded; right-click on a preview image offers copy / save.
  print_preview: `(async () => { ${PRELUDE} const S = () => window.__med.state; const out = {}; window.__med.activate(S().docs.find((d) => d.name === 'README.md').id); await wait(400); if (!S().settings.mdPreview) window.__med.action('toggle:mdPreview'); await until(() => document.querySelectorAll('.md-preview img').length >= 2, 8000); await wait(300);
    window.__med.action('print'); await until(() => window.__lastPrint, 6000); out.printTitle = window.__lastPrint.title; out.printHasImg = (window.__lastPrint.html.match(/<img /g) || []).length; out.printImgData = (window.__lastPrint.html.match(/src="data:image/g) || []).length; out.printLen = window.__lastPrint.html.length;
    const img = document.querySelector('.md-preview img'); const r = img.getBoundingClientRect(); img.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.x + 5, clientY: r.y + 5 })); await wait(300); out.menu = [...document.querySelectorAll('.ctx-menu .ctx-item')].map((e) => e.textContent);
    [...document.querySelectorAll('.ctx-menu .ctx-item')].find((e) => /이미지 복사|Copy image/.test(e.textContent)).click(); await wait(800); out.msg = document.querySelector('.status-text').textContent;
    const tb = document.querySelector('.icon-toolbar'); const last = tb.lastElementChild.getBoundingClientRect(); out.toolbarFits = tb.scrollWidth <= tb.clientWidth && last.right <= window.innerWidth; out.printBtn = !![...tb.querySelectorAll('.tool-btn')].find((b) => /인쇄|Print/.test(b.title));
    window.__med.newUntitled('int x = 1;' + String.fromCharCode(10) + 'int y = 2;'); await wait(300); window.__med.action('lang:C'); await wait(300); window.__lastPrint = null; window.__med.action('print'); await until(() => window.__lastPrint, 6000); out.codeRows = (window.__lastPrint.html.match(/<tr>/g) || []).length;
    return JSON.stringify(out); })()`,
  // Save image as…: format / quality / transparency choices; encoders produce the right file types, flattening onto a background when asked.
  image_export: `(async () => { ${PRELUDE} const out = {}; const tpng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVQImWNgYGD4z8DAwMDAwMDAAAAOAgIBAAAA' + 'AAAAAElFTkSuQmCC';
    const p = window.__med.saveImage(tpng, 'sample'); await until(() => document.querySelector('.dlg .imgx-preview'), 5000); await until(() => document.querySelector('.dlg select'), 5000); await wait(400);
    out.info = document.querySelectorAll('.dlg .settings-grid span')[0].textContent; const sel = document.querySelector('.dlg select'); out.formats = [...sel.options].map((o) => o.textContent); out.alphaBox = !!document.querySelector('.dlg input[type=checkbox]');
    const set = (v) => { const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(sel, v); sel.dispatchEvent(new Event('change', { bubbles: true })); }; set('jpeg'); await wait(200); out.jpegAlphaDisabled = !!(document.querySelector('.dlg input[type=checkbox]') || {}).disabled; out.jpegHasColor = !!document.querySelector('.dlg input[type=color]'); out.jpegHasQuality = !!document.querySelector('.dlg input[type=range]'); out.jpegName = [...document.querySelectorAll('.dlg .mono')].map((e) => e.textContent).find((x) => /.jpg$/.test(x));
    [...document.querySelectorAll('.dlg .btn')].find((b) => /취소|Cancel/.test(b.textContent)).click(); await p;
    const enc = async (opts) => (await window.__med.exportImage(tpng, opts)).slice(0, 22); out.png = await enc({ format: 'png', keepAlpha: true }); out.jpeg = await enc({ format: 'jpeg', quality: 0.8 }); out.webp = await enc({ format: 'webp', keepAlpha: true }); out.bmp = await enc({ format: 'bmp', background: '#ff0000' });
    // flattening: a transparent pixel becomes the background colour
    const flat = await window.__med.exportImage(tpng, { format: 'png', keepAlpha: false, background: '#00ff00' }); const img = new Image(); img.src = flat; await new Promise((r) => { img.onload = r; }); const c = document.createElement('canvas'); c.width = 2; c.height = 2; const g = c.getContext('2d'); g.drawImage(img, 0, 0); out.flatPixels = [...g.getImageData(0, 0, 2, 2).data]; const o = new Image(); o.src = tpng; await new Promise((r) => { o.onload = r; }); const c2 = document.createElement('canvas'); c2.width = 2; c2.height = 2; c2.getContext('2d').drawImage(o, 0, 0); out.origPixels = [...c2.getContext('2d').getImageData(0, 0, 2, 2).data];
    return JSON.stringify(out); })()`,
  // A formatter chosen in the settings but not installed: formatting offers to install it, the popup shows the package manager's progress, then the document is formatted with it.
  install_tool: `(async () => { ${PRELUDE} const S = () => window.__med.state; const out = {}; window.__med.newUntitled('select a,b from t where x=1'); await wait(300); window.__med.action('lang:SQL'); await wait(400);
    window.__med.action('settings'); await wait(300); [...document.querySelectorAll('.settings-tab')].find((b) => /정렬|Format/.test(b.textContent)).click(); await until(() => document.querySelectorAll('.format-grid select').length > 5, 6000);
    const row = [...document.querySelectorAll('.format-grid label')].find((l) => l.textContent === 'SQL'); const sel = row.nextElementSibling; out.sqlOptions = [...sel.options].map((o) => o.textContent); const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(sel, 'sql-formatter'); sel.dispatchEvent(new Event('change', { bubbles: true })); await wait(200); window.__med.closeDialog(); await wait(200); out.chosen = S().settings.formatters.SQL;
    const p = window.__med.formatDoc(); await until(() => S().dialog === 'confirm', 6000); out.askTitle = document.querySelector('.dlg .dlg-title span').textContent; [...document.querySelectorAll('.dlg .btn')].find((b) => /^설치$|^Install$/.test(b.textContent.trim())).click();
    await until(() => document.querySelector('.inst'), 6000); out.popup = !!document.querySelector('.inst-bar'); await until(() => !document.querySelector('.inst-bar'), 90000); out.result = document.querySelector('.dlg .dlg-title span').textContent; out.logHasInstalled = document.querySelector('.inst-log').textContent.includes('[installed]');
    [...document.querySelectorAll('.dlg .btn')].find((b) => /정렬 실행|Format now/.test(b.textContent)).click(); await p; await wait(400); out.text = window.__med.getText(); out.msg = document.querySelector('.status-text').textContent;
    return JSON.stringify(out); })()`,
  // Settings › 정렬: the install button of a tool that is installed already asks — remove and reinstall / install over / cancel — then shows the progress popup and rescans.
  reinstall_tool: `(async () => { ${PRELUDE} const S = () => window.__med.state; const out = {}; window.__med.action('settings'); await wait(300); [...document.querySelectorAll('.settings-tab')].find((b) => /정렬|Format/.test(b.textContent)).click(); await until(() => document.querySelectorAll('.format-grid select').length > 5, 6000);
    const row = [...document.querySelectorAll('.format-grid label')].find((l) => l.textContent === 'SQL'); const cell = row.nextElementSibling; const sel = cell.querySelector('select'); const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(sel, 'sql-formatter'); sel.dispatchEvent(new Event('change', { bubbles: true })); await wait(300);
    let btn = row.nextElementSibling.querySelector('.icon-btn'); out.btnBefore = btn ? btn.title : null; btn.click(); await until(() => document.querySelector('.inst'), 6000); await until(() => !document.querySelector('.inst-bar'), 90000); out.first = document.querySelector('.dlg.info .dlg-title span') && [...document.querySelectorAll('.dlg .dlg-title span')].pop().textContent; out.afterBtns = [...document.querySelectorAll('.dlg .btn')].map((b) => b.textContent.trim()); const closeBtn = [...document.querySelectorAll('.dlg .btn')].find((b) => /정렬 실행|Format now|닫기|Close/.test(b.textContent)); if (!closeBtn) return JSON.stringify(out); closeBtn.click(); await wait(600); await until(() => document.querySelectorAll('.format-grid select').length > 5, 8000); await wait(300);
    btn = [...document.querySelectorAll('.format-grid label')].find((l) => l.textContent === 'SQL').nextElementSibling.querySelector('.icon-btn'); out.btnAfter = btn.title; btn.click(); await wait(300); out.askButtons = [...document.querySelectorAll('.dlg .btn')].map((b) => b.textContent.trim()); [...document.querySelectorAll('.dlg .btn')].find((b) => /지우고 새로 설치|Remove and reinstall/.test(b.textContent)).click(); await until(() => document.querySelector('.inst'), 6000); out.cmd = document.querySelector('.inst-cmd').textContent; await until(() => !document.querySelector('.inst-bar'), 90000); out.second = [...document.querySelectorAll('.dlg .dlg-title span')].pop().textContent;
    return JSON.stringify(out); })()`,
  // ── the terminal prompt theme (settings › terminal), exit status, and the CR handling ──
  terminal_prompt: `(async () => { ${PRELUDE} const S = () => window.__med.state; window.__med.setFolder(${wp(work)}); await wait(300); window.__med.action('newTerminal', 'cmd'); await until(() => document.querySelector('.term-out input')); await until(() => document.querySelector('.term-live .pseg'), 8000); await wait(300);
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const type = (text) => { const el = document.querySelector('.term-view:not(.hidden) .term-out input'); set.call(el, text); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); };
    const live = () => document.querySelector('.term-view:not(.hidden) .term-live .term-prompt'); const segs = () => live() ? [...live().querySelectorAll('.pseg')].map((e) => e.dataset.type + ':' + e.textContent.trim()) : [];
    const run = async (cmd) => { const n = document.querySelectorAll('.term-view:not(.hidden) .term-prompt').length; type(cmd); await until(() => document.querySelectorAll('.term-view:not(.hidden) .term-prompt').length > n && live(), 15000); await wait(300); };
    const out = { defaultSegs: segs(), pathHasFolder: segs().some((x) => x.startsWith('path:') && x.includes('work')) };
    await run('cmd /c exit 3'); out.afterExit3 = segs();
    window.__med.action('termSettings'); await until(() => document.querySelector('.dlg.settings .pe-presets')); await wait(200);
    out.tab = document.querySelector('.settings-tab.active').textContent; out.presets = document.querySelectorAll('.pe-preset').length;
    [...document.querySelectorAll('.pe-preset')].find((b) => /rainbow|레인보우/i.test(b.title)).click(); await wait(300); out.presetId = S().settings.prompt.preset; out.previewLines = document.querySelectorAll('.pe-preview-out .term-prompt').length;
    window.__med.closeDialog(); await wait(300); out.rainbowSegs = segs(); out.statusShows3 = segs().some((x) => x.startsWith('status:') && x.includes('3'));
    await run('echo ok'); out.statusOk = segs().find((x) => x.startsWith('status:')); out.hasTime = segs().some((x) => /^time:\\d\\d:\\d\\d/.test(x)); out.hasShell = segs().some((x) => x.startsWith('shell:'));
    return JSON.stringify(out); })()`,
  terminal_cr: `(async () => { ${PRELUDE} const S = () => window.__med.state; window.__med.setFolder(${wp(work)}); await wait(300); window.__med.action('newTerminal', 'cmd'); await until(() => document.querySelector('.term-out input')); await until(() => document.querySelector('.term-live .pseg'), 8000); await wait(300);
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const type = (text) => { const el = document.querySelector('.term-view:not(.hidden) .term-out input'); set.call(el, text); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); };
    const run = async (cmd) => { const n = document.querySelectorAll('.term-view:not(.hidden) .term-prompt').length; type(cmd); await until(() => document.querySelectorAll('.term-view:not(.hidden) .term-prompt').length > n && document.querySelector('.term-view:not(.hidden) .term-live .term-prompt'), 15000); await wait(300); };
    const cmd = 'node -e "process.stdout.write(String.fromCharCode(65,65,65,13,66,66,66,10))"';   // AAA<CR>BBB<LF>
    const outText = () => document.querySelector('.term-view:not(.hidden) .term-out').textContent;
    const out = { defaultMode: S().settings.termCr };
    await run(cmd); out.overwrite = outText().includes('BBB') && !outText().includes('AAABBB') && !outText().includes('AAA' + String.fromCharCode(10) + 'BBB');
    await run('cmd /c exit 2'); await run('echo after'); out.rcResetByEcho = [...document.querySelectorAll('.term-view:not(.hidden) .term-live .pseg')].every((e) => e.dataset.type !== 'status');
    await run('node -e "process.stdout.write(String.fromCharCode(49,50,13,51,52,10))"'); out.progress = outText().includes('34') && !outText().includes('1234');
    return JSON.stringify(out); })()`,
  // ── settings › theme: 20 cards in dark / light groups, a custom theme is made, edited live and deleted ──
  theme_tab: `(async () => { ${PRELUDE} const S = () => window.__med.state; window.__med.action('settings'); await wait(300); [...document.querySelectorAll('.settings-tab')].find((b) => /테마|Theme/.test(b.textContent)).click(); await wait(300);
    const out = { tabs: [...document.querySelectorAll('.settings-tab')].map((b) => b.textContent), cards: document.querySelectorAll('.theme-card').length, sections: [...document.querySelectorAll('.theme-section')].map((e) => e.textContent) };
    const card = (name) => [...document.querySelectorAll('.theme-card')].find((c) => c.textContent.includes(name));
    card('사이버').click(); await wait(200); out.cyber = [S().settings.theme, document.documentElement.dataset.theme, getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()];
    document.querySelector('.dlg.settings .pe-quick .btn.small').click(); await wait(300); out.custom = { theme: S().settings.theme, cards: document.querySelectorAll('.theme-card').length, sections: document.querySelectorAll('.theme-section').length, badge: !!document.querySelector('.theme-badge'), count: S().settings.customThemes.length };
    const accent = [...document.querySelectorAll('.custom-color')].find((l) => /강조색$|^Accent$/.test(l.querySelector('span').textContent)).querySelector('input.mono'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(accent, '#ff0000'); accent.dispatchEvent(new Event('input', { bubbles: true })); await wait(300);
    out.accentLive = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(); out.storedAccent = S().settings.customThemes[0].colors.accent;
    out.menuHasCustom = !!(await (async () => { window.__med.closeDialog(); await wait(200); window.__med.action('nextTheme'); await wait(200); const t1 = S().settings.theme; window.__med.action('nextTheme'); await wait(200); return t1 === 'midnight' && S().settings.theme === 'daylight'; })());
    window.__med.action('theme:' + S().settings.customThemes[0].id); await wait(200); window.__med.action('settings'); await wait(300); [...document.querySelectorAll('.settings-tab')].find((b) => /테마|Theme/.test(b.textContent)).click(); await wait(300);
    [...document.querySelectorAll('.dlg.settings .pe-quick .btn.small')][1].click(); await wait(300); out.afterDelete = { theme: S().settings.theme, cards: document.querySelectorAll('.theme-card').length, count: S().settings.customThemes.length };
    return JSON.stringify(out); })()`,
  // ── the HTML preview pane: local stylesheet and image inlined, the page's script ran ──
  html_preview: `(async () => { ${PRELUDE} const S = () => window.__med.state; await window.__med.openPath(${wp(path.join(work, 'docs', 'page.html'))}); await wait(500); const d = S().docs.find((x) => x.name === 'page.html');
    const out = { lang: d.langName, bar: !!document.querySelector('.htmlbar'), before: !!document.querySelector('.html-preview') };
    window.__med.action('togglePreview'); await until(() => { const f = document.querySelector('.html-preview iframe'); return f && f.srcdoc && f.srcdoc.includes('data:image/png'); }, 8000); await wait(600);
    const f = document.querySelector('.html-preview iframe'); out.setting = S().settings.htmlPreview; out.css = f.srcdoc.includes('<style>') && f.srcdoc.includes('#3a86ff'); out.img = f.srcdoc.includes('data:image/png;base64'); out.sandbox = f.getAttribute('sandbox'); out.noLink = !/<link[^>]*stylesheet/.test(f.srcdoc);
    const v = window.__med.view(); v.dispatch({ changes: { from: v.state.doc.toString().indexOf('Hello preview'), insert: 'Edited ' } }); await until(() => document.querySelector('.html-preview iframe').srcdoc.includes('Edited Hello'), 5000); out.liveUpdate = true;
    const pv = document.querySelector('.html-preview'); const w0 = pv.getBoundingClientRect().width; const sp = pv.previousElementSibling; const sr = sp.getBoundingClientRect(); sp.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: sr.x + 2, clientY: sr.y + 100 })); window.dispatchEvent(new MouseEvent('mousemove', { clientX: sr.x - 150, clientY: sr.y + 100 })); window.dispatchEvent(new MouseEvent('mouseup', { clientX: sr.x - 150, clientY: sr.y + 100 })); await wait(300); out.dragWidened = Math.round(document.querySelector('.html-preview').getBoundingClientRect().width - w0); out.widthSetting = Math.round(S().settings.mdPreviewWidth * 100);
    window.__med.action('togglePreview'); await wait(300); out.after = !!document.querySelector('.html-preview'); out.wide = document.querySelector('.editor-area').getBoundingClientRect().width > 300;
    return JSON.stringify(out); })()`,
  // ── autocomplete: the language's completions appear while typing, the toolbar toggle turns them off ──
  autocomplete: `(async () => { ${PRELUDE} const S = () => window.__med.state; const v = window.__med.view(); const end = v.state.doc.length; v.dispatch({ selection: { anchor: end }, scrollIntoView: true }); v.focus(); await wait(200);
    const typeWord = async (w) => { for (const ch of w) { const at = v.state.selection.main.head; v.dispatch({ changes: { from: at, insert: ch }, selection: { anchor: at + 1 }, userEvent: 'input.type' }); await wait(60); } await wait(500); };
    await typeWord(String.fromCharCode(10) + 'cons'); const tip = () => document.querySelector('.cm-tooltip-autocomplete'); const out = { on: S().settings.autocomplete, tooltip: !!tip(), options: tip() ? [...tip().querySelectorAll('.cm-completionLabel')].slice(0, 6).map((e) => e.textContent) : [] };
    out.button = !!document.querySelector('.tool-btn.on[aria-label*="자동 완성"], .tool-btn.on[aria-label*="Autocomplete"]');
    window.__med.action('toggle:autocomplete'); await wait(300); await typeWord(' cons'); out.offTooltip = !!tip(); out.offSetting = S().settings.autocomplete; out.buttonOff = !!document.querySelector('.tool-btn.on[aria-label*="자동 완성"], .tool-btn.on[aria-label*="Autocomplete"]');
    window.__med.action('toggle:autocomplete'); await wait(200); window.__med.newUntitled('plain words here: alphabet alpine' + String.fromCharCode(10)); await wait(400); const v2 = window.__med.view(); v2.focus(); const at = v2.state.doc.length; for (const ch of 'alp') { const h = v2.state.selection.main.head; v2.dispatch({ changes: { from: h, insert: ch }, selection: { anchor: h + 1 }, userEvent: 'input.type' }); await wait(60); } await wait(500);
    out.plainWords = tip() ? [...tip().querySelectorAll('.cm-completionLabel')].map((e) => e.textContent) : [];
    return JSON.stringify(out); })()`,
  // ── the folder panel cannot be dragged narrower than its header (title + every icon button visible) ──
  sidebar_min: `(async () => { ${PRELUDE} const col = () => document.querySelector('.sidebar-column'); const w0 = col().getBoundingClientRect().width; const sp = document.querySelector('.v-splitter'); const r = sp.getBoundingClientRect();
    sp.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: r.x + 2, clientY: r.y + 100 })); window.dispatchEvent(new MouseEvent('mousemove', { clientX: 0, clientY: r.y + 100 })); window.dispatchEvent(new MouseEvent('mouseup', { clientX: 0, clientY: r.y + 100 })); await wait(300);
    const cr = col().getBoundingClientRect(); const head = document.querySelector('.sb-head'); const items = [head.querySelector('.panel-title'), ...head.querySelectorAll('.icon-btn')]; const visible = items.every((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.left >= cr.left - 1 && b.right <= cr.right + 1; });
    const need = items.reduce((a, e) => a + e.getBoundingClientRect().width, 0);
    return JSON.stringify({ before: Math.round(w0), after: Math.round(cr.width), need: Math.round(need), allVisible: visible, buttons: head.querySelectorAll('.icon-btn').length, headOverflow: head.scrollWidth > head.clientWidth + 1 }); })()`,
  // ── a source file with one NUL opens as text (not the hex view) ──
  nul_text: `(async () => { ${PRELUDE} const S = () => window.__med.state; await window.__med.openPath(${wp(path.join(work, 'src', 'nul.js'))}); await wait(600); const d = S().docs.find((x) => x.name === 'nul.js');
    return JSON.stringify({ kind: d.kind || 'text', lang: d.langName, hex: !!document.querySelector('.hex-view'), lines: window.__med.view().state.doc.lines, hasNul: window.__med.getText().includes(String.fromCharCode(0)) }); })()`,
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
  settings_terminal_fields: `(async () => { ${PRELUDE} window.__med.action('settings'); await wait(200); document.querySelectorAll('.settings-tab')[2].click(); await wait(300); return JSON.stringify({ shells: document.querySelectorAll('.settings-term select option').length, cwd: !!document.querySelector('.settings-term input[type=text]') }); })()`,
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
    const tE = Date.now(); type('echo hello-from-terminal', 'Enter'); await until(() => out().includes('echo hello-from-terminal\\nhello-from-terminal'), 8000); const tOut = Date.now() - tE; await until(() => prompts().length >= 2 && gitOf(), 8000); const tPrompt = Date.now() - tE;
    type('git log --oneline -n 2', 'Enter'); await until(() => document.querySelectorAll('.term-out span[style*=color]').length >= 2, 8000); const colored = document.querySelectorAll('.term-out span[style*=color]').length;
    type('echo 한글 출력', 'Enter'); await until(() => out().includes('한글 출력' + String.fromCharCode(10)), 8000);
    type('cd ..', 'Enter'); await until(() => pathOf() && pathOf() !== p0, 8000); const p1 = pathOf();
    type('cd MyEd', 'Tab'); await until(() => inp().value.startsWith('cd MyEditorMultiOSV10'), 4000); const completed = inp().value; type('', null);
    type('type READ', 'Tab'); await until(() => inp().value === 'type README.md ', 4000); type('', null);
    window.__med.action('newTerminal'); await wait(1200); document.querySelector('.term-tab').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await wait(300); type('echo typing', null); await wait(300);
    return JSON.stringify({ tabs: document.querySelectorAll('.term-tab').length, git: gitOf(), colored, tOut, tPrompt, p0, p1, completed, prompts: prompts().length, typing: inp().value === 'echo typing' }); })()`,
  font_picker: `(async () => { ${PRELUDE} document.querySelector('.font-picker .fp-caret').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await wait(1500);
    const list = document.querySelector('.fp-list'); const r = list.getBoundingClientRect();
    return JSON.stringify({ items: list.querySelectorAll('.fp-item').length, height: Math.round(r.height), scrollable: list.scrollHeight > list.clientHeight, insideWindow: r.bottom <= window.innerHeight }); })()`,
  no_sidebar: `(async () => { ${PRELUDE} window.__med.action('toggle:sidebarVisible'); window.__med.action('toggle:toolbarVisible'); await wait(300); return 'plain'; })()`,
};

async function electronShot(name = 'main', script = null, url = null) {
  const electronPath = require('electron');
  seedProfile(name);
  const env = { ...process.env, MED_USER_DATA: profileFor(name), MED_SMOKE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  // --dev: load the running Vite dev server (npm run dev / npm start) instead of dist/.
  if (args.includes('--dev')) env.ELECTRON_DEV = '1';
  const shot = path.join(smokeDir, `${name}.png`);
  const extra = [];
  if (url) extra.push(`--smoke-url=${url}`);
  if (opt('popup')) extra.push(`--smoke-popup=${opt('popup')}`);   // also open a separate settings / about / shortcuts window and capture it
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
    else if (scenario === 'all') { for (const [k, v] of Object.entries(SCENARIOS)) { if (k === 'file_dialog' || k === 'probe') continue; seed(k); await electronShot(k, v); } }
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
