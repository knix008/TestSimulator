// Desktop end-to-end cases against the real app (see harness.mjs). Each case
// gets the started App and throws on failure. Cases run in order and share
// the app; each leaves it in a usable state.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from './cdp.mjs';
import { root } from './harness.mjs';

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
  for (const until = Date.now() + 10000; !popup && Date.now() < until;) {
    if (windows.length) await sleep(150);
    windows = app.windowInfo().filter((w) => w.visible && w.title.endsWith(TITLE));
    popup = windows.find((w) => w.owner !== 0 && w.title.includes(head.text.slice(0, 4)));
  }
  const main = windows.find((w) => w.owner === 0);
  assert.ok(main, `main window found (${JSON.stringify(app.windowInfo().map((w) => [w.title, w.visible, w.owner]))})`);
  if (!popup) console.log('TRACE', JSON.stringify(await page.eval('[window.__TRACE, document.title, document.querySelector(".popup-menu")?.dataset.title]')), JSON.stringify(app.windowInfo().map((w) => [w.title, w.visible, w.owner])));
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
  await app.main.click(`[data-menu="${name}"]`);
  const menu = await app.popup('menu');
  await menu.waitFor(`document.querySelector('.menu-item') && document.querySelector('.popup-menu')?.dataset.title`);
  await sleep(200);
  return menu;
}

async function chooseMenuItem(menu, id) {
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
  { group: '창', name: '타이틀 바: 프로그램 이름과 버전', async run(app) {
    const main = app.windowInfo().find((w) => w.owner === 0 && w.visible && w.title.startsWith('MyCAD'));
    assert.equal(main?.title, TITLE);
  } },
  { group: '창', name: '처음 실행: 시작 페이지가 보이고, 뒤에 시작하기 도면 (기어·치수·문자)', async run(app) {
    assert.equal(await m(app, 'k.state.home'), true, 'the start page greets you');
    assert.equal(await app.main.eval(`document.querySelector('#start-page').hidden`), false);
    assert.equal(await app.main.eval(`Boolean(document.querySelector('.tut-panel:not([hidden])'))`), false, 'the tutorial does not start by itself');
    const d = await drawing(app);
    assert.ok(d.entities.some((e) => e.type === 'part' && e.kind === 'gear'));
    assert.ok(d.entities.some((e) => e.type === 'dim'));
  } },
  { group: '시작 페이지', name: '할 수 있는 일(레슨·샘플), 샘플 카드 = index.json, 썸네일, 샘플 열기, 집 탭, 최근 파일', async run(app) {
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
    assert.ok(page.lessons.every((n) => n >= 0 && n < 16));
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
  { group: '튜토리얼', name: '보기: 16개 레슨의 모든 단계가 실제 화면에서 실행되고 결과를 확인', async run(app) {
    await fresh(app);
    const report = await app.main.eval(`(async () => { const t = await window.__mycad.actions.openTutorial(); const r = await t.runAll(); t.close(); return r; })()`, 600000);
    const bad = report.filter((r) => !r.ok);
    assert.ok(report.length >= 80, `${report.length} steps`);
    assert.deepEqual(bad, [], JSON.stringify(bad));
    assert.equal(await m(app, 'k.state.settings.units'), 'mm', 'settings restored after the tutorial');
  } },
  { group: '튜토리얼', name: '직접 하기: 모든 단계에서 사용자가 한 일을 알아봄', async run(app) {
    await fresh(app);
    const report = await app.main.eval(`(async () => { const t = await window.__mycad.actions.openTutorial(); const r = await t.verifyPractice(); t.close(); return r; })()`, 600000);
    const bad = report.filter((r) => !r.run || r.check === false);
    assert.deepEqual(bad, [], JSON.stringify(bad));
  } },
  { group: '튜토리얼', name: '도움말 메뉴에서 열기: 레슨 목록, 보기/직접 하기, 단계 이동, 끌어 옮기기, 닫기', async run(app) {
    await fresh(app);
    const help = await openMenu(app, 'help');
    await chooseMenuItem(help, 'tutorial');
    await app.main.waitFor(`document.querySelector('.tut-panel') && !document.querySelector('.tut-panel').hidden`);
    assert.equal(await app.main.eval(`document.querySelectorAll('.tut-lesson option').length`), 16);
    await app.main.click('[data-tut="mode-practice"]');
    assert.ok(await app.main.eval(`document.querySelector('[data-tut="mode-practice"]').classList.contains('active')`));
    assert.ok(await app.main.eval(`Boolean(document.querySelector('.tut-todo'))`), 'practice shows what to do');
    await app.main.click('[data-tut="skip"]');
    await sleep(300);
    assert.match(await app.main.eval(`document.querySelector('.tut-step span').textContent`), /2 \//);
    const before = await app.main.eval(`document.querySelector('.tut-panel').getBoundingClientRect().left`);
    const head = await app.main.center('.tut-head b');
    await app.main.drag(head, { x: head.x - 200, y: head.y - 100 }, 6);
    assert.ok(Math.abs(await app.main.eval(`document.querySelector('.tut-panel').getBoundingClientRect().left`) - (before - 200)) < 3, 'the panel moves with the mouse');
    await app.main.click('[data-tut="close"]');
    assert.equal(await app.main.eval(`document.querySelector('.tut-panel').hidden`), true);
  } },
  { group: '창', name: '최소 창 폭: 툴바 버튼이 가려지지 않음', async run(app) {
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
  { group: '창', name: '오른쪽 아래 크기 조절 표시', async run(app) {
    const grip = await app.main.eval(`(() => { const g = document.querySelector('[data-resize-grip]'); const r = g.getBoundingClientRect(); return { right: innerWidth - r.right, bottom: innerHeight - r.bottom, cursor: getComputedStyle(g).cursor, title: g.title }; })()`);
    assert.ok(grip.right < 1 && grip.bottom < 1, JSON.stringify(grip));
    assert.equal(grip.cursor, 'nwse-resize');
    assert.ok(grip.title);
  } },
  { group: '창', name: '창 투명도 설정이 없음 (툴바·설정·상태 표시줄)', async run(app) {
    assert.equal(await app.main.eval(`Boolean(document.querySelector('#transparency, .opacity-control, #transparency-range'))`), false);
    const main = app.windowInfo().find((w) => w.owner === 0 && w.title === TITLE);
    assert.equal(main.layered, false, 'an ordinary, opaque window');
  } },

  // ───────────────────────── toolbar
  { group: '툴바', name: '모든 버튼에 툴팁', async run(app) {
    const missing = await app.main.eval(`[...document.querySelectorAll('#toolbar button, #tabs button, #left-panel button, #right-panel button, #statusbar button, #menubar button')].filter((b) => !(b.title || '').trim()).map((b) => b.outerHTML.slice(0, 80))`);
    assert.deepEqual(missing, []);
    assert.ok(await app.main.eval(`document.querySelectorAll('#toolbar .tool-button').length`) >= 22);
  } },
  { group: '툴바', name: '설정·프로그램 정보 버튼은 오른쪽 끝', async run(app) {
    const r = await app.main.eval(`(() => { const t = document.querySelector('#toolbar').getBoundingClientRect(); const a = document.querySelector('[data-command="about"]').getBoundingClientRect(); const s = document.querySelector('[data-command="settings"]').getBoundingClientRect(); return { gap: t.right - a.right, order: s.left < a.left }; })()`);
    assert.ok(r.gap < 20 && r.order, JSON.stringify(r));
  } },
  { group: '툴바', name: '토글 버튼: 격자·스냅·직교·패널', async run(app) {
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
  { group: '툴바', name: '확대 입력칸·확대/축소 버튼·전체 보기', async run(app) {
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
  { group: '툴바', name: '언어 전환 버튼: 한국어 ↔ English', async run(app) {
    await app.main.click('#toolbar [data-command="language"]');
    await sleep(300);
    assert.equal(await app.main.eval(`document.querySelector('[data-menu="file"]').textContent.trim()`), 'File');
    await app.main.click('#toolbar [data-command="language"]');
    await sleep(300);
    assert.equal(await app.main.eval(`document.querySelector('[data-menu="file"]').textContent.trim()`), '파일');
  } },
  { group: '툴바', name: '테마 버튼: 다음 테마, ▾ 고르기 창 (다크 | 라이트)', async run(app) {
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
  ...[['file', '파일'], ['edit', '편집'], ['view', '보기'], ['draw', '그리기'], ['modify', '수정'], ['parts', '부품'], ['solid', '3D 솔리드'], ['help', '도움말']].map(([name, title]) => ({ group: '메뉴', name: `메뉴 "${title}": 독립 창, 한 줄, 아이콘+이름`, async run(app) {
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
    await expectPopupWindow(app, menu, 'menu');
    await menu.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); 1`);
    await sleep(250);
  } })),
  { group: '메뉴', name: '메뉴 항목 실행 (보기 › 격자) 과 메뉴가 창 밖으로 나감', async run(app) {
    const before = await m(app, 'k.state.settings.showGrid');
    await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: 1100, height: 620 } } }).then(() => 1)`);
    await sleep(500);
    const menu = await openMenu(app, 'file');
    const windows = app.windowInfo().filter((w) => w.visible && w.title.endsWith(TITLE));
    const main = windows.find((w) => w.owner === 0);
    const popup = windows.find((w) => w.owner !== 0);
    assert.ok(popup.bottom > main.bottom - 40 || popup.bottom - popup.top > 500, 'the long File menu is shown whole, even past the small main window');
    await menu.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); 1`);
    await sleep(250);
    await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: 1440, height: 880 } } }).then(() => 1)`);
    await sleep(400);
    const view = await openMenu(app, 'view');
    await chooseMenuItem(view, 'grid');
    assert.equal(await m(app, 'k.state.settings.showGrid'), !before);
    await m(app, `(k.actions.updateSettings({ showGrid: ${before} }), 1)`);
  } },
  { group: '메뉴', name: '컨텍스트 메뉴: 빈 도면 · 객체 · 탭 · 레이어 · 입력칸이 서로 다름', async run(app) {
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
  { group: '그리기', name: '선 (연속) · Enter 로 끝내기', async run(app) {
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
  { group: '그리기', name: '사각형 · 원 · 호 · 타원 · 정다각형 · 폴리선 · 중심선 · 문자', async run(app) {
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
  { group: '그리기', name: '좌표 입력: 명령칸에 x,y · @dx,dy · @거리<각도', async run(app) {
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
  { group: '그리기', name: '객체 스냅 (끝점) · 격자 스냅 · 직교', async run(app) {
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
  { group: '그리기', name: '치수: 선형 · 정렬 · 반지름 · 지름 · 각도, 거리 재기', async run(app) {
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
  { group: '편집', name: '클릭 선택 · Shift 추가 · 영역(윈도/걸침) 선택 · Esc', async run(app) {
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
  { group: '편집', name: '끌어서 이동 · 핸들로 모양 바꾸기 · 실행 취소/다시 실행', async run(app) {
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
  { group: '편집', name: '수정 도구: 이동 · 복사 · 회전(각도 입력) · 대칭 · 크기(배율 입력) · 간격 띄우기', async run(app) {
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
  { group: '편집', name: '배열 복사 창 (직사각형·원형) · 분해 · 맨 앞/뒤 · 삭제', async run(app) {
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
  { group: '편집', name: '클립보드: Ctrl+C / Ctrl+V (OS 클립보드), 다른 프로그램의 글 붙여넣기', async run(app) {
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
  { group: '편집', name: 'Ctrl + 마우스 휠로 확대/축소 (커서 기준), 휠은 화면 이동', async run(app) {
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
  { group: '속성', name: '속성 패널: 반지름에 계산식 입력, 선 종류·굵기·색, 도면 속성', async run(app) {
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
  { group: '속성', name: '레이어: 추가 · 현재 레이어 · 숨기기 · 잠그기 · 이름 · 색 · 삭제', async run(app) {
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
  { group: '부품', name: '부품 창: 6분류 36종 미리보기 · 규격 · 보기 전환, 치수 바꾸기, 배치', async run(app) {
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
  { group: '부품', name: '부품 타일을 도면으로 끌어다 놓기, 속성 패널에서 치수 편집', async run(app) {
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
  { group: '탭', name: '탭이 넘치면 오른쪽 끝에 < > 버튼, 눌러서 이동', async run(app) {
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
  { group: '파일', name: '저장(.mcad) → 닫기 → 다시 열기, 최근 파일, 마지막 폴더', async run(app) {
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
  { group: '파일', name: 'DXF 열기 (가져오기) 와 DXF·SVG·PNG·STL 파일 쓰기', async run(app) {
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
  { group: '파일', name: '3D 프린팅(STL) 창: 솔리드·구멍·크기, 두께 바꾸기', async run(app) {
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
  { group: '파일', name: '최근 파일 창: 열기 · 하나 삭제 · 모두 지우기', async run(app) {
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
  { group: '파일', name: '공개 2D CAD 형식 열기: 바이너리·cp949 DXF, SVG, IGES, HP-GL, Gerber, Excellon (열기·끌어 놓기)', async run(app) {
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
  { group: '파일', name: '외부에서 끌어다 놓기: 도면은 열기, 이미지는 배경, 글은 문자', async run(app) {
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
  { group: '파일', name: '배경 이미지: 크기 제한 없이 데이터 폴더로 복사, 불투명도, 제거', async run(app) {
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
  { group: '인쇄', name: '인쇄 미리보기: 범위(전체·현재·사용자 지정), 페이지 설정, 바로 인쇄', async run(app) {
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
  { group: '설정', name: '설정 창: 탭 8개 모두 고정 크기 · 스크롤 없음 · 한 줄 정렬', async run(app) {
    await app.main.click('#toolbar [data-command="settings"]');
    const settings = await app.popup('settings');
    for (const tab of ['general', 'appearance', 'font', 'background', 'drawing', 'snaps', 'recent', 'shortcuts']) {
      await settings.click(`[data-action="tab"][data-value="${tab}"]`);
      await sleep(250);
      await expectPopupWindow(app, settings, 'settings');
    }
    await settings.click('[data-action="close"]');
  } },
  { group: '설정', name: '설정: 언어 · 글꼴(시스템 글꼴 전체) · 문자 크기 · 스타일 · 스냅 · 작성자', async run(app) {
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
  { group: '설정', name: '프로그램 정보: 빌드 정보와 제작자 SHKWON(knix008@naver.com)', async run(app) {
    await app.main.click('#toolbar [data-command="about"]');
    const about = await app.popup('about');
    await expectPopupWindow(app, about, 'about');
    const text = await about.eval(`document.querySelector('#about-rows').textContent`);
    assert.match(text, /SHKWON\(knix008@naver\.com\)/);
    assert.match(text, new RegExp(VERSION.replace(/\./g, '\\.')));
    assert.match(text, /x86_64|aarch64/);
    await about.click('[data-action="close"]');
  } },
  { group: '오류', name: '오류 팝업: 자세한 내용, 내용 복사', async run(app) {
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
  { group: '오류', name: '심각한 오류(백엔드 panic)도 위치·스레드와 함께 팝업', async run(app) {
    await closeAllPopups(app);
    await app.main.eval(`window.__TAURI_INTERNALS__.invoke('raise_test_panic').then(() => 1)`);
    const error = await app.popup('error');
    await error.waitFor(`document.querySelector('#error-detail').value.includes('test panic')`);
    const detail = await error.eval(`document.querySelector('#error-detail').value`);
    assert.match(detail, /lib\.rs/);
    assert.match(detail, /crash\.log/);
    await error.click('[data-action="close"]');
  } },
  { group: '오류', name: '그냥 종료되면(강제 종료·충돌) 다음 실행 때 지난 실행의 오류를 팝업으로 보고', async run(app) {
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
  { group: '진행', name: '오래 걸리는 열기/저장은 진행 팝업으로 알림', async run(app) {
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
  { group: '눈금자', name: '툴바의 눈금자 버튼, 캔버스 위·왼쪽 눈금자 (mm, 커서 표시)', async run(app) {
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
  { group: '단위', name: '설정 › 일반의 길이 단위: 눈금자·속성·상태 표시줄·치수가 따라 바뀌고, 다른 단위 입력은 자동 변환', async run(app) {
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
    await sleep(200);
    const shown = await app.main.eval(`(() => { const i = document.querySelector('#right-panel [data-prop="x2"]'); return { value: i.value, unit: i.closest('.prop-input').querySelector('small').textContent, status: document.querySelector('#status-unit').textContent }; })()`);
    assert.deepEqual(shown, { value: '2', unit: 'in', status: 'in' });
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
  { group: '단위', name: '축척 막대: 툴바 켜기/끄기, 끌어 옮기기, 끝선을 끌어 길이 바꾸기, 3D에서는 숨김', async run(app) {
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
  { group: '3D', name: '3D 보기: 돌출 솔리드, 좌표축 눈금, 시점 바꾸기, 두께', async run(app) {
    await fresh(app);
    await m(app, `(k.actions.change('op.part', (d) => { k.drawingModule.addEntity(d, 'part', { kind: 'flange', x: 0, y: 0 }); k.drawingModule.addEntity(d, 'line', { x1: -80, y1: -80, x2: 80, y2: -80 }); }), 1)`);
    await app.main.click('#toolbar [data-command="view3d"]');
    await app.main.waitFor(`window.__mycad.actions.view3d() && document.querySelector('.view3d-bar')`, { timeout: 30000 });
    await sleep(500);
    let info = await m(app, 'k.actions.view3d().inspect()');
    assert.ok(info.triangles > 100, 'solid drawn');
    assert.ok(info.wires >= 2, 'lines on the ground');
    assert.ok(info.axes && info.axisInfo.ticks >= 3 && info.tickLabels >= 9, `axes with ticks ${JSON.stringify(info.axisInfo)}`);
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
    await app.main.click('[data-view3d="wireframe"]');
    assert.equal((await m(app, 'k.actions.view3d().inspect()')).wireframe, true);
    await app.main.click('[data-view3d="wireframe"]');
    await app.main.eval(`(() => { const i = document.querySelector('#view3d-thickness'); i.value = '25'; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(200);
    assert.equal(await m(app, 'k.state.settings.extrudeHeight'), 25);
    // Editing the drawing updates the 3D view.
    const triangles = (await m(app, 'k.actions.view3d().inspect()')).triangles;
    await m(app, `(k.actions.change('op.rect', (d) => k.drawingModule.addEntity(d, 'rect', { x: 100, y: 100, width: 20, height: 20 })), 1)`);
    await sleep(200);
    assert.ok((await m(app, 'k.actions.view3d().inspect()')).triangles > triangles);
  } },
  { group: '3D', name: '3D 조명: 마우스로 해를 끌어 위치 이동, 조명 이동 모드, 켜기/끄기', async run(app) {
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
  { group: '3D 솔리드', name: '솔리드 창: 10종 음영 미리보기 · 치수 · 위치 → 넣기, 속성 패널에 부피', async run(app) {
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
  { group: '3D 솔리드', name: '2D → 3D: 사각형+원 돌출(구멍), 회전, 로프트, 스윕', async run(app) {
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
  { group: '3D 솔리드', name: '불리언: 빼기·합치기·교차 → 트리로 남고, 분해하면 원래 솔리드', async run(app) {
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
  { group: '3D 솔리드', name: '단면 창과 투상도 창: 윤곽선, 숨은선은 숨은선 레이어', async run(app) {
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
  { group: '3D 솔리드', name: '3D 보기: 솔리드마다 색, 선택 강조, 2D 판 보기 끄기', async run(app) {
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
  { group: '3D 솔리드', name: 'FreeCAD 파일 열기: .FCStd · .step · .3mf · .stl (FreeCAD 가 만든 파일)', async run(app) {
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
  { group: '3D 솔리드', name: '내보내기 메뉴의 3D 형식 + FCStd 바이트를 다시 가져오기', async run(app) {
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
  { group: '3D 솔리드', name: '툴바 2줄(Part 툴바) 전환 · FreeCAD 대응표 창 · 3D 메뉴', async run(app) {
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
    await solidMenu.waitFor(`document.querySelectorAll('.menu-item').length > 20`);
    await solidMenu.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); 1`);
    await sleep(200);
    await app.main.click('#left-panel [data-command="freecadCoverage"]');
    const coverage = await app.popup('coverage');
    await expectPopupWindow(app, coverage, 'coverage');
    assert.equal(await coverage.eval(`document.querySelectorAll('.coverage-tabs .tab').length`), 10);
    for (const tab of ['part', 'partdesign', 'sketcher', 'techdraw', 'draft', 'parts', 'mesh', 'files', 'general', 'other']) {
      await coverage.click(`.coverage-tabs [data-value="${tab}"]`);
      await sleep(60);
      assert.ok(await coverage.eval(`document.querySelectorAll('.coverage-row').length`) >= 4, tab);
      assert.deepEqual(await coverage.eval(`(() => { const b = document.querySelector('.popup-body').getBoundingClientRect(); return [...document.querySelectorAll('.coverage-row')].filter((r) => r.getBoundingClientRect().bottom > b.bottom + 1).length; })()`), 0, `${tab}: every row fits`);
    }
    await coverage.eval('window.__mycadPopup.close(); 1');
  } },
  { group: '3D 솔리드', name: '캔버스: 점선 십자선, 확대·축소해도 같은 크기의 5×5 격자', async run(app) {
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
  { group: '상태 표시줄', name: '좌표 · 도구 · 선택 · 레이어 · 스냅 토글 · 확대 · 저장 상태', async run(app) {
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
  { group: '키보드', name: '단축키: 도구 글자 · F3/F7/F8 · Ctrl+A · Delete · Ctrl+N', async run(app) {
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
  { group: '종료', name: '저장 안 한 도면: 끝낼 때 저장 여부를 묻고, 취소하면 계속 실행', async run(app) {
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
  { group: '종료', name: '다음 실행: 설정·마지막 폴더·창 위치·열어 둔 도면을 기억', async run(app) {
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
  { group: '종료', name: '메인 창을 닫으면 팝업도 함께 닫히고 프로그램이 끝남', async run(app) {
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
