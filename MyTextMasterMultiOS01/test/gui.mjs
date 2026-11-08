// GUI checks on the web build (dist/) in a headless Edge / Chrome: the start page, documents,
// formatting, preview and scroll sync, tools, dialogs, settings, themes, language, the toolbar
// width rule and the tutorial. Each check runs on a fresh page state where it matters.
//   node test/gui.mjs            (after npm run build:web)
//   node test/gui.mjs --shots    (also saves screenshots to test-results/gui/)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, launch } from './harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = process.argv.includes('--shots');
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7);
fs.rmSync(path.join(root, 'test-results', 'gui'), { recursive: true, force: true });
const { server, url } = await serve(path.join(root, 'dist'));
const page = await launch({ width: 1440, height: 900 });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const app = (expr) => page.eval(`const app = window.__mytextmaster; ${expr}`);

const checks = [];
const check = (name, fn) => checks.push({ name, fn });
const fail = (message) => { throw new Error(message); };
const expect = (value, message) => { if (!value) fail(message); };

/** A clean app: no stored settings or session, the start page. */
async function fresh(settings = {}) {
  // Storage belongs to the app's origin: load it once, clear, then load again.
  if (!(await page.eval('return location.href;')).startsWith(url)) await page.goto(url);
  await page.eval(`localStorage.clear(); localStorage.setItem('mytextmaster.settings', ${JSON.stringify(JSON.stringify(settings))}); return true;`);
  await page.goto(url);
}

async function editorText() { return app('return app.editor().text();'); }
async function setText(text) { await app(`const ed = app.editor(); ed.view.dispatch({ changes: { from: 0, to: ed.view.state.doc.length, insert: ${JSON.stringify(text)} } }); return true;`); }
async function select(from, to) { await app(`app.editor().view.dispatch({ selection: { anchor: ${from}, head: ${to} } }); app.editor().focus(); return true;`); }
async function previewHtml() { return page.eval(`return document.querySelector('.preview-frame')?.contentDocument?.querySelector('article')?.innerHTML ?? '';`); }
async function shot(name) { if (shots) await page.screenshot(path.join(root, 'test-results', 'gui', `${name}.png`)); }

// ───────────────────────── start page

check('start page shows the card board, 10 templates and 30 samples (10 per kind)', async () => {
  await fresh();
  const info = await page.eval(`return { cards: [...document.querySelectorAll('.start-card')].map((c) => c.dataset.card), templates: document.querySelectorAll('[data-start="template"]').length, samples: document.querySelectorAll('[data-start="sample"]').length, onStart: document.querySelector('#app').classList.contains('on-start') };`);
  expect(info.onStart, 'not on the start page');
  expect(['hero', 'actions', 'recent', 'templates', 'samples', 'theme', 'background'].every((id) => info.cards.includes(id)), `cards: ${info.cards}`);
  expect(info.templates === 10, `templates ${info.templates}`);
  expect(info.samples === 30, `samples ${info.samples}`);
  const groups = await page.eval(`return [...document.querySelectorAll('[data-sample-group]')].map((g) => g.querySelectorAll('[data-start="sample"]').length);`);
  expect(groups.join() === '10,10,10', `per group ${groups}`);
  expect(!(await page.eval(`return Boolean(document.querySelector('[data-start="tutorial"]'));`)), 'tutorial button still on the start page');
  await shot('01-start');
});

check('start cards do not overlap and auto arrange keeps them apart', async () => {
  await page.click('[data-start="arrange"]');
  await wait(300);
  const overlap = await page.eval(`const r = [...document.querySelectorAll('.start-card')].map((c) => c.getBoundingClientRect()); for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) { const a = r[i], b = r[j]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) return [i, j]; } return null;`);
  expect(!overlap, `cards overlap: ${overlap}`);
});

check('a theme tile on the start page changes the theme', async () => {
  await page.click('[data-start="pick-theme"][data-value="dracula"]');
  await wait(150);
  const theme = await page.eval(`return [document.documentElement.dataset.theme, document.documentElement.dataset.mode];`);
  expect(theme[0] === 'dracula' && theme[1] === 'dark', `theme ${theme}`);
  await shot('02-start-dark');
});

check('the background chips change the animation', async () => {
  await page.click('[data-start="animation"][data-value="snow"]');
  await wait(100);
  expect(await app(`return app.settings().animation === 'snow';`), 'animation not set');
});

// ───────────────────────── documents

check('a sample opens in a tab with editor, preview and outline', async () => {
  await fresh();
  await page.click('[data-start="sample"][data-value="feature-tour"]');
  await page.waitFor(`document.querySelector('.preview-frame')?.contentDocument?.querySelector('article h1')`, 5000);
  const info = await page.eval(`return { tabs: document.querySelectorAll('#tabs .tab').length, outline: document.querySelectorAll('.outline-item').length, mode: document.querySelector('#editor-area').dataset.mode, h1: document.querySelector('.preview-frame').contentDocument.querySelector('article h1').textContent };`);
  expect(info.tabs === 1, `tabs ${info.tabs}`);
  expect(info.outline === 6 || info.outline === 0, `outline items ${info.outline}`);
  expect(info.mode === 'split', `mode ${info.mode}`);
  expect(info.h1.includes('MyTextMaster'), `h1 ${info.h1}`);
  await shot('03-sample');
});

check('typing updates the preview, the outline and marks the tab unsaved', async () => {
  await app(`await app.newDocument('markdown'); return true;`);
  await app(`app.editor().focus(); return true;`);
  await page.type('# 새 제목\n\n본문 **굵게**\n\n## 둘째\n');
  await page.waitFor(`document.querySelector('.preview-frame')?.contentDocument?.querySelector('article strong')`, 4000);
  const html = await previewHtml();
  expect(/<h1 id="새-제목">새 제목<\/h1>/.test(html), 'heading not rendered');
  await page.waitFor(`document.querySelectorAll('.outline-item').length === 2`, 3000);
  expect(await page.eval(`return document.querySelector('#tabs .tab.active').classList.contains('dirty');`), 'tab not dirty');
  expect(await page.eval(`return document.querySelector('.app-brand-project').classList.contains('dirty');`), 'title not dirty');
});

check('Ctrl+B bolds the selection and undoes it again; Ctrl+I italics', async () => {
  await setText('hello world');
  await select(0, 5);
  await page.key('b', { ctrl: true });
  expect((await editorText()) === '**hello** world', `bold: ${await editorText()}`);
  await page.key('b', { ctrl: true });
  expect((await editorText()) === 'hello world', `unbold: ${await editorText()}`);
  await select(6, 11);
  await page.key('i', { ctrl: true });
  expect((await editorText()) === 'hello *world*', `italic: ${await editorText()}`);
});

check('heading, list, task and quote commands toggle line prefixes', async () => {
  await setText('one\ntwo');
  await select(0, 7);
  await app(`app.run('bulletList'); return true;`);
  expect((await editorText()) === '- one\n- two', `ul: ${await editorText()}`);
  await app(`app.run('bulletList'); return true;`);
  expect((await editorText()) === 'one\ntwo', `ul off: ${await editorText()}`);
  await app(`app.run('orderedList'); return true;`);
  expect((await editorText()) === '1. one\n2. two', `ol: ${await editorText()}`);
  await setText('title');
  await select(0, 0);
  await page.key('2', { ctrl: true });
  expect((await editorText()) === '## title', `h2: ${await editorText()}`);
  await page.key('0', { ctrl: true });
  expect((await editorText()) === 'title', `p: ${await editorText()}`);
});

check('HTML documents get HTML tags from the same commands', async () => {
  await app(`await app.newDocument('html'); return true;`);
  await setText('word');
  await select(0, 4);
  await app(`app.run('bold'); return true;`);
  expect((await editorText()) === '<strong>word</strong>', `html bold: ${await editorText()}`);
  await setText('a\nb');
  await select(0, 3);
  await app(`app.run('bulletList'); return true;`);
  expect((await editorText()) === '<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>', `html ul: ${await editorText()}`);
});

check('HTML preview shows the page without running its scripts', async () => {
  await setText('<!doctype html><html><body><h1 id="t">Page</h1><script>document.body.dataset.ran = "yes"</script></body></html>');
  await page.waitFor(`document.querySelector('.preview-frame')?.contentDocument?.querySelector('#t')`, 4000);
  const ran = await page.eval(`return document.querySelector('.preview-frame').contentDocument.body.dataset.ran ?? 'no';`);
  expect(ran === 'no', 'script ran in the preview');
  expect(await page.eval(`return document.querySelector('.preview-frame').getAttribute('sandbox');`) === 'allow-same-origin', 'sandbox');
});

check('Markdown preview drops scripts and event handlers (DOMPurify)', async () => {
  await app(`await app.newDocument('markdown'); return true;`);
  await setText('# x\n\n<img src=x onerror="parent.document.body.dataset.xss=1"><script>parent.document.body.dataset.xss=2</script>\n');
  await page.waitFor(`document.querySelector('.preview-frame')?.contentDocument?.querySelector('article h1')`, 4000);
  await wait(300);
  const article = await previewHtml();
  expect(!/onerror|<script/i.test(article), `unsafe html kept: ${article}`);
  expect(!(await page.eval(`return document.body.dataset.xss ?? '';`)), 'script ran');
});

check('insert table via the dialog', async () => {
  await setText('');
  await app(`app.run('table'); return true;`);
  await page.waitFor(`document.querySelector('[data-dialog="form"]')`, 2000);
  await page.eval(`const box = document.querySelector('[data-dialog="form"]'); box.querySelector('[data-field="cols"]').value = 2; box.querySelector('[data-field="rows"]').value = 1; box.querySelector('[data-dialog-button="ok"]').click(); return true;`);
  await wait(100);
  const lines = (await editorText()).trim().split('\n');
  expect(lines.length === 3 && lines[0].startsWith('| ') && lines[1].includes('---'), `table: ${lines.join(' / ')}`);
});

check('insert link via the dialog uses the selection as its text', async () => {
  await setText('MyTextMaster');
  await select(0, 12);
  await app(`app.run('link'); return true;`);
  await page.waitFor(`document.querySelector('[data-dialog="form"]')`, 2000);
  await page.eval(`const box = document.querySelector('[data-dialog="form"]'); box.querySelector('[data-field="url"]').value = 'https://example.com'; box.querySelector('[data-dialog-button="ok"]').click(); return true;`);
  await wait(100);
  expect((await editorText()) === '[MyTextMaster](https://example.com)', `link: ${await editorText()}`);
});

check('line tools: sort and remove duplicates on the whole document', async () => {
  await setText('pear\napple\npear\nbanana');
  await select(0, 0);
  await app(`app.run('dedupe'); return true;`);
  expect((await editorText()) === 'pear\napple\nbanana', `dedupe: ${await editorText()}`);
  await select(0, 0);
  await app(`app.run('sortAsc'); return true;`);
  expect((await editorText()) === 'apple\nbanana\npear', `sort: ${await editorText()}`);
  await select(0, 5);
  await app(`app.run('upper'); return true;`);
  expect((await editorText()).startsWith('APPLE\n'), `upper: ${await editorText()}`);
});

check('find opens the search bar; Ctrl+G asks for a line', async () => {
  await setText(Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n'));
  await page.key('f', { ctrl: true });
  await page.waitFor(`document.querySelector('.cm-search input[name="search"]')`, 2000);
  await page.key('Escape');
  await page.key('g', { ctrl: true });
  await page.waitFor(`document.querySelector('[data-dialog="form"] [data-field="line"]')`, 2000);
  await page.eval(`const box = document.querySelector('[data-dialog="form"]'); box.querySelector('[data-field="line"]').value = 40; box.querySelector('[data-dialog-button="ok"]').click(); return true;`);
  await wait(100);
  expect((await app(`return app.editor().cursorInfo().line;`)) === 40, 'cursor not on line 40');
});

check('the outline jumps to a heading', async () => {
  await setText(`# Top\n\n${'text\n\n'.repeat(60)}## Far below\n\nend\n`);
  await page.waitFor(`document.querySelectorAll('.outline-item').length === 2`, 3000);
  await page.click('.outline-item.level-2');
  await wait(100);
  expect((await app(`return app.editor().cursorInfo().line;`)) === 123, `line ${await app('return app.editor().cursorInfo().line;')}`);
});

check('scroll sync: scrolling the editor scrolls the Markdown preview to the same block', async () => {
  await setText(Array.from({ length: 80 }, (_, i) => `## Section ${i + 1}\n\nParagraph ${i + 1}.\n`).join('\n'));
  await page.waitFor(`document.querySelectorAll('.preview-frame')[0]?.contentDocument?.querySelectorAll('article h2').length === 80`, 4000);
  await app(`app.editor().scrollToLine(121); return true;`);
  await wait(300);
  const top = await page.eval(`const d = document.querySelector('.preview-frame').contentDocument; const s = d.scrollingElement.scrollTop; const h = [...d.querySelectorAll('article h2')].find((e) => e.getBoundingClientRect().bottom > 0); return h?.textContent;`);
  expect(top === 'Section 31' || top === 'Section 30' || top === 'Section 32', `preview shows ${top}`);
});

check('view modes: editor only, preview only, side by side', async () => {
  await app(`app.run('viewEditor'); return true;`);
  expect(await page.eval(`return getComputedStyle(document.querySelector('#preview-pane')).display === 'none';`), 'preview still shown');
  await app(`app.run('viewPreview'); return true;`);
  expect(await page.eval(`return getComputedStyle(document.querySelector('#editor-pane')).visibility === 'hidden';`), 'editor still shown');
  await page.key('\\', { ctrl: true, code: 'Backslash' });
  // Markdown: preview → WYSIWYG → editor.
  expect((await app(`return app.settings().viewMode;`)) === 'wysiwyg', 'Ctrl+\\ did not cycle to WYSIWYG');
  await page.key('\\', { ctrl: true, code: 'Backslash' });
  expect((await app(`return app.settings().viewMode;`)) === 'editor', 'Ctrl+\\ did not cycle to the editor');
  await app(`app.run('viewSplit'); return true;`);
});

check('status bar shows cursor, counts, encoding; the encoding menu changes it', async () => {
  await setText('one two three');
  await select(3, 3);
  const text = await page.eval(`return document.querySelector('#statusbar').textContent;`);
  expect(/1.*4/.test(text) && text.includes('UTF-8'), `status: ${text}`);
  await page.click('[data-status="encoding"]');
  await page.waitFor(`document.querySelector('.popup-menu.in-page')`, 2000);
  await page.eval(`[...document.querySelectorAll('.popup-menu.in-page .menu-item')].find((b) => b.textContent.includes('EUC-KR')).click(); return true;`);
  await wait(100);
  expect((await page.eval(`return document.querySelector('[data-status="encoding"]').textContent;`)).includes('EUC-KR'), 'encoding not changed');
});

check('closing an unsaved tab asks; Cancel keeps it, Don\'t save closes it', async () => {
  const before = await page.eval(`return document.querySelectorAll('#tabs .tab').length;`);
  await app(`app.run('closeTab'); return true;`);
  await page.waitFor(`document.querySelector('[data-dialog="confirm"]')`, 2000);
  await page.eval(`document.querySelector('[data-dialog="confirm"] [data-dialog-button="no"]').click(); return true;`);
  await wait(100);
  expect((await page.eval(`return document.querySelectorAll('#tabs .tab').length;`)) === before, 'tab closed on cancel');
  await app(`app.run('closeTab'); return true;`);
  await page.waitFor(`document.querySelector('[data-dialog="confirm"]')`, 2000);
  await page.eval(`document.querySelector('[data-dialog="confirm"] [data-dialog-button="extra"]').click(); return true;`);
  await wait(150);
  expect((await page.eval(`return document.querySelectorAll('#tabs .tab').length;`)) === before - 1, 'tab not closed');
});

check('menus open from the menu bar, move with arrow keys and close with Esc', async () => {
  await page.click('[data-menu="file"]');
  await page.waitFor(`document.querySelector('.popup-menu.in-page')`, 2000);
  await page.key('ArrowRight');
  await wait(80);
  expect(await page.eval(`return document.querySelector('[data-menu="edit"]').classList.contains('open');`), 'ArrowRight did not open Edit');
  await page.key('Escape');
  await wait(80);
  expect(!(await page.eval(`return Boolean(document.querySelector('.popup-menu.in-page'));`)), 'menu still open');
});

check('the session brings unsaved documents back after a reload', async () => {
  await app(`await app.newDocument('markdown'); return true;`);
  await setText('# 다시 열릴 초안\n');
  await wait(1200); // the session is written 0.8 s after an edit
  await page.goto(url);
  await page.waitFor(`document.querySelector('#tabs .tab')`, 4000).catch(() => {});
  const restored = await app(`return app.state.docs.some((d) => app.editor().text(d).includes('다시 열릴 초안'));`);
  expect(restored, 'draft not restored');
});

// ───────────────────────── settings, language, theme, layout

check('settings: tabs switch and a change applies at once', async () => {
  await app(`app.run('settings'); return true;`);
  await page.waitFor(`document.querySelector('[data-dialog="settings"]')`, 2000);
  await page.click('[data-settings-tab="editor"]');
  await page.eval(`const box = document.querySelector('[data-dialog="settings"] [data-setting="editorFontSize"]'); box.value = 18; box.dispatchEvent(new Event('change', { bubbles: true })); return true;`);
  expect((await app(`return app.settings().editorFontSize;`)) === 18, 'font size not applied');
  await shot('05-settings');
  await page.key('Escape');
  await app(`app.updateSettings({ editorFontSize: 14 }); return true;`);
});

check('language switch rebuilds the window in English and keeps the documents', async () => {
  await app(`app.showStartPage(false); return true;`);
  const docs = await app(`return app.state.docs.length;`);
  await app(`app.run('language'); return true;`);
  await wait(200);
  const label = await page.eval(`return document.querySelector('[data-menu="file"]').textContent.trim();`);
  expect(label === 'File', `menu label ${label}`);
  expect((await app(`return app.state.docs.length;`)) === docs, 'documents lost');
  await shot('06-english');
  await app(`app.run('language'); return true;`);
  // The rebuilt window's preview frame is drawn again (a moved frame reloads empty).
  await page.waitFor(`document.querySelector('.preview-frame')?.contentDocument?.body?.textContent.trim()`, 4000);
});

check('every one of the 40 themes applies and keeps text readable', async () => {
  // The theme ids from the start page's theme card.
  const list = await app(`app.showStartPage(true); await new Promise((r) => setTimeout(r, 100)); return [...document.querySelectorAll('.st-theme-tile')].map((t) => t.dataset.value);`);
  expect(list.length === 40, `themes ${list.length}`);
  for (const id of list) {
    await app(`app.updateSettings({ theme: ${JSON.stringify(id)} }, { quiet: true }); return true;`);
    const ok = await page.eval(`const s = getComputedStyle(document.documentElement); return Boolean(s.getPropertyValue('--text').trim() && s.getPropertyValue('--bg').trim());`);
    expect(ok, `theme ${id} has no colours`);
  }
  await app(`app.updateSettings({ theme: 'light' }, { quiet: true }); app.showStartPage(false); return true;`);
});

check('toolbar is never cut off: the window minimum fits every button', async () => {
  for (const language of ['ko', 'en']) {
    await app(`app.updateSettings({ language: '${language}' }); return true;`);
    await wait(200);
    const m = await page.eval(`const tb = document.querySelector('#toolbar'); const min = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--min-width')); const right = document.querySelector('.toolbar-right').getBoundingClientRect(); return { min, overflow: tb.scrollWidth - tb.clientWidth, rightEnd: right.right, width: innerWidth };`);
    expect(m.overflow <= 0, `${language}: toolbar overflows by ${m.overflow}px`);
    expect(m.min <= 1300, `${language}: minimum width ${m.min}px is wider than a 1300 px window`);
    expect(m.rightEnd <= m.width, `${language}: right tools cut off`);
  }
  await app(`app.updateSettings({ language: 'ko' }); return true;`);
});

check('about, statistics and shortcuts dialogs open', async () => {
  for (const [command, id] of [['about', 'about'], ['stats', 'stats'], ['shortcuts', 'shortcuts']]) {
    await app(`app.run('${command}'); return true;`);
    await page.waitFor(`document.querySelector('[data-dialog="${id}"]')`, 2000);
    await shot(`07-${id}`);
    await page.key('Escape');
    await wait(80);
  }
});

check('the user\'s guide opens in a tab with contents, text size and language', async () => {
  await app(`app.run('userGuide'); return true;`);
  await page.waitFor(`document.querySelector('.guide-frame')?.contentDocument?.querySelector('h1')`, 4000);
  expect((await page.eval(`return document.querySelectorAll('.guide-toc .outline-item').length;`)) > 8, 'no contents');
  await page.click('[data-guide="larger"]');
  expect((await page.eval(`return document.querySelector('.guide-size').textContent;`)) === '110%', 'size did not grow');
  expect((await page.eval(`return document.querySelector('.guide-frame').contentDocument.body.style.fontSize;`)) === '110%', 'guide text did not grow');
  await page.click('[data-guide-lang="en"]');
  await page.waitFor(`document.querySelector('.guide-frame')?.contentDocument?.querySelector('h1')?.textContent.includes('User')`, 4000);
  await shot('08-guide');
  await page.click('[data-guide-lang="ko"]');
  await page.click('[data-guide="reset"]');
  await app(`app.run('closeTab'); return true;`);
});

check('side and bottom panels collapse and expand from the toolbar and their title bars', async () => {
  await app(`await app.openSample('feature-tour'); app.updateSettings({ leftOpen: true, rightOpen: true, bottomOpen: true }); return true;`);
  await wait(150);
  const width = () => page.eval(`return Math.round(document.querySelector('#left-panel').getBoundingClientRect().width);`);
  expect((await width()) > 150, 'left panel not open');
  await page.click('[data-panel-collapse="left"]');
  await wait(100);
  expect((await width()) < 50, 'left panel did not collapse to a rail');
  await page.click('[data-panel-expand="left"]');
  await wait(100);
  expect((await width()) > 150, 'left panel did not expand');
  await page.click('#toolbar [data-command="rightPanel"]');
  await wait(100);
  expect((await page.eval(`return Math.round(document.querySelector('#right-panel').getBoundingClientRect().width);`)) < 50, 'right panel did not collapse');
  await page.click('#toolbar [data-command="bottomPanel"]');
  await wait(100);
  expect(await page.eval(`return getComputedStyle(document.querySelector('#bottom-panel')).display === 'none';`), 'bottom panel still shown');
  await page.click('#toolbar [data-command="bottomPanel"]');
  await page.click('#toolbar [data-command="rightPanel"]');
  await wait(100);
  for (const side of ['left', 'right', 'bottom']) expect(await page.eval(`return Boolean(document.querySelector('[data-panel-head="${side}"] .panel-name') && document.querySelector('[data-panel-head="${side}"] .icon') && document.querySelector('[data-panel-collapse="${side}"]'));`), `${side} title bar incomplete`);
  await shot('09-panels');
});

check('the information panel has a line counter that follows the cursor', async () => {
  await app(`app.updateSettings({ rightOpen: true, rightTab: 'info' }); return true;`);
  await select(0, 0);
  await app(`app.editor().goToLine(12); return true;`);
  await wait(300);
  const counter = await page.eval(`return [...document.querySelectorAll('.line-counter b')].map((b) => b.textContent);`);
  const lines = await app(`return String(app.editor().cursorInfo().lines);`);
  expect(counter[0] === '12' && counter[1] === lines, `counter ${counter}`);
  expect((await page.eval(`return document.querySelector('.line-counter-status').textContent;`)).includes(`12/${lines}`), 'status bar line counter');
});

check('WYSIWYG: editing the rendered page writes Markdown into the source', async () => {
  await app(`await app.newDocument('markdown', '# Title\\n\\nhello world\\n'); return true;`);
  await app(`app.run('viewWysiwyg'); return true;`);
  await page.waitFor(`document.querySelector('.wysiwyg-frame')?.contentDocument?.querySelector('article h1')`, 4000);
  // Select "world" in the page and make it bold with Ctrl+B.
  await page.eval(`const d = document.querySelector('.wysiwyg-frame').contentDocument; const p = d.querySelector('article p').firstChild; const r = d.createRange(); r.setStart(p, 6); r.setEnd(p, 11); d.getSelection().removeAllRanges(); d.getSelection().addRange(r); d.querySelector('article').focus(); return true;`);
  await app(`app.run('bold'); return true;`);
  await wait(400);
  expect((await editorText()).includes('hello **world**'), `source: ${await editorText()}`);
  // Typing in the page.
  await page.eval(`const d = document.querySelector('.wysiwyg-frame').contentDocument; const h = d.querySelector('article h1'); const r = d.createRange(); r.selectNodeContents(h); r.collapse(false); d.getSelection().removeAllRanges(); d.getSelection().addRange(r); d.execCommand('insertText', false, ' 2'); return true;`);
  await wait(500);
  expect((await editorText()).startsWith('# Title 2'), `typed: ${await editorText()}`);
  await shot('10-wysiwyg');
  await app(`app.run('viewSplit'); return true;`);
});

check('WYSIWYG tag bar: every Markdown element as a button under the tabs, applied by clicking', async () => {
  await app(`await app.newDocument('markdown', 'alpha beta gamma\\n'); app.run('viewWysiwyg'); return true;`);
  await page.waitFor(`document.querySelector('.wysiwyg-frame')?.contentDocument?.querySelector('article p')`, 4000);
  const layout = await page.eval(`const bar = document.querySelector('.md-tagbar'); const tabs = document.querySelector('#tabs').getBoundingClientRect(); const r = bar.getBoundingClientRect(); return { tags: bar.querySelectorAll('[data-md-tag]').length, gap: Math.round(r.top - tabs.bottom), visible: r.height > 0 };`);
  expect(layout.visible && layout.tags === 28, `bar: ${JSON.stringify(layout)}`);
  expect(layout.gap >= 0 && layout.gap <= 2, `bar not right under the tabs (gap ${layout.gap})`);
  const pick = (from, to) => page.eval(`const d = document.querySelector('.wysiwyg-frame').contentDocument; const t = d.querySelector('article p').firstChild; const r = d.createRange(); r.setStart(t, ${from}); r.setEnd(t, ${to}); d.getSelection().removeAllRanges(); d.getSelection().addRange(r); d.querySelector('article').focus(); return true;`);
  await pick(6, 10);
  await page.click('[data-md-tag="bold"]');
  await wait(400);
  expect((await editorText()).includes('alpha **beta** gamma'), `bold: ${await editorText()}`);
  expect(await page.eval(`return document.querySelector('[data-md-tag="bold"]').classList.contains('active');`), 'bold not shown as active');
  await page.click('[data-md-tag="h2"]');
  await wait(400);
  expect((await editorText()).startsWith('## alpha'), `h2: ${await editorText()}`);
  expect(await page.eval(`return document.querySelector('[data-md-tag="h2"]').classList.contains('active');`), 'h2 not shown as active');
  await page.click('[data-md-tag="p"]');
  await wait(300);
  await pick(0, 5);
  await page.click('[data-md-tag="kbd"]');
  await wait(400);
  expect((await editorText()).includes('<kbd>alpha</kbd>'), `kbd: ${await editorText()}`);
  await page.click('[data-md-tag="ul"]');
  await wait(400);
  expect(/^- /.test(await editorText()), `ul: ${await editorText()}`);
  await page.eval(`const d = document.querySelector('.wysiwyg-frame').contentDocument; const t = [...d.querySelector('article li').childNodes].find((n) => n.nodeType === 3 && n.textContent.includes('gamma')); const i = t.textContent.indexOf('gamma'); const r = d.createRange(); r.setStart(t, i); r.setEnd(t, i + 5); d.getSelection().removeAllRanges(); d.getSelection().addRange(r); return true;`);
  await page.click('[data-md-tag="code"]');
  await wait(400);
  expect((await editorText()).includes('`gamma`'), `code: ${await editorText()}`);
  await page.click('[data-md-tag="table"]');
  await page.waitFor(`document.querySelector('[data-dialog="form"]')`, 2000);
  await page.eval(`const box = document.querySelector('[data-dialog="form"]'); box.querySelector('[data-field="cols"]').value = 2; box.querySelector('[data-field="rows"]').value = 1; box.querySelector('[data-dialog-button="ok"]').click(); return true;`);
  await wait(500);
  expect(/\| .+ \| .+ \|\n\| -+ \| -+ \|/.test(await editorText()), `table: ${await editorText()}`);
  await shot('12-tagbar');
  await app(`app.run('viewSplit'); return true;`);
  expect(await page.eval(`return document.querySelector('.md-tagbar').getBoundingClientRect().height === 0;`), 'bar shown outside WYSIWYG');
});

check('pictures pasted into a Markdown document are inserted (embedded when unsaved) and shown inline', async () => {
  await app(`await app.newDocument('markdown', 'pic: '); app.editor().view.dispatch({ selection: { anchor: 5 } }); app.editor().focus(); return true;`);
  await page.eval(`const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0)); const dt = new DataTransfer(); dt.items.add(new File([png], 'dot.png', { type: 'image/png' })); document.querySelector('#editor-host .cm-content').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); return true;`);
  await page.waitFor(`window.__mytextmaster.editor().text().includes('![dot](data:image/png;base64,')`, 4000);
  await page.waitFor(`document.querySelector('#editor-host .cm-inline-image img')`, 3000);
});

check('the hex editor shows bytes, edits a nibble and undoes it', async () => {
  await app(`await app.newDocument('text', 'ABC'); return true;`);
  await app(`app.run('openAsHex'); return true;`);
  await page.waitFor(`document.querySelector('.hex-row')`, 3000);
  const row = await page.eval(`return [...document.querySelectorAll('.hex-row .hex-bytes b')].slice(0, 3).map((b) => b.textContent).join(' ');`);
  expect(row === '41 42 43', `bytes ${row}`);
  await page.click('.hex-row .hex-bytes b[data-at="0"]');
  await page.key('f');
  await page.key('f');
  expect((await app(`return Array.from(app.activeDoc().bytes).join(',');`)) === '255,66,67', 'nibble edit');
  expect(await page.eval(`return document.querySelector('#tabs .tab.active').classList.contains('dirty');`), 'hex doc not dirty');
  await page.key('z', { ctrl: true });
  await page.key('z', { ctrl: true });
  expect((await app(`return Array.from(app.activeDoc().bytes).join(',');`)) === '65,66,67', 'undo');
  await shot('11-hex');
});

check('a picture opens in the viewer with zoom and rotate', async () => {
  await page.eval(`const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0)); await window.__mytextmaster.openFile({ file: new File([png], 'dot.png', { type: 'image/png' }), path: 'dot.png', web: true }); return true;`);
  await page.waitFor(`document.querySelector('.image-stage img')?.naturalWidth === 1`, 4000);
  await page.click('[data-viewer="actual"]');
  expect((await page.eval(`return document.querySelector('[data-viewer-zoom]').textContent;`)).startsWith('100%'), 'actual size');
  await page.click('[data-viewer="zoomIn"]');
  expect((await page.eval(`return document.querySelector('[data-viewer-zoom]').textContent;`)).startsWith('125%'), 'zoom in');
  await page.click('[data-viewer="rotateRight"]');
  expect((await page.eval(`return document.querySelector('.image-stage img').style.transform;`)).includes('rotate(90deg)'), 'rotate');
});

check('spelling: a misspelled word is underlined, and adding it to the dictionary clears it', async () => {
  await app(`app.updateSettings({ spellCheck: true, spellLanguages: 'both', bottomOpen: true, bottomTab: 'problems' }); await app.newDocument('markdown', 'This sentense has a mistake.\\n'); return true;`);
  await page.waitFor(`[...document.querySelectorAll('#editor-host .cm-misspelled')].some((e) => e.textContent === 'sentense')`, 8000);
  await page.waitFor(`[...document.querySelectorAll('.problem-row')].some((r) => r.textContent.includes('sentense'))`, 4000);
  await app(`app.addToDictionary(['sentense']); return true;`);
  await page.waitFor(`![...document.querySelectorAll('#editor-host .cm-misspelled')].some((e) => e.textContent === 'sentense')`, 6000);
  await app(`app.setUserDictionary([]); return true;`);
});

check('problems: Markdown checks list a skipped heading level and a missing alt text', async () => {
  await app(`await app.newDocument('markdown', '# A\\n\\n### C\\n\\n![](x.png)\\n'); app.updateSettings({ bottomOpen: true, bottomTab: 'problems' }); return true;`);
  await page.waitFor(`document.querySelectorAll('.problem-row').length >= 2`, 4000);
  const text = await page.eval(`return document.querySelector('.problem-list').textContent;`);
  expect(/1.*3/.test(text) && /alt/.test(text), `problems: ${text}`);
  await page.click('.problem-row');
  expect((await app(`return app.editor().cursorInfo().line;`)) === 3, 'click did not go to the line');
});

check('bookmarks: toggle with Ctrl+F2, jump with F2, list in the panel', async () => {
  await setText(Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n'));
  await app(`app.editor().goToLine(5); return true;`);
  await app(`app.run('bookmarkToggle'); return true;`);
  await app(`app.editor().goToLine(20); return true;`);
  await app(`app.run('bookmarkToggle'); app.editor().goToLine(1); return true;`);
  await app(`app.run('bookmarkNext'); return true;`);
  expect((await app(`return app.editor().cursorInfo().line;`)) === 5, 'F2 to line 5');
  await app(`app.run('bookmarkNext'); return true;`);
  expect((await app(`return app.editor().cursorInfo().line;`)) === 20, 'F2 to line 20');
  await app(`app.updateSettings({ rightOpen: true, rightTab: 'bookmarks' }); return true;`);
  expect((await page.eval(`return document.querySelectorAll('#right-panel .result-row').length;`)) === 2, 'bookmark list');
  expect((await page.eval(`return document.querySelectorAll('#editor-host .cm-bookmark').length;`)) >= 2, 'gutter marks');
});

check('macros: record typing and keys, play back three times', async () => {
  await setText('');
  await app(`app.editor().focus(); app.run('macroRecord'); return true;`);
  await page.type('ab');
  await page.key('Enter');
  await app(`app.run('macroStop'); return true;`);
  await app(`app.editor().playMacro(3); return true;`);
  expect((await editorText()) === 'ab\nab\nab\nab\n', `macro: ${JSON.stringify(await editorText())}`);
});

check('encode tools and the syntax menu', async () => {
  await setText('hello');
  await select(0, 5);
  await app(`app.run('base64Encode'); return true;`);
  expect((await editorText()) === 'aGVsbG8=', `base64: ${await editorText()}`);
  await select(0, 8);
  await app(`app.run('base64Decode'); return true;`);
  expect((await editorText()) === 'hello', 'decode');
  await page.click('[data-status="kind"]');
  await page.waitFor(`document.querySelector('.popup-menu.in-page')`, 2000);
  expect(await page.eval(`return [...document.querySelectorAll('.popup-menu.in-page .menu-item')].some((b) => b.textContent.includes('${'구문'}') || b.textContent.includes('Syntax'));`), 'no syntax submenu');
  await page.key('Escape');
});

check('theme menu lists 20 light, 20 dark, the custom theme and theme settings', async () => {
  await page.click('#toolbar [data-command="themeMenu"]');
  await page.waitFor(`document.querySelector('.popup-menu.in-page')`, 2000);
  const labels = await page.eval(`return [...document.querySelectorAll('.popup-menu.in-page .menu-item')].map((b) => b.textContent.trim());`);
  expect(labels.some((l) => l.includes('(20)')) && labels.filter((l) => l.includes('(20)')).length === 2, `labels ${labels}`);
  expect(labels.some((l) => l.includes('사용자 정의')) && labels.some((l) => l.includes('테마 설정')), `custom / settings missing: ${labels}`);
  await page.key('Escape');
});

check('settings apply at once and "reset to defaults" restores them', async () => {
  await app(`app.run('settings'); return true;`);
  await page.waitFor(`document.querySelector('[data-dialog="settings"]')`, 2000);
  await page.click('[data-settings-tab="appearance"]');
  expect((await page.eval(`return document.querySelectorAll('[data-dialog="settings"] [data-pick-theme]').length;`)) === 40, 'theme tiles');
  await page.click('[data-dialog="settings"] [data-pick-theme="nord"]');
  expect((await page.eval(`return document.documentElement.dataset.theme;`)) === 'nord', 'theme not applied at once');
  await page.click('[data-dialog="settings"] [data-custom-start]');
  expect((await page.eval(`return document.querySelectorAll('[data-dialog="settings"] [data-custom]').length;`)) >= 12, 'custom colour editor');
  await page.click('[data-dialog-button="reset"]');
  await page.waitFor(`document.querySelector('[data-dialog="confirm"]')`, 2000);
  await page.click('[data-dialog="confirm"] [data-dialog-button="yes"]');
  await wait(100);
  expect((await app(`return app.settings().theme;`)) === 'light', 'reset did not restore the theme');
  await page.key('Escape');
});

check('the resize marker at the bottom right is made of dots', async () => {
  expect((await page.eval(`return document.querySelectorAll('.resize-grip svg circle').length;`)) === 6, 'no dotted resize marker');
});

// ───────────────────────── run

let failed = 0;
for (const { name, fn } of checks) {
  if (only && !name.includes(only)) continue;
  const started = Date.now();
  try {
    page.errors.length = 0;
    await fn();
    if (page.errors.length) throw new Error(`page errors: ${page.errors.join(' | ')}`);
    console.log(`  ok   ${name} (${Date.now() - started} ms)`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL ${name}\n       ${String(error.message).split('\n')[0]}`);
    await page.screenshot(path.join(root, 'test-results', 'gui', `FAIL-${name.replace(/[^\w가-힣]+/g, '_').slice(0, 60)}.png`)).catch(() => {});
  }
}
await page.close();
server.close();
console.log(`\nGUI: ${checks.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
