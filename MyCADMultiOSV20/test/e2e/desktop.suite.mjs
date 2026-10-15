// Desktop end-to-end cases against the real app (see harness.mjs). Each case
// gets the started App and throws on failure. Cases run in order and share
// the app; each leaves it in a usable state.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from './cdp.mjs';
import { root } from './harness.mjs';
import { freecadCoverage } from '../../src/domain/freecad-map.js';
import { toIfc } from '../../src/domain/ifc.js';
import { normalizeSolidData, solidMesh } from '../../src/domain/solids.js';

const VERSION = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const TITLE = `MyCAD V${VERSION.split('.').slice(0, 2).join('.')}`;
const POPUP_KINDS = ['settings', 'about', 'confirm', 'error', 'progress', 'recent', 'print', 'theme', 'part', 'array', 'stl', 'solid', 'coverage'];
const WS_THICKFRAME = 0x40000;

/** Elements inside a popup that scroll (there must be none). */
const POPUP_SCROLL_CHECK = `(() => [...document.querySelectorAll('*')].filter((e) => {
  const style = getComputedStyle(e);
  return ['auto', 'scroll'].includes(style.overflowY) && e.scrollHeight > e.clientHeight + 1 && e.tagName !== 'SELECT' && e.tagName !== 'TEXTAREA';
}).map((e) => e.className || e.tagName))()`;

/** Popup body problems: content outside the body, tab bar cut off, content cut at the bottom. */
const LAYOUT_CHECK = `(() => {
  const body = document.querySelector('.popup-body');
  if (!body) return ['no body'];
  const box = body.getBoundingClientRect();
  const bad = [];
  for (const element of body.querySelectorAll('.row, .button, .stepper, .segmented, select, input, .theme-row, .shortcut-row, .part-kind')) {
    const r = element.getBoundingClientRect();
    if (!r.width || element.closest('.print-sheet')) continue;
    if (r.right > box.right + 1 || r.left < box.left - 1) bad.push('outside: ' + (element.className || element.tagName));
    if (r.bottom > box.bottom + 1) bad.push('cut off: ' + (element.className || element.tagName));
  }
  const tabs = document.querySelector('.tabs');
  if (tabs && tabs.scrollWidth > tabs.clientWidth + 1) bad.push('tabs cut off');
  return [...new Set(bad)];
})()`;

/** Left edges of the first control in every label | control row, grouped per form: one edge per form. */
const ALIGN_CHECK = `(() => {
  const groups = new Map();
  for (const control of document.querySelectorAll('.row > .row-control')) {
    const first = control.firstElementChild;
    if (!first || !control.getBoundingClientRect().width) continue;
    const key = control.closest('.part-fields, .array-fields, .stl-fields, .print-options, .error-view, .color-grid, .settings-page, .popup-body');
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(Math.round(first.getBoundingClientRect().left));
  }
  const buttons = [...document.querySelectorAll('.popup-foot .button')].map((b) => Math.round(b.getBoundingClientRect().height));
  return { edges: [...groups.values()].map((set) => set.size), buttons: [...new Set(buttons)] };
})()`;

const ps = (script) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }).toString().trim();
const getClipboard = () => ps('[Console]::OutputEncoding = [Text.Encoding]::UTF8; Get-Clipboard -Raw');
const setClipboard = (text) => ps(`Set-Clipboard -Value @'\n${text}\n'@`);

const m = (app, expression) => app.main.eval(`(() => { const k = window.__mycad; return ${expression}; })()`);
const drawing = (app) => m(app, 'JSON.parse(JSON.stringify(k.actions.activeDrawing()))');
const notice = (app) => m(app, 'k.state.notice?.text ?? ""');
const count = (app) => m(app, 'k.actions.activeDrawing().entities.length');
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);

async function closeAllPopups(app) {
  await app.main.eval(`Promise.all(${JSON.stringify(POPUP_KINDS)}.map((kind) => window.__TAURI_INTERNALS__.invoke('close_popup', { kind }))).then(() => window.__TAURI_INTERNALS__.invoke('hide_popup', { kind: 'menu' })).then(() => 1)`);
  await sleep(150);
}

/** A fresh, empty drawing tab with a known view: origin at the canvas centre, 2 px per mm. */
async function fresh(app, { snap = false } = {}) {
  await closeAllPopups(app);
  await m(app, `(k.actions.toggle3d(false), k.actions.setTool('select'), k.actions.newDrawing(), k.actions.updateSettings({ language: 'ko', snapObject: ${snap}, snapGrid: false, ortho: false, showRulers: true }), 1)`);
  await m(app, `(() => { const vp = k.actions.ensureViewport(k.actions.activeDoc()); vp.cx = 0; vp.cy = 0; vp.zoom = 2; k.actions.drawCanvas(); return 1; })()`);
}

/** Screen (CSS px in the page) of a drawing point. */
async function at(app, x, y) {
  return m(app, `(() => { const r = document.querySelector('#cad-canvas').getBoundingClientRect(); const s = k.actions.activeDoc().vp.toScreen({ x: ${x}, y: ${y} }); return { x: r.left + s.x, y: r.top + s.y }; })()`);
}

async function clickAt(app, x, y, options) {
  const p = await at(app, x, y);
  await app.main.realClick(p.x, p.y, options);
  await sleep(40);
}

/** Runs a command without waiting for the popup it opens. */
const fire = (app, expression) => m(app, `(${expression}, 1)`);

async function expectPopupWindow(app, page, kind) {
  assert.equal(await page.eval('document.title'), `popup-${kind}`);
  const head = await page.eval(`(() => { const m = document.querySelector('.popup-menu'); if (m) return { icon: !document.querySelector('.menu-head'), text: m.dataset.title }; const h = document.querySelector('.popup-head h2'); return h ? { icon: Boolean(h.querySelector('svg')), text: h.textContent.trim() } : null; })()`);
  assert.ok(head?.icon && head.text, `${kind}: header has an icon and a title (${JSON.stringify(head)})`);
  assert.deepEqual(await page.eval(POPUP_SCROLL_CHECK), [], `${kind}: no scroll bars inside the popup`);
  if (kind !== 'menu') {
    assert.deepEqual(await page.eval(LAYOUT_CHECK), [], `${kind}: everything fits`);
    const align = await page.eval(ALIGN_CHECK);
    assert.ok(align.edges.every((edges) => edges === 1), `${kind}: controls line up in one column ${JSON.stringify(align)}`);
    assert.ok(align.buttons.length <= 1, `${kind}: footer buttons have one height ${JSON.stringify(align.buttons)}`);
  }
  let windows = [];
  let popup;
  // The OS shows the window a moment after its page is ready — seconds for the
  // first window of a kind while the whole suite runs (WebView2 starts up).
  // Both are looked for in the same listing (the main window may show a moment later, after a restart).
  let main;
  for (const until = Date.now() + 10000; !(popup && main) && Date.now() < until;) {
    if (windows.length) await sleep(150);
    windows = app.windowInfo().filter((w) => w.visible && w.title.endsWith(TITLE));
    popup = windows.find((w) => w.owner !== 0 && w.title.includes(head.text.slice(0, 4)));
    main = windows.find((w) => w.owner === 0);
  }
  assert.ok(main, `main window found (${JSON.stringify(app.windowInfo().map((w) => [w.title, w.visible, w.owner]))})`);
  assert.ok(popup, `${kind}: its own OS window "<title> — ${TITLE}" (${JSON.stringify(windows.map((w) => w.title))})`);
  assert.equal(popup.owner, main.handle, `${kind}: owned by the main window (closes with it)`);
  assert.equal(popup.style & WS_THICKFRAME, 0, `${kind}: fixed size`);
  return { main, popup };
}

async function gone(app, kind) {
  for (let i = 0; i < 40 && (await app.hasPopup(kind)); i++) await sleep(100);
}

/** Scrolls a panel element into view and returns its centre. */
async function visibleCenter(app, selector) {
  await app.main.eval(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({ block: 'center' }); 1`);
  await sleep(100);
  return app.main.center(selector);
}

async function openMenu(app, name) {
  for (let attempt = 1; ; attempt++) {
    if (app.foreground()) await sleep(300);
    await app.main.click(`[data-menu="${name}"]`);
    const menu = await app.popup('menu');
    await menu.waitFor(`document.querySelector('.menu-item') && document.querySelector('.popup-menu')?.dataset.title`);
    await sleep(200);
    // Another program took the foreground meanwhile: the menu closed itself, as it should. Once more.
    if (attempt >= 3 || await menu.eval('document.hasFocus()')) return menu;
  }
}

async function chooseMenuItem(menu, id) {
  // A command inside a group: open the submenu (in the same window) first.
  await menu.waitFor(`Boolean(document.querySelector('.menu-item[data-id="${id}"], .menu-item[data-contains~="${id}"]'))`);
  for (let depth = 0; depth < 3 && !(await menu.eval(`Boolean(document.querySelector('.menu-item[data-id="${id}"]'))`)); depth++) {
    await menu.click(`.menu-item[data-contains~="${id}"]`);
    await sleep(150);
  }
  await menu.waitFor(`document.querySelector('.menu-item[data-id="${id}"]:not([disabled])')`);
  await menu.click(`.menu-item[data-id="${id}"]`);
  await sleep(250);
}

async function contextMenuIds(app, point) {
  await app.main.realClick(point.x, point.y, { button: 'right' });
  const menu = await app.popup('menu');
  await menu.waitFor(`document.querySelector('.menu-item')`);
  await sleep(150);
  const ids = await menu.eval(`[...document.querySelectorAll('.menu-item')].map((i) => i.dataset.id)`);
  const head = await menu.eval(`document.querySelector('.popup-menu')?.dataset.title`);
  await menu.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); 1`);
  await sleep(250);
  return { ids, head };
}

export const cases = [
  // ───────────────────────── window
  { group: 'Window', name: 'Title bar: program name and version', async run(app) {
    const main = app.windowInfo().find((w) => w.owner === 0 && w.visible && w.title.startsWith('MyCAD'));
    assert.equal(main?.title, TITLE);
  } },
  { group: 'Window', name: 'First start: the start page shows, with the Getting Started drawing behind it (gear, dimensions, text)', async run(app) {
    assert.equal(await m(app, 'k.state.home'), true, 'the start page greets you');
    assert.equal(await app.main.eval(`document.querySelector('#start-page').hidden`), false);
    assert.equal(app.windowInfo().filter((w) => w.visible && /튜토리얼|tutorial/i.test(w.title)).length, 0, 'the tutorial does not start by itself');
    assert.equal(await m(app, 'Boolean(k.state.tutorial?.visible)'), false);
    const d = await drawing(app);
    assert.ok(d.entities.some((e) => e.type === 'part' && e.kind === 'gear'));
    assert.ok(d.entities.some((e) => e.type === 'dim'));
  } },
  { group: 'Start page', name: 'What you can do (lessons, samples), sample cards = index.json, thumbnails, opening a sample, home tab, recent files', async run(app) {
    await fresh(app);
    await app.main.click('[data-tab-home]');
    assert.equal(await m(app, 'k.state.home'), true);
    await app.main.waitFor(`document.querySelectorAll('.sample-card').length > 0`);
    const index = JSON.parse(fs.readFileSync(path.join(root, 'samples', 'index.json'), 'utf8'));
    const page = await app.main.eval(`(() => ({
      tasks: document.querySelectorAll('.task-card').length,
      lessons: [...document.querySelectorAll('[data-start-lesson]')].map((b) => Number(b.dataset.startLesson)),
      samples: [...document.querySelectorAll('.sample-card')].map((c) => c.dataset.sample),
      actions: [...document.querySelectorAll('.action-card')].map((c) => c.dataset.command),
      panels: getComputedStyle(document.querySelector('#left-panel')).visibility,
    }))()`);
    assert.equal(page.tasks, 12);
    assert.ok(page.lessons.every((n) => n >= 0 && n < 21));
    assert.deepEqual(page.samples, index.map((s) => s.file), 'one card per sample in index.json');
    assert.deepEqual(page.actions, ['tutorial', 'new', 'open', 'importDxf', 'import3d', 'tutorialDoc', 'shortcuts']);
    assert.equal(page.panels, 'hidden', 'the start page uses the whole width');
    await app.main.waitFor(`document.querySelectorAll('canvas.sample-thumb.ready').length >= 10`, { timeout: 60000 });
    // A sample opens in a new tab, as an unsaved copy.
    const tabs = await m(app, 'k.state.docs.length');
    await app.main.click('.sample-card[data-sample="02-flange.mcad"]');
    await app.main.waitFor(`window.__mycad.state.docs.length === ${tabs + 1}`);
    assert.equal(await m(app, 'k.state.home'), false);
    assert.ok((await drawing(app)).entities.some((e) => e.type === 'part' && e.kind === 'flange'));
    assert.equal(await m(app, 'k.actions.activeDoc().path'), null);
    // An IGES sample from the task card; then back home with the house tab.
    await app.main.click('[data-tab-home]');
    await app.main.click('.task-card[data-task="files"] [data-sample-open]');
    await app.main.waitFor(`window.__mycad.actions.activeDoc().format === 'iges'`);
    await app.main.click('[data-tab-home]');
    assert.equal(await m(app, 'k.state.home'), true);
    // Clicking a drawing tab leaves the start page.
    await app.main.click('.tab[data-doc]');
    assert.equal(await m(app, 'k.state.home'), false);
    // The house button at the left of the menu bar goes back to the start page from anywhere.
    await app.main.click('#menubar .menubar-home');
    assert.equal(await m(app, 'k.state.home'), true);
    assert.ok(await app.main.eval(`document.querySelector('#menubar .menubar-home').classList.contains('active')`));
    // The background: two gears turning (they keep turning even with reduced motion asked for).
    await app.main.waitFor(`Boolean(document.querySelector('.start-bg canvas'))`, { timeout: 15000 });
    await app.main.click('.tab[data-doc]');
  } },
  { group: 'Tutorial', name: 'Watch: every step of the 21 lessons runs in the real window and its result is checked', async run(app) {
    await fresh(app);
    const report = await app.main.eval(`(async () => { const t = await window.__mycad.actions.openTutorial(); const r = await t.runAll(); t.close(); return r; })()`, 600000);
    const bad = report.filter((r) => !r.ok);
    assert.ok(report.length >= 80, `${report.length} steps`);
    assert.deepEqual(bad, [], JSON.stringify(bad));
    assert.equal(await m(app, 'k.state.settings.units'), 'mm', 'settings restored after the tutorial');
  } },
  { group: 'Tutorial', name: 'Practice: every step recognises what the user did', async run(app) {
    await fresh(app);
    const report = await app.main.eval(`(async () => { const t = await window.__mycad.actions.openTutorial(); const r = await t.verifyPractice(); t.close(); return r; })()`, 600000);
    const bad = report.filter((r) => !r.run || r.check === false);
    assert.deepEqual(bad, [], JSON.stringify(bad));
  } },
  { group: 'Tutorial', name: 'Opened from the Help menu: own window (owned by the main window), lesson list, watch/practice, step navigation, moving by the header, close', async run(app) {
    await fresh(app);
    const help = await openMenu(app, 'help');
    await chooseMenuItem(help, 'tutorial');
    // The panel is its own OS window (owned by the main window), not a box inside it.
    const panel = await app.popup('tutorial');
    await panel.waitFor(`document.querySelectorAll('.tut-lesson option').length === 21`);
    assert.equal(await app.main.eval(`Boolean(document.querySelector('.tut-panel'))`), false, 'no panel inside the main window');
    let windows = [];
    for (const until = Date.now() + 10000; Date.now() < until; await sleep(150)) {
      windows = app.windowInfo().filter((w) => w.visible && w.title.endsWith(TITLE));
      if (windows.some((w) => w.owner !== 0 && /튜토리얼/.test(w.title))) break;
    }
    const own = windows.find((w) => w.owner !== 0 && /튜토리얼/.test(w.title));
    assert.ok(own, `its own window "따라 하는 튜토리얼 — ${TITLE}" (${JSON.stringify(windows.map((w) => w.title))})`);
    assert.equal(own.owner, windows.find((w) => w.owner === 0)?.handle, 'owned by the main window');
    assert.ok(await panel.eval(`document.querySelector('.tut-head').hasAttribute('data-tauri-drag-region')`), 'moved by its header');
    await panel.click('[data-tut="mode-practice"]');
    await panel.waitFor(`document.querySelector('[data-tut="mode-practice"]')?.classList.contains('active')`);
    assert.ok(await panel.eval(`Boolean(document.querySelector('.tut-todo'))`), 'practice shows what to do');
    await panel.click('[data-tut="skip"]');
    await panel.waitFor(`/2 \\//.test(document.querySelector('.tut-step span')?.textContent ?? '')`);
    // The window is as tall as the panel.
    const fit = await panel.eval(`({ panel: Math.ceil(document.querySelector('.tut-panel').getBoundingClientRect().height), inner: innerHeight })`);
    assert.ok(Math.abs(fit.panel - fit.inner) <= 2, `window height follows the panel ${JSON.stringify(fit)}`);
    await panel.click('[data-tut="close"]');
    await app.main.waitFor(`!window.__mycad.state.tutorial.visible`);
    await sleep(400);
    assert.equal(app.windowInfo().filter((w) => w.visible && /튜토리얼/.test(w.title)).length, 0, 'the window closes');
  } },
  { group: 'Window', name: 'Minimum window width: no toolbar button is hidden', async run(app) {
    const min = await m(app, 'k.state.minWidth');
    assert.ok(min > 800, `minimum width ${min}`);
    await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: 500, height: 500 } } }).then(() => 1)`);
    await sleep(600);
    const result = await app.main.eval(`(() => {
      const items = [...document.querySelectorAll('#toolbar .tool-button, #toolbar .stepper-value')];
      const toolbar = document.querySelector('#toolbar').getBoundingClientRect();
      return { width: innerWidth, hidden: items.filter((b) => { const r = b.getBoundingClientRect(); return r.right > innerWidth + 0.5 || r.left < -0.5 || r.width < 14; }).map((b) => b.dataset.command ?? b.id ?? b.className), height: toolbar.height };
    })()`);
    await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: 1440, height: 880 } } }).then(() => 1)`);
    await sleep(500);
    assert.ok(result.width >= min - 2, `window kept ${result.width}px ≥ ${min}px`);
    assert.deepEqual(result.hidden, []);
    assert.ok(result.height < 50, `one toolbar row (${result.height}px)`);
  } },
  { group: 'Window', name: 'Resize grip at the bottom right', async run(app) {
    const grip = await app.main.eval(`(() => { const g = document.querySelector('[data-resize-grip]'); const r = g.getBoundingClientRect(); return { right: innerWidth - r.right, bottom: innerHeight - r.bottom, cursor: getComputedStyle(g).cursor, title: g.title }; })()`);
    assert.ok(grip.right < 1 && grip.bottom < 1, JSON.stringify(grip));
    assert.equal(grip.cursor, 'nwse-resize');
    assert.ok(grip.title);
  } },
  { group: 'Window', name: 'No window transparency setting (toolbar, settings, status bar)', async run(app) {
    assert.equal(await app.main.eval(`Boolean(document.querySelector('#transparency, .opacity-control, #transparency-range'))`), false);
    const main = app.windowInfo().find((w) => w.owner === 0 && w.title === TITLE);
    assert.equal(main.layered, false, 'an ordinary, opaque window');
  } },

  // ───────────────────────── toolbar
  { group: 'Toolbar', name: 'Every button has a tooltip', async run(app) {
    const missing = await app.main.eval(`[...document.querySelectorAll('#toolbar button, #tabs button, #left-panel button, #right-panel button, #statusbar button, #menubar button')].filter((b) => !(b.title || '').trim()).map((b) => b.outerHTML.slice(0, 80))`);
    assert.deepEqual(missing, []);
    assert.ok(await app.main.eval(`document.querySelectorAll('#toolbar .tool-button').length`) >= 22);
  } },
  { group: 'Toolbar', name: 'Settings and About buttons at the right end', async run(app) {
    const r = await app.main.eval(`(() => { const t = document.querySelector('#toolbar').getBoundingClientRect(); const a = document.querySelector('[data-command="about"]').getBoundingClientRect(); const s = document.querySelector('[data-command="settings"]').getBoundingClientRect(); return { gap: t.right - a.right, order: s.left < a.left }; })()`);
    assert.ok(r.gap < 20 && r.order, JSON.stringify(r));
  } },
  { group: 'Toolbar', name: 'Toggle buttons: grid, snap, ortho, panels', async run(app) {
    for (const [command, key] of [['grid', 'showGrid'], ['snap', 'snapObject'], ['ortho', 'ortho'], ['leftPanel', 'showLeftPanel'], ['rightPanel', 'showRightPanel']]) {
      const before = await m(app, `k.state.settings.${key}`);
      await app.main.click(`#toolbar [data-command="${command}"]`);
      await sleep(150);
      assert.equal(await m(app, `k.state.settings.${key}`), !before, command);
      assert.equal(await app.main.eval(`document.querySelector('#toolbar [data-command="${command}"]').getAttribute('aria-pressed')`), String(!before));
      await app.main.click(`#toolbar [data-command="${command}"]`);
      await sleep(150);
    }
    await m(app, '(k.actions.updateSettings({ showLeftPanel: false }), 1)');
    assert.ok(await app.main.eval(`document.querySelectorAll('#left-panel .rail-button[data-tool]').length >= 5`), 'collapsed panel keeps a rail of tools');
    await m(app, '(k.actions.updateSettings({ showLeftPanel: true }), 1)');
  } },
  { group: 'Toolbar', name: 'Zoom field, zoom in/out buttons, fit all', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.change('op.circle', (d) => k.drawingModule.addEntity(d, 'circle', { cx: 300, cy: 200, r: 50 })), 1)`);
    await app.main.eval(`(() => { const i = document.querySelector('#zoom-value'); i.value = '250'; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(100);
    assert.equal(Math.round(await m(app, 'k.actions.activeDoc().vp.percent')), 250);
    await app.main.click('#toolbar [data-command="zoomIn"]');
    assert.ok(Math.abs(await m(app, 'k.actions.activeDoc().vp.percent') - 312.5) < 0.6);
    await app.main.click('#toolbar [data-command="zoomOut"]');
    await app.main.click('#toolbar [data-command="zoomFit"]');
    await sleep(100);
    const c = await m(app, `(() => { const vp = k.actions.activeDoc().vp; const s = vp.toScreen({ x: 300, y: 200 }); return { dx: s.x - vp.width / 2, dy: s.y - vp.height / 2 }; })()`);
    assert.ok(Math.abs(c.dx - 11) < 1.5 && Math.abs(c.dy - 11) < 1.5, `fit centres the drawing in the area next to the rulers ${JSON.stringify(c)}`);
  } },
  { group: 'Toolbar', name: 'Language button: Korean ↔ English', async run(app) {
    await app.main.click('#toolbar [data-command="language"]');
    await sleep(300);
    assert.equal(await app.main.eval(`document.querySelector('[data-menu="file"]').textContent.trim()`), 'File');
    await app.main.click('#toolbar [data-command="language"]');
    await sleep(300);
    assert.equal(await app.main.eval(`document.querySelector('[data-menu="file"]').textContent.trim()`), '파일');
  } },
  { group: 'Toolbar', name: 'Theme button: next theme, ▾ picker window (dark | light)', async run(app) {
    await m(app, `(k.actions.updateSettings({ theme: 'light' }), 1)`);
    await app.main.click('#toolbar [data-command="theme"]');
    await sleep(200);
    assert.notEqual(await m(app, 'k.state.settings.theme'), 'light');
    await app.main.click('#toolbar [data-command="themeMenu"]');
    const picker = await app.popup('theme');
    await picker.waitFor(`document.querySelectorAll('.picker-column').length === 2`);
    assert.equal(await picker.eval(`document.querySelectorAll('[data-pick-theme]').length`), 42);
    await picker.click('[data-pick-theme="dracula"]');
    await sleep(400);
    assert.equal(await m(app, 'k.state.settings.theme'), 'dracula');
    assert.equal(await app.main.eval(`document.documentElement.dataset.theme`), 'dracula');
    await m(app, `(k.actions.updateSettings({ theme: 'light' }), 1)`);
  } },

  // ───────────────────────── menus
  ...[['file', '파일'], ['edit', '편집'], ['view', '보기'], ['draw', '그리기'], ['modify', '수정'], ['parts', '부품'], ['solid', '3D 솔리드'], ['arch', '건축 (BIM)'], ['tools', '도구'], ['help', '도움말']].map(([name, title]) => ({ group: 'Menus', name: `Menu "${name}": own window, one row per item, icon + name`, async run(app) {
    const menu = await openMenu(app, name);
    await menu.waitFor(`document.querySelector('.popup-menu')?.dataset.title === '${title}' && !document.querySelector('.menu-head')`);
    const info = await menu.eval(`(() => {
      const items = [...document.querySelectorAll('.menu-item')];
      return { count: items.length, lefts: new Set(items.map((i) => Math.round(i.getBoundingClientRect().left))).size,
        icons: items.every((i) => i.querySelector('.menu-icon svg')), labels: items.every((i) => i.querySelector('.menu-label').textContent.trim()),
        width: document.querySelector('.popup-menu').getBoundingClientRect().width, inner: innerWidth };
    })()`);
    assert.ok(info.count >= 3);
    assert.equal(info.lefts, 1, 'one column');
    assert.ok(info.icons && info.labels, 'icon and label on every item');
    assert.ok(info.width <= info.inner + 1, 'the window fits the menu');
    try {
      await expectPopupWindow(app, menu, 'menu');
    } catch (error) {
      // Windows may refuse the foreground to a process started by the test runner:
      // the menu then loses the focus to another program and closes, as it should. Once more.
      if (!/its own OS window/.test(error.message)) throw error;
      await expectPopupWindow(app, await openMenu(app, name), 'menu');
    }
    await menu.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); 1`);
    await sleep(250);
  } })),
  { group: 'Menus', name: 'Long menus use submenus by category: opened in the same window, back with ◀ or ←', async run(app) {
    for (const name of ['file', 'view', 'draw', 'modify', 'solid', 'arch']) {
      const menu = await openMenu(app, name);
      const rows = await menu.eval(`document.querySelectorAll('.menu-item').length`);
      assert.ok(rows <= 24, `${name}: ${rows} rows`);
      await menu.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); 1`);
      await sleep(250);
    }
    const menu = await openMenu(app, 'solid');
    const height = await menu.eval('innerHeight');
    await menu.click('.menu-item[data-contains~="solid:box"]');
    await menu.waitFor(`document.querySelector('.popup-menu')?.dataset.depth === '1'`);
    assert.ok(await menu.eval(`Boolean(document.querySelector('.menu-back') && document.querySelector('.menu-item[data-id="solid:helix"]'))`), 'the primitives with a back row');
    await menu.waitFor(`innerHeight !== ${height}`);
    await menu.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' })); 1`);
    await menu.waitFor(`document.querySelector('.popup-menu')?.dataset.depth === '0' && Boolean(document.querySelector('.menu-item[data-contains~="solid:box"]'))`);
    await menu.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); 1`);
    await sleep(250);
  } },
  { group: 'Menus', name: 'Running a menu item (View › Grid); menus may extend past the window', async run(app) {
    const before = await m(app, 'k.state.settings.showGrid');
    await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: 1100, height: 400 } } }).then(() => 1)`);
    await sleep(500);
    const menu = await openMenu(app, 'file');
    const windows = app.windowInfo().filter((w) => w.visible && w.title.endsWith(TITLE));
    const main = windows.find((w) => w.owner === 0);
    const popup = windows.find((w) => w.owner !== 0);
    assert.ok(popup.bottom > main.bottom - 40 || popup.bottom - popup.top > 380, 'the long File menu is shown whole, even past the small main window');
    await menu.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); 1`);
    await sleep(250);
    await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: 1440, height: 880 } } }).then(() => 1)`);
    await sleep(400);
    const view = await openMenu(app, 'view');
    await chooseMenuItem(view, 'grid');
    assert.equal(await m(app, 'k.state.settings.showGrid'), !before);
    await m(app, `(k.actions.updateSettings({ showGrid: ${before} }), 1)`);
  } },
  { group: 'Menus', name: 'Context menus: empty drawing, object, tab, layer and input field each differ', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.change('op.circle', (d) => k.drawingModule.addEntity(d, 'circle', { cx: 0, cy: 0, r: 40 })), 1)`);
    const empty = await contextMenuIds(app, await at(app, 120, 120));
    assert.ok(empty.ids.includes('paste') && empty.ids.includes('zoomFit'), JSON.stringify(empty));
    const entity = await contextMenuIds(app, await at(app, 40, 0));
    assert.ok(entity.ids.includes('tool:rotate') && entity.ids.some((id) => id.startsWith('custom:layer:')), JSON.stringify(entity.ids));
    assert.equal(entity.head, '원');
    await app.main.eval(`(document.querySelector('.tab.active').scrollIntoView({ inline: 'nearest' }), 1)`);
    const tab = await contextMenuIds(app, await app.main.center('.tab.active .tab-name'));
    assert.ok(tab.ids.includes('closeTab') && tab.ids.includes('saveAs'), JSON.stringify(tab));
    const layer = await contextMenuIds(app, await visibleCenter(app, '.layer-row .layer-name'));
    assert.ok(layer.ids.includes('custom:visible') && layer.ids.includes('custom:lock'));
    const input = await contextMenuIds(app, await app.main.center('#command-input'));
    assert.ok(input.ids.includes('custom:paste') && input.ids.includes('custom:selectAll'));
    assert.notDeepEqual(empty.ids, entity.ids);
  } },

  // ───────────────────────── drawing with the mouse
  { group: 'Drawing', name: 'Line (continuous), finished with Enter', async run(app) {
    await fresh(app);
    await app.main.click('[data-tool="line"]');
    await clickAt(app, 0, 0);
    await clickAt(app, 50, 0);
    await clickAt(app, 50, 30);
    await app.main.key('Enter');
    const lines = (await drawing(app)).entities.filter((e) => e.type === 'line');
    assert.equal(lines.length, 2);
    assert.ok(Math.abs(lines[0].x2 - 50) < 1 && Math.abs(lines[1].y2 - 30) < 1);
  } },
  { group: 'Drawing', name: 'Rectangle, circle, arc, ellipse, regular polygon, polyline, centerline, text', async run(app) {
    await fresh(app);
    const draw = async (tool, points) => {
      await app.main.click(`[data-tool="${tool}"]`);
      for (const [x, y] of points) await clickAt(app, x, y);
      await app.main.key('Escape');
      await app.main.key('Escape');
    };
    await draw('rect', [[-100, -50], [-40, -10]]);
    await draw('circle', [[0, 0], [20, 0]]);
    await draw('arc', [[60, 0], [80, 20], [100, 0]]);
    await draw('ellipse', [[0, 60], [30, 60], [0, 75]]);
    await draw('polygon', [[-80, 60], [-60, 60]]);
    await draw('centerline', [[-120, 0], [120, 0]]);
    await app.main.click('[data-tool="polyline"]');
    for (const [x, y] of [[60, 60], [90, 60], [90, 90]]) await clickAt(app, x, y);
    await app.main.key('Enter');
    await app.main.click('[data-tool="text"]');
    await clickAt(app, -100, 100);
    await sleep(200);
    const types = (await drawing(app)).entities.map((e) => e.type);
    for (const type of ['rect', 'circle', 'arc', 'ellipse', 'polygon', 'line', 'polyline', 'text']) assert.ok(types.includes(type), `${type} in ${types}`);
    const d = await drawing(app);
    assert.ok(Math.abs(d.entities.find((e) => e.type === 'circle').r - 20) < 1);
    assert.equal(d.entities.find((e) => e.type === 'line').lineType, 'center');
    assert.equal(await m(app, 'k.state.toolId'), 'select', 'text returns to select');
    assert.equal(await app.main.eval(`document.activeElement?.dataset.prop`), 'text', 'the text field is focused');
  } },
  { group: 'Drawing', name: 'Coordinate input in the command field: x,y · @dx,dy · @distance<angle', async run(app) {
    await fresh(app);
    await app.main.click('[data-tool="polyline"]');
    await app.main.click('#cad-canvas');
    for (const text of ['10,10', '@40,0', '@20<90', '@-40,0']) {
      await app.main.key(text[0]);
      await app.main.type(text.slice(1));
      await app.main.key('Enter');
    }
    await app.main.key('Enter');
    const poly = (await drawing(app)).entities.at(-1);
    assert.equal(poly.type, 'polyline');
    assert.deepEqual(poly.points.map((p) => [Math.round(p.x), Math.round(p.y)]), [[10, 10], [50, 10], [50, 30], [10, 30]]);
    await m(app, `k.actions.submitCommand('zz')`);
  } },
  { group: 'Drawing', name: 'Object snap (end point), grid snap, ortho', async run(app) {
    await fresh(app, { snap: true });
    await m(app, `(k.actions.change('op.line', (d) => k.drawingModule.addEntity(d, 'line', { x1: 0, y1: 0, x2: 50, y2: 0 })), 1)`);
    await app.main.click('[data-tool="line"]');
    const near = await at(app, 51.5, 1.5);
    await app.main.mouse('mouseMoved', near.x, near.y, { button: 'none' });
    await sleep(80);
    assert.equal(await m(app, 'k.state.snap?.kind'), 'endpoint');
    await app.main.realClick(near.x, near.y);
    await m(app, `(k.actions.updateSettings({ snapObject: false, ortho: true }), 1)`);
    await clickAt(app, 90, 7);
    await app.main.key('Escape');
    const line = (await drawing(app)).entities.at(-1);
    assert.equal(line.x1, 50, 'snapped to the end');
    assert.equal(line.y1, 0);
    assert.ok(Math.abs(line.y2) < 1e-9, 'ortho keeps it horizontal');
    await m(app, `(k.actions.updateSettings({ ortho: false, snapGrid: true }), 1)`);
    await app.main.click('[data-tool="circle"]');
    await clickAt(app, 21, 19);
    await clickAt(app, 41, 19);
    await app.main.key('Escape');
    const circle = (await drawing(app)).entities.at(-1);
    assert.deepEqual([circle.cx, circle.cy, circle.r], [20, 20, 20], 'grid snap');
    await m(app, `(k.actions.updateSettings({ snapGrid: false }), 1)`);
  } },
  { group: 'Drawing', name: 'Dimensions: linear, aligned, radius, diameter, angle; measuring a distance', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.change('op.circle', (d) => k.drawingModule.addEntity(d, 'circle', { cx: 0, cy: 0, r: 30 })), 1)`);
    const dim = async (tool, points) => {
      await app.main.click(`[data-tool="${tool}"]`);
      for (const [x, y] of points) await clickAt(app, x, y);
      await app.main.key('Escape');
      await app.main.key('Escape');
    };
    await dim('dimLinear', [[-30, -40], [30, -40], [0, -60]]);
    await dim('dimAligned', [[60, 0], [90, 40], [100, 10]]);
    await dim('dimRadius', [[30, 0], [50, 30]]);
    await dim('dimDiameter', [[-30, 0], [-50, 30]]);
    await dim('dimAngle', [[100, -60], [140, -60], [130, -30]]);
    const dims = (await drawing(app)).entities.filter((e) => e.type === 'dim');
    assert.deepEqual(dims.map((e) => e.kind), ['horizontal', 'aligned', 'radius', 'diameter', 'angle']);
    assert.ok(Math.abs(dims[0].x2 - dims[0].x1 - 60) < 1);
    assert.ok(dims.every((e) => e.layer === 'dim'));
    await app.main.click('[data-tool="measure"]');
    await clickAt(app, 0, 0);
    await clickAt(app, 30, 40);
    await app.main.key('Escape');
    assert.match(await notice(app), /거리 50/);
  } },

  // ───────────────────────── selecting and editing
  { group: 'Drawing', name: 'Balloon (auto number), feature control frame, datum (TechDraw); changing kind and symbol in the properties', async run(app) {
    await fresh(app);
    const place = async (tool, tip, at) => {
      await fire(app, `k.run('tool:${tool}')`);
      await clickAt(app, ...tip);
      await clickAt(app, ...at);
      await sleep(150);
    };
    await place('balloon', [0, 0], [30, 30]);
    await place('balloon', [50, 0], [80, 30]);
    let leaders = (await drawing(app)).entities.filter((e) => e.type === 'leader');
    assert.deepEqual(leaders.map((e) => [e.style, e.text]), [['balloon', '1'], ['balloon', '2']], 'balloons number themselves');
    await place('datum', [0, -40], [0, -60]);
    await place('datum', [40, -40], [40, -60]);
    await place('gdt', [100, 0], [120, 20]);
    leaders = (await drawing(app)).entities.filter((e) => e.type === 'leader');
    assert.deepEqual(leaders.slice(2).map((e) => [e.style, e.text]), [['datum', 'A'], ['datum', 'B'], ['gdt', '0.05']]);
    // The frame is selected with its properties: change the characteristic and add datums.
    assert.equal(await app.main.eval(`document.querySelector('#right-panel [data-prop="style"]').value`), 'gdt');
    await app.main.eval(`(() => { const s = document.querySelector('#right-panel [data-prop="symbol"]'); s.value = 'flatness'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await app.main.eval(`(() => { const s = document.querySelector('#right-panel [data-prop="datums"]'); s.value = 'A|B'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    const frame = (await drawing(app)).entities.at(-1);
    assert.deepEqual([frame.symbol, frame.datums], ['flatness', 'A|B']);
    // A plain note becomes a balloon from its properties.
    await m(app, `(k.actions.select([k.actions.activeDrawing().entities[0].id]), 1)`);
    await app.main.eval(`(() => { const s = document.querySelector('#right-panel [data-prop="style"]'); s.value = 'note'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    assert.equal((await drawing(app)).entities[0].style, undefined);
    assert.ok(await app.main.eval(`Boolean(document.querySelector('#right-panel textarea[data-prop="text"]'))`), 'a note has its text box');
  } },
  { group: 'Drawing', name: 'Working plane: set by two points → coordinate input and status bar follow the plane; height Z in the properties; back to global', async run(app) {
    await fresh(app);
    await fire(app, "k.run('tool:workPlane')");
    await clickAt(app, 20, 10);
    await clickAt(app, 20, 60);
    await sleep(150);
    let d = await drawing(app);
    assert.deepEqual(d.workPlane, { x: 20, y: 10, angle: 90, z: 0 });
    // A line typed in plane coordinates: 30 along the plane's X is 30 up in the drawing.
    await fire(app, "k.run('tool:line')");
    await app.main.eval("(() => { const i = document.querySelector('#command-input'); return Boolean(i); })()");
    await m(app, "(k.actions.submitCommand ? (k.actions.submitCommand('0,0'), k.actions.submitCommand('@30,0')) : null, 1)");
    await app.main.key('Escape');
    d = await drawing(app);
    const line = d.entities.find((e) => e.type === 'line');
    assert.ok(line, 'line drawn from typed coordinates');
    assert.deepEqual([line.x1, line.y1].map(Math.round), [20, 10]);
    assert.deepEqual([line.x2, line.y2].map(Math.round), [20, 40]);
    await clickAt(app, 0, 0);
    assert.match(await app.main.eval("document.querySelector('#status-coords').textContent"), /작업 평면/);
    await m(app, '(k.actions.select([]), 1)');
    await app.main.eval("(() => { const i = document.querySelector('#right-panel [data-drawing-wp=\"wp.z\"]'); i.value = '300'; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()");
    assert.equal((await drawing(app)).workPlane.z, 300);
    await app.main.click('#right-panel [data-command="workPlaneReset"]');
    await sleep(100);
    assert.equal((await drawing(app)).workPlane, undefined);
  } },
  { group: 'Editing', name: 'Sketch constraints (B-spline): coincident and tangent to a line end, from the menu', async run(app) {
    await fresh(app);
    await m(app, "(() => { const a = k.actions; a.change('op.line', (d) => { k.drawingModule.addEntity(d, 'line', { x1: -50, y1: 0, x2: 0, y2: 0 }); k.drawingModule.addEntity(d, 'spline', { points: [{ x: 4, y: 3 }, { x: 20, y: 25 }, { x: 40, y: 10 }, { x: 60, y: 30 }], degree: 3 }); }); a.select(a.activeDrawing().entities.map((e) => e.id)); return 1; })()");
    await fire(app, "k.run('constrain:coincident')");
    await fire(app, "k.run('constrain:tangent')");
    await sleep(200);
    const d = await drawing(app);
    assert.deepEqual(d.constraints.map((c) => c.type), ['coincident', 'tangent']);
    assert.deepEqual(d.constraints[1].refs.map((r) => r.at ?? null), [null, 'start']);
    const s = d.entities.find((e) => e.type === 'spline');
    const l = d.entities.find((e) => e.type === 'line');
    assert.ok(Math.hypot(s.points[0].x - l.x2, s.points[0].y - l.y2) < 1e-6, 'starts on the line end');
    const u = [l.x2 - l.x1, l.y2 - l.y1]; const v = [s.points[1].x - s.points[0].x, s.points[1].y - s.points[0].y];
    assert.ok(Math.abs(u[0] * v[1] - u[1] * v[0]) / (Math.hypot(...u) * Math.hypot(...v)) < 1e-6, 'tangent');
  } },
  { group: 'Editing', name: 'Sketch constraints: coincident, perpendicular, distance (value in the properties) → the solver fits them, degrees of freedom shown, delete (Sketcher)', async run(app) {
    await fresh(app);
    await m(app, "(k.actions.change('op.line', (d) => { k.drawingModule.addEntity(d, 'line', { x1: 0, y1: 0, x2: 40, y2: 3 }); k.drawingModule.addEntity(d, 'line', { x1: 41, y1: 2, x2: 50, y2: 30 }); }), 1)");
    const [a, b] = (await drawing(app)).entities.map((e) => e.id);
    await m(app, 'k.actions.select([' + JSON.stringify(a) + ', ' + JSON.stringify(b) + ']), 1');
    await app.main.click('#left-panel [data-command="constrain:coincident"]');
    await sleep(120);
    await app.main.click('#left-panel [data-command="constrain:perpendicular"]');
    await sleep(120);
    let d = await drawing(app);
    assert.deepEqual(d.constraints.map((c) => c.type), ['coincident', 'perpendicular']);
    const [la, lb] = d.entities;
    assert.ok(Math.abs(la.x2 - lb.x1) < 1e-6 && Math.abs(la.y2 - lb.y1) < 1e-6, 'the corner meets');
    const dot = (la.x2 - la.x1) * (lb.x2 - lb.x1) + (la.y2 - la.y1) * (lb.y2 - lb.y1);
    assert.ok(Math.abs(dot) < 1e-3, 'square corner ' + dot);
    // A distance on the first line; its value is typed in the properties.
    await m(app, 'k.actions.select([' + JSON.stringify(a) + ']), 1');
    await app.main.click('#left-panel [data-command="constrain:horizontal"]');
    await app.main.click('#left-panel [data-command="constrain:distance"]');
    await sleep(200);
    await app.main.eval("(() => { const i = document.querySelector('#right-panel [data-constraint-value]'); i.value = '60'; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()");
    await sleep(150);
    d = await drawing(app);
    const first = d.entities[0];
    assert.ok(Math.abs(Math.hypot(first.x2 - first.x1, first.y2 - first.y1) - 60) < 1e-6, 'length 60');
    assert.ok(Math.abs(first.y2 - first.y1) < 1e-9, 'horizontal');
    assert.match(await app.main.eval("document.querySelector('#right-panel .constraint-status').textContent"), /자유도/);
    // Remove one from the list.
    const before = d.constraints.length;
    await app.main.click('#right-panel [data-constraint-remove]');
    await sleep(100);
    assert.equal((await drawing(app)).constraints.length, before - 1);
  } },
  { group: 'Editing', name: 'Script console: drawing with the cad object, printing values, errors; recording a macro → save → run (FreeCAD console and macros)', async run(app) {
    await fresh(app);
    await app.main.key('j', 2 | 8);
    await sleep(150);
    assert.equal(await app.main.eval("document.querySelector('#console-panel').hidden"), false, 'Ctrl+Shift+J opens the console');
    const type = (code) => app.main.eval('(() => { const t = document.querySelector("#console-code"); t.value = ' + JSON.stringify(code) + '; return 1; })()');
    await type('const a = cad.line(0, 0, 40, 0);\ncad.circle(20, 20, 10);\nprint(cad.entities().length)');
    await app.main.click('[data-console="run"]');
    await sleep(200);
    let d = await drawing(app);
    assert.deepEqual(d.entities.map((e) => e.type), ['line', 'circle']);
    assert.match(await app.main.eval("document.querySelector('#console-output').textContent"), /2/);
    await type('cad.entities("circle")[0].r * 2');
    await app.main.click('[data-console="run"]');
    await sleep(150);
    assert.match(await app.main.eval("[...document.querySelectorAll('#console-output .console-line.value')].pop().textContent"), /^20$/);
    await type('cad.nope()');
    await app.main.click('[data-console="run"]');
    await sleep(150);
    assert.match(await app.main.eval("[...document.querySelectorAll('#console-output .console-line.error')].pop().textContent"), /TypeError/);
    // Record: an object added from the hook and a command → a macro.
    await app.main.click('[data-console="record"]');
    await m(app, "(k.actions.change('op.rect', (d) => k.drawingModule.addEntity(d, 'rect', { x: 100, y: 0, width: 10, height: 5 })), 1)");
    await fire(app, "k.run('zoomFit')");
    await app.main.click('[data-console="record"]');
    await sleep(100);
    const recorded = await app.main.eval("document.querySelector('#console-code').value");
    assert.match(recorded, /cad\.add\("rect"/);
    assert.match(recorded, /cad\.run\("zoomFit"\)/);
    await app.main.eval('(() => { document.querySelector("#console-macro-name").value = "box10"; return 1; })()');
    await app.main.click('[data-console="save"]');
    await sleep(100);
    assert.ok((await m(app, 'k.state.settings.macros')).some((x) => x.name === 'box10'));
    await m(app, "k.actions.runMacro('box10').then(() => 1)");
    d = await drawing(app);
    assert.equal(d.entities.filter((e) => e.type === 'rect').length, 2, 'the macro drew the rectangle again');
    await m(app, "(k.actions.updateSettings({ macros: [], showConsole: false }), 1)");
  } },
  { group: 'Editing', name: 'Python console: running a FreeCAD-style macro (Part); installing, running and removing a macro with the addon manager', async run(app) {
    await fresh(app);
    await m(app, "(k.actions.updateSettings({ showConsole: true, consoleLanguage: 'js', macros: [] }), 1)");
    await sleep(150);
    await app.main.click('[data-console="lang:python"]');
    await app.main.waitFor("[...document.querySelectorAll('#console-output .console-line.info')].some((l) => /Python/.test(l.textContent) && /준비|ready/.test(l.textContent))", { timeout: 60000 });
    const type = (code) => app.main.eval('(() => { const t = document.querySelector("#console-code"); t.value = ' + JSON.stringify(code) + '; return 1; })()');
    await type('import FreeCAD as App, Part\nplate = Part.makeBox(100, 60, 10).cut(Part.makeCylinder(10, 10, App.Vector(50, 30, 0)))\nPart.show(plate, "Plate")\nround(plate.Volume)');
    await app.main.click('[data-console="run"]');
    await app.main.waitFor("window.__mycad.actions.activeDrawing().entities.some((e) => e.name === 'Plate')", { timeout: 20000 });
    const value = Number(await app.main.eval("[...document.querySelectorAll('#console-output .console-line.value')].pop().textContent"));
    assert.ok(Math.abs(value - (60000 - Math.PI * 1000)) < 2, `volume ${value}`);
    await type('1/0');
    await app.main.click('[data-console="run"]');
    await app.main.waitFor("/ZeroDivisionError/.test([...document.querySelectorAll('#console-output .console-line.error')].pop()?.textContent ?? '')");
    // The addon manager: install a catalogue macro, run it, remove it.
    await gone(app, 'addons');
    await fire(app, "k.run('addons')");
    const win = await app.popup('addons');
    await expectPopupWindow(app, win, 'addons');
    // (Clicked from inside: the window closes as it installs.)
    await win.eval("setTimeout(() => document.querySelector('[data-addon-install=\"box-grid\"]').click(), 0), 1");
    await app.main.waitFor("window.__mycad.state.settings.macros.some((m) => m.language === 'python')");
    const name = await m(app, 'k.state.settings.macros[0].name');
    await m(app, `k.actions.runMacro(${JSON.stringify(name)}).then(() => 1)`);
    assert.equal((await drawing(app)).entities.filter((e) => /^Box\d\d$/.test(e.name)).length, 9);
    await m(app, `k.actions.openAddons({ action: 'remove', names: [${JSON.stringify(name)}] }).then(() => 1)`);
    assert.equal((await m(app, 'k.state.settings.macros')).length, 0);
    await m(app, "(k.actions.updateSettings({ showConsole: false, consoleLanguage: 'js' }), 1)");
  } },
  { group: 'Editing', name: 'Construction geometry: toggled in the sketch section and the properties; left out of extrusions and exports', async run(app) {
    await fresh(app);
    await m(app, "(k.actions.change('op.rect', (d) => { k.drawingModule.addEntity(d, 'rect', { x: 0, y: 0, width: 40, height: 20 }); k.drawingModule.addEntity(d, 'circle', { cx: 80, cy: 10, r: 10 }); }), 1)");
    const circle = (await drawing(app)).entities[1].id;
    await m(app, 'k.actions.select([' + JSON.stringify(circle) + ']), 1');
    await app.main.click('#left-panel [data-command="construction"]');
    await sleep(120);
    assert.equal((await drawing(app)).entities[1].construction, true);
    assert.equal(await app.main.eval("document.querySelector('#right-panel [data-prop-bool=\"construction\"]').checked"), true);
    // Pad everything: only the rectangle becomes a solid.
    await m(app, "(k.actions.select(k.actions.activeDrawing().entities.map((e) => e.id)), k.actions.applyFeature('pad', k.actions.featureSource('pad'), { height: 5 }), 1)");
    const d = await drawing(app);
    const solid = d.entities.find((e) => e.type === 'solid');
    assert.equal(solid.shape.shapes.length, 1, 'the construction circle is not padded');
  } },
  { group: 'Editing', name: 'Spreadsheet: cells, formulas, aliases (window); =expressions in the properties follow the sheet (FreeCAD Spreadsheet)', async run(app) {
    await fresh(app);
    await gone(app, 'spreadsheet');
    await fire(app, "k.run('spreadsheet')");
    const win = await app.popup('spreadsheet');
    await expectPopupWindow(app, win, 'spreadsheet');
    const put = (sel, value) => win.eval(`(() => { const i = document.querySelector('${sel}'); i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await put('[data-sheet-alias]', 'width');
    await sleep(60);
    await put('[data-sheet-formula]', '40');
    await sleep(60);
    await win.click('[data-sheet-cell="B1"]');
    await sleep(60);
    await put('[data-sheet-formula]', '=width*3');
    await sleep(80);
    assert.equal(await win.eval("document.querySelector('[data-sheet-cell=\"B1\"]').textContent"), '120');
    assert.deepEqual(await win.eval(LAYOUT_CHECK), [], 'window fits');
    await win.click('[data-action="sheet-apply"]');
    await sleep(250);
    let d = await drawing(app);
    assert.deepEqual(d.spreadsheet.aliases, { width: 'A1' });
    // A box whose length is bound to the sheet from its properties.
    await m(app, "(() => { const a = k.actions; const box = a.insertSolid('box', { length: 10, width: 10, height: 10 }, { x: 0, y: 0 }); a.select([box.id]); return 1; })()");
    await sleep(150);
    await app.main.eval("(() => { const i = document.querySelector('#right-panel [data-solid-param=\"length\"]'); i.value = '=width*2'; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()");
    await sleep(150);
    d = await drawing(app);
    assert.equal(d.entities.at(-1).params.length, 80);
    assert.ok((await app.main.eval("document.querySelector('#right-panel .bind-row').textContent")).includes('length = width*2'), 'the binding is listed');
    await m(app, "k.actions.openSpreadsheet({ action: 'apply', sheet: { cells: { A1: '25', B1: '=width*3' }, aliases: { width: 'A1' } } }).then(() => 1)");
    assert.equal((await drawing(app)).entities.at(-1).params.length, 50, 'the box follows the sheet');
  } },
  { group: 'Editing', name: 'Clones: follow the original, move and rotate only the clone, select the original, unlink (Draft Clone)', async run(app) {
    await fresh(app);
    await m(app, `(() => { const a = k.actions; a.change('op.rect', (d) => k.drawingModule.addEntity(d, 'rect', { x: 0, y: 0, width: 40, height: 20 })); a.select([a.activeDrawing().entities[0].id]); return 1; })()`);
    await app.main.click('#left-panel [data-command="clone"]');
    await sleep(200);
    let d = await drawing(app);
    assert.equal(d.entities.length, 2);
    const [source, clone] = d.entities;
    assert.equal(clone.clone.of, source.id);
    assert.match(await app.main.eval(`document.querySelector('#right-panel .clone-note').textContent`), /클론/);
    // Change the source in its properties: the clone follows.
    await m(app, `(k.actions.select([${JSON.stringify(source.id)}]), 1)`);
    await app.main.eval(`(() => { const i = document.querySelector('#right-panel [data-prop="width"]'); i.value = '60'; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(150);
    d = await drawing(app);
    assert.equal(d.entities[1].width, 60, 'the clone follows the source');
    // Rotating the clone turns only the clone.
    await m(app, `(k.drawingModule && k.actions.change('op.rotate', (dd) => k.drawingModule.transformEntities(dd, [${JSON.stringify(clone.id)}], { type: 'rotate', cx: 0, cy: 0, angle: 90 })), 1)`);
    d = await drawing(app);
    assert.equal(d.entities[0].angle, 0);
    assert.equal(d.entities[1].clone.angle, 90);
    // Select source, then make the clone independent.
    await m(app, `(k.actions.select([${JSON.stringify(clone.id)}]), 1)`);
    await app.main.click('#right-panel [data-command="cloneSource"]');
    assert.deepEqual(await m(app, `[...k.state.selection]`), [source.id]);
    await m(app, `(k.actions.select([${JSON.stringify(clone.id)}]), 1)`);
    await app.main.click('#right-panel [data-command="unlinkClone"]');
    await sleep(150);
    d = await drawing(app);
    assert.equal(d.entities[1].clone, undefined);
    assert.ok(await app.main.eval(`Boolean(document.querySelector('#right-panel [data-prop="width"]'))`), 'an independent object has its own fields again');
  } },
  { group: 'Editing', name: 'Trim, extend, fillet, chamfer (FreeCAD Draft/Sketcher)', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.change('op.line', (d) => { k.drawingModule.addEntity(d, 'line', { x1: 0, y1: 0, x2: 100, y2: 0 }); k.drawingModule.addEntity(d, 'line', { x1: 50, y1: -30, x2: 50, y2: 30 }); }), 1)`);
    await app.main.click('[data-tool="trim"]');
    await clickAt(app, 80, 0);
    let d = await drawing(app);
    const horizontal = d.entities.filter((e) => e.type === 'line' && Math.abs(e.y1) < 1e-6 && Math.abs(e.y2) < 1e-6);
    assert.equal(horizontal.length, 1);
    assert.ok(Math.abs(Math.max(horizontal[0].x1, horizontal[0].x2) - 50) < 1e-6, 'the right half is cut away at the crossing line');
    // Extend a short line to the vertical one.
    await m(app, `(k.actions.change('op.line', (d) => k.drawingModule.addEntity(d, 'line', { x1: 0, y1: 20, x2: 20, y2: 20 })), 1)`);
    await app.main.click('[data-tool="extend"]');
    await clickAt(app, 18, 20);
    d = await drawing(app);
    assert.ok(d.entities.some((e) => e.type === 'line' && Math.abs(e.y1 - 20) < 1e-6 && Math.abs(Math.max(e.x1, e.x2) - 50) < 1e-6), 'extended to x = 50');
    // Fillet two lines meeting at a corner (radius typed).
    await fresh(app);
    await m(app, `(k.actions.change('op.line', (d) => { k.drawingModule.addEntity(d, 'line', { x1: 0, y1: 0, x2: 100, y2: 0 }); k.drawingModule.addEntity(d, 'line', { x1: 0, y1: 0, x2: 0, y2: 100 }); }), 1)`);
    await app.main.click('[data-tool="fillet"]');
    await m(app, `(() => { const i = document.querySelector('#command-input'); i.value = '20'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return 1; })()`);
    await clickAt(app, 60, 0);
    await clickAt(app, 0, 60);
    d = await drawing(app);
    const arc = d.entities.find((e) => e.type === 'arc');
    assert.ok(arc && Math.abs(arc.r - 20) < 1e-6 && Math.abs(arc.cx - 20) < 1e-6 && Math.abs(arc.cy - 20) < 1e-6, `fillet arc ${JSON.stringify(arc)}`);
    // Chamfer the other way: one rectangle corner.
    await fresh(app);
    await m(app, `(k.actions.change('op.rect', (d) => k.drawingModule.addEntity(d, 'rect', { x: 0, y: 0, width: 60, height: 40 })), 1)`);
    await app.main.click('[data-tool="chamfer"]');
    await clickAt(app, 60, 40);
    d = await drawing(app);
    assert.equal(d.entities[0].type, 'polyline');
    assert.equal(d.entities[0].points.length, 5, 'one corner cut: five corners');
    await app.main.click('[data-tool="select"]');
  } },
  { group: 'Editing', name: 'Click selection, Shift to add, window/crossing selection, Esc', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.change('op.line', (d) => { k.drawingModule.addEntity(d, 'line', { x1: 0, y1: 0, x2: 40, y2: 0 }); k.drawingModule.addEntity(d, 'circle', { cx: 100, cy: 0, r: 10 }); }), 1)`);
    await clickAt(app, 20, 0);
    assert.equal(await m(app, 'k.state.selection.size'), 1);
    await clickAt(app, 110, 0, { modifiers: 8 });
    assert.equal(await m(app, 'k.state.selection.size'), 2);
    await app.main.key('Escape');
    assert.equal(await m(app, 'k.state.selection.size'), 0);
    // Window (left → right) only takes the line; crossing (right → left) takes both.
    await app.main.drag(await at(app, -10, 20), await at(app, 60, -20));
    assert.equal(await m(app, 'k.state.selection.size'), 1);
    await app.main.drag(await at(app, 105, 20), await at(app, 30, -20));
    assert.equal(await m(app, 'k.state.selection.size'), 2);
    assert.match(await app.main.eval(`document.querySelector('#right-panel h3').textContent`), /2/);
  } },
  { group: 'Editing', name: 'Drag to move, reshape with handles, undo/redo', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.change('op.line', (d) => k.drawingModule.addEntity(d, 'line', { x1: 0, y1: 0, x2: 40, y2: 0 })), 1)`);
    await clickAt(app, 20, 0);
    await app.main.drag(await at(app, 20, 0), await at(app, 20, 30));
    let line = (await drawing(app)).entities[0];
    assert.ok(Math.abs(line.y1 - 30) < 1, 'moved');
    await app.main.drag(await at(app, 40, line.y2), await at(app, 80, 60));
    line = (await drawing(app)).entities[0];
    assert.ok(Math.abs(line.x2 - 80) < 1 && Math.abs(line.y2 - 60) < 1, `grip ${JSON.stringify(line)}`);
    await app.main.key('z', 2);
    await sleep(100);
    assert.ok(Math.abs((await drawing(app)).entities[0].x2 - 40) < 1, 'undo');
    await app.main.key('y', 2);
    await sleep(100);
    assert.ok(Math.abs((await drawing(app)).entities[0].x2 - 80) < 1, 'redo');
    const tips = await app.main.eval(`document.querySelector('#toolbar [data-command="undo"]').title`);
    assert.match(tips, /실행 취소: /);
  } },
  { group: 'Editing', name: 'Modify tools: move, copy, rotate (typed angle), mirror, scale (typed factor), offset', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.change('op.rect', (d) => k.drawingModule.addEntity(d, 'rect', { x: 0, y: 0, width: 20, height: 10 })), 1)`);
    await clickAt(app, 10, 0);
    const typed = async (text) => { await m(app, `k.actions.submitCommand(${JSON.stringify(text)})`); };
    await app.main.click('[data-tool="move"]');
    await clickAt(app, 0, 0);
    await typed('@10,0');
    assert.equal((await drawing(app)).entities[0].x, 10);
    await clickAt(app, 20, 0);
    await app.main.click('[data-tool="copy"]');
    await clickAt(app, 0, 0);
    await clickAt(app, 0, 40);
    await app.main.key('Escape');
    await app.main.key('Escape');
    assert.equal(await count(app), 2);
    await clickAt(app, 20, 0);
    await app.main.click('[data-tool="rotate"]');
    await clickAt(app, 10, 0);
    await typed('90');
    assert.equal((await drawing(app)).entities[0].angle, 90);
    await clickAt(app, 10, 10);
    await app.main.click('[data-tool="scale"]');
    await clickAt(app, 10, 0);
    await typed('2');
    assert.equal((await drawing(app)).entities[0].width, 40);
    await clickAt(app, 10, 30);
    await app.main.click('[data-tool="mirror"]');
    await clickAt(app, -50, -100);
    await clickAt(app, -50, 100);
    assert.equal(await count(app), 3, 'mirror keeps the original');
    await m(app, `(k.actions.select([]), k.actions.change('op.circle', (d) => k.drawingModule.addEntity(d, 'circle', { cx: 120, cy: -60, r: 20 })), 1)`);
    await app.main.click('[data-tool="offset"]');
    await typed('5');
    await clickAt(app, 140, -60);
    await clickAt(app, 165, -60);
    await app.main.key('Escape');
    assert.equal((await drawing(app)).entities.at(-1).r, 25);
  } },
  { group: 'Editing', name: 'Array window (rectangular, polar), explode, bring to front/send to back, delete', async run(app) {
    await fresh(app);
    await m(app, `(() => { k.actions.change('op.circle', (d) => k.drawingModule.addEntity(d, 'circle', { cx: 50, cy: 0, r: 5 })); k.actions.select(k.actions.activeDrawing().entities.map((e) => e.id)); return 1; })()`);
    await fire(app, `k.run('array')`);
    const array = await app.popup('array');
    await expectPopupWindow(app, array, 'array');
    await array.click('[data-array-mode][data-value="polar"]');
    await array.eval(`(() => { for (const [key, value] of [['cx', 0], ['cy', 0]]) { const i = document.querySelector('[data-array="' + key + '"]'); i.value = value; i.dispatchEvent(new Event('change', { bubbles: true })); } return 1; })()`);
    await array.click('[data-action="array-apply"]');
    await sleep(400);
    assert.equal(await count(app), 6);
    await m(app, `(k.actions.change('op.part', (d) => k.drawingModule.addEntity(d, 'part', { kind: 'washer', x: 200, y: 0 })), k.actions.select([k.actions.activeDrawing().entities.at(-1).id]), 1)`);
    await app.main.click('#right-panel [data-command="explode"]');
    await sleep(200);
    assert.ok(await count(app) >= 6 + 3);
    assert.ok(!(await drawing(app)).entities.some((e) => e.type === 'part'));
    const last = await m(app, 'k.actions.activeDrawing().entities.at(-1).id');
    await m(app, `(k.actions.select([${JSON.stringify(last)}]), k.run('sendBack'), 1)`);
    assert.equal(await m(app, 'k.actions.activeDrawing().entities[0].id'), last);
    await m(app, `(k.actions.select([${JSON.stringify(last)}]), 1)`);
    const before = await count(app);
    await app.main.click('#cad-canvas');
    await app.main.key('Delete');
    await sleep(150);
    assert.equal(await count(app), before - 1);
  } },
  { group: 'Editing', name: 'Clipboard: Ctrl+C / Ctrl+V (OS clipboard), pasting text from other programs', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.change('op.circle', (d) => k.drawingModule.addEntity(d, 'circle', { cx: 0, cy: 0, r: 7 })), k.actions.select([k.actions.activeDrawing().entities[0].id]), 1)`);
    await app.main.click('#cad-canvas');
    await app.main.key('c', 2);
    await sleep(400);
    assert.match(getClipboard(), /^MyCAD-Clipboard\/1/);
    await app.main.mouse('mouseMoved', ...Object.values(await at(app, 80, 80)), { button: 'none' });
    await app.main.key('v', 2);
    await sleep(400);
    const d = await drawing(app);
    assert.equal(d.entities.length, 2);
    assert.ok(Math.abs(d.entities[1].cx - 80) < 2, 'pasted at the cursor');
    await app.main.key('x', 2);
    await sleep(300);
    assert.equal(await count(app), 1, 'cut');
    setClipboard('외부 프로그램의 글');
    await app.main.key('v', 2);
    await sleep(400);
    const text = (await drawing(app)).entities.at(-1);
    assert.equal(text.type, 'text');
    assert.match(text.text, /외부 프로그램의 글/);
  } },
  { group: 'Editing', name: 'Ctrl + mouse wheel zooms (about the cursor), the wheel alone pans', async run(app) {
    await fresh(app);
    const p = await at(app, 30, 30);
    const before = await m(app, 'k.actions.activeDoc().vp.zoom');
    await app.main.wheel(p.x, p.y, -100, 2);
    await sleep(100);
    const after = await m(app, 'k.actions.activeDoc().vp.zoom');
    assert.ok(after > before * 1.1, `${before} → ${after}`);
    const still = await m(app, `(() => { const r = document.querySelector('#cad-canvas').getBoundingClientRect(); return k.actions.activeDoc().vp.toWorld(${p.x} - r.left, ${p.y} - r.top); })()`);
    assert.ok(Math.abs(still.x - 30) < 0.5 && Math.abs(still.y - 30) < 0.5, 'the point under the cursor stays');
    await app.main.wheel(p.x, p.y, 100, 2);
    await sleep(100);
    assert.ok(await m(app, 'k.actions.activeDoc().vp.zoom') < after);
    const cy = await m(app, 'k.actions.activeDoc().vp.cy');
    await app.main.wheel(p.x, p.y, 100, 0);
    await sleep(100);
    assert.ok(await m(app, 'k.actions.activeDoc().vp.cy') < cy, 'plain wheel pans');
    assert.match(await app.main.eval(`document.querySelector('#zoom-value').value`), /%$/);
  } },

  // ───────────────────────── properties, layers, parts
  { group: 'Properties', name: 'Properties panel: an expression for the radius, line type, weight and colour, drawing properties', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.change('op.circle', (d) => k.drawingModule.addEntity(d, 'circle', { cx: 0, cy: 0, r: 10 })), k.actions.select([k.actions.activeDrawing().entities[0].id]), 1)`);
    const set = (selector, value) => app.main.eval(`(() => { const i = document.querySelector(${JSON.stringify(selector)}); i.value = ${JSON.stringify(value)}; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await set('#right-panel [data-prop="r"]', '25.4/2');
    assert.equal((await drawing(app)).entities[0].r, 12.7);
    await set('#right-panel [data-style="lineType"]', 'hidden');
    await set('#right-panel [data-style="lineWidth"]', '0.7');
    await app.main.click('#right-panel [data-style="colorByLayer"]');
    const e = (await drawing(app)).entities[0];
    assert.equal(e.lineType, 'hidden');
    assert.equal(e.lineWidth, 0.7);
    assert.ok(e.color, 'own colour');
    await set('#right-panel [data-prop="r"]', 'abc');
    assert.match(await notice(app), /숫자가 아닙니다/);
    await m(app, '(k.actions.select([]), 1)');
    await set('#right-panel [data-drawing="title"]', '축 조립도');
    await set('#right-panel [data-drawing="sheet.material"]', 'SM45C');
    const d = await drawing(app);
    assert.equal(d.title, '축 조립도');
    assert.equal(d.sheet.material, 'SM45C');
  } },
  { group: 'Properties', name: 'Layers: add, current layer, hide, lock, name, colour, delete', async run(app) {
    await fresh(app);
    const layers = () => app.main.eval(`document.querySelectorAll('.layer-row').length`);
    const before = await layers();
    await app.main.click('[data-command="addLayer"]');
    assert.equal(await layers(), before + 1);
    const id = await m(app, 'k.actions.activeDrawing().activeLayer');
    await m(app, `(k.actions.change('op.circle', (d) => k.drawingModule.addEntity(d, 'circle', { cx: 0, cy: 0, r: 10 })), 1)`);
    assert.equal((await drawing(app)).entities[0].layer, id, 'new entities go to the current layer');
    await app.main.click(`[data-layer-visible="${id}"]`);
    assert.equal((await drawing(app)).layers.find((l) => l.id === id).visible, false);
    await clickAt(app, 10, 0);
    assert.equal(await m(app, 'k.state.selection.size'), 0, 'hidden objects cannot be picked');
    await app.main.click(`[data-layer-visible="${id}"]`);
    await app.main.click(`[data-layer-lock="${id}"]`);
    await clickAt(app, 10, 0);
    assert.equal(await m(app, 'k.state.selection.size'), 0, 'locked objects cannot be picked');
    await app.main.click(`[data-layer-lock="${id}"]`);
    await app.main.eval(`(() => { document.querySelector('[data-layer-activate="${id}"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); const i = document.querySelector('.layer-rename'); i.value = '가공선'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return 1; })()`);
    assert.equal((await drawing(app)).layers.find((l) => l.id === id).name, '가공선');
    await app.main.eval(`(() => { const i = document.querySelector('[data-layer-color="${id}"]'); i.value = '#00aa55'; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    assert.equal((await drawing(app)).layers.find((l) => l.id === id).color, '#00aa55');
    await m(app, '(k.actions.updateSettings({ confirmDelete: false }), 1)');
    await app.main.click(`[data-layer-remove="${id}"]`);
    await sleep(150);
    assert.equal(await layers(), before);
    assert.equal((await drawing(app)).entities[0].layer, '0');
    await m(app, '(k.actions.updateSettings({ confirmDelete: true }), 1)');
  } },
  { group: 'Parts', name: 'Parts window: 36 parts in 6 categories with preview, standard sizes, view switch, dimensions, placing', async run(app) {
    await fresh(app);
    await gone(app, 'part');
    await app.main.click('#left-panel [data-part-category="gears"]');
    await sleep(150);
    await app.main.click('[data-part="gear"]');
    const part = await app.popup('part');
    await expectPopupWindow(app, part, 'part');
    let total = 0;
    for (const category of ['fasteners', 'pins', 'gears', 'bearings', 'springs', 'profiles']) {
      await part.click(`[data-part-category="${category}"]`);
      await sleep(80);
      const kinds = await part.eval(`[...document.querySelectorAll('[data-part-kind]')].map((b) => b.dataset.partKind)`);
      for (const kind of kinds) {
        await part.click(`[data-part-kind="${kind}"]`);
        await sleep(60);
        assert.ok(await part.eval(`document.querySelectorAll('#part-preview svg > g > *').length > 0`), `${kind} preview`);
        assert.deepEqual(await part.eval(LAYOUT_CHECK), [], `${kind} fits`);
        for (const view of await part.eval(`[...document.querySelectorAll('[data-part-view]')].map((b) => b.dataset.partView)`)) {
          await part.click(`[data-part-view="${view}"]`);
          await sleep(40);
          assert.ok(await part.eval(`document.querySelectorAll('#part-preview svg > g > *').length > 0`), `${kind} ${view} view`);
        }
        total += 1;
      }
    }
    assert.equal(total, 36, 'every part of the library');
    await part.click('[data-part-category="gears"]');
    await sleep(60);
    await part.click('[data-part-kind="gear"]');
    await part.eval(`(() => { const s = document.querySelector('[data-stepper="part:teeth"] .stepper-value'); s.value = '30'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(100);
    assert.match(await part.eval(`document.querySelector('.part-info').textContent`), /60/);
    await part.click('[data-action="part-apply"]');
    await sleep(300);
    assert.equal(await m(app, 'k.state.toolId'), 'place');
    await clickAt(app, 0, 0);
    const gear = (await drawing(app)).entities.at(-1);
    assert.equal(gear.kind, 'gear');
    assert.equal(gear.params.teeth, 30);
  } },
  { group: 'Parts', name: 'Dragging a part tile onto the drawing; editing its dimensions in the properties', async run(app) {
    await fresh(app);
    await app.main.click('#left-panel [data-part-category="bearings"]');
    await sleep(150);
    await app.main.drag(await visibleCenter(app, '[data-part="flange"]'), await at(app, 40, 40), 16);
    await sleep(300);
    const flange = (await drawing(app)).entities.at(-1);
    assert.equal(flange?.kind, 'flange');
    assert.ok(Math.abs(flange.x - 40) < 2 && Math.abs(flange.y - 40) < 2);
    await app.main.eval(`(() => { const i = document.querySelector('#right-panel [data-param="holes"]'); i.value = '8'; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    assert.equal((await drawing(app)).entities.at(-1).params.holes, 8);
  } },

  // ───────────────────────── tabs
  { group: 'Tabs', name: 'Overflowing tabs get < > buttons at the right end that scroll them', async run(app) {
    for (let i = 0; i < 14; i++) await m(app, '(k.actions.newDrawing(), 1)');
    await sleep(200);
    const nav = await app.main.eval(`(() => { const n = document.querySelector('.tab-nav'); const r = n.getBoundingClientRect(); return { shown: getComputedStyle(n).display !== 'none', right: document.querySelector('#canvas-area').getBoundingClientRect().right - r.right, scrollbar: document.querySelector('.tab-strip').scrollWidth > document.querySelector('.tab-strip').clientWidth && getComputedStyle(document.querySelector('.tab-strip')).overflowX }; })()`);
    assert.ok(nav.shown, 'buttons shown');
    assert.ok(nav.right >= 0 && nav.right < 30, `at the right end of the tab row (${nav.right})`);
    assert.equal(nav.scrollbar, 'hidden', 'no scroll bar');
    await app.main.eval(`document.querySelector('.tab-strip').scrollLeft = 0; 1`);
    await app.main.click('[data-tab-scroll="1"]');
    assert.ok(await app.main.eval(`document.querySelector('.tab-strip').scrollLeft`) > 0);
    await app.main.click('[data-tab-scroll="-1"]');
    // Close the extra tabs without questions (they are unchanged).
    while (await m(app, 'k.state.docs.length') > 3) await m(app, 'k.actions.closeDoc(k.actions.activeDoc(), { force: true })');
  } },

  // ───────────────────────── files
  { group: 'Files', name: 'Save (.mcad) → close → reopen; recent files; last folder', async run(app) {
    await fresh(app);
    const file = path.join(app.files, '축 도면.mcad');
    await m(app, `(k.actions.change('op.circle', (d) => k.drawingModule.addEntity(d, 'circle', { cx: 1, cy: 2, r: 3 })), k.actions.activeDoc().path = ${JSON.stringify(file)}, 1)`);
    assert.equal(await m(app, 'k.actions.saveDoc(k.actions.activeDoc())'), true);
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(saved.format, 'mycad');
    assert.equal(saved.drawing.entities[0].r, 3);
    assert.equal(await m(app, 'k.state.settings.lastDirectory'), app.files);
    await m(app, 'k.actions.closeDoc(k.actions.activeDoc())');
    await m(app, `k.actions.openPath(${JSON.stringify(file)}).then(() => 1)`);
    assert.equal((await drawing(app)).entities[0].r, 3);
    assert.equal(await m(app, 'k.state.recent[0].path'), file);
    assert.match(await app.main.eval(`document.querySelector('.tab.active').title`), /축 도면\.mcad/);
  } },
  { group: 'Files', name: 'Opening (importing) DXF and writing DXF, SVG, PNG and STL files', async run(app) {
    const dxf = path.join(app.files, 'plate.dxf');
    fs.writeFileSync(dxf, ['0', 'SECTION', '2', 'ENTITIES', '0', 'CIRCLE', '8', '0', '10', '5', '20', '5', '40', '2.5', '0', 'LINE', '8', '0', '10', '0', '20', '0', '11', '10', '21', '0', '0', 'ENDSEC', '0', 'EOF'].join('\n'));
    await m(app, `k.actions.openPath(${JSON.stringify(dxf)}).then(() => 1)`);
    const d = await drawing(app);
    assert.deepEqual(d.entities.map((e) => e.type).sort(), ['circle', 'line']);
    assert.equal(await m(app, 'k.actions.activeDoc().format'), 'dxf');
    const written = await app.main.eval(`(async () => {
      const k = window.__mycad; const d = k.actions.activeDrawing();
      const dxf = await import('/src/domain/dxf.js'); const svg = await import('/src/domain/svg.js'); const stl = await import('/src/domain/stl.js');
      const out = ${JSON.stringify(app.files)};
      const invoke = window.__TAURI_INTERNALS__.invoke;
      await invoke('write_text_file', { path: out + '/out.dxf', content: dxf.exportDxf(d), op: 'a' });
      await invoke('write_text_file', { path: out + '/out.svg', content: svg.exportSvg(d), op: 'b' });
      await invoke('write_base64_file', { path: out + '/out.png', data: k.actions.renderPng(d).split(',')[1], op: 'c' });
      const mesh = stl.prepareStl(d.entities, d, { thickness: 3 });
      await invoke('write_base64_file', { path: out + '/out.stl', data: stl.toBase64(stl.toBinaryStl(mesh.triangles)), op: 'd' });
      return mesh.triangles.length;
    })()`);
    assert.ok(written > 0);
    assert.match(fs.readFileSync(path.join(app.files, 'out.dxf'), 'utf8'), /AC1009/);
    assert.match(fs.readFileSync(path.join(app.files, 'out.svg'), 'utf8'), /<svg/);
    assert.equal(fs.readFileSync(path.join(app.files, 'out.png')).subarray(1, 4).toString(), 'PNG');
    const stlBytes = fs.readFileSync(path.join(app.files, 'out.stl'));
    assert.equal(stlBytes.length, 84 + stlBytes.readUInt32LE(80) * 50);
  } },
  { group: 'Files', name: '3D printing (STL) window: solids, holes, size; changing the thickness', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.change('op.part', (d) => k.drawingModule.addEntity(d, 'part', { kind: 'flange', x: 0, y: 0 })), 1)`);
    await gone(app, 'stl');
    await fire(app, `k.run('exportStl')`);
    const stl = await app.popup('stl');
    await expectPopupWindow(app, stl, 'stl');
    assert.equal(await stl.eval(`document.querySelector('#stl-solids').textContent`), '1');
    assert.equal(await stl.eval(`document.querySelector('#stl-holes').textContent`), '7');
    await stl.eval(`(() => { const s = document.querySelector('[data-stepper="stl:thickness"] .stepper-value'); s.value = '12'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(150);
    assert.match(await stl.eval(`document.querySelector('#stl-size').textContent`), /× 12 mm/);
    await stl.click('[data-action="close"]');
  } },
  { group: 'Files', name: 'CAM window: profile, pocket, drilling and engraving path preview, time estimate, G-code (FreeCAD CAM)', async run(app) {
    await fresh(app);
    await m(app, "(k.actions.change('op.rect', (d) => { k.drawingModule.addEntity(d, 'rect', { x: 0, y: 0, width: 100, height: 50 }); k.drawingModule.addEntity(d, 'circle', { cx: 30, cy: 25, r: 8 }); }), 1)");
    await gone(app, 'cam');
    await fire(app, "k.run('cam')");
    const cam = await app.popup('cam');
    await expectPopupWindow(app, cam, 'cam');
    await sleep(150);
    assert.ok(Number(await cam.eval("document.querySelector('#cam-svg').dataset.cuts")) >= 2, 'profile paths drawn');
    assert.deepEqual(await cam.eval(LAYOUT_CHECK), [], 'window fits');
    for (const op of ['pocket', 'engrave', 'drill']) {
      await cam.click('[data-cam-op="' + op + '"]');
      await sleep(100);
      assert.deepEqual(await cam.eval(LAYOUT_CHECK), [], op + ' fits');
    }
    assert.equal(await cam.eval("document.querySelector('#cam-svg').dataset.drills"), '1');
    await cam.click('[data-action="close"]');
    // The G-code the window would save (straight from the hook).
    const gcode = await m(app, "k.actions.openCam({ operation: 'drill', depth: 4, peck: 0 })");
    assert.match(gcode, /G98 G81 X30 Y25 Z-4/);
  } },
  { group: 'Files', name: 'CAM 3D: roughing a solid, finishing with a ball end mill, simulating to the end with a gouge check, machined stock solid', async run(app) {
    await fresh(app);
    await m(app, "(() => { const s = k.actions.insertSolid('sphere', { radius: 25 }, { x: 0, y: 0 }); k.actions.select([s.id]); return 1; })()");
    await gone(app, 'cam');
    await fire(app, "k.run('cam')");
    const cam = await app.popup('cam');
    await expectPopupWindow(app, cam, 'cam');
    await sleep(200);
    // Only solids: the 3D roughing is chosen and the 2D operations are off.
    assert.equal(await cam.eval("document.querySelector('[data-cam-op=\"rough3d\"]').classList.contains('active')"), true);
    assert.equal(await cam.eval("document.querySelector('[data-cam-op=\"profile\"]').disabled"), true);
    assert.ok(Number(await cam.eval("document.querySelector('#cam-svg').dataset.cuts")) > 10, 'roughing paths');
    await cam.click('[data-cam-op="finish3d"]');
    await sleep(150);
    await cam.click('[data-cam-shape="ball"]');
    await sleep(150);
    assert.deepEqual(await cam.eval(LAYOUT_CHECK), [], 'window fits');
    await cam.click('[data-cam-view="sim"]');
    await sleep(150);
    await cam.click('[data-cam-sim="play"]');
    await cam.waitFor("Number(document.querySelector('#cam-sim').dataset.cut) > 0");
    await cam.click('[data-cam-sim="end"]');
    await cam.waitFor("document.querySelector('#cam-gouge')");
    const gouge = await cam.eval("parseFloat(document.querySelector('#cam-gouge b').textContent)");
    assert.ok(gouge < 0.1, `gouge ${gouge}`);
    assert.deepEqual(await cam.eval(LAYOUT_CHECK), [], 'simulation fits');
    // (Clicked from inside: the window closes before a CDP click would return.)
    await cam.eval("setTimeout(() => document.querySelector('[data-action=\"cam-stock\"]').click(), 0), 1");
    await app.main.waitFor("window.__mycad.actions.activeDrawing().entities.some((e) => e.kind === 'mesh')");
    const stock = (await drawing(app)).entities.find((e) => e.kind === 'mesh');
    assert.ok(stock.shape.tris.length > 9 * 1000 && stock.shape.tris.length < 9 * 40000, 'a light mesh');
    // The G-code from the hook: Z on the cutting moves, the safe height over the stock top.
    const gcode = await m(app, `(k.actions.select([${JSON.stringify((await drawing(app)).entities[0].id)}]), k.actions.openCam({ operation: 'finish3d', toolShape: 'ball', tool: 6, stepOver: 0.3 }))`);
    assert.match(gcode, /G1 X[-\d.]+ Y[-\d.]+ Z[-\d.]+/);
    assert.match(gcode, /G0 Z(\d+)/);
  } },
  { group: 'Files', name: 'Recent files window: open, remove one, clear all', async run(app) {
    await fire(app, `k.run('recent')`);
    const recent = await app.popup('recent');
    await expectPopupWindow(app, recent, 'recent');
    const rows = await recent.eval(`document.querySelectorAll('.recent-row').length`);
    assert.ok(rows >= 2);
    await recent.click('.recent-row [data-action="remove-recent"]');
    await sleep(150);
    assert.equal(await recent.eval(`document.querySelectorAll('.recent-row').length`), rows - 1);
    await recent.click('[data-action="clear-recent"]');
    await sleep(150);
    assert.equal(await recent.eval(`document.querySelectorAll('.recent-row').length`), 0);
    await recent.click('[data-action="close"]');
  } },
  { group: 'Files', name: 'Open 2D CAD formats: binary and cp949 DXF, SVG, IGES, HP-GL, Gerber, Excellon (open and drag-and-drop)', async run(app) {
    await fresh(app);
    const cases = [
      ['dxf', 'ezdxf-entities-r2000-binary.dxf', 'dxf', 'samples/dxf'], ['dxf', 'ezdxf-entities-r12-cp949.dxf', 'dxf', 'samples/dxf'],
      ['svg', 'inkscape-bracket.svg', 'svg'], ['iges', 'freecad-plate.igs', 'iges'], ['hpgl', 'hpgl-plotter-demo.plt', 'hpgl'],
      ['gerber', 'pcb-board-top.gtl', 'gerber'], ['excellon', 'pcb-board.drl', 'excellon'],
    ];
    for (const [format, file, expected, dir = 'samples/drawings'] of cases) {
      const tabs = await m(app, 'k.state.docs.length');
      const source = path.join(root, ...dir.split('/'), file);
      await m(app, `k.actions.openPath(${JSON.stringify(source)}).then(() => 1)`);
      assert.equal(await m(app, 'k.state.docs.length'), tabs + 1, `${file}: a new tab`);
      assert.equal(await m(app, 'k.actions.activeDoc().format'), expected, `${file}: read as ${format}`);
      assert.ok((await drawing(app)).entities.length > 3, `${file}: entities`);
      assert.equal(await m(app, 'k.actions.activeDoc().path'), null, `${file}: saving asks for a .mcad name`);
    }
    assert.ok((await drawing(app)).entities.some((e) => e.type === 'circle'), 'drill holes');
    const korean = await m(app, `k.state.docs.find((d) => d.name === 'ezdxf-entities-r12-cp949.dxf').drawing.layers.map((l) => l.name)`);
    assert.ok(korean.includes('외형선'), `cp949 layer name: ${korean}`);
    // Dropped from the file manager: an SVG opens as a drawing (not as the background).
    const tabs = await m(app, 'k.state.docs.length');
    await m(app, `k.actions.handleDroppedPaths(${JSON.stringify([path.join(root, 'samples', 'drawings', 'freecad-plate.svg')])}, null).then(() => 1)`);
    assert.equal(await m(app, 'k.state.docs.length'), tabs + 1);
    assert.equal(await m(app, 'k.actions.activeDoc().format'), 'svg');
    // The export menu offers the open 2D formats.
    const items = await m(app, `k.actions.contextMenuFor ? Object.keys(k.commands).filter((id) => ['exportDxf2000', 'exportIges', 'exportHpgl'].includes(id)) : []`);
    assert.deepEqual(items.sort(), ['exportDxf2000', 'exportHpgl', 'exportIges']);
  } },
  { group: 'Files', name: 'Drag and drop from outside: drawings open, images become the background, text becomes a text entity', async run(app) {
    await fresh(app);
    const file = path.join(app.files, 'dropped.mcad');
    fs.writeFileSync(file, JSON.stringify({ format: 'mycad', version: 1, drawing: { title: '끌어온 도면', entities: [{ type: 'circle', cx: 0, cy: 0, r: 9 }] } }));
    const note = path.join(app.files, 'note.txt');
    fs.writeFileSync(note, '끌어온 메모');
    const image = path.join(app.files, 'bg.png');
    fs.copyFileSync(path.join(root, 'assets', 'icon-256.png'), image);
    const tabs = await m(app, 'k.state.docs.length');
    await m(app, `k.actions.handleDroppedPaths(${JSON.stringify([file])}, null).then(() => 1)`);
    assert.equal(await m(app, 'k.state.docs.length'), tabs + 1);
    assert.equal((await drawing(app)).title, '끌어온 도면');
    await m(app, `k.actions.handleDroppedPaths(${JSON.stringify([note])}, null).then(() => 1)`);
    assert.equal((await drawing(app)).entities.at(-1).text, '끌어온 메모');
    await m(app, `k.actions.handleDroppedPaths(${JSON.stringify([image])}, null).then(() => 1)`);
    assert.equal(await m(app, 'k.state.settings.backgroundName'), 'bg.png');
    assert.ok(await app.main.eval(`document.querySelector('.canvas-image').classList.contains('has-image')`));
  } },
  { group: 'Files', name: 'Background image: copied to the data folder with no size limit, opacity, removal', async run(app) {
    const big = path.join(app.files, 'big.png');
    const png = fs.readFileSync(path.join(root, 'assets', 'icon.png'));
    fs.writeFileSync(big, Buffer.concat([png, Buffer.alloc(30 * 1024 * 1024)]));
    await m(app, `k.actions.setBackgroundFromPath(${JSON.stringify(big)}).then(() => 1)`);
    const stored = await m(app, 'k.state.settings.backgroundImage');
    assert.ok(stored.startsWith(app.data));
    assert.equal(fs.statSync(stored).size, fs.statSync(big).size);
    await m(app, '(k.actions.updateSettings({ backgroundOpacity: 55 }), 1)');
    assert.equal(await app.main.eval(`document.querySelector('.canvas-image').style.opacity`), '0.55');
    await m(app, 'k.actions.removeBackground().then(() => 1)');
    assert.equal(await m(app, 'k.state.settings.backgroundImage'), null);
  } },

  // ───────────────────────── print
  { group: 'Printing', name: 'Print preview: range (all, current, custom), page setup, direct print', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.change('op.rect', (d) => { k.drawingModule.addEntity(d, 'rect', { x: 0, y: 0, width: 600, height: 300 }); k.drawingModule.addEntity(d, 'circle', { cx: 50, cy: 50, r: 10, layer: 'hidden' }); }), 1)`);
    await app.main.click('#toolbar [data-command="print"]');
    const print = await app.popup('print');
    await expectPopupWindow(app, print, 'print');
    const pages = () => print.eval(`window.__mycadPopup.printLayout().pages.length`);
    assert.equal(await pages(), 1);
    await print.click('[data-print-range="all"]');
    assert.ok(await pages() >= 2, 'every open drawing');
    await print.click('[data-print-range="custom"]');
    await print.click('[data-print-layer="0"]');
    await sleep(100);
    assert.equal(await print.eval(`window.__mycadPopup.printLayout().pages[0].entities.length`), 1, 'only the chosen layers');
    await print.click('[data-print-range="current"]');
    await print.eval(`(() => { const s = document.querySelector('[data-print="scale"]'); s.value = '1:1'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    assert.ok(await pages() > 1, '1:1 tiles over several pages');
    await print.eval(`(() => { const s = document.querySelector('[data-print="paper"]'); s.value = 'A3'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await print.click('[data-print-orientation="portrait"]');
    assert.match(await print.eval(`document.querySelector('#page-size').textContent`), /A3 · 세로 · 297×420/);
    await print.click('[data-action="page"][data-value="1"]');
    assert.match(await print.eval(`document.querySelector('#page-number').textContent`), /^2 \//);
    assert.ok(await print.eval(`document.querySelectorAll('.print-sheet .print-page').length`) > 1);
    await print.eval(`window.__mycadPrintHook = (layout) => { window.__printed = layout.pages.length; }; 1`);
    await print.click('[data-action="print"]');
    await sleep(200);
    assert.ok(await print.eval('window.__printed') > 1);
    assert.match(await notice(app), /인쇄를 시작/);
    await print.eval(`(() => { const s = document.querySelector('[data-print="scale"]'); s.value = 'fit'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await print.click('[data-print-orientation="landscape"]');
    await print.eval(`(() => { const s = document.querySelector('[data-print="paper"]'); s.value = 'A4'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await print.click('[data-action="close"]');
  } },

  // ───────────────────────── settings and other popups
  { group: 'Settings', name: 'Settings window: all 8 tabs at a fixed size, no scrolling, rows aligned', async run(app) {
    await app.main.click('#toolbar [data-command="settings"]');
    const settings = await app.popup('settings');
    for (const tab of ['general', 'appearance', 'font', 'background', 'drawing', 'snaps', 'recent', 'shortcuts']) {
      await settings.click(`[data-action="tab"][data-value="${tab}"]`);
      await sleep(250);
      await expectPopupWindow(app, settings, 'settings');
    }
    await settings.click('[data-action="close"]');
  } },
  { group: 'Settings', name: 'Settings: 2D cross-hair colour (red by default) and width', async run(app) {
    await gone(app, 'settings');
    assert.deepEqual(await m(app, '[k.state.settings.crosshairColor, k.state.settings.crosshairWidth]'), ['#e5484d', 1], 'red, 1 px by default');
    await fire(app, `k.run('settings')`);
    const settings = await app.popup('settings');
    await settings.click('[data-action="tab"][data-value="drawing"]');
    await sleep(200);
    await settings.eval(`(() => { const c = document.querySelector('[data-setting-color="crosshairColor"]'); c.value = '#2266ff'; c.dispatchEvent(new Event('change', { bubbles: true })); const w = document.querySelector('[data-select="crosshairWidth"]'); w.value = '2'; w.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(200);
    assert.deepEqual(await m(app, '[k.state.settings.crosshairColor, k.state.settings.crosshairWidth]'), ['#2266ff', 2]);
    await expectPopupWindow(app, settings, 'settings');
    await settings.eval(`(() => { const c = document.querySelector('[data-setting-color="crosshairColor"]'); c.value = '#e5484d'; c.dispatchEvent(new Event('change', { bubbles: true })); const w = document.querySelector('[data-select="crosshairWidth"]'); w.value = '1'; w.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(150);
    await settings.click('[data-action="close"]');
  } },
  { group: 'Settings', name: 'Settings: language, font (all system fonts), text size, style, snaps, author', async run(app) {
    await gone(app, 'settings');
    await fire(app, `k.run('settings')`);
    const settings = await app.popup('settings');
    await settings.click('[data-action="tab"][data-value="font"]');
    await settings.waitFor(`document.querySelectorAll('#font-family option').length > 20`, { timeout: 30000 });
    const family = await settings.eval(`[...document.querySelectorAll('#font-family option')].map((o) => o.value).find((v) => /malgun|맑은|arial/i.test(v))`);
    await settings.eval(`(() => { const s = document.querySelector('#font-family'); s.value = ${JSON.stringify(family)}; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await settings.eval(`(() => { const s = document.querySelector('[data-stepper="textHeight"] .stepper-value'); s.value = '5'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await settings.click('[data-setting="fontStyle"][data-value="italic"]');
    await sleep(200);
    let s = await m(app, 'k.state.settings');
    assert.equal(s.fontFamily, family);
    assert.equal(s.textHeight, 5);
    assert.equal(s.fontStyle, 'italic');
    await settings.click('[data-action="tab"][data-value="snaps"]');
    await settings.click('[data-snap-mode="midpoint"]');
    await sleep(150);
    assert.equal((await m(app, 'k.state.settings.snapModes')).midpoint, false);
    await settings.click('[data-snap-mode="midpoint"]');
    await settings.click('[data-action="tab"][data-value="general"]');
    await settings.eval(`(() => { const i = document.querySelector('[data-text="author"]'); i.value = '홍길동'; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await settings.click('[data-setting="language"][data-value="en"]');
    await sleep(300);
    assert.equal(await settings.eval(`document.querySelector('#popup-title').textContent.trim()`), 'Settings');
    assert.equal(await app.main.eval(`document.querySelector('[data-menu="edit"]').textContent.trim()`), 'Edit');
    await settings.click('[data-setting="language"][data-value="ko"]');
    s = await m(app, 'k.state.settings');
    assert.equal(s.author, '홍길동');
    await m(app, `(k.actions.updateSettings({ fontFamily: '', fontStyle: 'normal', textHeight: 3.5 }), 1)`);
    await settings.click('[data-action="close"]');
  } },
  { group: 'Settings', name: 'About: build information and author SHKWON (knix008@naver.com)', async run(app) {
    await app.main.click('#toolbar [data-command="about"]');
    const about = await app.popup('about');
    await expectPopupWindow(app, about, 'about');
    const text = await about.eval(`document.querySelector('#about-rows').textContent`);
    assert.match(text, /SHKWON\(knix008@naver\.com\)/);
    assert.match(text, new RegExp(VERSION.replace(/\./g, '\\.')));
    assert.match(text, /x86_64|aarch64/);
    await about.click('[data-action="close"]');
  } },
  { group: 'Errors', expectConsoleErrors: true, name: 'Error popup: details, copy the text', async run(app) {
    await m(app, `(k.actions.updateSettings({ language: 'ko' }), 1)`);
    await gone(app, 'error');
    await fire(app, `k.actions.showError('error.save', new Error('디스크가 가득 찼습니다'), 'C:/x.mcad')`);
    const error = await app.popup('error');
    await expectPopupWindow(app, error, 'error');
    await error.click('[data-action="copy-error"]');
    await sleep(300);
    const copied = getClipboard();
    assert.match(copied, /파일을 저장할 수 없습니다/);
    assert.match(copied, /디스크가 가득 찼습니다/);
    assert.match(copied, /C:\/x\.mcad/);
    await error.click('[data-action="close"]');
  } },
  { group: 'Errors', expectConsoleErrors: true, name: 'Serious errors (backend panic) also pop up with their location and thread', async run(app) {
    await closeAllPopups(app);
    await app.main.eval(`window.__TAURI_INTERNALS__.invoke('raise_test_panic').then(() => 1)`);
    const error = await app.popup('error');
    await error.waitFor(`document.querySelector('#error-detail').value.includes('test panic')`);
    const detail = await error.eval(`document.querySelector('#error-detail').value`);
    assert.match(detail, /lib\.rs/);
    assert.match(detail, /crash\.log/);
    await error.click('[data-action="close"]');
  } },
  { group: 'Errors', expectConsoleErrors: true, name: 'After an abrupt exit (killed or crashed) the next start reports the last run in a popup', async run(app) {
    // Killed without a word (like a crash): running.lock stays, and this run's crash.log entry (the test panic above) is in it.
    await app.restart([], {}, { reportCrash: true });
    const error = await app.popup('error');
    await error.waitFor(`document.querySelector('#error-detail')?.value.length > 0`);
    const report = await error.eval(`({ text: document.body.textContent, detail: document.querySelector('#error-detail').value })`);
    assert.match(report.text, /지난번 실행이 비정상적으로 끝났습니다|The last run did not end normally/);
    assert.match(report.detail, /test panic/, 'the crash.log entries of that run are in the details');
    assert.ok(await error.eval(`Boolean(document.querySelector('[data-action="copy"], [data-action="copy-error"]'))`), 'the details can be copied');
    await error.click('[data-action="close"]');
    // A normal start after that: nothing to report.
    await app.restart();
    await sleep(1500);
    assert.equal(app.windowInfo().filter((w) => w.visible && /지난번 실행|last run/.test(w.title)).length, 0, 'no report after a clean start');
  } },
  { group: 'Progress', name: 'Slow opening/saving shows a progress popup', async run(app) {
    // Slow enough (several chunks × 900 ms) that the window stays up while it is checked.
    await app.restart([], { MYCAD_IO_DELAY_MS: '900' });
    const file = path.join(app.files, 'big.mcad');
    const entities = Array.from({ length: 30000 }, (_, i) => ({ type: 'line', x1: i, y1: 0, x2: i, y2: 10 }));
    fs.writeFileSync(file, JSON.stringify({ format: 'mycad', version: 1, drawing: { title: 'big', entities } }));
    await fire(app, `k.actions.openPath(${JSON.stringify(file)})`);
    const progress = await app.popup('progress');
    await progress.waitFor(`/%/.test(document.querySelector('#progress-percent')?.textContent ?? '')`);
    await expectPopupWindow(app, progress, 'progress');
    await m(app, '1');
    await app.main.waitFor(`window.__mycad.state.docs.some((d) => d.drawing.title === 'big')`, { timeout: 30000 });
    await app.restart();
  } },

  // ───────────────────────── rulers and 3D
  { group: 'Rulers', name: 'Ruler button on the toolbar, rulers above and left of the canvas (mm, cursor marker)', async run(app) {
    await fresh(app);
    const pixel = (x, y) => app.main.eval(`(() => { const c = document.querySelector('#cad-canvas'); const d = c.getContext('2d').getImageData(Math.round(${x} * devicePixelRatio), Math.round(${y} * devicePixelRatio), 1, 1).data; return [d[0], d[1], d[2]].join(','); })()`);
    await m(app, 'k.actions.drawCanvas()');
    const withRulers = await pixel(5, 300);
    assert.ok(await app.main.eval(`document.querySelector('#toolbar [data-command="rulers"]').getAttribute('aria-pressed')`) === 'true');
    const info = await m(app, `(() => { const vp = k.actions.activeDoc().vp; return { major: k.canvasState.lastRuler?.major ?? null }; })()`);
    await app.main.click('#toolbar [data-command="rulers"]');
    await m(app, 'k.actions.drawCanvas()');
    const without = await pixel(5, 300);
    assert.notEqual(withRulers, without, 'the left ruler is drawn over the canvas');
    assert.equal(await m(app, 'k.state.settings.showRulers'), false);
    await app.main.click('#toolbar [data-command="rulers"]');
    assert.ok(info);
  } },
  { group: 'Units', name: 'Length unit in Settings › General: rulers, properties, status bar and dimensions follow; other units typed in are converted', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.change('op.line', (d) => { k.drawingModule.addEntity(d, 'line', { x1: 0, y1: 0, x2: 50.8, y2: 0 }); k.drawingModule.addEntity(d, 'dim', { kind: 'horizontal', x1: 0, y1: 0, x2: 50.8, y2: 0, ox: 0, oy: -10, precision: 1 }); }), 1)`);
    await m(app, `(k.run('settings'), 1)`);
    const settings = await app.popup('settings');
    await settings.click('[data-action="tab"][data-value="general"]');
    await settings.waitFor(`Boolean(document.querySelector('#settings-units'))`);
    await settings.eval(`(() => { const s = document.querySelector('#settings-units'); s.value = 'in'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await app.main.waitFor(`window.__mycad.state.settings.units === 'in'`, { timeout: 5000 }).catch(() => {});
    assert.equal(await m(app, 'k.state.settings.units'), 'in', 'chosen in Settings › General');
    await settings.eval(`(document.querySelector('[data-action="close"]').click(), 1)`).catch(() => {});
    await m(app, `(() => { const d = k.actions.activeDrawing(); k.actions.select([d.entities.at(-2).id]); k.actions.drawCanvas(); return 1; })()`);
    // The panel and status bar are drawn again a moment after the selection.
    const read = `(() => { const i = document.querySelector('#right-panel [data-prop="x2"]'); return JSON.stringify(i ? { value: i.value, unit: i.closest('.prop-input').querySelector('small').textContent, status: document.querySelector('#status-unit').textContent } : null); })()`;
    const want = JSON.stringify({ value: '2', unit: 'in', status: 'in' });
    await app.main.waitFor(`${read} === ${JSON.stringify(want)}`, { timeout: 5000 }).catch(() => {});
    assert.equal(await app.main.eval(read), want, 'line end shown in inches, with the unit, and the status bar unit');
    assert.equal((await m(app, 'k.canvasState.lastRuler')).unit, 'in', 'the ruler counts in inches');
    const dim = await m(app, `k.actions.activeDrawing().entities.at(-1)`);
    assert.equal(await app.main.eval(`import('/src/domain/entities.js').then((e) => e.dimText(${JSON.stringify(dim)}))`), '2"');
    // Typed with its own unit: converted, stored in mm, shown in inches.
    await app.main.eval(`(() => { const i = document.querySelector('#right-panel [data-prop="x2"]'); i.value = '76.2mm'; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(150);
    assert.equal((await drawing(app)).entities.at(-2).x2, 76.2);
    assert.equal(await app.main.eval(`document.querySelector('#right-panel [data-prop="x2"]').value`), '3');
    await m(app, `(k.actions.updateSettings({ units: 'mm' }), 1)`);
  } },
  { group: 'Units', name: 'Scale bar: toggled on the toolbar, dragged to move, end dragged to change the length, hidden in 3D', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.updateSettings({ units: 'mm', showScaleBar: true, scaleBar: { x: 36, y: 14, width: 120 } }), k.actions.setZoomPercent(100), 1)`);
    await sleep(200);
    const read = () => app.main.eval(`(() => { const b = document.querySelector('#scale-bar'); const r = b.getBoundingClientRect(); const t = b.querySelector('.scale-track').getBoundingClientRect(); return { hidden: b.hidden, x: r.left, y: r.top, left: t.left, right: t.right, top: t.top, mm: Number(b.dataset.mm), text: b.querySelector('.scale-length').textContent }; })()`);
    let bar = await read();
    assert.equal(bar.hidden, false);
    assert.match(bar.text, / mm$/);
    const zoom = await m(app, 'k.actions.activeDoc().vp.zoom');
    assert.ok(Math.abs(bar.mm - 120 / zoom) < 1e-6, 'length = bar px / zoom');
    await app.main.drag({ x: bar.x + 30, y: bar.y + 8 }, { x: bar.x + 130, y: bar.y + 8 - 60 }, 6);
    const moved = await read();
    assert.ok(Math.abs(moved.x - bar.x - 100) < 2 && Math.abs(moved.y - bar.y + 60) < 2, `moved with the mouse ${JSON.stringify({ bar, moved })}`);
    await app.main.drag({ x: moved.right, y: moved.top + 3 }, { x: moved.right + 60, y: moved.top + 3 }, 6);
    bar = await read();
    assert.ok(Math.abs(bar.right - bar.left - 180) < 2, 'end line dragged: longer bar');
    assert.ok(Math.abs(bar.mm - 180 / zoom) < 1e-6, 'and a longer length');
    await app.main.click('#toolbar [data-command="scaleBar"]');
    assert.equal((await read()).hidden, true, 'toolbar button hides it');
    await app.main.click('#toolbar [data-command="scaleBar"]');
    await m(app, 'k.actions.toggle3d(true).then(() => 1)');
    assert.equal((await read()).hidden, true, 'not shown in 3D');
    await m(app, 'k.actions.toggle3d(false).then(() => 1)');
    assert.equal((await read()).hidden, false);
  } },
  { group: '3D', name: '3D view: extruded solids, axis ticks, view changes, thickness', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.change('op.part', (d) => { k.drawingModule.addEntity(d, 'part', { kind: 'flange', x: 0, y: 0 }); k.drawingModule.addEntity(d, 'line', { x1: -80, y1: -80, x2: 80, y2: -80 }); }), 1)`);
    await app.main.click('#toolbar [data-command="view3d"]');
    await app.main.waitFor(`window.__mycad.actions.view3d() && document.querySelector('.view3d-bar')`, { timeout: 30000 });
    await sleep(500);
    let info = await m(app, 'k.actions.view3d().inspect()');
    assert.ok(info.triangles > 100, 'solid drawn');
    assert.ok(info.wires >= 2, 'lines on the ground');
    assert.ok(info.axes && info.axisInfo.ticks >= 3 && info.tickLabels >= 9, `axes with ticks ${JSON.stringify(info.axisInfo)}`);
    // The numbers keep their size on screen: never above 13 px (at 100 %), even close up.
    assert.ok(info.tickPx > 2 && info.tickPx <= 13.5, `axis numbers ${info.tickPx} px`);
    await m(app, '(k.actions.view3d().zoom(6), 1)');
    const close = await m(app, 'k.actions.view3d().inspect().tickPx');
    assert.ok(close <= 13.5, `close up the numbers do not grow: ${close} px`);
    assert.equal(await app.main.eval(`document.querySelector('#cad-canvas').hidden`), true);
    const missing = await app.main.eval(`[...document.querySelectorAll('.view3d-bar button')].filter((b) => !b.title).length`);
    assert.equal(missing, 0, 'every 3D button has a tooltip');
    const before = info.camera;
    await app.main.click('[data-view3d="view:top"]');
    info = await m(app, 'k.actions.view3d().inspect()');
    assert.notDeepEqual(info.camera, before);
    assert.ok(info.camera[2] > Math.abs(info.camera[0]) * 10, 'top view looks down');
    await app.main.click('[data-view3d="axes"]');
    assert.equal((await m(app, 'k.actions.view3d().inspect()')).axes, false);
    await app.main.click('[data-view3d="axes"]');
    // Draw styles: the dropdown lists all ten; the mesh style is the old wireframe.
    await app.main.click('[data-view3d="styleMenu"]');
    const styles = await app.popup('menu');
    await styles.waitFor(`document.querySelectorAll('.menu-item').length === 10`);
    await chooseMenuItem(styles, 'view3dStyle:mesh');
    await sleep(200);
    assert.equal((await m(app, 'k.actions.view3d().inspect()')).wireframe, true);
    await m(app, `(k.actions.setView3dStyle('asis'), 1)`);
    await app.main.eval(`(() => { const i = document.querySelector('#view3d-thickness'); i.value = '25'; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(200);
    assert.equal(await m(app, 'k.state.settings.extrudeHeight'), 25);
    // Editing the drawing updates the 3D view.
    const triangles = (await m(app, 'k.actions.view3d().inspect()')).triangles;
    await m(app, `(k.actions.change('op.rect', (d) => k.drawingModule.addEntity(d, 'rect', { x: 100, y: 100, width: 20, height: 20 })), 1)`);
    await sleep(200);
    assert.ok((await m(app, 'k.actions.view3d().inspect()')).triangles > triangles);
  } },
  { group: '3D', name: '3D light: dragging the sun with the mouse, light move mode, on/off', async run(app) {
    await app.main.click('[data-view3d="view:iso"]');
    await sleep(200);
    const start = await m(app, 'k.actions.view3d().inspect()');
    const sun = start.sunScreen;
    // The sun follows the mouse (a point on a sphere around the model): it ends up under the pointer.
    const target = { x: sun.x + 120, y: sun.y + 40 };
    await app.main.drag(sun, target, 12);
    await sleep(200);
    const moved = await m(app, 'k.actions.view3d().inspect()');
    assert.notEqual(moved.light.azimuth, start.light.azimuth, 'dragging the sun turns the light around');
    const off = Math.hypot(moved.sunScreen.x - target.x, moved.sunScreen.y - target.y);
    assert.ok(off < 12, `the sun is under the pointer (${off.toFixed(1)} px away)`);
    assert.deepEqual(moved.camera, start.camera, 'the camera did not orbit while moving the light');
    await app.main.click('[data-view3d="lightMode"]');
    const centre = await app.main.center('#view3d .view3d-canvas');
    await app.main.drag(centre, { x: centre.x - 120, y: centre.y }, 10);
    await sleep(200);
    const mode = await m(app, 'k.actions.view3d().inspect()');
    assert.notEqual(mode.light.azimuth, moved.light.azimuth, 'light mode: any drag moves the light');
    await app.main.click('[data-view3d="lightMode"]');
    assert.match(await app.main.eval(`document.querySelector('#view3d-light').textContent`), /조명 방위 \d+° · 고도 \d+°/);
    await app.main.click('[data-view3d="light"]');
    assert.equal((await m(app, 'k.actions.view3d().inspect()')).light.visible, false, 'light off');
    assert.equal((await m(app, 'k.actions.view3d().inspect()')).light.sunShown, false, 'light off: the sun itself is not shown');
    assert.equal((await m(app, 'k.actions.view3d().inspect()')).light.basicLight, true, 'light off: the model is still lit by the basic light');
    await app.main.click('[data-view3d="light"]');
    assert.equal((await m(app, 'k.actions.view3d().inspect()')).light.visible, true, 'light on');
    assert.equal((await m(app, 'k.actions.view3d().inspect()')).light.sunShown, true, 'light on: the sun is back');
    assert.equal((await m(app, 'k.actions.view3d().inspect()')).light.basicLight, false, 'light on: the sun lights it');
    // The sun keeps its size on screen when zooming (it does not grow blurry or shrink away).
    const sunCentre = await app.main.center('#view3d .view3d-canvas');
    const before = (await m(app, 'k.actions.view3d().inspect()')).light.sunPx;
    for (let i = 0; i < 4; i++) await app.main.wheel(sunCentre.x, sunCentre.y, -240);
    await sleep(300);
    const zoomedIn = (await m(app, 'k.actions.view3d().inspect()')).light.sunPx;
    for (let i = 0; i < 8; i++) await app.main.wheel(sunCentre.x, sunCentre.y, 240);
    await sleep(300);
    const zoomedOut = (await m(app, 'k.actions.view3d().inspect()')).light.sunPx;
    for (const px of [before, zoomedIn, zoomedOut]) assert.ok(Math.abs(px - 44) < 1, `sun ${px.toFixed(1)} px on screen`);
    await app.main.click('[data-view3d="close"]');
    assert.equal(await app.main.eval(`document.querySelector('#cad-canvas').hidden`), false, 'back to 2D');
  } },


  // ───────────────────────── 3D solids (FreeCAD Part)
  { group: '3D solids', name: 'Solid window: shaded previews of 10 kinds, dimensions, position → insert; volume in the properties', async run(app) {
    await fresh(app);
    await gone(app, 'solid');
    await app.main.click(`#left-panel [data-command="solid:torus"]`);
    const solid = await app.popup('solid');
    await expectPopupWindow(app, solid, 'solid');
    for (const kind of ['box', 'cylinder', 'sphere', 'cone', 'torus', 'tube', 'wedge', 'prism', 'ellipsoid', 'helix']) {
      await solid.click(`[data-solid-kind="${kind}"]`);
      await sleep(80);
      const preview = await solid.eval(`(() => { const s = document.querySelector('#solid-preview svg'); return s ? { faces: Number(s.dataset.faces), segments: Number(s.dataset.segments) } : null; })()`);
      assert.ok(preview && preview.faces > 0 && preview.segments > 0, `${kind}: shaded preview ${JSON.stringify(preview)}`);
      assert.deepEqual(await solid.eval(LAYOUT_CHECK), [], `${kind} fits`);
    }
    await solid.click('[data-solid-kind="cylinder"]');
    const set = (key, value) => solid.eval(`(() => { const s = document.querySelector('[data-stepper="${key}"] .stepper-value'); s.value = '${value}'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await set('solid:radius', 8);
    await set('solid:height', 20);
    await set('solidPlace:x', 30);
    await sleep(120);
    assert.match(await solid.eval(`document.querySelector('.part-info').textContent`), /4,?021\.2\d* mm³/, 'volume π·8²·20 shown with its unit');
    await solid.click('[data-action="solid-apply"]');
    await sleep(300);
    const added = (await drawing(app)).entities.at(-1);
    assert.equal(added.type, 'solid');
    assert.equal(added.kind, 'cylinder');
    assert.deepEqual([added.params.radius, added.params.height, added.x], [8, 20, 30]);
    assert.match(await app.main.eval(`document.querySelector('#right-panel').textContent`), /부피/);
    // Edit in the properties panel: the radius.
    await app.main.eval(`(() => { const i = document.querySelector('#right-panel [data-solid-param="radius"]'); i.value = '10'; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    assert.equal((await drawing(app)).entities.at(-1).params.radius, 10);
  } },
  { group: '3D solids', name: '2D → 3D: rectangle + circle extruded (hole), revolve, loft, sweep', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.change('op.rect', (d) => { k.drawingModule.addEntity(d, 'rect', { x: 0, y: 0, width: 40, height: 30 }); k.drawingModule.addEntity(d, 'circle', { cx: 20, cy: 15, r: 5 }); }), 1)`);
    await m(app, `(k.actions.select(k.actions.activeDrawing().entities.map((e) => e.id)), 1)`);
    await fire(app, `k.run('solid:pad')`);
    const pad = await app.popup('solid');
    await expectPopupWindow(app, pad, 'solid');
    await pad.eval(`(() => { const s = document.querySelector('[data-stepper="solid:height"] .stepper-value'); s.value = '7'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(100);
    await pad.click('[data-action="solid-apply"]');
    await sleep(300);
    let d = await drawing(app);
    assert.equal(d.entities.length, 1, 'the outlines became the solid');
    assert.equal(d.entities[0].kind, 'pad');
    const volume = await m(app, `k.actions.selectedSolids()[0] && Math.round(window.__mycad.actions.activeDrawing().entities[0].params.height)`);
    assert.equal(volume, 7);
    assert.ok(Math.abs((await m(app, `(() => { const e = k.actions.activeDrawing().entities[0]; return e.shape.shapes[0].holes.length; })()`)) - 1) < 1e-9, 'the circle is a hole');
    // Revolve, loft and sweep straight from the test hook (the same code as their windows).
    await fresh(app);
    await m(app, `(k.actions.change('op.rect', (d) => k.drawingModule.addEntity(d, 'rect', { x: 10, y: 0, width: 5, height: 20 })), k.actions.select([k.actions.activeDrawing().entities[0].id]), 1)`);
    await m(app, `(k.actions.applyFeature('revolution', k.actions.featureSource('revolution'), { angle: 360 }, 'yAxis'), 1)`);
    d = await drawing(app);
    assert.equal(d.entities[0].kind, 'revolution');
    await m(app, `(k.actions.change('op.rect', (d) => { k.drawingModule.addEntity(d, 'rect', { x: 100, y: 0, width: 20, height: 20 }); k.drawingModule.addEntity(d, 'circle', { cx: 110, cy: 10, r: 6 }); }), 1)`);
    await m(app, `(k.actions.select(k.actions.activeDrawing().entities.slice(-2).map((e) => e.id)), k.actions.applyFeature('loft', k.actions.featureSource('loft'), { height: 25 }), 1)`);
    assert.equal((await drawing(app)).entities.at(-1).kind, 'loft');
    await m(app, `(k.actions.change('op.polyline', (d) => k.drawingModule.addEntity(d, 'polyline', { points: [{ x: 0, y: 60 }, { x: 40, y: 60 }, { x: 60, y: 90 }] })), k.actions.select([k.actions.activeDrawing().entities.at(-1).id]), k.actions.applyFeature('sweep', k.actions.featureSource('sweep'), { radius: 3 }), 1)`);
    assert.equal((await drawing(app)).entities.at(-1).kind, 'sweep');
  } },
  { group: '3D solids', name: 'Booleans: cut, union, intersection stay as a tree; exploding gives back the solids', async run(app) {
    await fresh(app);
    await m(app, `(() => { const a = k.actions; const box = a.insertSolid('box', { length: 20, width: 20, height: 20 }, { x: 0, y: 0 }); const pin = a.insertSolid('cylinder', { radius: 5, height: 40 }, { x: 10, y: 10, z: -10 }); a.select([box.id, pin.id]); return 1; })()`);
    assert.equal(await m(app, `k.commands['bool:cut'].enabled()`), true);
    await app.main.click('#left-panel [data-command="bool:cut"]');
    await sleep(300);
    let d = await drawing(app);
    assert.equal(d.entities.length, 1);
    assert.equal(d.entities[0].kind, 'boolean');
    assert.equal(d.entities[0].shape.op, 'cut');
    const volume = await m(app, `k.actions.activeDrawing().entities[0] && Number(document.querySelector('#right-panel').textContent.match(/부피([\\d,.]+)/)?.[1].replace(/,/g, ''))`);
    assert.ok(Math.abs(volume - (8000 - Math.PI * 25 * 20)) < 30, `volume ${volume}`);
    await app.main.click('#right-panel [data-command="explode"]');
    await sleep(300);
    d = await drawing(app);
    assert.deepEqual(d.entities.map((e) => e.kind).sort(), ['box', 'cylinder'], 'explode gives the parts back');
    for (const op of ['union', 'common']) {
      await m(app, `(k.actions.select(k.actions.activeDrawing().entities.map((e) => e.id)), k.actions.booleanSelection('${op}'), 1)`);
      assert.equal((await drawing(app)).entities[0].shape.op, op);
      await m(app, `(k.actions.select([k.actions.activeDrawing().entities[0].id]), k.actions.explodeSelection(), 1)`);
    }
  } },
  { group: '3D solids', name: 'Fillet, chamfer, thickness, offset (3D): size in the window → replaces the solid; exploding gives it back', async run(app) {
    await fresh(app);
    await m(app, `(() => { const a = k.actions; const box = a.insertSolid('box', { length: 100, width: 60, height: 40 }, { x: 50, y: 20 }); a.select([box.id]); return 1; })()`);
    assert.equal(await m(app, `k.commands['dress:fillet'].enabled()`), true);
    await gone(app, 'solid');
    await app.main.click('#left-panel [data-command="dress:chamfer"]');
    const win = await app.popup('solid');
    await expectPopupWindow(app, win, 'solid');
    await win.eval(`(() => { const s = document.querySelector('[data-stepper="solid:size"] .stepper-value'); s.value = '10'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(120);
    const preview = await win.eval(`(() => { const s = document.querySelector('#solid-preview svg'); return s ? Number(s.dataset.faces) : 0; })()`);
    assert.ok(preview > 12, `chamfered preview ${preview}`);
    assert.deepEqual(await win.eval(LAYOUT_CHECK), [], 'window fits');
    await win.click('[data-action="solid-apply"]');
    await sleep(300);
    let d = await drawing(app);
    assert.equal(d.entities.length, 1, 'the box became the chamfer');
    assert.equal(d.entities[0].kind, 'chamfer');
    assert.equal(d.entities[0].params.size, 10);
    assert.equal(d.entities[0].x, 50, 'it keeps the box placement');
    await app.main.click('#right-panel [data-command="explode"]');
    await sleep(300);
    d = await drawing(app);
    assert.equal(d.entities[0].kind, 'box', 'explode gives the box back');
    assert.equal(d.entities[0].x, 50);
    for (const [kind, params] of [['fillet', { size: 5, edges: 0 }], ['thickness', { thickness: 4 }], ['offset3d', { distance: 3 }]]) {
      await m(app, `(k.actions.select([k.actions.activeDrawing().entities[0].id]), 1)`);
      await m(app, `k.actions.dressUp('${kind}', ${JSON.stringify(params)}).then(() => 1)`);
      assert.equal((await drawing(app)).entities[0].kind, kind);
      await m(app, `(k.actions.select([k.actions.activeDrawing().entities[0].id]), k.actions.explodeSelection(), 1)`);
    }
    // Only a prism-shaped solid can take one.
    await m(app, `(() => { const a = k.actions; const ball = a.insertSolid('sphere', { radius: 5 }, { x: 0, y: 0 }); a.select([ball.id]); return 1; })()`);
    assert.equal(await m(app, `k.commands['dress:fillet'].enabled()`), false);
  } },
  { group: '3D solids', name: 'Check geometry window: results per solid, problem items, repairing the chosen solid → mesh solid (FreeCAD Part/Mesh)', async run(app) {
    await fresh(app);
    // A good box and a mesh box with its top taken away and a face turned over.
    await m(app, `(() => {
      const a = k.actions;
      a.insertSolid('box', { length: 20, width: 20, height: 20 }, { x: 0, y: 0 });
      const s = 10;
      const P = (x, y, z) => [x, y, z];
      const quads = [[P(0,0,0),P(0,s,0),P(s,s,0),P(s,0,0)], [P(0,0,0),P(s,0,0),P(s,0,s),P(0,0,s)], [P(s,0,0),P(s,s,0),P(s,s,s),P(s,0,s)], [P(s,s,0),P(0,s,0),P(0,s,s),P(s,s,s)], [P(0,s,0),P(0,0,0),P(0,0,s),P(0,s,s)]];
      let tris = quads.flatMap(([p, q, r, t]) => [[p, q, r], [p, r, t]]).map((tri) => tri.map(([x, y, z]) => [x + 40, y, z]));
      tris[2] = [tris[2][0], tris[2][2], tris[2][1]];
      a.change('op.meshRepair', (d) => k.drawingModule.addEntity(d, 'solid', { kind: 'mesh', name: 'broken', shape: { tris: tris.flat(2) } }));
      a.select([]);
      return 1;
    })()`);
    assert.equal(await m(app, `k.commands.checkGeometry.enabled()`), true);
    await gone(app, 'check');
    await app.main.click('#left-panel [data-command="checkGeometry"]');
    const win = await app.popup('check');
    await expectPopupWindow(app, win, 'check');
    await sleep(150);
    assert.equal(await win.eval(`document.querySelectorAll('.check-row').length`), 2, 'both solids listed');
    assert.equal(await win.eval(`document.querySelector('#check-bad').textContent`), '1');
    // The broken one is shown first with its problems.
    const detail = await win.eval(`document.querySelector('.check-detail').textContent`);
    assert.match(detail, /broken/);
    assert.match(detail, /열린 모서리/);
    assert.match(detail, /방향이 어긋난 곳/);
    assert.deepEqual(await win.eval(LAYOUT_CHECK), [], 'window fits');
    await win.click('.check-row:not(.active)');
    await sleep(80);
    assert.match(await win.eval(`document.querySelector('.check-detail').textContent`), /예/, 'the box is closed');
    await win.click('[data-action="check-repair"]');
    await sleep(400);
    const d = await drawing(app);
    const broken = d.entities.find((e) => e.name === 'broken');
    assert.equal(broken.kind, 'mesh');
    assert.notEqual(broken.shape.tris.length, 90, 'the mesh was repaired (a lid added)');
    const report = await m(app, `(() => { const e = k.actions.activeDrawing().entities.find((x) => x.name === 'broken'); k.actions.select([e.id]); return 1; })()`);
    assert.equal(report, 1);
    await fire(app, `k.actions.checkGeometry()`);
    const again = await app.popup('check');
    await sleep(150);
    const seen = await again.eval(`[document.querySelectorAll('.check-row').length, document.querySelector('#check-bad').textContent, document.querySelector('.check-detail').textContent.replace(/\s+/g, ' ')].join(' | ')`);
    assert.ok(seen.startsWith('1 | 0 |'), `repaired: no problems left — ${seen}`);
    await again.click('[data-action="close"]');
    // Repair is one undo step.
    await m(app, `(k.run('undo'), 1)`);
    await sleep(150);
    assert.equal((await drawing(app)).entities.find((e) => e.name === 'broken').shape.tris.length, 90);
  } },
  { group: '3D solids', name: 'FEM window: frame of lines, supports, loads, sections → displacement, moment, stress; results drawn on the FEM layer', async run(app) {
    await fresh(app);
    await m(app, "(k.actions.change('op.line', (d) => { k.drawingModule.addEntity(d, 'line', { x1: 0, y1: 0, x2: 0, y2: 3000 }); k.drawingModule.addEntity(d, 'line', { x1: 0, y1: 3000, x2: 5000, y2: 3000 }); k.drawingModule.addEntity(d, 'line', { x1: 5000, y1: 3000, x2: 5000, y2: 0 }); }), 1)");
    await gone(app, 'fem');
    await fire(app, "k.run('fem')");
    const fem = await app.popup('fem');
    await expectPopupWindow(app, fem, 'fem');
    await sleep(150);
    assert.match(await fem.eval("document.querySelector('#fem-error').textContent"), /지지/, 'no supports yet');
    const pick = (key, value) => fem.eval(`(() => { const s = document.querySelector('[data-fem-support="${key}"]'); s.value = '${value}'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await pick('0,0', 'fixed');
    await sleep(80);
    await pick('5000,0', 'fixed');
    await sleep(80);
    await fem.eval(`(() => { const s = document.querySelector('[data-stepper="fem:q"] .stepper-value'); s.value = '3'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(150);
    assert.equal(await fem.eval("document.querySelector('#fem-svg').dataset.ok"), 'true');
    assert.ok(Number(await fem.eval("document.querySelector('#fem-svg').dataset.deformed")) === 3);
    assert.match(await fem.eval("document.querySelector('#fem-moment').textContent"), /kN·m/);
    assert.deepEqual(await fem.eval(LAYOUT_CHECK), [], 'window fits');
    await fem.click('[data-action="fem-draw"]');
    await sleep(300);
    const d = await drawing(app);
    assert.deepEqual(d.fem.supports, { '0,0': 'fixed', '5000,0': 'fixed' });
    assert.equal(d.fem.q, 3);
    const results = d.entities.filter((e) => e.layer === 'fem');
    assert.ok(results.filter((e) => e.type === 'polyline').length >= 6, 'deformed shape and moments');
    assert.match(results.find((e) => e.type === 'text').text, /FEM/);
  } },
  { group: '3D solids', name: 'FEM plate stress window: plate with a hole, supports and loads per side → von Mises colours; results drawn on the FEM layer', async run(app) {
    await fresh(app);
    await m(app, "(k.actions.change('op.rect', (d) => { k.drawingModule.addEntity(d, 'rect', { x: 0, y: 0, width: 400, height: 200 }); k.drawingModule.addEntity(d, 'circle', { cx: 200, cy: 100, r: 30 }); }), 1)");
    await gone(app, 'plate');
    await fire(app, "k.run('femPlate')");
    const win = await app.popup('plate');
    await expectPopupWindow(app, win, 'plate');
    await sleep(150);
    assert.match(await win.eval("document.querySelector('#plate-error').textContent"), /지지/, 'no supports yet');
    // Four outer sides and the hole; the two 200 mm ends: one held, the other pulled.
    const rows = await win.eval("[...document.querySelectorAll('.plate-side-row')].map((r) => r.querySelector('span').textContent)");
    assert.equal(rows.length, 5);
    const ends = rows.map((text, i) => (/바깥 · 200/.test(text) ? i : -1)).filter((i) => i >= 0);
    assert.equal(ends.length, 2);
    await win.eval(`(() => { const s = document.querySelector('[data-plate-support="${ends[0]}"]'); s.value = 'fixed'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(120);
    await win.eval(`(() => { const s = document.querySelector('[data-plate-load="${ends[1]}:fx"]'); s.value = '20000'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await win.waitFor("document.querySelector('#plate-svg')?.dataset.ok === 'true'");
    assert.ok(Number(await win.eval("document.querySelector('#plate-svg').dataset.elements")) > 100);
    assert.equal(await win.eval("document.querySelector('#plate-svg').dataset.deformed"), '2');
    assert.match(await win.eval("document.querySelector('#plate-vm').textContent"), /MPa/);
    assert.deepEqual(await win.eval(LAYOUT_CHECK), [], 'window fits');
    await win.click('[data-action="plate-draw"]');
    await app.main.waitFor("window.__mycad.actions.activeDrawing().entities.some((e) => e.layer === 'fem')");
    const d = await drawing(app);
    assert.equal(d.plate.supports[ends[0]], 'fixed');
    assert.equal(d.plate.loads[ends[1]].fx, 20000);
    const results = d.entities.filter((e) => e.layer === 'fem');
    assert.equal(results.filter((e) => e.type === 'polyline').length, 2, 'deformed outer outline and hole');
    assert.ok(results.some((e) => e.type === 'text' && /판 FEM/.test(e.text)));
  } },
  { group: '3D solids', name: 'FEM solid window: cantilever clamped and loaded → displacement and stress colours, compared with CalculiX, deformed solid drawn', async run(app) {
    await fresh(app);
    await m(app, "(() => { const s = k.actions.insertSolid('box', { length: 200, width: 20, height: 20 }, { x: 0, y: 0 }); k.actions.select([s.id]); return 1; })()");
    await gone(app, 'fem3d');
    await fire(app, "k.run('fem3d')");
    const win = await app.popup('fem3d');
    await expectPopupWindow(app, win, 'fem3d');
    // Clamp the left end instead of the bottom; push the right end down.
    await win.click('[data-fem3d-fixed="zmin"]');
    await sleep(100);
    await win.click('[data-fem3d-fixed="xmin"]');
    await sleep(100);
    await win.eval(`(() => { const s = document.querySelector('[data-fem3d-load-face]'); s.value = 'xmax'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(100);
    await win.eval(`(() => { const i = document.querySelector('[data-fem3d-load="fz"]'); i.value = '-1000'; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await win.waitFor("document.querySelector('#fem3d-disp')");
    const disp = await win.eval("parseFloat(document.querySelector('#fem3d-disp').textContent)");
    const beam = (1000 * 200 ** 3) / (3 * 210000 * (20 * 20 ** 3 / 12));
    assert.ok(Math.abs(disp - beam) / beam < 0.08, `tip ${disp} vs ${beam}`);
    assert.ok(Number(await win.eval("document.querySelector('#fem3d-canvas').dataset.faces")) > 100);
    assert.deepEqual(await win.eval(LAYOUT_CHECK), [], 'window fits');
    await win.click('[data-action="close"]');
    // CalculiX (FreeCAD's ccx, found from FREECAD_CMD) through the app: the same answer.
    const options = { fixed: ['xmin'], loads: [{ face: 'xmax', fz: -1000 }], resolution: 24 };
    const ccx = await m(app, `k.actions.openFem3d({ action: 'ccx', fem3d: ${JSON.stringify(options)} }).then((r) => r.ccx ? { max: r.ccx.max, ours: r.max.displacement } : null)`);
    if (process.env.FREECAD_CMD) assert.ok(ccx, 'CalculiX ran (FREECAD_CMD is set)');
    if (ccx) assert.ok(Math.abs(ccx.max - ccx.ours) / ccx.ours < 0.02, `CalculiX ${ccx.max} vs ${ccx.ours}`);
    else assert.match(await notice(app), /CalculiX/, 'no ccx: says so');
    await m(app, `k.actions.openFem3d({ action: 'draw', fem3d: ${JSON.stringify(options)} }).then(() => 1)`);
    const d = await drawing(app);
    assert.ok(d.entities.some((e) => e.kind === 'mesh' && /FEM/.test(e.name)));
  } },
  { group: '3D solids', name: 'PartDesign: pocket (window), hole (counterbore), three-section loft, mesh decimation', async run(app) {
    await fresh(app);
    await m(app, "(() => { const a = k.actions; const box = a.insertSolid('box', { length: 100, width: 60, height: 30 }, { x: 0, y: 0 }); a.change('op.rect', (d) => { k.drawingModule.addEntity(d, 'rect', { x: 10, y: 10, width: 30, height: 20 }); k.drawingModule.addEntity(d, 'circle', { cx: 70, cy: 30, r: 3.3 }); }); const [r] = a.activeDrawing().entities.filter((e) => e.type === 'rect'); a.select([r.id, box.id]); return 1; })()");
    assert.equal(await m(app, "k.commands['solid:pocket'].enabled()"), true);
    await gone(app, 'solid');
    await fire(app, "k.run('solid:pocket')");
    const win = await app.popup('solid');
    await sleep(150);
    await win.eval(`(() => { const s = document.querySelector('[data-stepper="solid:depth"] .stepper-value'); s.value = '8'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(100);
    await win.click('[data-action="solid-apply"]');
    await sleep(400);
    let d = await drawing(app);
    const cut = d.entities.find((e) => e.type === 'solid');
    assert.equal(cut.kind, 'boolean');
    assert.equal(cut.shape.op, 'cut');
    const volume = () => m(app, "k.actions.solidProperties(k.actions.activeDrawing().entities.find((x) => x.type === 'solid')).volume");
    await m(app, "(k.actions.select([k.actions.activeDrawing().entities.find((x) => x.type === 'solid').id]), 1)");
    await sleep(200);
    const got = await volume();
    assert.ok(Math.abs(got - (180000 - 30 * 20 * 8)) < 2, `pocket 30×20×8 cut away: ${got}`);
    // Hole through the window's parameters (straight from the hook): a counterbore at the circle.
    await m(app, "(() => { const a = k.actions; const d = a.activeDrawing(); a.select([d.entities.find((x) => x.type === 'circle').id, d.entities.find((x) => x.type === 'solid').id]); return 1; })()");
    await gone(app, 'solid');
    await fire(app, "k.run('solid:hole')");
    const hole = await app.popup('solid');
    await sleep(150);
    assert.deepEqual(await hole.eval(LAYOUT_CHECK), [], 'hole window fits');
    await hole.click('[data-action="solid-apply"]');
    await sleep(400);
    d = await drawing(app);
    const drilled = d.entities.find((x) => x.type === 'solid');
    assert.equal(drilled.shape.parts.at(-1).kind, 'hole');
    assert.ok(Math.abs(drilled.shape.parts.at(-1).params.diameter - 6.6) < 1e-9, 'diameter from the circle');
    // A loft through three outlines picked in order, then decimated.
    await fresh(app);
    await m(app, "(() => { const a = k.actions; a.change('op.rect', (d) => { for (const s of [20, 8, 14]) k.drawingModule.addEntity(d, 'rect', { x: -s, y: -s, width: 2 * s, height: 2 * s }); }); const ids = a.activeDrawing().entities.map((e) => e.id); a.select(ids); return a.applyFeature('loft', a.featureSource('loft'), { height: 60, mode: 1 }) ? 1 : 0; })()");
    d = await drawing(app);
    assert.equal(d.entities[0].shape.sections.length, 3);
    await m(app, "(k.actions.select([k.actions.activeDrawing().entities[0].id]), k.actions.decimateSolids(k.actions.selectedSolids().map((e) => e.id)), 1)");
    assert.equal((await drawing(app)).entities[0].kind, 'mesh');
  } },
  { group: '3D solids', name: 'Robot: add a robot → inverse kinematics to a point → square trajectory (3D playback) + KRL', async run(app) {
    await fresh(app);
    await fire(app, "k.run('robot:add')");
    await sleep(200);
    let d = await drawing(app);
    const robot = d.entities.at(-1);
    assert.equal(robot.kind, 'robot');
    // A point in front of the robot: the tool tip goes there, pointing down.
    await m(app, `(() => { const a = k.actions; a.change('op.point', (dd) => { k.drawingModule.addEntity(dd, 'point', { x: 600, y: 200 }); }); a.select([${JSON.stringify(robot.id)}, a.activeDrawing().entities.at(-1).id]); a.robotMoveTo(); return 1; })()`);
    d = await drawing(app);
    const moved = d.entities.find((e) => e.id === robot.id);
    assert.notEqual(moved.params.a1, 0, 'joint 1 turned toward the point');
    // A square path: joint poses every 20 mm, played in the 3D view, KRL text.
    await m(app, `(() => { const a = k.actions; a.change('op.polyline', (dd) => { k.drawingModule.addEntity(dd, 'polyline', { points: [{ x: 450, y: -150 }, { x: 650, y: -150 }, { x: 650, y: 150 }, { x: 450, y: 150 }], closed: true }); }); a.select([${JSON.stringify(robot.id)}, a.activeDrawing().entities.at(-1).id]); return 1; })()`);
    await fire(app, "k.run('view3d')");
    await sleep(400);
    const run = await m(app, 'k.actions.robotTrajectory({ save: false }).then((r) => ({ reached: r.reached, steps: r.steps.length, text: r.text }))');
    assert.ok(run.reached, 'every point within reach');
    assert.equal(run.steps, 1 + 2 * 10 + 2 * 15);
    assert.match(run.text, /^DEF /);
    await fire(app, "k.run('view3d')");
    await sleep(200);
  } },
  { group: '3D solids', name: 'Assembly: base → part revolute joint, turned by the angle in the properties, follows when the base moves', async run(app) {
    await fresh(app);
    await m(app, "(() => { const a = k.actions; a.change('op.solid', (dd) => { k.drawingModule.addEntity(dd, 'solid', { kind: 'box', name: 'frame', params: { length: 100, width: 100, height: 600 } }); k.drawingModule.addEntity(dd, 'solid', { kind: 'box', name: 'door', params: { length: 500, width: 30, height: 580 }, x: 100, y: 0, z: 10 }); }); const ids = a.activeDrawing().entities.map((e) => e.id); a.select(ids); return 1; })()");
    await chooseMenuItem(await openMenu(app, 'solid'), 'joint:revolute');
    await app.main.waitFor('window.__mycad.actions.activeDrawing().joints?.length === 1');
    let d = await drawing(app);
    assert.equal(d.joints.length, 1);
    assert.equal(d.joints[0].type, 'revolute');
    // The door alone selected: its joint row turns it.
    const door = d.entities.find((e) => e.name === 'door');
    await fire(app, `k.actions.select([${JSON.stringify(door.id)}])`);
    await sleep(200);
    await app.main.eval(`(() => { const i = document.querySelector('#right-panel [data-joint-value$=":angle"]'); i.value = '90'; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await app.main.waitFor("Math.abs((window.__mycad.actions.activeDrawing().entities.find((e) => e.name === 'door')?.rz ?? 0) - 90) < 1e-6");
    d = await drawing(app);
    let moved = d.entities.find((e) => e.name === 'door');
    assert.ok(Math.abs(moved.rz - 90) < 1e-6, 'turned on its hinge');
    const frame = d.entities.find((e) => e.name === 'frame');
    await m(app, `(k.actions.change('op.move', (dd) => k.drawingModule.updateEntity(dd, ${JSON.stringify(frame.id)}, { x: 1000 })), 1)`);
    d = await drawing(app);
    moved = d.entities.find((e) => e.name === 'door');
    assert.ok(Math.abs(moved.x - 1100) < 1e-6, 'follows its base');
  } },
  { group: '3D solids', name: 'Assembly animation: a moving sample plays in 3D when opened; the piston moves; slider, pause, keep the pose', async run(app) {
    await fresh(app);
    await m(app, "(k.actions.openSample('25-crank-engine.mcad'), 1)");
    await app.main.waitFor("window.__mycad.actions.animState().playing && document.querySelector('.anim-bar')");
    // The piston (a mesh moved by a transform from where it was built) goes up and down while the drawing stays put.
    const pistonZ = `(() => { const v = window.__mycad.actions.view3d(); const e = window.__mycad.actions.activeDrawing().entities.find((x) => x.name === 'Piston'); const o = v.model.children.find((c) => c.userData.entity === e.id && c.isMesh); o.updateMatrixWorld(); return e.z + o.matrixWorld.elements[14]; })()`;
    const seen = new Set();
    for (let i = 0; i < 8; i++) { seen.add(Math.round(await app.main.eval(pistonZ))); await sleep(120); }
    assert.ok(seen.size >= 3, `piston moves: ${[...seen]}`);
    const before = await drawing(app);
    assert.equal(before.entities.find((e) => e.name === 'Piston').z, 160, 'the drawing is not changed by playing');
    // Scrubbing pauses and shows that moment: a quarter turn puts the crank pin level with the shaft.
    await app.main.eval(`(() => { const s = document.querySelector('#anim-time'); s.value = '0.5'; s.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
    await sleep(150);
    assert.equal(await m(app, 'k.actions.animState().playing'), false);
    assert.match(await app.main.eval("document.querySelector('#anim-clock').textContent"), /0\.5/);
    const expected = Math.sqrt(140 ** 2 - 40 ** 2) - 20;
    const at90 = await app.main.eval(pistonZ);
    assert.ok(Math.abs(at90 - expected) < 0.01, `piston at √(L² − r²) at 90°: ${at90} vs ${expected}, ${await m(app, 'JSON.stringify(k.actions.animState().joints.map((j) => [j.id, j.angle, j.offset]))')}`);
    await app.main.click('[data-anim="mode:bounce"]');
    assert.equal((await drawing(app)).animation.mode, 'bounce');
    // Keeping the pose writes the joint values (one undo step) and the parts move in the drawing.
    await app.main.click('[data-anim="keep"]');
    await sleep(200);
    const kept = await drawing(app);
    assert.ok(Math.abs(kept.entities.find((e) => e.name === 'Piston').z - expected) < 0.01);
    assert.equal(await m(app, 'k.actions.animState().active'), false);
    for (const file of ['25-crank-engine', '26-four-bar', '27-gear-train', '28-screw-vise', '29-robot-arm', '30-room-doors']) {
      await m(app, `(k.actions.openSample('${file}.mcad'), 1)`);
      await app.main.waitFor("window.__mycad.actions.animState().playing");
      await sleep(900);
      assert.deepEqual(await m(app, 'k.actions.animState().failed'), [], `${file} solves`);
      await m(app, '(k.actions.stopAnimation(), 1)');
    }
  } },
  { group: '3D solids', name: 'Working plane on a face: clicking a box\'s front face in 3D sets the plane; a rectangle drawn on it extrudes from the face', async run(app) {
    await fresh(app);
    await m(app, "(k.actions.insertSolid('box', { length: 100, width: 60, height: 40 }, { x: 0, y: 0 }), k.actions.select([]), 1)");
    await fire(app, 'k.actions.pickWorkPlaneFace()');
    await app.main.waitFor('Boolean(window.__mycad.actions.view3d())');
    await sleep(300);
    // The front face (y = 0, normal −y) at its middle, on the screen.
    const at = await app.main.eval(`(() => { const v = window.__mycad.actions.view3d(); const p = new (v.camera.position.constructor)(50, 0, 20).project(v.camera); const r = v.canvas.getBoundingClientRect(); return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height }; })()`);
    await app.main.realClick(at.x, at.y);
    await app.main.waitFor('Boolean(window.__mycad.actions.activeDrawing().workPlane?.frame)');
    const wp = (await drawing(app)).workPlane;
    assert.deepEqual(wp.frame.z.map((v) => Math.round(v)), [0, -1, 0], 'the front face');
    assert.ok(Math.abs(wp.frame.origin[1]) < 1e-6);
    // A 20 × 10 rectangle at (0, 0) on the plane, padded 15: it stands out of the face.
    await m(app, "(() => { const a = k.actions; const r = a.change('op.rect', (d) => k.drawingModule.addEntity(d, 'rect', { x: 0, y: 0, width: 20, height: 10 })); a.select([r.id]); a.applyFeature('pad', a.featureSource('pad'), { height: 15 }); return 1; })()");
    const d = await drawing(app);
    const pad = d.entities.find((e) => e.type === 'solid' && e.kind === 'pad');
    const box = await m(app, `(() => { const e = k.actions.activeDrawing().entities.find((x) => x.kind === 'pad'); const s = k.actions.solidProperties(e); return [s.sizeX, s.sizeY, s.sizeZ]; })()`);
    assert.deepEqual(box.map((v) => Math.round(v)), [20, 15, 10], 'out of the face along −y');
    assert.ok(pad.y <= 1e-6, 'in front of the box');
    await fire(app, "k.run('workPlaneReset')");
  } },
  { group: '3D solids', name: 'OpenCASCADE: exact boolean volumes; picking one edge in 3D with the mouse to fillet (topological naming)', async run(app) {
    await fresh(app);
    await app.main.waitFor('window.__mycad.actions.kernelState().ready', { timeout: 30000 });
    // A plate with a hole: the exact volume (not the mesh's).
    const volume = await m(app, `(() => { const a = k.actions; const e = a.change('op.solid', (d) => k.drawingModule.addEntity(d, 'solid', { kind: 'boolean', name: 'Plate', params: {}, shape: { op: 'cut', parts: [{ kind: 'box', params: { length: 100, width: 60, height: 30 } }, { kind: 'cylinder', params: { radius: 12, height: 40, angle: 360 }, x: 50, y: 30, z: -5 }] } })); return a.solidProperties(e).volume; })()`);
    assert.ok(Math.abs(volume - (100 * 60 * 30 - Math.PI * 144 * 30)) < 1e-6, `exact ${volume}`);
    // A fillet whose one edge is picked in the 3D view with the mouse.
    await m(app, `(() => { const a = k.actions; a.change('op.solid', (d) => { d.entities = []; }); const e = a.change('op.solid', (d) => k.drawingModule.addEntity(d, 'solid', { kind: 'fillet', name: 'Round', params: { size: 5, edges: 0 }, shape: { base: { kind: 'box', params: { length: 40, width: 30, height: 20 } } } })); a.select([e.id]); return 1; })()`);
    await fire(app, 'k.actions.toggleEdgePick(true)');
    await app.main.waitFor("window.__mycad.actions.view3d()?.edgePick?.edges.length === 12");
    // Where the vertical edge at (40, 30) is on the screen.
    const at = await app.main.eval(`(() => { const v = window.__mycad.actions.view3d(); const e = v.edgePick.edges.find((x) => Math.abs(x.mid[0] - 40) < 1e-6 && Math.abs(x.mid[1] - 30) < 1e-6); const p = new (v.camera.position.constructor)(...e.points[12]).project(v.camera); const r = v.canvas.getBoundingClientRect(); return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height }; })()`);
    await app.main.realClick(at.x, at.y);
    await app.main.waitFor("window.__mycad.actions.activeDrawing().entities[0].shape.picks?.length === 11");
    // Clicked on a picked edge (all twelve were in the "all edges" group): it left the list. Keep only that one.
    await m(app, `(() => { const a = k.actions; const e = a.activeDrawing().entities[0]; const v = a.view3d(); const edge = v.edgePick.edges.find((x) => Math.abs(x.mid[0] - 40) < 1e-6 && Math.abs(x.mid[1] - 30) < 1e-6); a.change('op.edges', (d) => k.drawingModule.updateEntity(d, e.id, { shape: { ...e.shape, picks: [{ mid: edge.mid, dir: edge.dir }] } })); return 1; })()`);
    const one = await m(app, 'k.actions.solidProperties(k.actions.activeDrawing().entities[0]).volume');
    assert.ok(Math.abs(one - (40 * 30 * 20 - (25 - Math.PI * 25 / 4) * 20)) < 1e-6, `one edge ${one}`);
    // The box made longer: the fillet stays on that corner.
    await m(app, `(() => { const a = k.actions; const e = a.activeDrawing().entities[0]; a.change('op.solid', (d) => k.drawingModule.updateEntity(d, e.id, { shape: { ...e.shape, base: { ...e.shape.base, params: { ...e.shape.base.params, length: 50 } } } })); return 1; })()`);
    const longer = await m(app, 'k.actions.solidProperties(k.actions.activeDrawing().entities[0]).volume');
    assert.ok(Math.abs(longer - (50 * 30 * 20 - (25 - Math.PI * 25 / 4) * 20)) < 1e-6, `after the change ${longer}`);
    await fire(app, 'k.actions.toggleEdgePick(false)');
  } },
  { group: '3D solids', name: 'Section and projection windows: outlines; hidden lines on the hidden layer', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.insertSolid('cylinder', { radius: 10, height: 20 }, { x: 0, y: 0 }), k.actions.select([]), 1)`);
    await fire(app, `k.run('solidSection')`);
    const section = await app.popup('solid');
    await expectPopupWindow(app, section, 'solid');
    assert.ok(Number(await section.eval(`document.querySelector('#section-count').textContent`)) > 10);
    await section.click('[data-action="solid-apply"]');
    await sleep(300);
    const outline = (await drawing(app)).entities.at(-1);
    assert.equal(outline.type, 'polyline');
    assert.ok(outline.closed && outline.points.every((p) => Math.abs(Math.hypot(p.x, p.y) - 10) < 0.05), 'a circle of r 10');
    // A plate with a hole: the bore shows as hidden lines in the front and side views.
    await m(app, `(() => { const a = k.actions; a.select([]); a.change('op.delete', (d) => { d.entities = []; }); const plate = a.insertSolid('box', { length: 40, width: 30, height: 10 }, {}); const drill = a.insertSolid('cylinder', { radius: 5, height: 30 }, { x: 20, y: 15, z: -10 }); a.select([plate.id, drill.id]); a.booleanSelection('cut'); a.select([]); return 1; })()`);
    await fire(app, `k.run('solidProject')`);
    const project = await app.popup('solid');
    await expectPopupWindow(app, project, 'solid');
    await project.click('[data-action="solid-apply"]');
    await sleep(500);
    const d = await drawing(app);
    const hidden = d.entities.filter((e) => e.type === 'polyline' && e.layer === 'hidden');
    assert.ok(hidden.length > 0, 'hidden lines on the hidden layer');
    assert.equal(d.entities.filter((e) => e.type === 'text').length, 3, 'names of the three views chosen by default (front, top, right)');
  } },
  { group: '3D solids', name: '3D view: a colour per solid, selection highlight, 2D sheet hidden', async run(app) {
    await fresh(app);
    await m(app, `(() => { const a = k.actions; a.change('op.rect', (d) => k.drawingModule.addEntity(d, 'rect', { x: -60, y: -60, width: 30, height: 30 })); a.insertSolid('box', {}, { x: 0, y: 0 }); a.insertSolid('sphere', { radius: 8 }, { x: 40, y: 0, z: 8 }); a.select([]); return 1; })()`);
    await m(app, `k.actions.toggle3d(true).then(() => 1)`);
    await app.main.waitFor(`window.__mycad.actions.view3d() && document.querySelector('.view3d-bar')`, { timeout: 30000 });
    await sleep(400);
    let info = await m(app, 'k.actions.view3d().inspect()');
    assert.equal(info.parts3d.length, 2, 'two solids');
    assert.notEqual(info.parts3d[0].color, info.parts3d[1].color, 'each its own colour');
    const sphereId = await m(app, `k.actions.activeDrawing().entities.at(-1).id`);
    await m(app, `(k.actions.select([${JSON.stringify(sphereId)}].map(String)), 1)`);
    await sleep(300);
    info = await m(app, 'k.actions.view3d().inspect()');
    const accent = await app.main.eval(`getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toLowerCase()`);
    assert.equal(info.parts3d.find((p) => p.id === sphereId).color, accent, 'the selected solid in the accent colour');
    const withPlates = info.triangles;
    await app.main.click('[data-view3d="extrude2d"]');
    await sleep(300);
    assert.ok((await m(app, 'k.actions.view3d().inspect()')).triangles < withPlates, '2D outlines no longer shown as plates');
    await app.main.click('[data-view3d="extrude2d"]');
    await m(app, `(k.actions.toggle3d(false), 1)`);
  } },
  { group: '3D solids', name: 'Opening FreeCAD files: .FCStd, .step, .3mf, .stl (made by FreeCAD)', async run(app) {
    const dir = path.join(root, 'samples', 'freecad').replace(/\\/g, '/');
    const volumes = JSON.parse(fs.readFileSync(path.join(dir, 'freecad-volumes.json'), 'utf8'));
    for (const file of ['freecad-assembly.FCStd', 'freecad-bracket.step', 'freecad-bracket.3mf', 'freecad-bracket.stl']) {
      await m(app, `k.actions.openPath(${JSON.stringify(`${dir}/${file}`)}).then(() => 1)`);
      await sleep(200);
      const info = await m(app, `(() => { const d = k.actions.activeDrawing(); return { title: d.title, solids: d.entities.filter((e) => e.type === 'solid').length }; })()`);
      assert.ok(info.solids >= 1, `${file}: ${JSON.stringify(info)}`);
      assert.equal(info.title, file.replace(/\.[^.]+$/, ''));
      void volumes;
    }
    const assembly = await m(app, `(() => { const doc = k.state.docs.find((x) => x.name === 'freecad-assembly.FCStd'); return doc.drawing.entities.filter((e) => e.type === 'solid').map((e) => e.kind); })()`);
    assert.ok(assembly.includes('boolean') && assembly.includes('pad') && assembly.includes('revolution') && assembly.includes('mesh'), JSON.stringify(assembly));
    while (await m(app, 'k.state.docs.length') > 3) await m(app, 'k.actions.closeDoc(k.actions.activeDoc(), { force: true })');
  } },
  { group: '3D solids', name: '3D formats in the export menu + FCStd bytes imported again', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.insertSolid('box', { length: 10, width: 20, height: 30 }, { x: 5 }), 1)`);
    await app.main.click('#toolbar [data-command="exportMenu"]');
    const menu = await app.popup('menu');
    await menu.waitFor(`document.querySelector('.menu-item')`);
    const ids = await menu.eval(`[...document.querySelectorAll('.menu-item')].map((i) => i.dataset.id)`);
    for (const id of ['exportStl', 'export3d:3mf', 'export3d:step', 'export3d:fcstd', 'export3d:obj']) assert.ok(ids.includes(id), id);
    await menu.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); 1`);
    await sleep(200);
    const back = await m(app, `(() => { const d = k.actions.activeDrawing(); const bytes = k.actions.exportMesh('fcstd', d, d.entities); k.actions.importModelBytes('copy.FCStd', bytes); return k.actions.activeDrawing().entities.filter((e) => e.type === 'solid').map((e) => [e.kind, e.params.height, e.x]); })()`);
    assert.deepEqual(back, [['box', 30, 5], ['box', 30, 5]], 'the FCStd copy is the same parametric box');
  } },
  { group: 'BIM', name: 'Steel profiles, L-shaped stairs (window), shaped rebar, schedule CSV, panel nesting', async run(app) {
    await fresh(app);
    // A stair from its window: L-shaped.
    await gone(app, 'solid');
    await fire(app, "k.run('arch:stairs')");
    const win = await app.popup('solid');
    await sleep(150);
    await win.click('[data-solid-choice="stairType"][data-value="1"]');
    await sleep(120);
    assert.deepEqual(await win.eval(LAYOUT_CHECK), [], 'stairs window fits');
    await win.click('[data-action="solid-apply"]');
    await sleep(300);
    let d = await drawing(app);
    assert.equal(d.entities.at(-1).params.stairType, 1);
    // A column of a standard section, a drawn bar, two panels.
    await m(app, "(() => { const a = k.actions; a.insertSolid('column', { height: 3000, preset: 2 }, { x: 5000, y: 0 }); a.change('op.line', (dd) => { k.drawingModule.addEntity(dd, 'polyline', { points: [{ x: 0, y: -3000 }, { x: 2000, y: -3000 }, { x: 2000, y: -2000 }] }); }); a.select([a.activeDrawing().entities.at(-1).id]); return a.addRebar({ diameter: 16, bars: 2, spacing: 150 }).then(() => 1); })()");
    d = await drawing(app);
    const bar = d.entities.at(-1);
    assert.equal(bar.kind, 'rebar');
    assert.ok(bar.shape.path.length === 3, 'a bar along the drawn polyline');
    const csv = await m(app, 'k.actions.scheduleCsv()');
    assert.ok(csv.startsWith('﻿'), 'UTF-8 BOM for Excel');
    assert.equal(csv.trim().split('\r\n').length, 4, 'header + stairs + column + rebar');
    await m(app, "(() => { const a = k.actions; a.change('op.rect', (dd) => { k.drawingModule.addEntity(dd, 'rect', { x: 0, y: 5000, width: 1200, height: 800 }); k.drawingModule.addEntity(dd, 'rect', { x: 0, y: 7000, width: 1500, height: 600 }); }); const ids = a.activeDrawing().entities.filter((e) => e.type === 'rect').map((e) => e.id); a.select(ids); a.nestSelection(); return 1; })()");
    d = await drawing(app);
    assert.ok(d.layers.some((l) => l.id === 'nesting'));
    assert.equal(d.entities.filter((e) => e.layer === 'nesting' && e.type === 'polyline').length, 2);
  } },
  { group: 'BIM', name: 'Wall: polyline selected → wall window (preview, thickness, height) → 3D wall; the plan shows a hatched cut', async run(app) {
    await fresh(app);
    await gone(app, 'solid');
    await m(app, `(k.actions.change('op.polyline', (d) => k.drawingModule.addEntity(d, 'polyline', { points: [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }] })), k.actions.select(k.actions.activeDrawing().entities.map((e) => e.id)), 1)`);
    await app.main.click('#left-panel [data-command="arch:wall"]');
    const win = await app.popup('solid');
    await expectPopupWindow(app, win, 'solid');
    const preview = await win.eval(`(() => { const s = document.querySelector('#solid-preview svg'); return s ? Number(s.dataset.faces) : 0; })()`);
    assert.ok(preview > 0, 'shaded preview of the wall');
    const set = (key, value) => win.eval(`(() => { const s = document.querySelector('[data-stepper="${key}"] .stepper-value'); s.value = '${value}'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await set('solid:width', 250);
    await set('solid:height', 3000);
    await win.click('[data-solid-choice="align"][data-value="1"]');
    await sleep(120);
    assert.deepEqual(await win.eval(LAYOUT_CHECK), [], 'the wall window fits');
    await win.click('[data-action="solid-apply"]');
    await sleep(300);
    const d = await drawing(app);
    assert.equal(d.entities.length, 1, 'the polyline became the wall');
    const w = d.entities[0];
    assert.deepEqual([w.kind, w.params.width, w.params.height, w.params.align, w.shape.path.length], ['wall', 250, 3000, 1, 3]);
    const panel = await app.main.eval(`document.querySelector('#right-panel').textContent`);
    assert.match(panel, /벽 면적/);
    assert.match(panel, /정렬/);
    const hatch = await m(app, `k.actions.planOf(k.actions.activeDrawing().entities[0]).filter((p) => p.thin).length`);
    assert.ok(hatch > 20, `cut wall hatched in plan (${hatch})`);
  } },
  { group: 'BIM', name: 'Windows and doors: wall selected → insert window → edit openings (add door, double door, width) → the wall is cut', async run(app) {
    await fresh(app);
    await m(app, `(() => { const a = k.actions; a.change('op.polyline', (d) => k.drawingModule.addEntity(d, 'polyline', { points: [{ x: 0, y: 0 }, { x: 8000, y: 0 }] })); a.select(a.activeDrawing().entities.map((e) => e.id)); return a.archFeature('wall', { width: 200, height: 2700 }).then(() => 1); })()`);
    assert.equal(await m(app, `k.commands['arch:window'].enabled()`), true, 'a wall is selected');
    await fire(app, `k.run('arch:window')`);
    const win = await app.popup('solid');
    await expectPopupWindow(app, win, 'solid');
    assert.equal(await win.eval(`document.querySelectorAll('.opening-chip').length`), 1);
    assert.equal(await win.eval(`document.querySelector('.opening-chip.active') !== null`), true, 'the new window is chosen');
    await win.click('[data-opening-add="door"]');
    await sleep(100);
    assert.equal(await win.eval(`document.querySelectorAll('.opening-chip').length`), 2);
    assert.equal(await win.eval(`document.querySelectorAll('.opening-chip')[1].classList.contains('active')`), true, 'the added door is chosen');
    await win.click('[data-opening-choice="1.type"][data-value="2"]');
    await sleep(80);
    await win.click('[data-opening-pick="0"]');
    await sleep(80);
    await win.eval(`(() => { const s = document.querySelector('[data-stepper="opening:0.width"] .stepper-value'); s.value = '1800'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(120);
    assert.deepEqual(await win.eval(LAYOUT_CHECK), [], 'the openings editor fits');
    const volumeText = await win.eval(`document.querySelector('.part-info').textContent`);
    await win.click('[data-action="solid-apply"]');
    await sleep(300);
    const w = (await drawing(app)).entities[0];
    assert.deepEqual(w.shape.openings.map((o) => o.type), ['window', 'doubleDoor']);
    assert.equal(w.shape.openings[0].width, 1800);
    assert.ok(/m³/.test(volumeText), volumeText);
    const props = await m(app, `k.actions.solidProperties(k.actions.activeDrawing().entities[0])`);
    assert.deepEqual([props.windows, props.doors], [1, 1]);
    assert.ok(Math.abs(props.wallArea - (8000 * 2700 - 1800 * 1300 - 1600 * 2100)) < 1, `wall area ${props.wallArea}`);
  } },
  { group: '3D', name: 'Selection in 3D, properties, move handle (drag) and rotate handle → one undo', async run(app) {
    await fresh(app);
    await m(app, `(() => { const a = k.actions; const box = a.insertSolid('box', { length: 40, width: 30, height: 20 }, {}); a.select([box.id]); return 1; })()`);
    await m(app, 'k.actions.toggle3d(true).then(() => 1)');
    await app.main.waitFor(`window.__mycad.actions.view3d() && document.querySelector('.view3d-bar')`, { timeout: 30000 });
    await sleep(500);
    const id = await m(app, 'k.actions.activeDrawing().entities[0].id');
    let info = await m(app, 'k.actions.view3d().inspect()');
    assert.equal(info.handle?.entity, id, 'the handle sits on the selected solid');
    assert.equal(info.handle.mode, 'translate');
    assert.match(await app.main.eval(`document.querySelector('#right-panel').textContent`), /길이/, 'its properties show on the right');
    // Drag the X arrow with the mouse: from just off the origin along the arrow's screen direction.
    const p = await m(app, `(() => { const v = k.actions.view3d(); const r = v.canvas.getBoundingClientRect(); const pr = (x, y, z) => { const q = new v.pivot.position.constructor(x, y, z).project(v.camera); return { x: r.left + (q.x + 1) / 2 * r.width, y: r.top + (1 - q.y) / 2 * r.height }; }; const size = v.camera.position.distanceTo(v.pivot.position) * 0.12; return { a: pr(size * 0.55, 0, 0), b: pr(size * 1.6, 0, 0) }; })()`);
    await app.main.drag(p.a, p.b, 14);
    await sleep(300);
    const x = await m(app, 'k.actions.activeDrawing().entities[0].x');
    assert.ok(x > 0, `dragging the X arrow moved the box (x = ${x})`);
    assert.equal(await m(app, 'k.actions.activeDrawing().entities[0].y'), 0, 'only along X');
    // The rotate handle (about Z), committed as one change.
    await app.main.click('[data-view3d="handle:rotate"]');
    info = await m(app, 'k.actions.view3d().inspect()');
    assert.equal(info.handle.mode, 'rotate');
    await m(app, `(() => { const v = k.actions.view3d(); v.pivot.rotation.z = Math.PI / 2; v.followHandle(); v.transform.dispatchEvent({ type: 'dragging-changed', value: false }); return 1; })()`);
    await sleep(200);
    assert.equal(Math.round(await m(app, 'k.actions.activeDrawing().entities[0].rz')), 90);
    await m(app, `(k.run('undo'), 1)`);
    assert.equal(Math.round(await m(app, 'k.actions.activeDrawing().entities[0].rz')), 0, 'one undo step');
    await app.main.click('[data-view3d="handle:move"]');
    await m(app, `(k.actions.toggle3d(false), 1)`);
  } },
  { group: '3D', name: '10 3D view styles: sketch, X-ray, hidden line, clay, points…; kept in the settings', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.insertSolid('box', { length: 40, width: 30, height: 20 }, {}), k.actions.insertSolid('cylinder', { radius: 8, height: 30 }, { x: 60 }), k.actions.select([]), 1)`);
    await m(app, 'k.actions.toggle3d(true).then(() => 1)');
    await app.main.waitFor(`window.__mycad.actions.view3d() && document.querySelector('.view3d-bar')`, { timeout: 30000 });
    const seen = {};
    for (const style of ['asis', 'shaded', 'flat', 'clay', 'hidden', 'xray', 'sketch', 'wireframe', 'mesh', 'points']) {
      await m(app, `(k.actions.setView3dStyle('${style}'), 1)`);
      await sleep(120);
      const info = await m(app, 'k.actions.view3d().inspect()');
      assert.equal(info.style, style);
      assert.equal(await m(app, 'k.state.settings.view3dStyle'), style, 'kept in the settings');
      assert.ok((await app.main.eval(`document.querySelector('[data-view3d="styleMenu"]').title`)).length > 3, 'the style button names the style');
      seen[style] = info;
    }
    assert.ok(seen.sketch.styleObjects.includes('style-sketch') && seen.sketch.background === '#f5f1e6', 'pencil strokes on paper');
    assert.ok(seen.points.styleObjects.includes('style-points'), 'points');
    assert.equal(seen.mesh.wireframe, true);
    assert.deepEqual(seen.asis.styleObjects, []);
    assert.equal(seen.flat.light.sunShown, false, 'no shading: no sun');
    await m(app, "(k.actions.setView3dStyle('flat'), 1)");
    await app.main.click('[data-view3d="light"]');
    await sleep(200);
    const lit = await m(app, 'k.actions.view3d().inspect()');
    assert.deepEqual([lit.style, lit.light.sunShown], ['asis', true], 'switching the light on goes back to the usual model');
    // Picking still works in the edge-only styles.
    await m(app, `(k.actions.setView3dStyle('wireframe'), 1)`);
    assert.equal((await m(app, 'k.actions.view3d().inspect()')).parts3d.length, 2);
    await m(app, `(k.actions.setView3dStyle('asis'), k.actions.toggle3d(false), 1)`);
  } },
  { group: 'BIM', name: '3D view: wall colours, translucent glass, wooden frames; spaces as faint volumes', async run(app) {
    await fresh(app);
    await m(app, `(() => { const a = k.actions; a.change('op.rect', (d) => k.drawingModule.addEntity(d, 'rect', { x: 0, y: 0, width: 6000, height: 4000 })); a.select(a.activeDrawing().entities.map((e) => e.id)); return a.archFeature('wall', { width: 200, height: 2700 }).then(() => 1); })()`);
    await m(app, `(() => { const a = k.actions; const w = a.activeDrawing().entities[0]; a.change('op.editSolid', (d) => k.drawingModule.updateEntity(d, w.id, { shape: { ...w.shape, openings: [{ type: 'window', at: 1000, width: 1500, height: 1300, sill: 900, swing: 1, hinge: 1 }] } })); a.change('op.rect', (d) => k.drawingModule.addEntity(d, 'rect', { x: 100, y: 100, width: 5800, height: 3800 })); a.select([a.activeDrawing().entities.at(-1).id]); return a.archFeature('space', { height: 2400 }).then(() => (a.select([]), 1)); })()`);
    await m(app, `k.actions.toggle3d(true).then(() => 1)`);
    await app.main.waitFor(`window.__mycad.actions.view3d() && document.querySelector('.view3d-bar')`, { timeout: 30000 });
    await sleep(400);
    const info = await m(app, 'k.actions.view3d().inspect()');
    const colors = info.parts3d.map((p) => p.color);
    for (const color of ['#e6e1d6', '#8cc4ec', '#a8763e', '#79d29a']) assert.ok(colors.includes(color), `${color} in ${colors.join(', ')}`);
    await m(app, `(k.actions.toggle3d(false), 1)`);
  } },
  { group: 'BIM', name: 'Slab, roof, space, stairs, column, furniture, axes → schedule; BIM menu and panel', async run(app) {
    await fresh(app);
    await m(app, `(async () => {
      const a = k.actions;
      const pick = () => a.select([a.activeDrawing().entities.at(-1).id]);
      a.change('op.rect', (d) => k.drawingModule.addEntity(d, 'rect', { x: 0, y: 0, width: 6000, height: 4000 })); pick(); await a.archFeature('wall', { width: 200, height: 2700 });
      a.change('op.rect', (d) => k.drawingModule.addEntity(d, 'rect', { x: -100, y: -100, width: 6200, height: 4200 })); pick(); await a.archFeature('slab', { thickness: 200 });
      a.change('op.rect', (d) => k.drawingModule.addEntity(d, 'rect', { x: 0, y: 0, width: 6000, height: 4000 })); pick(); await a.archFeature('roof', { roofType: 1, slope: 30, overhang: 400, thickness: 200 });
      a.change('op.rect', (d) => k.drawingModule.addEntity(d, 'rect', { x: 100, y: 100, width: 5800, height: 3800 })); pick(); await a.archFeature('space', { height: 2400 });
      a.insertSolid('stairs', { length: 3000, width: 1000, height: 2700, steps: 15 }, { x: 500, y: 500 });
      a.insertSolid('column', { width: 300, depth: 300, height: 2700 }, { x: 3000, y: 2000 });
      a.insertSolid('equipment', { equipment: 0, length: 2000, width: 1500, height: 900 }, { x: 3500, y: 500 });
      a.insertSolid('axis', { countX: 3, spacingX: 3000, countY: 2, spacingY: 4000 }, {});
      a.select([]);
      return 1;
    })()`);
    const kinds = (await drawing(app)).entities.map((e) => e.kind);
    assert.deepEqual([...kinds].sort(), ['axis', 'column', 'equipment', 'roof', 'slab', 'space', 'stairs', 'wall']);
    await fire(app, `k.run('archSchedule')`);
    await sleep(300);
    const table = (await drawing(app)).entities.at(-1);
    assert.equal(table.type, 'text');
    for (const word of ['BIM 물량표', '벽 1개', '슬래브 1개', '지붕 1개', '실 1개', '기둥 1개', '계단 1개', '가구·설비 1개']) assert.ok(table.text.includes(word), word);
    // The BIM menu (menu bar) and the left panel section.
    const menu = await openMenu(app, 'arch');
    const ids = await menu.eval(`[...document.querySelectorAll('.menu-item')].flatMap((i) => [i.dataset.id, ...(i.dataset.contains ?? '').split(' ')])`);
    for (const id of ['arch:wall', 'arch:window', 'arch:door', 'arch:curtainwall', 'arch:column', 'arch:beam', 'arch:slab', 'arch:stairs', 'arch:roof', 'arch:railing', 'arch:space', 'arch:equipment', 'arch:axis', 'archSchedule']) assert.ok(ids.includes(id), id);
    await menu.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); 1`);
    await sleep(200);
    assert.ok(await app.main.eval(`document.querySelectorAll('#left-panel [data-command^="arch:"]').length`) >= 13, 'BIM tiles in the left panel');
  } },
  { group: 'BIM', name: 'IFC: the sample IFC opens as BIM objects; IFC in the 3D export menu', async run(app) {
    const file = path.join(root, 'samples', 'exports', '18-house-3d.ifc').replace(/\\/g, '/');
    await m(app, `k.actions.openPath(${JSON.stringify(file)}).then(() => 1)`);
    await sleep(300);
    const kinds = await m(app, `[...new Set(k.actions.activeDrawing().entities.map((e) => e.kind))].sort()`);
    for (const kind of ['wall', 'slab', 'roof', 'space', 'stairs', 'equipment', 'column', 'axis']) assert.ok(kinds.includes(kind), `${kind} in ${kinds}`);
    const outer = await m(app, `k.actions.activeDrawing().entities.find((e) => e.name === '외벽').shape.openings.length`);
    assert.equal(outer, 9, 'the outer wall keeps its windows and doors');
    while (await m(app, 'k.state.docs.length') > 3) await m(app, 'k.actions.closeDoc(k.actions.activeDoc(), { force: true })');
    await fresh(app);
    await m(app, `(k.actions.insertSolid('column', {}, {}), 1)`);
    await app.main.click('#toolbar [data-command="exportMenu"]');
    const menu = await app.popup('menu');
    await menu.waitFor(`document.querySelector('.menu-item')`);
    assert.ok((await menu.eval(`[...document.querySelectorAll('.menu-item')].map((i) => i.dataset.id)`)).includes('export3d:ifc'));
    await menu.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); 1`);
    await sleep(200);
  } },
  { group: 'BIM', name: 'Levels: building tree, add a level, plan level, building window (changing a level elevation moves its objects; materials)', async run(app) {
    await fresh(app);
    await m(app, `(async () => { const a = k.actions; a.change('op.rect', (d) => k.drawingModule.addEntity(d, 'rect', { x: 0, y: 0, width: 6000, height: 4000 })); a.select([a.activeDrawing().entities.at(-1).id]); await a.archFeature('wall', { width: 200, height: 3000 }); return 1; })()`);
    assert.equal(await m(app, `k.actions.activeDrawing().entities[0].level`), 'L1', 'a new BIM object stands on level 1');
    assert.ok(await app.main.eval(`document.querySelectorAll('#left-panel [data-level-active]').length`) === 1, 'the building tree lists the level');
    await app.main.click('#left-panel [data-level-add]');
    await sleep(200);
    assert.equal(await m(app, `k.actions.activeDrawing().bim.activeLevel`), 'L2', 'the new level is where new objects go');
    await m(app, `(k.actions.insertSolid('column', { width: 400, depth: 400, height: 3000 }, { x: 0, y: 0 }), 1)`);
    const column = await m(app, `(() => { const e = k.actions.activeDrawing().entities.at(-1); return [e.level, e.z]; })()`);
    assert.deepEqual(column, ['L2', 3000], 'on level 2, raised by its elevation');
    await app.main.click('#left-panel [data-level-plan="L1"]');
    await sleep(200);
    assert.equal(await m(app, `k.actions.activeDrawing().entities.filter((e) => k.drawingModule.isVisible(k.actions.activeDrawing(), e)).length`), 1, 'the plan shows level 1 only');
    await fire(app, `k.run('bimManager')`);
    const win = await app.popup('bim');
    await expectPopupWindow(app, win, 'bim');
    await win.eval(`(() => { const s = [...document.querySelectorAll('[data-stepper^="bimLevel:"][data-stepper$=".elevation"] .stepper-value')].find((i) => i.closest('.bim-row').querySelector('input').value.startsWith('2')); s.value = '3200'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(100);
    await win.click('[data-action="tab"][data-value="materials"]');
    await sleep(150);
    assert.ok(await win.eval(`document.querySelectorAll('[data-bim-text$=".name"]').length`) >= 11, 'preset materials');
    assert.deepEqual(await win.eval(LAYOUT_CHECK), [], 'the building window fits');
    await win.click('[data-bim-action="apply"]');
    await sleep(300);
    assert.equal(await m(app, `k.actions.activeDrawing().entities.at(-1).z`), 3200, 'moving level 2 moved its column');
  } },
  { group: 'BIM', name: 'Wall material layers tab, roof slope per edge tab (gable), material properties', async run(app) {
    await fresh(app);
    await m(app, `(async () => { const a = k.actions; a.change('op.polyline', (d) => k.drawingModule.addEntity(d, 'polyline', { points: [{ x: 0, y: 0 }, { x: 6000, y: 0 }] })); a.select([a.activeDrawing().entities.at(-1).id]); await a.archFeature('wall', { width: 200, height: 2700 }); return 1; })()`);
    await fire(app, `k.run('editSolid')`);
    let win = await app.popup('solid');
    await win.click('[data-solid-tab="layers"]');
    await sleep(100);
    await win.click('[data-layer-add]');
    await sleep(100);
    await win.click('[data-layer-add]');
    await sleep(100);
    assert.equal(await win.eval(`document.querySelectorAll('.wall-layer').length`), 2);
    assert.deepEqual(await win.eval(LAYOUT_CHECK), [], 'layers tab fits');
    await win.click('[data-action="solid-apply"]');
    await sleep(300);
    const w = (await drawing(app)).entities[0];
    assert.deepEqual([w.shape.layers.length, w.params.width], [2, 212], 'concrete 200 + gypsum 12');
    // A roof over an L with a gable end.
    await m(app, `(async () => { const a = k.actions; a.change('op.polyline', (d) => k.drawingModule.addEntity(d, 'polyline', { closed: true, points: [{ x: 0, y: 0 }, { x: 12000, y: 0 }, { x: 12000, y: 6000 }, { x: 6000, y: 6000 }, { x: 6000, y: 10000 }, { x: 0, y: 10000 }] })); a.select([a.activeDrawing().entities.at(-1).id]); await a.archFeature('roof', { roofType: 1, slope: 30, overhang: 300, thickness: 200 }); return 1; })()`);
    await fire(app, `k.run('editSolid')`);
    win = await app.popup('solid');
    await win.click('[data-solid-tab="edges"]');
    await sleep(100);
    assert.equal(await win.eval(`document.querySelectorAll('[data-edge-pick]').length`), 6);
    await win.click('[data-edge-pick="1"]');
    await win.click('[data-edge-mode="1"]');
    await sleep(100);
    assert.deepEqual(await win.eval(LAYOUT_CHECK), [], 'edges tab fits');
    await win.click('[data-action="solid-apply"]');
    await sleep(300);
    const roof = (await drawing(app)).entities.at(-1);
    assert.equal(roof.shape.slopes[1], 90, 'edge 2 is a gable');
    // Material in the properties panel.
    await app.main.eval(`(() => { const s = document.querySelector('#right-panel [data-solid-material]'); s.value = 'tile'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    assert.equal((await drawing(app)).entities.at(-1).material.id, 'tile');
  } },
  { group: 'BIM', name: 'Rebar in a column, window from a sketch, truss, pipe, panel', async run(app) {
    await fresh(app);
    await m(app, `(() => { const a = k.actions; const c = a.insertSolid('column', { width: 400, depth: 400, height: 3000 }, {}); a.select([c.id]); return 1; })()`);
    await fire(app, `k.run('arch:rebar')`);
    const win = await app.popup('solid');
    await expectPopupWindow(app, win, 'solid');
    await win.click('[data-action="solid-apply"]');
    await sleep(300);
    const rebar = (await drawing(app)).entities.at(-1);
    assert.equal(rebar.kind, 'rebar');
    assert.ok(await m(app, `k.actions.solidProperties(k.actions.activeDrawing().entities.at(-1)).weight`) > 10, 'rebar weight');
    // A window from a sketch: a wall and two closed outlines.
    await m(app, `(async () => { const a = k.actions; a.change('op.polyline', (d) => k.drawingModule.addEntity(d, 'polyline', { points: [{ x: 0, y: 5000 }, { x: 6000, y: 5000 }] })); a.select([a.activeDrawing().entities.at(-1).id]); await a.archFeature('wall', { width: 200, height: 2700 }); a.change('op.rect', (d) => { k.drawingModule.addEntity(d, 'rect', { x: 0, y: 8000, width: 1200, height: 1600 }); k.drawingModule.addEntity(d, 'rect', { x: 100, y: 8100, width: 1000, height: 1400 }); }); const list = a.activeDrawing().entities; a.select([list.find((e) => e.kind === 'wall').id, ...list.filter((e) => e.type === 'rect').map((e) => e.id)]); return 1; })()`);
    await fire(app, `k.run('arch:customWindow')`);
    const edit = await app.popup('solid');
    await edit.click('[data-action="solid-apply"]');
    await sleep(300);
    const wall = (await drawing(app)).entities.find((e) => e.kind === 'wall');
    assert.equal(wall.shape.openings[0].type, 'custom');
    assert.equal((await drawing(app)).entities.filter((e) => e.type === 'rect').length, 0, 'the sketch became the window');
    await m(app, `(async () => { const a = k.actions; for (const kind of ['truss', 'pipe']) { a.change('op.polyline', (d) => k.drawingModule.addEntity(d, 'polyline', { points: [{ x: 0, y: 12000 }, { x: 6000, y: 12000 }] })); a.select([a.activeDrawing().entities.at(-1).id]); await a.archFeature(kind, {}); } a.change('op.rect', (d) => k.drawingModule.addEntity(d, 'rect', { x: 0, y: 14000, width: 3000, height: 2000 })); a.select([a.activeDrawing().entities.at(-1).id]); await a.archFeature('panel', { thickness: 1, waveLength: 150, waveHeight: 20 }); return 1; })()`);
    const kinds = (await drawing(app)).entities.map((e) => e.kind);
    for (const kind of ['truss', 'pipe', 'panel']) assert.ok(kinds.includes(kind), kind);
  } },
  { group: '3D solids', name: 'Two-row toolbar (Part toolbar), FreeCAD coverage window, 3D menu', async run(app) {
    await fresh(app);
    const one = await m(app, 'k.state.minWidth');
    await app.main.click('#toolbar [data-command="toolbarRows"]');
    await sleep(500);
    assert.equal(await app.main.eval(`document.querySelectorAll('#toolbar .toolbar-row').length`), 2);
    assert.ok(await app.main.eval(`Boolean(document.querySelector('#toolbar [data-command="solid:helix"]'))`), 'the Part toolbar has every primitive');
    const two = await m(app, 'k.state.minWidth');
    assert.ok(two < one, `two rows let the window be narrower (${one} → ${two})`);
    await app.main.click('#toolbar [data-command="toolbarRows"]');
    await sleep(300);
    assert.equal(await app.main.eval(`document.querySelectorAll('#toolbar .toolbar-row').length`), 1);
    await app.main.click('#toolbar [data-command="solidMenu"]');
    const solidMenu = await app.popup('menu');
    // Every solid command, the grouped ones in its submenus.
    await solidMenu.waitFor(`[...document.querySelectorAll('.menu-item')].flatMap((i) => [i.dataset.id, ...(i.dataset.contains ?? '').split(' ')]).filter(Boolean).length > 40`);
    await solidMenu.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); 1`);
    await sleep(200);
    await app.main.click('#left-panel [data-command="freecadCoverage"]');
    const coverage = await app.popup('coverage');
    await expectPopupWindow(app, coverage, 'coverage');
    assert.equal(await coverage.eval(`document.querySelectorAll('.coverage-tabs .tab').length`), 11);
    for (const tab of ['part', 'partdesign', 'sketcher', 'techdraw', 'draft', 'parts', 'mesh', 'files', 'general', 'other']) {
      await coverage.click(`.coverage-tabs [data-value="${tab}"]`);
      await sleep(60);
      assert.ok(await coverage.eval(`document.querySelectorAll('.coverage-row').length`) >= 4, tab);
      assert.deepEqual(await coverage.eval(`(() => { const b = document.querySelector('.popup-body').getBoundingClientRect(); return [...document.querySelectorAll('.coverage-row')].filter((r) => r.getBoundingClientRect().bottom > b.bottom + 1).length; })()`), 0, `${tab}: every row fits`);
    }
    await coverage.eval('window.__mycadPopup.close(); 1');
  } },
  { group: '3D solids', name: 'Canvas: dashed cross-hair, 5×5 grid of the same size at every zoom', async run(app) {
    await fresh(app);
    const p = await at(app, 10, 10);
    await app.main.mouse('mouseMoved', p.x, p.y, { button: 'none' });
    for (const percent of [5, 37, 100, 260, 900, 4000]) {
      await m(app, `(k.actions.setZoomPercent(${percent}), k.actions.drawCanvas(), 1)`);
      const grid = await m(app, `({ step: k.canvasState.gridStep, zoom: k.actions.activeDoc().vp.zoom })`);
      const px = grid.step * grid.zoom;
      assert.ok(px >= 10 && px < 50, `${percent}%: a minor cell is ${px.toFixed(1)} px`);
      const power = Math.log(grid.step / 10) / Math.log(5);
      assert.ok(Math.abs(power - Math.round(power)) < 1e-9, `${percent}%: the step is 10 × 5ⁿ (cells nest 5 × 5)`);
    }
    // The cross-hair lines are drawn dashed.
    await m(app, `(k.actions.setZoomPercent(100), k.actions.updateSettings({ crosshair: true }), 1)`);
    await app.main.mouse('mouseMoved', p.x + 3, p.y + 3, { button: 'none' });
    await sleep(100);
    const dashes = await app.main.eval(`(() => { const ctx = document.querySelector('#cad-canvas').getContext('2d'); const seen = []; const orig = ctx.setLineDash; ctx.setLineDash = function (d) { seen.push(d.join(',')); return orig.call(this, d); }; window.__mycad.actions.drawCanvas(); ctx.setLineDash = orig; return seen; })()`);
    assert.ok(dashes.includes('6,4'), `dashed cross-hair ${JSON.stringify(dashes)}`);
  } },

  // ───────────────────────── status bar
  { group: 'FreeCAD', name: 'Coverage map: every MyCAD command it names exists in the app', async run(app) {
    const ids = [...new Set(freecadCoverage().flatMap((c) => c.commands))];
    const missing = await m(app, `${JSON.stringify(ids)}.filter((id) => !k.commands[id])`);
    assert.deepEqual(missing, []);
  } },
  { group: 'Std', name: 'Standard views and cameras: front/top, orthographic ↔ perspective, saved camera, rotate, stereo, turntable, clipping', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.insertSolid('box', { length: 40, width: 30, height: 20 }, { x: 0, y: 0, z: 0 }), 1)`);
    await fire(app, `k.run('viewFront')`);
    await app.main.waitFor(`Boolean(window.__mycad.state.view3d && window.__mycad.actions.view3d())`);
    await sleep(300);
    const dir = (camera) => { const d = camera.position.map((v, i) => v - camera.target[i]); const l = Math.hypot(...d); return d.map((v) => v / l); };
    let camera = await m(app, 'k.actions.view3d().getCamera()');
    assert.ok(dir(camera)[1] < -0.99, `front looks along +y: ${dir(camera)}`);
    await fire(app, `k.run('viewTop')`);
    await sleep(150);
    camera = await m(app, 'k.actions.view3d().getCamera()');
    assert.ok(dir(camera)[2] > 0.99, 'top looks down');
    await fire(app, `k.run('cameraOrtho')`);
    await sleep(150);
    assert.equal(await m(app, 'k.actions.view3d().camera.type'), 'OrthographicCamera', 'orthographic camera');
    await fire(app, `k.run('viewSaveCamera')`);
    await fire(app, `k.run('viewIsometric')`);
    await fire(app, `k.run('viewRestoreCamera')`);
    await sleep(150);
    const back = await m(app, 'k.actions.view3d().getCamera()');
    assert.equal(back.projection, 'ortho', 'the saved camera was orthographic');
    assert.ok(back.position.every((v, i) => Math.abs(v - camera.position[i]) < 1e-3), 'the saved camera comes back');
    await fire(app, `k.run('cameraPerspective')`);
    await fire(app, `k.run('viewRotateLeft')`);
    await sleep(150);
    assert.equal(await m(app, 'k.actions.view3d().camera.type'), 'PerspectiveCamera', 'perspective again');
    for (const mode of ['anaglyph', 'rows', 'columns', 'sideBySide', 'off']) {
      await fire(app, `k.run('stereo:${mode}')`);
      await sleep(80);
      assert.equal(await m(app, '(k.actions.view3d().render(), k.actions.view3d().stereo ?? "off")'), mode, `stereo ${mode}`);
    }
    assert.equal(await m(app, '(k.actions.view3d().setTurntable(true, 4), Boolean(k.actions.view3d().turntable))'), true);
    assert.equal(await m(app, '(k.actions.view3d().setTurntable(false), Boolean(k.actions.view3d().turntable))'), false);
    assert.equal(await m(app, '(k.actions.view3d().setClipping({ x: { on: true, offset: 10 } }), k.actions.view3d().renderer.clippingPlanes.length)'), 1);
    assert.equal(await m(app, '(k.actions.view3d().setClipping(null), k.actions.view3d().renderer.clippingPlanes.length)'), 0);
    await fire(app, `k.run('storeWorkingView')`);
    assert.ok((await drawing(app)).workingView, 'the working view is kept in the drawing');
    await m(app, '(k.actions.toggle3d(false), 1)');
  } },
  { group: 'Std', name: 'Visibility, selection history, groups, transparency, recompute', async run(app) {
    await fresh(app);
    const [a, b] = await m(app, `[k.actions.insertSolid('box', { length: 10, width: 10, height: 10 }, {}).id, k.actions.insertSolid('sphere', { radius: 5 }, { x: 30 }).id]`);
    await m(app, `(k.actions.select([${JSON.stringify(a)}]), k.actions.select([${JSON.stringify(b)}]), 1)`);
    await fire(app, `k.run('selectionBack')`);
    assert.deepEqual(await m(app, '[...k.state.selection]'), [a]);
    await fire(app, `k.run('selectionForward')`);
    assert.deepEqual(await m(app, '[...k.state.selection]'), [b]);
    await fire(app, `k.run('hideSelection')`);
    let d = await drawing(app);
    assert.equal(d.entities.find((e) => e.id === b).hidden, true);
    await fire(app, `k.run('showAll')`);
    d = await drawing(app);
    assert.ok(!d.entities.find((e) => e.id === b).hidden);
    await m(app, `(k.actions.select([${JSON.stringify(a)}, ${JSON.stringify(b)}]), 1)`);
    await fire(app, `k.run('toggleTransparency')`);
    await fire(app, `k.run('newGroup')`);
    d = await drawing(app);
    assert.equal(d.groups.length, 1);
    assert.ok(d.entities.every((e) => e.group === d.groups[0].id && e.transparency === 50));
    await fire(app, `k.run('recompute')`);
    assert.match(await notice(app), /recomputed|다시 계산/);
  } },
  { group: 'Std', name: 'The form popup: units calculator converts live and changes its units with the kind', async run(app) {
    await fire(app, `k.run('unitsCalculator')`);
    const form = await app.popup('form');
    await form.waitFor(`document.querySelector('[data-form="result"]')?.textContent.includes('25.4')`);
    await expectPopupWindow(app, form, 'form');
    assert.deepEqual(await form.eval(POPUP_SCROLL_CHECK), []);
    await form.eval(`(() => { const k = document.querySelector('[data-form="kind"]'); k.value = 'temperature'; k.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await form.waitFor(`[...document.querySelectorAll('[data-form="from"] option')].some((o) => o.value === 'K')`);
    await form.eval(`(() => { const set = (key, value) => { const e = document.querySelector('[data-form="' + key + '"]'); e.value = value; e.dispatchEvent(new Event('change', { bubbles: true })); }; set('from', '°C'); set('to', '°F'); set('value', '100'); return 1; })()`);
    await form.waitFor(`document.querySelector('[data-form="result"]')?.textContent.startsWith('212')`);
    await form.click('[data-form-action="ok"]');
    await sleep(250);
  } },
  { group: 'Std', name: 'Model tree: objects and the 2D folder, eye toggles, click selects, groups, collapse and expand', async run(app) {
    await fresh(app);
    const [a, b] = await m(app, `[k.actions.insertSolid('box', { length: 10, width: 10, height: 10 }, {}).id, k.actions.insertSolid('cylinder', { radius: 4, height: 9 }, { x: 30 }).id]`);
    await m(app, `(k.actions.change('op.line', (d) => k.drawingModule.addEntity(d, 'line', { x1: 0, y1: 0, x2: 50, y2: 0 })), k.actions.select([]), 1)`);
    await m(app, `(k.actions.updateSettings({ collapsedSections: [], workbench: 'all' }), 1)`);
    await app.main.waitFor(`Boolean(document.querySelector('[data-tree-entity="${a}"]'))`);
    assert.ok(await app.main.eval(`Boolean(document.querySelector('[data-tree-toggle="folder:2d"]'))`), 'the 2D folder');
    await app.main.click(`[data-tree-entity="${b}"] .tree-label`);
    assert.deepEqual(await m(app, '[...k.state.selection]'), [b]);
    await app.main.click(`[data-tree-eye="${a}"]`);
    assert.equal((await drawing(app)).entities.find((e) => e.id === a).hidden, true);
    await m(app, `(k.actions.select([${JSON.stringify(a)}, ${JSON.stringify(b)}]), 1)`);
    await fire(app, `k.run('newGroup')`);
    const group = (await drawing(app)).groups[0];
    await app.main.waitFor(`Boolean(document.querySelector('[data-tree-group="${group.id}"]'))`);
    await app.main.click(`[data-tree-group-eye="${group.id}"]`);
    assert.equal((await drawing(app)).groups[0].hidden, true);
    await fire(app, `k.run('treeCollapse')`);
    assert.ok(!(await app.main.eval(`Boolean(document.querySelector('[data-tree-entity="${b}"]'))`)), 'folded');
    await fire(app, `k.run('treeExpand')`);
    assert.ok(await app.main.eval(`Boolean(document.querySelector('[data-tree-entity="${b}"]'))`), 'unfolded');
  } },
  { group: 'Std', name: 'Links: make, go to the source, select all links, replace with link, link from another drawing (form list)', async run(app) {
    await fresh(app);
    const source = await m(app, `k.actions.insertSolid('box', { length: 10, width: 10, height: 10 }, {}).id`);
    await m(app, `(k.actions.select([${JSON.stringify(source)}]), 1)`);
    await fire(app, `k.run('linkMake')`);
    let d = await drawing(app);
    const link = d.entities.find((e) => e.clone?.link);
    assert.equal(link.clone.of, source);
    await fire(app, `k.run('linkSelectLinked')`);
    assert.deepEqual(await m(app, '[...k.state.selection]'), [source]);
    await fire(app, `k.run('linkSelectAllLinks')`);
    assert.deepEqual(await m(app, '[...k.state.selection]'), [link.id]);
    // A second drawing with a solid, then a link to it from the first.
    const first = await m(app, 'k.state.active');
    await m(app, `(k.actions.newDrawing(), k.actions.insertSolid('sphere', { radius: 6 }, {}), 1)`);
    await m(app, `(k.actions.activateDoc ? k.actions.activateDoc(${JSON.stringify(first)}) : k.state.docs.find((doc) => doc.id === ${JSON.stringify(first)}) && (k.state.active = ${JSON.stringify(first)}), k.actions.select([]), 1)`);
    await fire(app, `k.run('linkMake')`);
    const form = await app.popup('form');
    await form.waitFor(`Boolean(document.querySelector('[data-form-pick]'))`);
    // The newest drawing (the one with the sphere) is listed last.
    await form.eval(`(() => { const all = document.querySelectorAll('[data-form-pick]'); all[all.length - 1].click(); return 1; })()`);
    await sleep(300);
    await form.click('[data-form-action="ok"]');
    await sleep(250);
    d = await drawing(app);
    const external = d.entities.find((e) => e.clone?.external);
    assert.ok(external, 'a link to the other drawing');
    assert.equal(external.clone.external.cache.kind, 'sphere');
    await m(app, `(k.actions.select([${JSON.stringify(external.id)}]), 1)`);
    await fire(app, `k.run('linkImport')`);
    assert.ok(!(await drawing(app)).entities.find((e) => e.id === external.id).clone, 'imported as an ordinary object');
  } },
  { group: 'Std', name: 'Transform window, alignment from point pairs, materials with mass, parameters, custom toolbar, hidden toolbars', async run(app) {
    await fresh(app);
    const [a, b] = await m(app, `[k.actions.insertSolid('box', { length: 10, width: 10, height: 10 }, {}).id, k.actions.insertSolid('box', { length: 10, width: 10, height: 10 }, { x: 50, y: 20 }).id]`);
    await m(app, `(k.actions.select([${JSON.stringify(a)}]), 1)`);
    await fire(app, `k.run('transform')`);
    let form = await app.popup('form');
    await form.waitFor(`Boolean(document.querySelector('[data-form="dx"]'))`);
    await form.eval(`(() => { const e = document.querySelector('[data-form="dx"]'); e.value = '15'; e.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await form.click('[data-form-action="ok"]');
    await sleep(300);
    assert.equal((await drawing(app)).entities.find((e) => e.id === a).x, 15);
    // Align: one pair carries a's corner onto b's.
    await m(app, `(k.actions.select([${JSON.stringify(a)}, ${JSON.stringify(b)}]), 1)`);
    await fire(app, `k.run('alignTo')`);
    form = await app.popup('form');
    await app.main.waitFor('Boolean(window.__mycad.state.align)');
    await m(app, '(k.state.align.from.push([15, 0, 0]), k.state.align.to.push([50, 20, 0]), k.state.align.refresh(), 1)');
    await form.waitFor(`Boolean(document.querySelector('.form-list-row'))`);
    await form.click('[data-form-action="ok"]');
    await sleep(300);
    const moved = (await drawing(app)).entities.find((e) => e.id === a);
    assert.deepEqual([moved.x, moved.y], [50, 20]);
    // Material and mass.
    await m(app, `(k.actions.select([${JSON.stringify(a)}]), 1)`);
    await fire(app, `k.run('setMaterial')`);
    form = await app.popup('form');
    await form.waitFor(`Boolean(document.querySelector('[data-form="material"]'))`);
    await form.eval(`(() => { const e = document.querySelector('[data-form="material"]'); e.value = 'aluminium'; e.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await form.click('[data-form-action="ok"]');
    await sleep(300);
    assert.equal((await drawing(app)).entities.find((e) => e.id === a).physical.density, 2700);
    await fire(app, `k.run('inspectMaterial')`);
    form = await app.popup('form');
    await form.waitFor(`[...document.querySelectorAll('.form-info')].some((e) => /2\\.7 ?kg|0\\.0027 kg|kg/.test(e.textContent))`);
    await form.click('[data-form-action="ok"]');
    await sleep(250);
    // Parameters: the settings as JSON, changed and stored.
    await fire(app, `k.run('parameters')`);
    form = await app.popup('form');
    await form.waitFor(`Boolean(document.querySelector('[data-form="json"]'))`);
    await form.eval(`(() => { const e = document.querySelector('[data-form="json"]'); const s = JSON.parse(e.value); s.customToolbar = ['viewFront', 'nonsense']; s.hiddenToolbars = ['zoom']; e.value = JSON.stringify(s); return 1; })()`);
    await form.click('[data-form-action="ok"]');
    await sleep(400);
    assert.ok(await app.main.eval(`Boolean(document.querySelector('#toolbar [data-command="viewFront"]'))`), 'the custom toolbar');
    assert.ok(!(await app.main.eval(`Boolean(document.querySelector('#toolbar [data-command="zoomFit"]'))`)), 'the zoom toolbar is hidden');
    await m(app, `(k.actions.updateSettings({ customToolbar: [], hiddenToolbars: [] }), 1)`);
  } },
  { group: 'Std', name: 'Overlay panels, workbenches, tiled 2D | 3D, the 3D view in its own window, PDF export', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.insertSolid('box', { length: 20, width: 20, height: 20 }, {}), 1)`);
    await fire(app, `k.run('dockOverlay:left')`);
    assert.ok(await app.main.eval(`document.documentElement.classList.contains('overlay-left') || document.querySelector('#app')?.classList.contains('overlay-left') || document.body.classList.contains('overlay-left') || Boolean(document.querySelector('.overlay-left'))`));
    await fire(app, `k.run('dockOverlay:left')`);
    await fire(app, `k.run('workbench:bim')`);
    const sections = await app.main.eval(`[...document.querySelectorAll('#left-panel [data-section]')].map((s) => s.dataset.section)`);
    assert.ok(sections.includes('model') && sections.includes('arch') && !sections.includes('solids'), sections.join());
    await fire(app, `k.run('workbench:all')`);
    await fire(app, `k.run('tileWindows')`);
    await app.main.waitFor(`Boolean(window.__mycad.state.tiled && window.__mycad.actions.view3d())`);
    await sleep(300);
    const tiles = await app.main.eval(`(() => { const a = document.querySelector('#cad-canvas').getBoundingClientRect(); const b = document.querySelector('#view3d').getBoundingClientRect(); return [a.width > 50, b.width > 50, a.right <= b.left + 4]; })()`);
    assert.deepEqual(tiles, [true, true, true], 'side by side');
    await fire(app, `k.run('cascadeWindows')`);
    await sleep(200);
    await fire(app, `k.run('newView3d')`);
    const viewer = await app.popup('viewer');
    await viewer.waitFor(`Boolean(document.querySelector('#viewer-host canvas'))`);
    await expectPopupWindow(app, viewer, 'viewer');
    await m(app, `(k.actions.insertSolid('sphere', { radius: 5 }, { x: 40 }), 1)`);
    await sleep(400);
    await m(app, `(k.popups.close('viewer'), 1)`);
    await sleep(250);
    const file = path.join(app.files, 'plan.pdf').replace(/\\/g, '/');
    await app.main.eval(`window.__mycad.actions.printPdf({ path: ${JSON.stringify(file)} }).then(() => 1)`, 60000);
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.match(bytes.toString('latin1'), /\/Count 1/);
  } },
  { group: 'Std', name: 'Macro debugger: breakpoint on a line, start, step into and over, locals shown, stop; self-tests in the console', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.updateSettings({ showConsole: true, consoleLanguage: 'python' }), 1)`);
    await app.main.waitFor(`Boolean(document.querySelector('#console-code'))`);
    await app.main.eval(`(() => { const c = document.querySelector('#console-code'); c.value = 'a = 2\\nb = a * 3\\nc = b + 1\\nprint(c)'; c.focus(); c.setSelectionRange(c.value.indexOf('c = b'), c.value.indexOf('c = b')); return 1; })()`);
    await fire(app, `k.run('toggleBreakpoint')`);
    await app.main.waitFor(`/3/.test(document.querySelector('#debug-panel')?.textContent ?? '')`);
    await fire(app, `k.run('macroStartDebug')`);
    await app.main.waitFor(`Boolean(document.querySelector('.debug-line')) && /c = b \\+ 1/.test(document.querySelector('.debug-line').textContent)`, 60000);
    assert.match(await app.main.eval(`document.querySelector('.debug-locals').textContent`), /b = 6/);
    await fire(app, `k.run('macroStepOver')`);
    await app.main.waitFor(`/print\\(c\\)/.test(document.querySelector('.debug-line')?.textContent ?? '')`);
    assert.match(await app.main.eval(`document.querySelector('.debug-locals').textContent`), /c = 7/);
    await fire(app, `k.run('macroStopDebug')`);
    assert.ok(!(await app.main.eval(`Boolean(document.querySelector('.debug-line'))`)));
    await fire(app, `k.run('selfTest:allText')`);
    await app.main.waitFor(`[...document.querySelectorAll('#console-output .console-line')].some((l) => /passed|통과/.test(l.textContent))`);
    assert.ok(!(await app.main.eval(`[...document.querySelectorAll('#console-output .console-line.error')].some((l) => l.textContent.startsWith('✖'))`)), 'every self-test passes in the app');
    await m(app, `(k.actions.updateSettings({ showConsole: false, consoleLanguage: 'js' }), 1)`);
  } },
  { group: 'Part', name: 'Face selection: a click on the top face picks Face, a datum plane on it, its colour, shape info', async run(app) {
    await fresh(app);
    const id = await m(app, `k.actions.insertSolid('box', { length: 40, width: 30, height: 20 }, { x: 0, y: 0, z: 0 }).id`);
    await fire(app, `k.run('selectFilter:face')`);
    await app.main.waitFor(`Boolean(window.__mycad.state.view3d && window.__mycad.actions.view3d()?.topologyOf(${JSON.stringify(id)}))`);
    await fire(app, `k.run('viewIsometric')`);
    // Where the top face's centre is on the screen, clicked until it is picked (the camera may still be moving when the machine is busy).
    for (let attempt = 0; ; attempt++) {
      await sleep(300);
      const at = await m(app, `(() => { const v = k.actions.view3d(); const face = v.topologyOf(${JSON.stringify(id)}).faces.find((f) => f.normal[2] > 0.99); const p = v.camera.position.clone().set(...face.center).project(v.camera); const r = v.canvas.getBoundingClientRect(); return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height }; })()`);
      await m(app, `(() => { const c = k.actions.view3d().canvas; const o = { clientX: ${at.x}, clientY: ${at.y}, button: 0, bubbles: true, pointerId: 1 }; c.dispatchEvent(new PointerEvent('pointerdown', o)); c.dispatchEvent(new PointerEvent('pointerup', o)); return 1; })()`);
      try { await app.main.waitFor('(window.__mycad.state.elements ?? []).length === 1', { timeout: 2000 }); break; } catch (error) { if (attempt >= 5) throw error; }
    }
    const picked = await m(app, 'k.state.elements[0]');
    assert.equal(picked.kind, 'face');
    near(picked.signature.normal[2], 1);
    assert.match(await app.main.eval(`document.querySelector('.elements-list')?.textContent ?? ''`), /Face/);
    await fire(app, `k.run('datum:plane')`);
    const datum = (await drawing(app)).entities.find((e) => e.kind === 'datum');
    assert.equal(datum.attach.mode, 'flat');
    near(datum.z, 20);
    // Colour the same face, then see the topology in the shape info.
    await m(app, `(k.state.elements = [${JSON.stringify(picked)}], 1)`);
    await fire(app, `k.run('part:colorPerFace')`);
    let form = await app.popup('form');
    await form.waitFor(`Boolean(document.querySelector('[data-form="color"]'))`);
    await form.click('[data-form-action="ok"]');
    await sleep(300);
    assert.equal((await drawing(app)).entities.find((e) => e.id === id).faceColors.length, 1);
    await fire(app, `k.run('selectFilter:off')`);
    await m(app, `(k.actions.select([${JSON.stringify(id)}]), 1)`);
    await fire(app, `k.run('part:shapeInfo')`);
    form = await app.popup('form');
    await form.waitFor(`[...document.querySelectorAll('.form-info')].some((e) => /24000/.test(e.textContent.replace(/,/g, '')))`);
    await form.click('[data-form-action="ok"]');
    await sleep(250);
    await m(app, '(k.actions.toggle3d(false), 1)');
  } },
  { group: 'Part', name: 'Fragments, slice apart, mirror (window), section cut: volumes and pieces', async run(app) {
    await fresh(app);
    const [a, b] = await m(app, `[k.actions.insertSolid('box', { length: 10, width: 10, height: 10 }, {}).id, k.actions.insertSolid('box', { length: 10, width: 10, height: 10 }, { x: 5 }).id]`);
    await m(app, `(k.actions.select([${JSON.stringify(a)}, ${JSON.stringify(b)}]), 1)`);
    await fire(app, `k.run('part:fragments')`);
    let d = await drawing(app);
    const fragments = d.entities.find((e) => e.kind === 'fragments');
    assert.ok(fragments && d.entities.length === 1, 'one fragments object');
    // A box cut through the middle by a thin slab: three pieces.
    await m(app, `(k.actions.change('op.delete', (dr) => { dr.entities = []; }), 1)`);
    const [c, s] = await m(app, `[k.actions.insertSolid('box', { length: 10, width: 10, height: 10 }, {}).id, k.actions.insertSolid('box', { length: 1, width: 20, height: 20 }, { x: 4.5, y: -5, z: -5 }).id]`);
    await m(app, `(k.actions.select([${JSON.stringify(c)}, ${JSON.stringify(s)}]), 1)`);
    await app.main.waitFor('window.__mycad.actions.kernelState().ready', 60000);
    await fire(app, `k.run('part:sliceApart')`);
    d = await drawing(app);
    assert.equal(d.entities.filter((e) => e.kind === 'mesh').length, 3, 'three pieces');
    // Mirror a box in the YZ plane, keeping it.
    await m(app, `(k.actions.change('op.delete', (dr) => { dr.entities = []; }), k.actions.select([k.actions.insertSolid('box', { length: 10, width: 10, height: 10 }, { x: 5 }).id]), 1)`);
    await fire(app, `k.run('part:mirror')`);
    const form = await app.popup('form');
    await form.waitFor(`Boolean(document.querySelector('[data-form="plane"]'))`);
    await form.click('[data-form-action="ok"]');
    await sleep(300);
    d = await drawing(app);
    assert.equal(d.entities.length, 2);
    assert.ok(d.entities.some((e) => e.kind === 'mirror3d'));
    // Section cut: every solid cut at x = 10 and the originals hidden.
    await fire(app, `k.run('part:sectionCut')`);
    const cut = await app.popup('form');
    await cut.waitFor(`Boolean(document.querySelector('[data-form="at"]'))`);
    await cut.eval(`(() => { const e = document.querySelector('[data-form="at"]'); e.value = '10'; e.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await cut.click('[data-form-action="ok"]');
    await sleep(300);
    d = await drawing(app);
    assert.equal(d.entities.filter((e) => e.hidden).length, 2);
    assert.equal(d.entities.filter((e) => e.kind === 'boolean' && e.shape.op === 'cut').length, 2);
  } },
  { group: 'PartDesign', name: 'Body takes new features, polar pattern window, tip hides later features, sketch on a picked face', async run(app) {
    await fresh(app);
    const base = await m(app, `k.actions.insertSolid('box', { length: 10, width: 10, height: 10 }, { x: 20 }).id`);
    await m(app, `(k.actions.select([${JSON.stringify(base)}]), 1)`);
    await fire(app, `k.run('pd:body')`);
    let d = await drawing(app);
    const body = d.groups.find((g) => g.body);
    assert.equal(d.entities.find((e) => e.id === base).group, body.id);
    // A new solid joins the active body.
    const later = await m(app, `k.actions.insertSolid('sphere', { radius: 3 }, { x: -20 }).id`);
    assert.equal((await drawing(app)).entities.find((e) => e.id === later).group, body.id);
    await m(app, `(k.actions.select([${JSON.stringify(base)}]), 1)`);
    await fire(app, `k.run('pd:polarPattern')`);
    const form = await app.popup('form');
    await form.waitFor(`Boolean(document.querySelector('[data-form="count2"]'))`);
    await form.eval(`(() => { const e = document.querySelector('[data-form="count2"]'); e.value = '4'; e.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await form.click('[data-form-action="ok"]');
    await sleep(400);
    d = await drawing(app);
    const pattern = d.entities.find((e) => e.kind === 'pattern');
    assert.equal(pattern.params.count2, 4);
    // The pattern was made last: tip on the sphere hides it.
    await m(app, `(k.actions.select([${JSON.stringify(later)}]), 1)`);
    await fire(app, `k.run('pd:moveTip')`);
    assert.ok(!(await m(app, `k.drawingModule.isVisible3d(k.actions.activeDrawing(), k.actions.activeDrawing().entities.find((e) => e.kind === 'pattern'))`)), 'after the tip');
    await fire(app, `k.run('pd:moveTip')`);
    // Sketch on the top face of the sphere's… a box: pick a face element and make it the working plane.
    const id = await m(app, `k.actions.insertSolid('box', { length: 30, width: 30, height: 5 }, { x: 0, y: 40 }).id`);
    await m(app, `(k.state.elements = [{ id: ${JSON.stringify(id)}, kind: 'face', index: 0, signature: { center: [15, 55, 5], normal: [0, 0, 1] } }], k.actions.select([${JSON.stringify(id)}]), 1)`);
    await fire(app, `k.run('pd:newSketch')`);
    await sleep(300);
    const plane = (await drawing(app)).workPlane;
    assert.ok(plane?.frame, 'a working plane on the face');
    near(plane.frame.origin[2], 5);
    await fire(app, `k.run('workPlaneReset')`);
  } },
  { group: 'Sketcher', name: 'Sketch on the XZ plane: hexagon with constraints, shown upright in 3D; split, B-spline degree, diagnostics, origin, toggles', async run(app) {
    await fresh(app);
    await fire(app, `k.run('sk:new')`);
    const form = await app.popup('form');
    await form.waitFor(`Boolean(document.querySelector('[data-form="plane"]'))`);
    await form.eval(`(() => { const e = document.querySelector('[data-form="plane"]'); e.value = 'xz'; e.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await form.click('[data-form-action="ok"]');
    await app.main.waitFor(`Boolean(window.__mycad.state.editSketch)`);
    let d = await drawing(app);
    const sketch = d.groups.find((g) => g.sketch);
    near(sketch.frame.rx, 90);
    // Hexagon: six lines and a construction circle, all in the sketch.
    await m(app, `(k.actions.setTool('skPolygon6'), 1)`);
    await clickAt(app, 0, 0);
    await clickAt(app, 20, 0);
    d = await drawing(app);
    assert.equal(d.entities.filter((e) => e.group === sketch.id).length, 7);
    assert.ok(d.entities.some((e) => e.type === 'circle' && e.construction));
    assert.ok(d.constraints.length >= 17);
    assert.equal(await m(app, 'k.actions.activeDoc().constraintStatus.status'), 'under');
    // In 3D it stands up: the sketch's Y is the world's Z.
    await m(app, `k.actions.toggle3d(true).then(() => 1)`);
    await app.main.waitFor(`Boolean(window.__mycad.actions.view3d()?.lines3d.children.length)`);
    const top = await m(app, `Math.max(...k.actions.view3d().lines3d.children.flatMap((o) => [...o.geometry?.attributes?.position?.array ?? []].filter((_, i) => i % 3 === 2)))`);
    // The construction circle (radius 20) reaches highest.
    near(top, 20, 1e-3);
    await m(app, `k.actions.toggle3d(false).then(() => 1)`);
    // Split a side of the hexagon in the middle.
    await m(app, `(k.actions.setTool('skSplit'), 1)`);
    await clickAt(app, 15, 20 * Math.sin(Math.PI / 3) / 2);
    d = await drawing(app);
    assert.equal(d.entities.filter((e) => e.type === 'line' && e.group === sketch.id).length, 7);
    // A B-spline through four points, one degree up.
    await m(app, `(k.actions.setTool('skBSplineInterp'), 1)`);
    for (const [x, y] of [[-60, -40], [-50, -20], [-40, -35], [-30, -20]]) await clickAt(app, x, y);
    await app.main.key('Enter');
    d = await drawing(app);
    const spline = d.entities.find((e) => e.type === 'spline');
    assert.equal(spline.degree, 3);
    assert.equal(spline.group, sketch.id);
    await m(app, `(k.actions.setTool('select'), k.actions.select([${JSON.stringify(spline.id)}]), 1)`);
    await fire(app, `k.run('sk:degreeUp')`);
    assert.equal((await drawing(app)).entities.find((e) => e.id === spline.id).degree, 4);
    await fire(app, `k.run('sk:bsplineComb')`);
    await fire(app, `k.run('sk:bsplinePolygon')`);
    assert.ok(await m(app, 'k.state.settings.sketchBsplineComb && k.state.settings.sketchBsplinePolygon'));
    // Block the spline, pick its constraint, turn it off.
    await fire(app, `k.run('constrain:block')`);
    await fire(app, `k.run('sk:selectConstraints')`);
    assert.equal(await m(app, 'k.state.constraintSelection.length'), 1);
    await fire(app, `k.run('sk:toggleActive')`);
    assert.equal((await drawing(app)).constraints.find((c) => c.type === 'block').active, false);
    // Under-constrained geometry: everything but nothing is held.
    await fire(app, `k.run('sk:selectDofs')`);
    assert.ok((await m(app, 'k.state.selection.size')) >= 8);
    // A point put on the sketch origin.
    await m(app, `(k.actions.setTool('point'), 1)`);
    await clickAt(app, 30, 30);
    const point = (await drawing(app)).entities.find((e) => e.type === 'point');
    await m(app, `(k.actions.setTool('select'), k.actions.select([${JSON.stringify(point.id)}]), 1)`);
    await fire(app, `k.run('sk:selectOrigin')`);
    await fire(app, `k.run('constrain:coincident')`);
    const moved = (await drawing(app)).entities.find((e) => e.id === point.id);
    near(moved.x, 0); near(moved.y, 0);
    assert.deepEqual(await m(app, 'k.state.sketchRefs'), []);
    // Validation finds nothing to fix in a sketch made by the tools.
    await fire(app, `k.run('sk:validate')`);
    const check = await app.popup('form');
    await check.waitFor(`Boolean(document.querySelector('[data-form="missing"]'))`);
    assert.equal(await check.eval(`document.querySelector('[data-form="degenerate"]').textContent.trim()`), '0');
    await check.click('[data-form-action="cancel"]');
    await fire(app, `k.run('sk:leave')`);
    assert.equal(await m(app, 'k.state.editSketch'), null);
  } },
  { group: 'Draft', name: 'Stretch window, upgrade lines to a wire, path array, text outlines, perpendicular snap, auto-group', async run(app) {
    await fresh(app);
    // Three lines meeting end to end → one closed wire.
    const ids = await m(app, `(() => { const a = k.actions; return [[0, 0, 40, 0], [40, 0, 40, 20], [40, 20, 0, 0]].map(([x1, y1, x2, y2]) => a.change('op.line', (d) => k.drawingModule.addEntity(d, 'line', { x1, y1, x2, y2 })).id); })()`);
    await m(app, `(k.actions.select(${JSON.stringify(ids)}), 1)`);
    await fire(app, `k.run('draft:upgrade')`);
    let d = await drawing(app);
    assert.equal(d.entities.length, 1);
    assert.equal(d.entities[0].type, 'polyline');
    assert.equal(d.entities[0].closed, true);
    // Stretch: a window round the right side moves those corners 10 to the right.
    await m(app, `(k.actions.select([]), k.actions.setTool('draftStretch'), 1)`);
    for (const [x, y] of [[35, -5], [45, 25], [40, 0], [50, 0]]) await clickAt(app, x, y);
    d = await drawing(app);
    assert.deepEqual(d.entities[0].points.map((p) => Math.round(p.x)), [0, 50, 50]);
    // A path array: a small circle copied five times along a line.
    await m(app, `(k.actions.setTool('select'), 1)`);
    const circle = await m(app, `k.actions.change('op.circle', (d) => k.drawingModule.addEntity(d, 'circle', { cx: 0, cy: 50, r: 2 })).id`);
    const path = await m(app, `k.actions.change('op.line', (d) => k.drawingModule.addEntity(d, 'line', { x1: 0, y1: 60, x2: 80, y2: 60 })).id`);
    await m(app, `(k.actions.select([${JSON.stringify(circle)}, ${JSON.stringify(path)}]), 1)`);
    await fire(app, `k.run('draft:pathArray')`);
    const form = await app.popup('form');
    await form.waitFor(`Boolean(document.querySelector('[data-form="count"]'))`);
    await form.click('[data-form-action="ok"]');
    await app.main.waitFor(`window.__mycad.actions.activeDrawing().entities.filter((e) => e.type === 'circle').length === 6`);
    const copies = (await drawing(app)).entities.filter((e) => e.type === 'circle').slice(1).map((e) => [e.cx, e.cy]);
    assert.deepEqual(copies.map(([x, y]) => [Math.round(x), Math.round(y)]), [[0, 60], [20, 60], [40, 60], [60, 60], [80, 60]]);
    // Text outlines, traced from the app's own font: "O" gives an outer and an inner loop in a new group.
    await fire(app, `k.run('draft:shapeString')`);
    const sform = await app.popup('form');
    await sform.waitFor(`Boolean(document.querySelector('[data-form="text"]'))`);
    await sform.eval(`(() => { const e = document.querySelector('[data-form="text"]'); e.value = 'O'; e.dispatchEvent(new Event('change', { bubbles: true })); const s = document.querySelector('[data-form="size"]'); s.value = '20'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sform.click('[data-form-action="ok"]');
    await app.main.waitFor(`(window.__mycad.actions.activeDrawing().groups ?? []).some((g) => g.name.endsWith('O'))`);
    d = await drawing(app);
    const group = d.groups.find((g) => g.name.endsWith('O'));
    const loops = d.entities.filter((e) => e.group === group.id);
    assert.equal(loops.length, 2, 'outside and inside of the O');
    const height = Math.max(...loops[0].points.map((p) => p.y)) - Math.min(...loops[0].points.map((p) => p.y));
    assert.ok(height > 10 && height < 22, `cap height ${height}`);
    // Perpendicular snap: from the start of a line, the foot on another line.
    await m(app, `(k.actions.updateSettings({ snapObject: true, snapModes: { ...k.state.settings.snapModes, endpoint: false, midpoint: false, intersection: false, nearest: false } }), 1)`);
    await fire(app, `k.run('snapMode:perpendicular')`);
    assert.equal(await m(app, 'k.state.settings.snapModes.perpendicular'), true);
    await m(app, `(k.actions.setTool('line'), 1)`);
    await clickAt(app, 25, 100);
    await clickAt(app, 25.6, 60.5);
    await app.main.key('Escape');
    const drawn = (await drawing(app)).entities.at(-1);
    near(drawn.x2, 25, 1e-6); near(drawn.y2, 60, 1e-6);
    await fire(app, `k.run('snapMode:perpendicular')`);
    // Auto-group: new objects go into the chosen group.
    await m(app, `(k.state.autoGroup = ${JSON.stringify(group.id)}, 1)`);
    const later = await m(app, `k.actions.change('op.point', (d) => k.drawingModule.addEntity(d, 'point', { x: 1, y: 1 })).id`);
    assert.equal((await drawing(app)).entities.find((e) => e.id === later).group, group.id);
    await m(app, `(k.state.autoGroup = null, k.actions.setTool('select'), 1)`);
  } },
  { group: 'Mesh', name: 'Regular sphere mesh, curvature colours, polygon cut on the 3D view, visual inspection against a solid', async run(app) {
    await fresh(app);
    const answer = async (values) => {
      const form = await app.popup('form');
      await form.waitFor(`Boolean(document.querySelector('[data-form-action="ok"]'))`);
      await form.eval(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(values)})) { const e = document.querySelector('[data-form="' + k + '"]'); e.value = String(v); e.dispatchEvent(new Event('change', { bubbles: true })); } return 1; })()`);
      await form.click('[data-form-action="ok"]');
    };
    // One dialog: choosing the sphere brings its radius field.
    await fire(app, `k.run('mesh:regularSolid')`);
    const solidForm = await app.popup('form');
    await solidForm.waitFor(`Boolean(document.querySelector('[data-form="kind"]'))`);
    await solidForm.eval(`(() => { const e = document.querySelector('[data-form="kind"]'); e.value = 'sphere'; e.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await solidForm.waitFor(`Boolean(document.querySelector('[data-form="radius"]'))`);
    await answer({ radius: 11 });
    await app.main.waitFor(`window.__mycad.actions.activeDrawing().entities.some((e) => e.kind === 'mesh')`);
    let d = await drawing(app);
    const mesh = d.entities.find((e) => e.kind === 'mesh');
    const before = mesh.shape.tris.length / 9;
    // A curvature plot: a copy with a colour per triangle.
    await m(app, `(k.actions.select([${JSON.stringify(mesh.id)}]), 1)`);
    await fire(app, `k.run('mesh:curvaturePlot')`);
    await answer({ which: 'mean' });
    await app.main.waitFor(`window.__mycad.actions.activeDrawing().entities.filter((e) => e.kind === 'mesh').length === 2`);
    d = await drawing(app);
    const plot = d.entities.filter((e) => e.kind === 'mesh')[1];
    assert.equal(plot.shape.colors.length, before * 3);
    await m(app, `(k.actions.change('op.delete', (dd) => { dd.entities = dd.entities.filter((e) => e.id !== ${JSON.stringify(plot.id)}); }), 1)`);
    // Cut away what is inside a polygon drawn round the middle of the top view.
    await m(app, `(k.actions.select([${JSON.stringify(mesh.id)}]), 1)`);
    await m(app, 'k.actions.toggle3d(true).then(() => 1)');
    await fire(app, `k.run('viewTop')`);
    await sleep(400);
    await fire(app, `k.run('mesh:polyCut')`);
    await sleep(300);
    await m(app, `(() => { const v = k.actions.view3d(); const c = v.canvas; const r = c.getBoundingClientRect(); const tris = v.entityTris.get(${JSON.stringify(mesh.id)}); let s = [0, 0, 0]; let n = 0; for (const tri of tris) for (const p of tri) { s = s.map((x, i) => x + p[i]); n++; } const [cx, cy] = v.projectToScreen([s.map((x) => x / n)])[0]; const pts = [[-25, -25], [25, -25], [25, 25], [-25, 25]].map(([dx, dy]) => [r.left + cx + dx, r.top + cy + dy]); for (const [x, y] of pts) c.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, button: 0, bubbles: true, pointerId: 1 })); c.dispatchEvent(new MouseEvent('contextmenu', { clientX: pts[0][0], clientY: pts[0][1], bubbles: true })); return 1; })()`);
    await app.main.waitFor(`window.__mycad.actions.activeDrawing().entities.find((e) => e.kind === 'mesh').shape.tris.length / 9 < ${before}`);
    const after = (await drawing(app)).entities.find((e) => e.kind === 'mesh').shape.tris.length / 9;
    assert.ok(after > before / 2, `only the middle went (${after} of ${before})`);
    // Inspection: the 11 mm sphere against a 10 mm solid sphere, moved so their centres agree.
    const nominal = await m(app, `k.actions.insertSolid('sphere', { radius: 10 }, { x: 0, y: 0, z: 0 }).id`);
    await app.main.waitFor(`Boolean(window.__mycad.actions.view3d()?.entityTris?.get(${JSON.stringify(nominal)}))`);
    await m(app, `(() => { const v = k.actions.view3d(); const meshId = ${JSON.stringify(mesh.id)}; const centre = (id) => { const lo = [1e9, 1e9, 1e9]; const hi = [-1e9, -1e9, -1e9]; for (const tri of v.entityTris.get(id)) for (const p of tri) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); } return lo.map((x, i) => (x + hi[i]) / 2); }; const a = centre(${JSON.stringify(nominal)}); const b = centre(meshId); k.actions.change('op.move', (dd) => { const e = dd.entities.find((x) => x.id === meshId); e.x = (e.x ?? 0) + a[0] - b[0]; e.y = (e.y ?? 0) + a[1] - b[1]; e.z = (e.z ?? 0) + a[2] - b[2]; }); return 1; })()`);
    await m(app, `(k.actions.select([${JSON.stringify(mesh.id)}, ${JSON.stringify(nominal)}]), 1)`);
    await fire(app, `k.run('inspection:visual')`);
    const report = await app.popup('form');
    await report.waitFor(`Boolean(document.querySelector('[data-form="rms"]'))`);
    const result = (await drawing(app)).entities.find((e) => e.shape?.inspect);
    near(result.shape.inspect.max, 1, 0.08);
    assert.ok(result.shape.inspect.min > 0.5, `all outside the nominal (${result.shape.inspect.min})`);
    await report.click('[data-form-action="ok"]');
    await m(app, 'k.actions.toggle3d(false).then(() => 1)');
  } },
  { group: 'Editing', name: 'Spreadsheet styles: bold from the main window, a Shift+click block merged and centred, CSV import', async run(app) {
    await fresh(app);
    await gone(app, 'spreadsheet');
    await m(app, `k.actions.importSheetCsv(null, { text: 'part,qty\\nbolt,4\\nnut,8\\n', name: 'parts.csv' }).then(() => 1)`);
    assert.deepEqual((await drawing(app)).spreadsheet.cells, { A1: 'part', B1: 'qty', A2: 'bolt', B2: '4', A3: 'nut', B3: '8' });
    await fire(app, "k.run('spreadsheet')");
    const win = await app.popup('spreadsheet');
    await win.waitFor(`Boolean(document.querySelector('[data-sheet-cmd="bold"]'))`);
    // Bold from the main window goes to the open spreadsheet window's picked cell.
    await fire(app, "k.run('sheet:bold')");
    await win.waitFor(`document.querySelector('[data-sheet-cell="A1"]').classList.contains('sb')`);
    // A block A2:B3 picked with Shift+click, merged and centred.
    await win.click('[data-sheet-cell="A2"]');
    await win.eval(`(() => { document.querySelector('[data-sheet-cell="B3"]').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })); return 1; })()`);
    await win.click('[data-sheet-cmd="merge"]');
    await win.click('[data-sheet-cmd="alignCenter"]');
    await win.waitFor(`document.querySelector('[data-sheet-cell="A2"]').style.gridColumn.includes('span 2')`);
    assert.equal(await win.eval(`Boolean(document.querySelector('[data-sheet-cell="B3"]'))`), false, 'covered cells are not shown');
    assert.deepEqual(await win.eval(LAYOUT_CHECK), [], 'window fits');
    await win.click('[data-action="sheet-apply"]');
    await sleep(250);
    const sheet = (await drawing(app)).spreadsheet;
    assert.deepEqual(sheet.merged, [{ from: 'A2', to: 'B3' }]);
    assert.deepEqual(sheet.styles.A1, { b: true });
    assert.equal(sheet.styles.B3.h, 'center');
  } },
  { group: 'Assembly', name: 'Perpendicular joint, gears coupling, grounded part, bill of materials; OpenSCAD hull; robot trajectory from edges', async run(app) {
    await fresh(app);
    const a = await m(app, `k.actions.insertSolid('box', { length: 10, width: 10, height: 10 }, { x: 0, y: 0, z: 0 }).id`);
    const b = await m(app, `k.actions.insertSolid('cylinder', { radius: 3, height: 20 }, { x: 30, y: 0, z: 0 }).id`);
    // Perpendicular: the cylinder's axis turns square to the box's.
    await m(app, `(k.actions.select([${JSON.stringify(a)}, ${JSON.stringify(b)}]), 1)`);
    await fire(app, `k.run('joint:perpendicular')`);
    let d = await drawing(app);
    const j1 = d.joints.find((j) => j.type === 'perpendicular');
    assert.ok(j1, 'joint made');
    const cyl = d.entities.find((e) => e.id === b);
    near(Math.abs(Math.cos(cyl.rx * Math.PI / 180) * Math.cos(cyl.ry * Math.PI / 180)), 0, 1e-6);
    // Two revolute joints on a base, the second follows the first as a gear pair.
    const c = await m(app, `k.actions.insertSolid('cylinder', { radius: 10, height: 2 }, { x: 0, y: 40, z: 0 }).id`);
    const e = await m(app, `k.actions.insertSolid('cylinder', { radius: 5, height: 2 }, { x: 15, y: 40, z: 0 }).id`);
    await m(app, `(k.actions.select([${JSON.stringify(a)}, ${JSON.stringify(c)}]), k.run('joint:revolute'), k.actions.select([${JSON.stringify(a)}, ${JSON.stringify(e)}]), k.run('joint:revolute'), 1)`);
    await fire(app, `k.run('joint:gears')`);
    const form = await app.popup('form');
    await form.waitFor(`Boolean(document.querySelector('[data-form="r1"]'))`);
    await form.eval(`(() => { const ids = [...document.querySelector('[data-form="leader"]').options].map((o) => o.value); const set = (k, v) => { const el = document.querySelector('[data-form="' + k + '"]'); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }; set('leader', ids.at(-2)); set('follower', ids.at(-1)); set('r1', '10'); set('r2', '5'); return 1; })()`);
    await form.click('[data-form-action="ok"]');
    await app.main.waitFor(`(window.__mycad.actions.activeDrawing().joints ?? []).some((j) => j.follow)`);
    d = await drawing(app);
    const follower = d.joints.find((j) => j.follow);
    near(follower.follow.ratio, -2);
    // Grounded, then the bill of materials as a text document.
    await m(app, `(k.actions.select([${JSON.stringify(a)}]), 1)`);
    await fire(app, `k.run('asm:grounded')`);
    assert.equal((await drawing(app)).entities.find((x) => x.id === a).grounded, true);
    await fire(app, `k.run('asm:bom')`);
    d = await drawing(app);
    // One box and three cylinders: a header and two rows.
    const bomLines = d.textDocs.at(-1).text.split('\n');
    assert.equal(bomLines.length, 3);
    assert.match(bomLines[2], /\s3\s/);
    // OpenSCAD hull of the box and the first cylinder: one closed mesh.
    await m(app, `(k.actions.select([${JSON.stringify(a)}, ${JSON.stringify(c)}]), 1)`);
    await fire(app, `k.run('scad:hull')`);
    d = await drawing(app);
    const hull = d.entities.at(-1);
    assert.equal(hull.kind, 'mesh');
    // A robot and a trajectory from a 2D line.
    await fire(app, `k.run('robot:add')`);
    const robot = (await drawing(app)).entities.at(-1).id;
    const line = await m(app, `k.actions.change('op.line', (dd) => k.drawingModule.addEntity(dd, 'line', { x1: 500, y1: -100, x2: 500, y2: 100 })).id`);
    await m(app, `(k.actions.select([${JSON.stringify(robot)}, ${JSON.stringify(line)}]), 1)`);
    await fire(app, `k.run('robot:edge2trac')`);
    d = await drawing(app);
    assert.equal(d.robots[robot].trajectories.length, 1);
    assert.deepEqual(d.robots[robot].trajectories[0].points.map((p) => p.map(Math.round)), [[500, -100, 0], [500, 100, 0]]);
  } },
  { group: 'CAM', name: 'CAM job: adaptive operation on a rectangle (dialog), holding tags, comment, G-code inspected, sanity check', async run(app) {
    await fresh(app);
    const rect = await m(app, `k.actions.change('op.rect', (d) => k.drawingModule.addEntity(d, 'rect', { x: 0, y: 0, width: 60, height: 40 })).id`);
    await m(app, `(k.actions.select([${JSON.stringify(rect)}]), 1)`);
    const ok = async () => { const f = await app.popup('form'); await f.waitFor(`Boolean(document.querySelector('[data-form-action="ok"]'))`); await f.click('[data-form-action="ok"]'); return f; };
    await fire(app, `k.run('camjob:adaptive')`);
    await ok();
    await app.main.waitFor(`(window.__mycad.actions.activeDrawing().camJob?.ops ?? []).length === 1`);
    let d = await drawing(app);
    assert.equal(d.camJob.controllers.length, 1, 'a tool controller made with the job');
    assert.deepEqual(d.camJob.ops[0].source, [rect]);
    await fire(app, `k.run('camjob:dress:tag')`);
    await ok();
    await app.main.waitFor(`window.__mycad.actions.activeDrawing().camJob.ops[0].dressups.length === 1`);
    await fire(app, `k.run('camjob:comment')`);
    await ok();
    await app.main.waitFor(`window.__mycad.actions.activeDrawing().camJob.ops.length === 2`);
    await fire(app, `k.run('camjob:inspect')`);
    const view = await app.popup('form');
    await view.waitFor(`Boolean(document.querySelector('[data-form="gcode"]'))`);
    const text = await view.eval(`document.querySelector('[data-form="gcode"]').value`);
    assert.match(text, /T1 M6/);
    assert.match(text, /\(Operation: .*adaptive\)|\(Operation: .*적응형/);
    assert.match(text, /M30/);
    await view.click('[data-form-action="ok"]');
    await sleep(250);
    await fire(app, `k.run('camjob:sanity')`);
    const check = await app.popup('form');
    await check.waitFor(`Boolean(document.querySelector('.popup-body'))`);
    assert.match(await check.eval(`document.querySelector('.popup-body').textContent`), /문제가 없습니다|No problems/);
    await check.click('[data-form-action="ok"]');
  } },
  { group: 'FEM', name: 'FEM analysis: cantilever example solved and coloured, warp filter, pressure load (dialog), histogram chart', async run(app) {
    await fresh(app);
    const ok = async (values = {}) => {
      const f = await app.popup('form');
      await f.waitFor(`Boolean(document.querySelector('[data-form-action="ok"]'))`);
      await f.eval(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(values)})) { const e = document.querySelector('[data-form="' + k + '"]'); e.value = String(v); e.dispatchEvent(new Event('change', { bubbles: true })); } return 1; })()`);
      await f.click('[data-form-action="ok"]');
    };
    await fire(app, `k.run('femx:examples')`);
    await ok({ which: 'cantilever' });
    await app.main.waitFor(`(window.__mycad.actions.activeDrawing().entities ?? []).some((e) => e.kind === 'mesh' && e.shape.colors)`, { timeout: 30000 });
    let d = await drawing(app);
    assert.equal(d.femAnalysis.constraints.length, 2);
    const result = d.entities.find((e) => e.kind === 'mesh');
    assert.equal(result.shape.colors.length * 3, result.shape.tris.length);
    assert.ok(d.groups.some((g) => g.femResults), 'results in their own group');
    // Warp by 100: the tip goes down about 100 × 0.2 mm.
    await fire(app, `k.run('femx:warp')`);
    await ok({ field: 'displacement', factor: 100 });
    await app.main.waitFor(`window.__mycad.actions.activeDrawing().entities.filter((e) => e.kind === 'mesh').length === 2`, { timeout: 30000 });
    d = await drawing(app);
    const warped = d.entities.filter((e) => e.kind === 'mesh')[1].shape.tris;
    let minZ = Infinity; for (let i = 2; i < warped.length; i += 3) minZ = Math.min(minZ, warped[i]);
    assert.ok(minZ < -10, `bent down: ${minZ}`);
    // A pressure load on the top (no face picked: the side chosen in the dialog).
    const solid = d.femAnalysis.solid;
    await m(app, `(k.actions.select([${JSON.stringify(solid)}]), 1)`);
    await fire(app, `k.run('femx:c:pressure')`);
    await ok({ box: 'zmax', pressure: 0.5 });
    await app.main.waitFor(`window.__mycad.actions.activeDrawing().femAnalysis.constraints.length === 3`);
    assert.deepEqual((await drawing(app)).femAnalysis.constraints[2].faces, [{ box: 'zmax' }]);
    // A histogram of the stresses as a 2D chart (bars in a group).
    await fire(app, `k.run('femx:histogram')`);
    await ok({ field: 'vm', bins: 6 });
    await app.main.waitFor(`window.__mycad.actions.activeDrawing().entities.filter((e) => e.type === 'rect').length === 6`, { timeout: 30000 });
  } },
  { group: 'TechDraw', name: 'TechDraw: active view of a box (dialog), redraw, chain dimensions, cosmetic circle tool, clip group, template fields, hole/shaft fit', async run(app) {
    await fresh(app);
    const ok = async (values = {}) => {
      const f = await app.popup('form');
      await f.waitFor(`Boolean(document.querySelector('[data-form-action="ok"]'))`);
      await f.eval(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(values)})) { const e = document.querySelector('[data-form="' + k + '"]'); e.value = String(v); e.dispatchEvent(new Event('change', { bubbles: true })); } return 1; })()`);
      await f.click('[data-form-action="ok"]');
    };
    const box = await m(app, `k.actions.insertSolid('box', { length: 40, width: 20, height: 10 }, { x: 0, y: 0, z: 0 }).id`);
    await m(app, `(k.actions.select([${JSON.stringify(box)}]), 1)`);
    await fire(app, `k.run('td:activeView')`);
    await ok({ dx: 0, dy: -1, dz: 0, scale: 1 });
    await app.main.waitFor(`(window.__mycad.actions.activeDrawing().groups ?? []).some((g) => g.view?.kind === 'projection')`);
    let d = await drawing(app);
    const view = d.groups.find((g) => g.view?.kind === 'projection');
    const members = () => k2(d).filter((e) => e.group === view.id);
    const k2 = (dd) => dd.entities;
    const xs = members().flatMap((e) => (e.points ?? []).map((p) => p.x));
    near(Math.max(...xs) - Math.min(...xs), 40, 1e-6);
    // The solid gets longer; Redraw page follows it.
    await m(app, `(k.actions.change('op.solid', (dd) => { const e = dd.entities.find((x) => x.id === ${JSON.stringify(box)}); k.drawingModule.updateEntity(dd, e.id, { params: { ...e.params, length: 60 } }); }), 1)`);
    await fire(app, `k.run('td:redraw')`);
    d = await drawing(app);
    const xs2 = d.entities.filter((e) => e.group === view.id).flatMap((e) => (e.points ?? []).map((p) => p.x));
    near(Math.max(...xs2) - Math.min(...xs2), 60, 1e-6);
    // Chain dimensions over three points.
    const pts = await m(app, `[[0, 100], [15, 100], [40, 100]].map(([x, y]) => k.actions.change('op.point', (dd) => k.drawingModule.addEntity(dd, 'point', { x, y })).id)`);
    await m(app, `(k.actions.select(${JSON.stringify(pts)}), 1)`);
    await fire(app, `k.run('td:chainH')`);
    d = await drawing(app);
    assert.deepEqual(d.entities.filter((e) => e.type === 'dim').map((e) => Math.round(e.x2 - e.x1)), [15, 25]);
    // A cosmetic circle drawn with two clicks.
    await m(app, `(k.actions.select([]), 1)`);
    await fire(app, `k.run('td:cosCircle')`);
    await clickAt(app, -40, -40);
    await clickAt(app, -30, -40);
    d = await drawing(app);
    const cos = d.entities.find((e) => e.type === 'circle' && e.cosmetic);
    near(cos.r, 10, 1e-6);
    await m(app, `(k.actions.setTool('select'), 1)`);
    // A clip group shows its members only inside its window.
    await m(app, `(k.actions.select([${JSON.stringify(cos.id)}]), 1)`);
    await fire(app, `k.run('td:clipGroup')`);
    await ok({ x: -50, y: -50, w: 10, h: 20 });
    await app.main.waitFor(`(window.__mycad.actions.activeDrawing().groups ?? []).some((g) => g.clip)`);
    // A page template and its fields.
    await m(app, `(k.actions.change('op.title', (dd) => { dd.title = 'Bracket'; }), 1)`);
    await fire(app, `k.run('td:pageTemplate')`);
    await ok({ size: 'A4' });
    await app.main.waitFor(`window.__mycad.actions.activeDrawing().entities.some((e) => e.field === 'title')`);
    await m(app, `(k.actions.change('op.title', (dd) => { dd.title = 'Bracket B'; }), 1)`);
    await fire(app, `k.run('td:fillFields')`);
    assert.equal((await drawing(app)).entities.find((e) => e.field === 'title').text, 'Bracket B');
    // A diameter dimension with an H7/g6 fit.
    const dia = await m(app, `k.actions.change('op.dim', (dd) => k.drawingModule.addEntity(dd, 'dim', { kind: 'diameter', cx: 0, cy: -100, r: 10, angle: 45 })).id`);
    await m(app, `(k.actions.select([${JSON.stringify(dia)}]), 1)`);
    await fire(app, `k.run('td:holeShaftFit')`);
    await ok({ hole: 'H', holeGrade: '7', shaft: 'g', shaftGrade: '6' });
    await app.main.waitFor(`/H7\\/g6/.test(window.__mycad.actions.activeDrawing().entities.find((e) => e.id === ${JSON.stringify(dia)}).text)`);
  } },
  { group: 'BIM', name: 'BIM: add to / remove from a component, grid, nudge, trash, project levels, working plane, classification, preflight, example building', async run(app) {
    await fresh(app);
    const host = await m(app, `k.actions.insertSolid('box', { length: 100, width: 100, height: 100 }, { x: 0, y: 0, z: 0 }).id`);
    const part = await m(app, `k.actions.insertSolid('box', { length: 50, width: 100, height: 100 }, { x: 100, y: 0, z: 0 }).id`);
    // Arch_Add: the host is selected last; the part hides and the host's shape takes it in.
    await m(app, `(k.actions.select([${JSON.stringify(part)}, ${JSON.stringify(host)}]), 1)`);
    await m(app, `k.run('bim:add').then(() => 1)`);
    let d = await drawing(app);
    assert.deepEqual(d.entities.find((e) => e.id === host).components.add, [part]);
    assert.equal(d.entities.find((e) => e.id === part).hidden, true);
    near(await m(app, `k.actions.solidProperties(k.actions.activeDrawing().entities.find((e) => e.id === ${JSON.stringify(host)})).volume`), 150 * 100 * 100, 1e-3);
    // Arch_Remove on the part alone: it leaves the component and shows again.
    await m(app, `(k.actions.select([${JSON.stringify(part)}]), 1)`);
    await m(app, `k.run('bim:remove').then(() => 1)`);
    d = await drawing(app);
    assert.equal(d.entities.find((e) => e.id === host).components, undefined);
    assert.equal(d.entities.find((e) => e.id === part).hidden, undefined);
    // Arch_Grid from spans.
    await m(app, `(k.actions.select([]), 1)`);
    await m(app, `k.run('bim:grid', { values: { columns: '3000, 4500', rows: '2000' } }).then(() => 1)`);
    d = await drawing(app);
    assert.deepEqual(d.entities.find((e) => e.kind === 'axis').shape, { xs: [0, 3000, 7500], ys: [0, 2000] });
    // BIM_Nudge_Right moves by the grid size; Nudge_Extend grows a line at both ends.
    const line = await m(app, `k.actions.change('op.line', (dd) => k.drawingModule.addEntity(dd, 'line', { x1: 0, y1: 0, x2: 20, y2: 0 })).id`);
    await m(app, `(k.actions.select([${JSON.stringify(line)}]), 1)`);
    await m(app, `k.run('bim:nudgeRight').then(() => k.run('bim:nudgeExtend')).then(() => 1)`);
    const moved = (await drawing(app)).entities.find((e) => e.id === line);
    assert.deepEqual([moved.x1, moved.x2], [0, 40]);
    // BIM_Trash and BIM_EmptyTrash.
    await m(app, `k.run('bim:trash').then(() => 1)`);
    assert.equal((await drawing(app)).entities.find((e) => e.id === line).group, 'bim-trash');
    await m(app, `k.run('bim:emptyTrash').then(() => 1)`);
    assert.equal((await drawing(app)).entities.some((e) => e.id === line), false);
    // BIM_Project: three levels of 3 m.
    await m(app, `k.run('bim:project', { values: { site: 'Site A', building: 'House', levels: 3, height: 3000, ground: 0 } }).then(() => 1)`);
    d = await drawing(app);
    assert.deepEqual(d.bim.levels.map((l) => l.elevation), [0, 3000, 6000]);
    assert.equal(d.bim.building, 'House');
    // BIM_SetWPFront: the working plane stands up facing −y.
    await m(app, `k.run('bim:wpFront').then(() => 1)`);
    assert.deepEqual((await drawing(app)).workPlane.frame.z.map((v) => Math.round(v) + 0), [0, -1, 0]);
    await m(app, `k.run('bim:wpTop').then(() => 1)`);
    assert.equal((await drawing(app)).workPlane, undefined);
    // BIM_Classification and BIM_Convert on the host.
    await m(app, `(k.actions.select([${JSON.stringify(host)}]), 1)`);
    await m(app, `k.run('bim:classification', { values: { system: 'Uniclass 2015', preset: 'EF_25_10', code: '', title: '' } }).then(() => k.run('bim:convert', { values: { type: 'IfcFooting' } })).then(() => 1)`);
    const bim = (await drawing(app)).entities.find((e) => e.id === host).bim;
    assert.deepEqual([bim.classification.code, bim.ifcType], ['EF_25_10', 'IfcFooting']);
    // BIM_Preflight lists its tests in a dialog.
    await fire(app, `k.run('bim:preflight')`);
    const pf = await app.popup('form');
    await pf.waitFor(`document.querySelectorAll('.form-list-row').length === 9`);
    await closeAllPopups(app);
    // BIM_Examples: a house in a new drawing.
    const tabs = await m(app, 'k.state.docs.length');
    await m(app, `k.run('bim:examples').then(() => 1)`);
    assert.equal(await m(app, 'k.state.docs.length'), tabs + 1);
    d = await drawing(app);
    assert.deepEqual(d.entities.map((e) => e.kind), ['wall', 'wall', 'wall', 'wall', 'slab', 'roof', 'space']);
    assert.ok(d.entities.filter((e) => e.kind === 'wall').every((e) => e.material?.id === 'brick'));
  } },
  { group: 'BIM', name: 'BIM structures and IFC: cut plane, frame, axis + structural system, merged walls, pipe connector, panel cut, IFC data, wires, reference, diff, explorer', async run(app) {
    await fresh(app);
    const ids = () => m(app, 'k.actions.activeDrawing().entities.map((e) => e.id)');
    const byId = async (id) => (await drawing(app)).entities.find((e) => e.id === id);
    const addRaw = (type, data) => m(app, `k.actions.change('op.add', (dd) => k.drawingModule.addEntity(dd, ${JSON.stringify(type)}, ${JSON.stringify(data)})).id`);
    const pick = (list) => m(app, `(k.actions.select(${JSON.stringify(list)}), 1)`);
    const run = (id, ctx) => m(app, `k.run(${JSON.stringify(id)}${ctx ? `, ${JSON.stringify(ctx)}` : ''}).then(() => 1)`);
    const errors = () => m(app, `k.state.notice?.kind === 'error' ? k.state.notice.text : ''`);
    // Arch_CutPlane: the top half of a box goes (a removable subtraction).
    const box = await m(app, `k.actions.insertSolid('box', { length: 100, width: 100, height: 100 }, { x: 0, y: 0, z: 0 }).id`);
    await pick([box]);
    await run('bim:cutPlane', { values: { axis: 'z', offset: 40, side: 'above' } });
    near(await m(app, `k.actions.solidProperties(k.actions.activeDrawing().entities.find((e) => e.id === ${JSON.stringify(box)})).volume`), 100 * 100 * 40, 1e-3);
    // Arch_Frame: a 20 × 10 profile along a 500 mm line.
    const prof = await addRaw('rect', { x: -10, y: -5, width: 20, height: 10 });
    const path1 = await addRaw('line', { x1: 0, y1: 300, x2: 500, y2: 300 });
    await pick([prof, path1]);
    await run('bim:frame');
    const frame = (await drawing(app)).entities.find((e) => e.kind === 'sweep');
    near(await m(app, `k.actions.solidProperties(k.actions.activeDrawing().entities.find((e) => e.id === ${JSON.stringify(frame.id)})).volume`), 20 * 10 * 500, 1e-2);
    // Arch_AxisSystem from two axes, then Arch_StructuralSystem: a column at each crossing.
    await run('bim:grid', { values: { columns: '4000, 4000', rows: '' } });
    const ax1 = (await ids()).at(-1);
    await run('bim:grid', { values: { columns: '3000', rows: '' } });
    const ax2 = (await ids()).at(-1);
    await pick([ax1, ax2]);
    await run('bim:axisSystem');
    const axis = await byId(ax1);
    assert.deepEqual(axis.shape, { xs: [0, 4000, 8000], ys: [0, 3000] });
    const col = await m(app, `k.actions.insertSolid('column', { width: 300, depth: 300, height: 3000 }, { x: -2000, y: -2000, z: 0 }).id`);
    await pick([ax1, col]);
    await run('bim:structuralSystem');
    const columns = (await drawing(app)).entities.filter((e) => e.kind === 'column' && e.group);
    assert.equal(columns.length, 6);
    // Arch_MergeWalls: two walls end to end become one.
    await pick([]);
    await addRaw('line', { x1: 0, y1: 5000, x2: 3000, y2: 5000 });
    await m(app, `(() => { const a = k.actions; a.select([a.activeDrawing().entities.at(-1).id]); return a.archFeature('wall', { width: 200, height: 2700 }).then(() => 1); })()`);
    const w1 = (await ids()).at(-1);
    await addRaw('line', { x1: 3000, y1: 5000, x2: 3000, y2: 8000 });
    await m(app, `(() => { const a = k.actions; a.select([a.activeDrawing().entities.at(-1).id]); return a.archFeature('wall', { width: 200, height: 2700 }).then(() => 1); })()`);
    const w2 = (await ids()).at(-1);
    await pick([w1, w2]);
    await run('bim:mergeWalls');
    let d = await drawing(app);
    assert.equal(d.entities.filter((e) => e.kind === 'wall').length, 1);
    assert.equal(d.entities.find((e) => e.kind === 'wall').shape.path.length, 3);
    // Arch_PipeConnector between two pipes; Arch_Panel_Cut of a panel.
    for (const [x1, y1, x2, y2] of [[0, 10000, 1000, 10000], [1000, 10000, 1000, 11000]]) {
      await addRaw('line', { x1, y1, x2, y2 });
      await m(app, `(() => { const a = k.actions; a.select([a.activeDrawing().entities.at(-1).id]); return a.archFeature('pipe', { diameter: 100 }).then(() => 1); })()`);
    }
    await pick((await drawing(app)).entities.filter((e) => e.kind === 'pipe').map((e) => e.id));
    await run('bim:pipeConnector');
    const ball = (await drawing(app)).entities.find((e) => e.kind === 'sphere');
    near(ball.x, 1000, 1e-6); near(ball.y, 10000, 1e-6);
    await addRaw('rect', { x: 0, y: 12000, width: 2000, height: 1000 });
    await m(app, `(() => { const a = k.actions; a.select([a.activeDrawing().entities.at(-1).id]); return a.archFeature('panel', { thickness: 20 }).then(() => 1); })()`);
    await pick([(await ids()).at(-1)]);
    await run('bim:panelCut');
    const cut = (await drawing(app)).entities.at(-1);
    assert.equal(cut.type, 'polyline');
    assert.equal(cut.points.length, 4);
    // IFC data on the box: quantities, properties, B-rep flag, IFC class by table, material.
    await pick([box]);
    // (The property text is the whole set; quantities add to it.)
    await run('bim:ifcProperties', { values: { props: 'FireRating = REI 60' } });
    await run('bim:ifcQuantities', { values: { Length: true, Width: true, Height: true, Area: false, Volume: true } });
    await run('bim:toggleBrep');
    await run('bim:ifcElements', { values: { [box]: 'IfcFooting' } });
    await run('bim:material', { values: { material: 'concrete' } });
    const b = await byId(box);
    assert.equal(b.bim.props.FireRating, 'REI 60');
    near(b.bim.props['Qto.Volume'], 0.0004, 1e-6);
    assert.equal(b.bim.brep, true);
    assert.equal(b.bim.ifcType, 'IfcFooting');
    assert.equal(b.color, '#c4c7cc');
    // BIM_Reextrude: the column template gets a new height.
    await pick([col]);
    await run('bim:reextrude', { values: { value: 3500 } });
    assert.equal((await byId(col)).params.height, 3500);
    // BIM_Glue and BIM_Rewire.
    const g1 = await addRaw('line', { x1: 0, y1: -1000, x2: 100, y2: -1000 });
    const g2 = await addRaw('line', { x1: 105, y1: -1000, x2: 200, y2: -1000 });
    await pick([g1, g2]);
    await run('bim:glue');
    assert.equal((await drawing(app)).entities.at(-1).points.length, 4);
    const r = [[0, -2000, 100, -2000], [100, -2000, 100, -1900], [100, -1900, 0, -1900], [0, -1900, 0, -2000]];
    const edges = [];
    for (const [x1, y1, x2, y2] of r) edges.push(await addRaw('line', { x1, y1, x2, y2 }));
    await pick(edges);
    await run('bim:rewire');
    const loop = (await drawing(app)).entities.at(-1);
    assert.deepEqual([loop.type, loop.closed, loop.points.length], ['polyline', true, 4]);
    // IFC_ConvertDocument, then IFC_Diff against this drawing's own IFC (nothing differs) and the explorer.
    await run('bim:ifcConvertDocument');
    d = await drawing(app);
    assert.ok(d.entities.filter((e) => e.type === 'solid').every((e) => e.level));
    const ifc = toIfc(d, { timestamp: '2026-01-01T00:00:00' });
    await fire(app, `k.run('bim:ifcExplorer', { file: { name: 'model.ifc', text: ${JSON.stringify(ifc)} } })`);
    const ex = await app.popup('form');
    await ex.waitFor(`/IFC4/.test(document.querySelector('[data-form="report"]')?.value ?? '')`);
    assert.match(await ex.eval(`document.querySelector('[data-form="report"]').value`), /IfcFooting:/);
    await closeAllPopups(app);
    await fire(app, `k.run('bim:ifcDiff', { file: { name: 'model.ifc', text: ${JSON.stringify(ifc)} } })`);
    const df = await app.popup('form');
    await df.waitFor(`/0/.test(document.querySelector('[data-form="report"]')?.value ?? '')`);
    const diffText = await df.eval(`document.querySelector('[data-form="report"]').value`);
    assert.match(diffText, /Added: 0|추가됨: 0/);
    await closeAllPopups(app);
    // Arch_Reference: the solids of another open drawing, reloaded on demand.
    const source = await m(app, 'k.actions.docName(k.actions.activeDoc())');
    await m(app, `(k.actions.newDrawing(), 1)`);
    await run('bim:reference', { values: { doc: source } });
    d = await drawing(app);
    const refGroup = d.groups.find((g) => g.reference);
    assert.equal(refGroup.reference.source, source);
    const refCount = d.entities.filter((e) => e.group === refGroup.id).length;
    assert.ok(refCount >= 10, `referenced ${refCount}`);
    await pick([d.entities.find((e) => e.group === refGroup.id).id]);
    await run('bim:reference');
    assert.equal((await drawing(app)).entities.filter((e) => e.group === refGroup.id).length, refCount);
    assert.equal(await errors(), '');
  } },
  { group: 'BIM', name: 'BIM tools: survey, IFC sheet, library, image plane, level views, panels, WP view, reorder, ungroup, switch, remove shape, holes, component, compare, expand', async run(app) {
    await fresh(app);
    const ids = () => m(app, 'k.actions.activeDrawing().entities.map((e) => e.id)');
    const byId = async (id) => (await drawing(app)).entities.find((e) => e.id === id);
    const addRaw = (type, data) => m(app, `k.actions.change('op.add', (dd) => k.drawingModule.addEntity(dd, ${JSON.stringify(type)}, ${JSON.stringify(data)})).id`);
    const pick = (list) => m(app, `(k.actions.select(${JSON.stringify(list)}), 1)`);
    const run = (id, ctx) => m(app, `k.run(${JSON.stringify(id)}${ctx ? `, ${JSON.stringify(ctx)}` : ''}).then(() => 1)`);
    const reportText = async () => { const f = await app.popup('form'); await f.waitFor(`Boolean(document.querySelector('[data-form="report"]'))`); const v = await f.eval(`document.querySelector('[data-form="report"]').value`); await closeAllPopups(app); return v; };
    // Arch_Survey: a 2 m line and a 1 m³ box, with totals.
    const line = await addRaw('line', { x1: 0, y1: 0, x2: 2000, y2: 0 });
    const cube = await m(app, `k.actions.insertSolid('box', { length: 1000, width: 1000, height: 1000 }, { x: 5000, y: 0, z: 0 }).id`);
    await pick([line, cube]);
    await fire(app, `k.run('bim:survey')`);
    const survey = await reportText();
    // Totals: 2 m, 6 m² (the cube's faces), 1 m³.
    assert.match(survey, /\t2\t6\t1\s*$/);
    // BIM_IfcSpreadsheet: a table in the drawing's spreadsheet.
    await pick([cube]);
    await fire(app, `k.run('bim:ifcSpreadsheet')`);
    await app.main.waitFor(`window.__mycad.actions.activeDrawing().spreadsheet?.cells?.B2 === 'IfcBuildingElementProxy'`);
    await closeAllPopups(app);
    // BIM_Library: save the cube, insert it back; insert a bed.
    await run('bim:library', { save: 'Cube' });
    const before = (await ids()).length;
    await run('bim:library', { insert: 'u0' });
    await run('bim:library', { insert: 'e0' });
    assert.equal((await ids()).length, before + 2);
    assert.equal((await drawing(app)).entities.at(-1).kind, 'equipment');
    // BIM_ImagePlane: a 2 × 1 picture on a plate.
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DwHwyBDAA9JAL+fUW+GwAAAABJRU5ErkJggg==';
    await run('bim:imagePlane', { data: png });
    const plate = (await drawing(app)).entities.at(-1);
    assert.deepEqual([plate.params.length, plate.params.width, Boolean(plate.texture)], [10000, 5000, true]);
    // BIM_Views: the plan shows one level.
    await run('bim:project', { values: { site: 'S', building: 'B', levels: 2, height: 3000, ground: 0 } });
    const level2 = (await drawing(app)).bim.levels[1].id;
    await run('bim:views', { level: level2 });
    assert.equal((await drawing(app)).bim.planLevel, level2);
    await run('bim:views', { level: null });
    // BIM_TogglePanels twice gives the panels back.
    const panels = () => m(app, `[k.commands.leftPanel.checked(), k.commands.rightPanel.checked()]`);
    const was = await panels();
    await run('bim:togglePanels');
    assert.notDeepEqual(await panels(), was);
    await run('bim:togglePanels');
    assert.deepEqual(await panels(), [true, true]);
    // BIM_WPView: the camera looks down the working plane's normal (front plane: from −y).
    await run('bim:wpFront');
    await run('bim:wpView');
    const cam = await m(app, 'k.actions.view3d().getCamera()');
    const dir = cam.position.map((p, i) => p - cam.target[i]);
    assert.ok(dir[1] < 0 && Math.abs(dir[0]) < 1e-6 && Math.abs(dir[2]) < 1e-6, JSON.stringify(dir));
    await m(app, '(k.actions.toggle3d(false), 1)');
    await run('bim:wpTop');
    // BIM_Reorder: the line goes after the cube.
    await pick([line, cube]);
    await run('bim:reorder', { values: { order: '2: cube\n1: line' } });
    const order = await ids();
    assert.ok(order.indexOf(cube) < order.indexOf(line));
    // BIM_Ungroup.
    await pick([line]);
    await run('newGroup');
    await pick([line]);
    await run('bim:ungroup');
    assert.equal((await byId(line)).group, undefined, 'ungrouped');
    // Arch_ToggleSubs and BIM_Nudge_Switch on a component.
    const tool = await m(app, `k.actions.insertSolid('box', { length: 200, width: 200, height: 200 }, { x: 5400, y: 400, z: 900 }).id`);
    await pick([tool, cube]);
    await run('bim:add');
    await run('bim:toggleSubs');
    assert.equal((await byId(tool)).hidden, undefined, 'subcomponent shown');
    await pick([tool]);
    await run('bim:nudgeSwitch');
    assert.deepEqual(await m(app, '[...k.state.selection]'), [cube]);
    // Arch_Component: the plain box becomes an IFC proxy on the active level.
    await run('bim:component');
    assert.equal((await byId(cube)).bim.ifcType, 'IfcBuildingElementProxy');
    // Arch_RemoveShape: a cuboid mesh becomes a parametric box; Arch_CloseHoles fills an open mesh; Arch_SelectNonSolidMeshes finds it first.
    const tris = [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 0, 0, 10, 10, 0, 0, 10, 0];
    const open = await addRaw('solid', { kind: 'mesh', params: {}, shape: { tris } });
    await run('bim:selectNonSolid');
    assert.deepEqual(await m(app, '[...k.state.selection]'), [open]);
    await run('bim:closeHoles');
    assert.ok((await byId(open)).shape.tris.length > tris.length);
    const cuboid = solidMesh(normalizeSolidData({ kind: 'box', params: { length: 30, width: 20, height: 10 }, x: 100, y: 200, z: 0 })).flat(2);
    const meshed = await addRaw('solid', { kind: 'mesh', params: {}, shape: { tris: cuboid } });
    await pick([meshed]);
    await run('bim:removeShape');
    const boxed = (await drawing(app)).entities.at(-1);
    assert.deepEqual([boxed.kind, boxed.params.length, boxed.params.width, boxed.params.height, boxed.x, boxed.y], ['box', 30, 20, 10, 100, 200]);
    // Arch_Check: every solid is valid.
    await pick([]);
    await run('bim:check');
    // BIM_ResetCloneColors: a recoloured clone takes its source's colour again.
    await pick([line]);
    await m(app, `k.run('clone').then(() => 1)`);
    const clone = (await drawing(app)).entities.at(-1);
    await m(app, `(k.actions.change('op.c', (dd) => k.drawingModule.updateEntity(dd, ${JSON.stringify(clone.id)}, { color: '#ff0000' })), 1)`);
    await run('bim:resetCloneColors');
    assert.equal((await byId(clone.id)).color, (await byId(line)).color, 'clone colour reset');
    // IFC_Expand: the members of the selected object's group.
    await pick([line, cube]);
    await run('newGroup');
    await pick([line]);
    await run('bim:ifcExpand');
    assert.deepEqual((await m(app, '[...k.state.selection]')).sort(), [line, cube].sort());
    // BIM_Diff against a copy with one object moved; IFC_UpdateIOS shows the built-in IFC engine.
    const name = await m(app, 'k.actions.docName(k.actions.activeDoc())');
    const copy = JSON.stringify(await drawing(app));
    await m(app, `(k.actions.newDrawing(), k.actions.change('op.copy', (dd) => { const src = ${copy}; dd.entities = src.entities; dd.layers = src.layers; dd.groups = src.groups; const c = dd.entities.find((e) => e.id === ${JSON.stringify(cube)}); c.x += 500; }), 1)`);
    await fire(app, `k.run('bim:diff', { values: { doc: ${JSON.stringify(name)} } })`);
    assert.match(await reportText(), /~ /);
    await fire(app, `k.run('bim:ifcVersion')`);
    assert.match(await reportText(), /IFC4/);
    assert.equal(await m(app, `k.state.notice?.kind === 'error' ? k.state.notice.text : ''`), '');
  } },
  { group: 'Status bar', name: 'Coordinates, tool, selection, layer, snap toggles, zoom, save state', async run(app) {
    await fresh(app);
    const p = await at(app, 12, 34);
    await app.main.mouse('mouseMoved', p.x, p.y, { button: 'none' });
    await sleep(100);
    assert.match(await app.main.eval(`document.querySelector('#status-coords').textContent`), /X 12(\.\d+)?\s+Y 34/);
    const text = await app.main.eval(`document.querySelector('#statusbar').textContent`);
    for (const part of ['선택 0 / 0', '외형선', '스냅', '격자', '직교', '확대']) assert.ok(text.includes(part), part);
    await app.main.click('#statusbar [data-command="ortho"]');
    assert.equal(await m(app, 'k.state.settings.ortho'), true);
    await app.main.click('#statusbar [data-command="ortho"]');
    const overflow = await app.main.eval(`(() => { const bar = document.querySelector('#statusbar'); const clock = document.querySelector('.status-item.clock'); return clock ? clock.getBoundingClientRect().right <= bar.getBoundingClientRect().right + 1 : true; })()`);
    assert.ok(overflow, 'the clock is not cut off');
  } },

  // ───────────────────────── keyboard
  { group: 'Keyboard', name: 'Shortcuts: tool letters, F3/F7/F8, Ctrl+A, Delete, Ctrl+N', async run(app) {
    await fresh(app);
    await app.main.click('#cad-canvas');
    await app.main.key('L');
    assert.equal(await m(app, 'k.state.toolId'), 'line');
    await app.main.key('Escape');
    await app.main.key('C');
    assert.equal(await m(app, 'k.state.toolId'), 'circle');
    await app.main.key('Escape');
    for (const [key, setting] of [['F3', 'snapObject'], ['F7', 'showGrid'], ['F8', 'ortho']]) {
      const before = await m(app, `k.state.settings.${setting}`);
      await app.main.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code: key, windowsVirtualKeyCode: { F3: 114, F7: 118, F8: 119 }[key] });
      await app.main.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: { F3: 114, F7: 118, F8: 119 }[key] });
      await sleep(100);
      assert.equal(await m(app, `k.state.settings.${setting}`), !before, key);
      await m(app, `(k.actions.updateSettings({ ${setting}: ${before} }), 1)`);
    }
    await m(app, `(k.actions.change('op.line', (d) => { k.drawingModule.addEntity(d, 'line', { x1: 0, y1: 0, x2: 1, y2: 0 }); k.drawingModule.addEntity(d, 'line', { x1: 0, y1: 1, x2: 1, y2: 1 }); }), 1)`);
    await app.main.click('#cad-canvas');
    await app.main.key('a', 2);
    assert.equal(await m(app, 'k.state.selection.size'), 2);
    await app.main.key('Delete');
    assert.equal(await count(app), 0);
    const tabs = await m(app, 'k.state.docs.length');
    await app.main.key('n', 2);
    assert.equal(await m(app, 'k.state.docs.length'), tabs + 1);
  } },

  // ───────────────────────── exit and the next start
  { group: 'Exit', name: 'Unsaved drawing: asks to save on exit; cancel keeps running', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.change('op.circle', (d) => k.drawingModule.addEntity(d, 'circle', { cx: 0, cy: 0, r: 5 })), 1)`);
    await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|close', { label: 'main' }).catch(() => 1); 1`);
    const confirm = await app.popup('confirm');
    await expectPopupWindow(app, confirm, 'confirm');
    const buttons = await confirm.eval(`[...document.querySelectorAll('[data-action="choice"]')].map((b) => b.dataset.value)`);
    assert.deepEqual(buttons, ['cancel', 'discard', 'save']);
    await confirm.click('[data-value="cancel"]');
    await sleep(500);
    assert.equal(app.process.exitCode, null, 'still running');
  } },
  { group: 'Exit', name: 'Next start: settings, last folder, window position and open drawings are remembered', async run(app) {
    const file = path.join(app.files, 'session.mcad');
    await fresh(app);
    await m(app, `(k.actions.change('op.circle', (d) => k.drawingModule.addEntity(d, 'circle', { cx: 0, cy: 0, r: 4 })), k.actions.activeDoc().path = ${JSON.stringify(file)}, 1)`);
    await m(app, 'k.actions.saveDoc(k.actions.activeDoc())');
    await m(app, `(k.actions.updateSettings({ theme: 'nord', gridSize: 5 }), 1)`);
    await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_position', { label: 'main', value: { Logical: { x: 120, y: 90 } } }).then(() => 1)`);
    await sleep(900);
    const place = app.windowInfo().find((w) => w.owner === 0 && w.title === TITLE);
    await app.quit();
    await app.launch();
    const s = await m(app, 'k.state.settings');
    assert.equal(s.theme, 'nord');
    assert.equal(s.gridSize, 5);
    assert.equal(s.lastDirectory, app.files);
    await app.main.waitFor(`window.__mycad.state.docs.some((d) => d.path === ${JSON.stringify(file)})`, { timeout: 30000, message: 'the saved drawing is open again' });
    await sleep(600);
    const again = app.windowInfo().find((w) => w.owner === 0 && w.title === TITLE);
    assert.ok(Math.abs(again.left - place.left) <= 2 && Math.abs(again.top - place.top) <= 2, `window place ${JSON.stringify([place.left, place.top, again.left, again.top])}`);
    await m(app, `(k.actions.updateSettings({ theme: 'light', gridSize: 10 }), 1)`);
  } },
  { group: 'Exit', name: 'Closing the main window closes the popups and ends the program', async run(app) {
    await fire(app, `k.run('about')`);
    await app.popup('about');
    await m(app, `(k.state.docs.forEach((d) => d.markSaved(d.path)), 1)`);
    await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|close', { label: 'main' }).catch(() => 1); 1`);
    const code = await Promise.race([app.exited, sleep(8000).then(() => 'timeout')]);
    assert.notEqual(code, 'timeout', 'the process ended');
    assert.equal(app.windowInfo().length, 0, 'no window left');
    await app.launch();
  } },
];
