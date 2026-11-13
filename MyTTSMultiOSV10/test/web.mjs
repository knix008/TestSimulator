// web — the page in headless Edge, served by server.js (no Tauri bridge, no synthesis), driven
// with real mouse and keyboard input through CDP: start screen and its cards, themes, menus,
// toolbar, tooltips, text tabs, context menus, voice panel, dialogs and the guide page.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { launchEdge, Page, sleep, waitForTarget } from '../scripts/lib/cdp.mjs';

export const meta = { name: 'web', description: 'GUI in headless Edge: start screen, themes, menus, tabs, dialogs, guide' };

const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

export function cases(ctx) {
  const list = [];
  const add = (name, run, options = {}) => list.push({ name, run, ...options });
  let browser = null;
  let server = null;
  let page = null;
  let url = '';
  ctx.defer(async () => { await browser?.close(); server?.kill(); });

  const ev = (expr, ms) => page.eval(expr, ms);
  const q = (selector) => JSON.stringify(selector);
  const count = (selector) => ev(`document.querySelectorAll(${q(selector)}).length`);
  const click = (selector) => page.click(selector);
  const domClick = (selector) => ev(`(document.querySelector(${q(selector)}).click(), true)`);
  const onStart = () => ev(`document.querySelector('#app').classList.contains('on-start')`);
  /** A fresh page: storage cleared (or `storage` set), reloaded, booted. */
  async function fresh(storage = {}, path0 = '') {
    await page.navigate(`${url}/about-blank-for-reset.txt`).catch(() => {});
    await page.navigate(`${url}/${path0}`);
    await page.waitFor(`document.readyState === 'complete'`);
    await ev(`(() => { localStorage.clear(); for (const [k, v] of Object.entries(${JSON.stringify(storage)})) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); return true; })()`);
    await page.navigate(`${url}/${path0}`);
    await page.waitFor(`document.querySelectorAll('#toolbar .tool-button').length > 10 && document.querySelectorAll('#modelSelect option').length > 1`, 15000, 'the page to boot');
  }
  const toStart = async () => { if (!(await onStart())) { await domClick('#menubar [data-cmd="home"]'); await page.waitFor(`document.querySelector('#app').classList.contains('on-start')`); } };
  const toEditor = async () => { if (await onStart()) { await domClick('[data-start="editor"]'); await page.waitFor(`!document.querySelector('#app').classList.contains('on-start')`); } };
  const allIconsColoured = (scope) => ev(`(() => { const icons = [...document.querySelectorAll(${q(scope)})].flatMap((e) => [...e.querySelectorAll('svg.icon')]); return { n: icons.length, plain: icons.filter((i) => !i.dataset.tone || getComputedStyle(i).color === getComputedStyle(document.body).color).length }; })()`);

  // ── setup ──
  add('Start the web server and headless Edge', async () => {
    const port = await freePort();
    server = spawn(process.execPath, [path.join(ctx.root, 'server.js')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
    url = `http://localhost:${port}`;
    for (let i = 0; i < 50; i += 1) { try { await fetch(url); break; } catch { await sleep(100); } }
    browser = await launchEdge({ width: 1440, height: 900 });
    page = browser.page;
    await fresh();
  }, { critical: true, timeout: 60000 });
  add('Page boots without script errors (web mode, no desktop bridge)', async () => {
    assert.deepEqual(page.consoleErrors, []);
    assert.equal(await ev('typeof window.ttsBridge'), 'undefined');
    assert.equal(await ev('document.title'), 'TTS Multi OS');
  });

  // ── start screen ──
  add('Start screen: fixed title card, six board cards, tools and footer', async () => {
    assert.ok(await onStart());
    assert.deepEqual(await ev(`[...document.querySelectorAll('.start-board > .start-card')].map((c) => c.dataset.card)`), ['actions', 'recent', 'models', 'samples', 'theme', 'background']);
    assert.equal(await count('.start-card-hero'), 1);
    assert.equal(await ev(`!!document.querySelector('.start-card-hero').closest('.start-board')`), false);
    assert.equal(await count('.start-tools .start-btn'), 3);
    assert.match(await ev(`document.querySelector('.start-foot').textContent`), /TTS Multi OS v0\.1\.0/);
  });
  add('Start screen: the title card has no move handle or resize corner', async () => {
    assert.equal(await count('.start-card-hero [data-card-handle], .start-card-hero [data-card-resize]'), 0);
    const before = await ev(`JSON.stringify(document.querySelector('.start-card-hero').getBoundingClientRect())`);
    const box = await page.center('.start-card-hero .start-icon');
    await page.drag(box, { x: box.x + 300, y: box.y + 250 });
    assert.equal(await ev(`JSON.stringify(document.querySelector('.start-card-hero').getBoundingClientRect())`), before);
  });
  add('Start screen: the title card offers user guide, tutorial, about and start', async () => {
    assert.deepEqual(await ev(`[...document.querySelectorAll('.start-card-hero [data-start]')].map((b) => b.dataset.start)`), ['guide', 'tutorial', 'about', 'editor']);
  });
  add('Start screen: a card moves by its handle (real drag) and the layout is saved', async () => {
    const from = await page.center('[data-card-handle="theme"]');
    const target = await page.center('[data-card="actions"]');
    await page.drag(from, { x: target.x - 250, y: target.y - 40 }, 20);
    await sleep(300);
    const layout = await ev(`JSON.parse(localStorage.getItem('tts-ui-settings')).startLayout`);
    assert.ok(layout?.cards?.theme, 'saved');
    assert.equal(layout.cards.theme.row, 0);
  });
  add('Start screen: a card resizes from its corner (real drag)', async () => {
    const before = await ev(`document.querySelector('[data-card="recent"]').getBoundingClientRect().height`);
    const corner = await page.center('[data-card-resize="recent"]');
    await page.drag(corner, { x: corner.x, y: corner.y + 160 }, 15);
    await sleep(300);
    const after = await ev(`document.querySelector('[data-card="recent"]').getBoundingClientRect().height`);
    assert.ok(after > before + 100, `${before} → ${after}`);
  });
  add('Start screen: auto arrange restores the default arrangement', async () => {
    await click('[data-start="arrange"]');
    await sleep(400);
    const order = await ev(`[...document.querySelectorAll('.start-board > .start-card')].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || a.getBoundingClientRect().left - b.getBoundingClientRect().left).map((c) => c.dataset.card)`);
    assert.deepEqual(order.slice(0, 2), ['actions', 'recent']);
    assert.equal(order.at(-1), 'background');
  });
  add('Start screen: moving background has 20 kinds and draws frames', async () => {
    assert.equal(await count('[data-start="animation"]'), 20);
    await click('[data-start="animation"][data-value="starfield"]');
    await sleep(200);
    assert.equal(await ev(`document.querySelector('[data-start="animation"].on').dataset.value`), 'starfield');
    const sample = `(() => { const c = document.querySelector('.start-bg'); return c.getContext('2d').getImageData(0, 0, c.width, c.height).data.reduce((s, v, i) => (i % 97 ? s : s + v), 0); })()`;
    const a = await ev(sample);
    await sleep(400);
    assert.notEqual(await ev(sample), a, 'the background moves');
  });
  add('Start screen: card opacity and motion speed sliders apply and persist', async () => {
    await ev(`(() => { const r = document.querySelector('[data-start-opacity]'); r.value = 45; r.dispatchEvent(new Event('input', { bubbles: true })); const s = document.querySelector('[data-start-speed]'); s.value = 200; s.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    assert.equal(await ev(`document.querySelector('.start-inner').style.getPropertyValue('--start-card-alpha')`), '45%');
    const s = await ev(`JSON.parse(localStorage.getItem('tts-ui-settings'))`);
    assert.equal(s.startCardOpacity, 45);
    assert.equal(s.animationSpeed, 200);
  });
  add('Start screen: settings dialog hides and shows cards', async () => {
    await click('.start-tools [data-start="start-settings"]');
    await page.waitFor(`document.querySelector('#startSettingsDialog').open`);
    assert.ok(await count('#startSettingsDialog .icon[data-tone]') >= 8, 'coloured icons');
    await ev(`(() => { const c = document.querySelector('#startSettingsDialog [data-setting="startShowSamples"]'); c.click(); return true; })()`);
    assert.equal(await count('.start-board [data-card="samples"]'), 0);
    await ev(`(document.querySelector('#startSettingsDialog [data-setting="startShowSamples"]').click(), true)`);
    assert.equal(await count('.start-board [data-card="samples"]'), 1);
    await domClick('#startSettingsDialog [data-close]');
  });
  add('Start screen: models card lists six models; clicking one opens the editor with it', async () => {
    assert.equal(await count('[data-start="model"]'), 4); // web mode: the fallback catalog
    await click('[data-start="model"][data-value="en-kokoro"]');
    await page.waitFor(`!document.querySelector('#app').classList.contains('on-start')`);
    assert.equal(await ev(`document.querySelector('#modelSelect').value`), 'en-kokoro');
  });
  add('Start screen: "show at startup" off starts in the editor next time', async () => {
    await domClick('#menubar [data-cmd="home"]');
    await ev(`(document.querySelector('[data-start-toggle]').click(), true)`);
    await page.navigate(url);
    await page.waitFor(`document.querySelectorAll('#toolbar .tool-button').length > 10`);
    assert.equal(await onStart(), false);
    await fresh();
  });
  add('Samples: each of the six opens in a tab with its text and language', async () => {
    const samples = await ev(`[...document.querySelectorAll('[data-start="sample"]')].map((b) => b.dataset.value)`);
    assert.equal(samples.length, 10);
    for (const id of samples) {
      await toStart();
      await click(`[data-start="sample"][data-value="${id}"]`);
      await page.waitFor(`!document.querySelector('#app').classList.contains('on-start')`);
      const state = await ev(`({ text: document.querySelector('#textInput').value, lang: document.querySelector('#languageSelect').value, tab: document.querySelector('#docTabs .tab.active .tab-name').textContent })`);
      assert.ok(state.text.length > 50, id);
      assert.equal(state.lang, id.startsWith('english') ? 'en-US' : 'ko-KR', id);
      assert.match(state.tab, /^예제 · /);
    }
    assert.equal(await count('#docTabs .tab'), 10, 'ten tabs (the untouched first tab was reused)');
    // The same sample again goes to its tab instead of opening a copy.
    await toStart();
    await click('[data-start="sample"][data-value="korean_news"]');
    await page.waitFor(`!document.querySelector('#app').classList.contains('on-start')`);
    assert.equal(await count('#docTabs .tab'), 10);
    assert.equal(await ev(`document.querySelector('#docTabs .tab.active .tab-name').textContent`), '예제 · 뉴스');
  });

  // ── themes ──
  add('Themes: theme card has 20 dark and 20 light tiles', async () => {
    await fresh();
    assert.equal(await count('[data-theme-kind="dark"] [data-start="pick-theme"]'), 20);
    assert.equal(await count('[data-theme-kind="light"] [data-start="pick-theme"]'), 20);
  });
  add('Themes: all 40 apply (mode, colours, status bar name)', async () => {
    const ids = await ev(`[...document.querySelectorAll('[data-start="pick-theme"]')].map((b) => b.dataset.value)`);
    const seen = new Set();
    for (const id of ids) {
      await domClick(`[data-start="pick-theme"][data-value="${id}"]`);
      const s = await ev(`({ id: document.documentElement.dataset.themeId, mode: document.documentElement.dataset.mode, accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), bg: getComputedStyle(document.body).backgroundColor, on: document.querySelector('[data-start="pick-theme"].on')?.dataset.value, dark: !!document.querySelector('[data-theme-kind="dark"] [data-value="${id}"]') })`);
      assert.equal(s.id, id);
      assert.equal(s.on, id);
      assert.equal(s.mode, s.dark ? 'dark' : 'light', id);
      seen.add(`${s.accent}|${s.bg}`);
    }
    assert.ok(seen.size >= 38, `distinct looks: ${seen.size}`);
    assert.match(await ev(`document.querySelector('#statusTheme').textContent`), /\S/);
  });
  add('Themes: dialog offers system, custom and 40 themes; custom colours apply', async () => {
    await domClick('#statusTheme');
    await page.waitFor(`document.querySelector('#themeDialog').open`);
    assert.equal(await count('#themeDialog [data-start="dlg-theme"]'), 42);
    await ev(`(() => { const i = document.querySelector('#themeDialog [data-custom-key="accent"]'); i.value = '#ff0066'; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    assert.equal(await ev(`getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()`), '#ff0066');
    assert.equal(await ev(`document.documentElement.dataset.themeId`), 'custom');
    assert.match(await ev(`document.querySelector('#statusTheme').textContent`), /사용자 정의/);
    await ev(`(document.querySelector('#themeDialog [data-custom-dark]').click(), true)`);
    assert.equal(await ev(`document.documentElement.dataset.mode`), 'dark');
    const before = await ev(`document.documentElement.dataset.themeId`);
    await domClick('#themeDialog [data-random]');
    assert.notEqual(await ev(`document.documentElement.dataset.themeId`), before);
    await domClick('#themeDialog [data-close]');
  });
  add('Themes: the choice survives a reload', async () => {
    await domClick('[data-start="pick-theme"][data-value="nord"]');
    await page.navigate(url);
    await page.waitFor(`document.documentElement.dataset.themeId === 'nord'`);
  });

  // ── window chrome ──
  add('Menu bar: Home and the menus come right after the version; tab name after the menus', async () => {
    const order = await ev(`[...document.querySelector('#menubar').children].map((e) => e.className.split(' ')[0])`);
    assert.deepEqual(order.slice(0, 4), ['app-brand', 'menubar-item', 'menubar-sep', 'menubar-item']);
    assert.equal(order.indexOf('app-brand-project'), order.lastIndexOf('menubar-item') + 1);
    const gap = await ev(`document.querySelector('.menubar-home').getBoundingClientRect().left - document.querySelector('.app-brand-version').getBoundingClientRect().right`);
    assert.ok(gap >= 0 && gap < 30, `gap ${gap}`);
  });
  add('Window: a dotted-triangle resize grip sits at the bottom right', async () => {
    const r = await ev(`(() => { const g = document.querySelector('#resizeGrip'); const b = g.getBoundingClientRect(); return { icon: g.querySelector('svg')?.dataset.icon, right: innerWidth - b.right, bottom: innerHeight - b.bottom, static: g.classList.contains('static'), dots: g.querySelectorAll('circle').length }; })()`);
    assert.deepEqual(r, { icon: 'grip', right: 0, bottom: 0, static: true, dots: 6 });
  });
  add('Menu bar: icon, name, version, Home and five menus', async () => {
    await fresh();
    assert.match(await ev(`document.querySelector('.app-brand').textContent`), /TTS Multi OS\s*v0\.1\.0/);
    assert.deepEqual(await ev(`[...document.querySelectorAll('#menubar [data-menu]')].map((b) => b.textContent.trim())`), ['파일', '재생', '모델', '보기', '도움말']);
    assert.equal(await count('#menubar .menubar-home'), 1);
    assert.equal(await count('#menubar [data-window]'), 0, 'no window buttons in a browser');
  });
  add('Menus: every menu opens with coloured icons on every item', async () => {
    for (const name of ['file', 'play', 'model', 'view', 'help']) {
      await click(`#menubar [data-menu="${name}"]`);
      await page.waitFor(`document.querySelector('.menu-layer .popup-menu')`);
      const items = await ev(`[...document.querySelectorAll('.menu-layer .menu-item')].map((b) => ({ label: b.textContent.trim(), tone: b.querySelector('svg.icon')?.dataset.tone || '' }))`);
      assert.ok(items.length >= 2, name);
      assert.deepEqual(items.filter((i) => !i.tone), [], name);
      await page.key('Escape');
      assert.equal(await count('.menu-layer'), 0);
    }
  });
  add('Menus: hovering another menu name switches the open menu', async () => {
    await click('#menubar [data-menu="file"]');
    const view = await page.center('#menubar [data-menu="view"]');
    await page.mouse('mouseMoved', view.x, view.y, { button: 'none' });
    await page.waitFor(`document.querySelector('#menubar [data-menu="view"]').classList.contains('open')`);
    await page.key('Escape');
  });
  add('Menus: Help has the user guide, tutorial and about', async () => {
    await click('#menubar [data-menu="help"]');
    const labels = await ev(`[...document.querySelectorAll('.menu-layer .menu-item')].map((b) => b.dataset.cmd)`);
    assert.deepEqual(labels, ['guide', 'tutorial', 'about']);
    await page.key('Escape');
  });
  add('Toolbar: every button has a tooltip and a coloured icon', async () => {
    const buttons = await ev(`[...document.querySelectorAll('#toolbar .tool-button')].map((b) => ({ cmd: b.dataset.cmd, title: b.title || b.dataset.tip || '', tone: b.querySelector('svg')?.dataset.tone }))`);
    assert.ok(buttons.length >= 20, `${buttons.length} buttons`);
    assert.deepEqual(buttons.filter((b) => !b.title || !b.tone).map((b) => b.cmd), []);
    for (const cmd of ['newText', 'open', 'closeTab', 'save', 'saveAs', 'speak', 'speakAll', 'pause', 'stop', 'download', 'deleteModel', 'refresh', 'home', 'themeSettings', 'guide', 'about']) assert.ok(buttons.some((b) => b.cmd === cmd), cmd);
  });
  add('Toolbar: buttons follow the state (no audio → pause, stop, save disabled)', async () => {
    const state = await ev(`Object.fromEntries(['pause', 'stop', 'save', 'speak'].map((c) => [c, document.querySelector('#toolbar [data-cmd="' + c + '"]').disabled]))`);
    assert.deepEqual(state, { pause: true, stop: true, save: true, speak: false });
  });
  add('Tooltips: appear quickly on hover', async () => {
    await toEditor();
    const b = await page.center('#toolbar [data-cmd="about"]');
    await page.mouse('mouseMoved', b.x, b.y, { button: 'none' });
    await page.waitFor(`document.querySelector('.app-tooltip')?.textContent.includes('프로그램 정보')`, 2000);
    await page.mouse('mouseMoved', 5, 600, { button: 'none' });
  });
  add('Home: toggles start screen and editor (button and Ctrl+Home)', async () => {
    assert.equal(await onStart(), false);
    await click('#menubar .menubar-home');
    assert.equal(await onStart(), true);
    await page.key('Home', { ctrl: true });
    await page.waitFor(`!document.querySelector('#app').classList.contains('on-start')`);
  });
  add('Sections: every header and label of the main window has a coloured icon', async () => {
    for (const scope of ['.panel-section h3', '.param-label', '.form-row > label', '.panel-header', '#right-panel .check-row', '#statusbar .status-item']) {
      const r = await allIconsColoured(scope);
      assert.ok(r.n > 0, `${scope}: no icons`);
      assert.equal(r.plain, 0, `${scope}: ${r.plain} of ${r.n} not coloured`);
    }
    assert.equal(await ev(`[...document.querySelectorAll('.param-label')].filter((l) => !l.querySelector('svg')).length`), 0);
  });
  add('Window: the toolbar is never cut off at the minimum size (1180×720)', async () => {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 720, deviceScaleFactor: 1, mobile: false });
    await sleep(300);
    const r = await ev(`(() => { const t = document.querySelector('#toolbar .toolbar-inner'); const last = [...t.querySelectorAll('.tool-button')].at(-1).getBoundingClientRect(); return { right: last.right, width: innerWidth, overflow: t.scrollWidth - t.clientWidth }; })()`);
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    assert.ok(r.right <= r.width && r.overflow <= 0, JSON.stringify(r));
  });
  add('View menu: the status bar can be hidden and shown again', async () => {
    await click('#menubar [data-menu="view"]');
    await click('.menu-layer [data-cmd="statusBar"]');
    assert.equal(await ev(`getComputedStyle(document.querySelector('#statusbar')).display`), 'none');
    await click('#menubar [data-menu="view"]');
    await click('.menu-layer [data-cmd="statusBar"]');
    assert.notEqual(await ev(`getComputedStyle(document.querySelector('#statusbar')).display`), 'none');
  });

  // ── text tabs ──
  add('Tabs: "+" and Ctrl+N open new tabs with unique names', async () => {
    await fresh();
    await toEditor();
    await click('#docTabs [data-tab-add]');
    await page.key('n', { ctrl: true });
    const names = await ev(`[...document.querySelectorAll('#docTabs .tab-name')].map((n) => n.textContent)`);
    assert.ok(names.length >= 2);
    assert.equal(new Set(names).size, names.length, names.join(', '));
  });
  add('Tabs: each tab keeps its own text, cursor and dirty mark', async () => {
    await click('#docTabs .tab:nth-child(2)');
    await click('#textInput');
    await page.type('두 번째 탭의 글');
    await click('#docTabs .tab:first-child');
    const first = await ev(`document.querySelector('#textInput').value`);
    await click('#docTabs .tab:nth-child(2)');
    const second = await ev(`({ text: document.querySelector('#textInput').value, dirty: document.querySelector('#docTabs .tab.active').classList.contains('dirty') })`);
    assert.notEqual(first, second.text);
    assert.equal(second.text, '두 번째 탭의 글');
    assert.ok(second.dirty);
    assert.match(await ev(`document.querySelector('.app-brand-project').className`), /dirty/);
  });
  add('Tabs: "<" ">" are always there and scroll the strip when tabs overflow', async () => {
    assert.equal(await count('#docTabs .tab-scroll'), 2);
    assert.deepEqual(await ev(`[...document.querySelectorAll('#docTabs .tab-scroll')].map((b) => b.disabled)`), [true, true]);
    for (let i = 0; i < 10; i += 1) await domClick('#docTabs [data-tab-add]');
    assert.equal(await ev(`document.querySelectorAll('#docTabs .tab-scroll')[1].disabled`), true, 'at the right end after a new tab');
    assert.equal(await ev(`document.querySelectorAll('#docTabs .tab-scroll')[0].disabled`), false);
    await click('#docTabs .tab-scroll[data-tab-scroll="-1"]');
    await click('#docTabs .tab-scroll[data-tab-scroll="-1"]');
    await click('#docTabs .tab-scroll[data-tab-scroll="-1"]');
    assert.equal(await ev(`document.querySelector('#docTabs .tab-strip').scrollLeft`), 0);
    assert.equal(await ev(`document.querySelectorAll('#docTabs .tab-scroll')[1].disabled`), false);
  });
  add('Tabs: Ctrl+Tab and Ctrl+Shift+Tab move between tabs (wrapping)', async () => {
    await click('#docTabs .tab:first-child');
    await page.key('Tab', { ctrl: true, shift: true });
    const last = await ev(`[...document.querySelectorAll('#docTabs .tab')].at(-1).classList.contains('active')`);
    await page.key('Tab', { ctrl: true });
    const first = await ev(`document.querySelector('#docTabs .tab:first-child').classList.contains('active')`);
    assert.ok(last && first);
  });
  add('Tabs: closing a modified tab asks; cancel keeps it, OK closes it', async () => {
    await click('#docTabs .tab:nth-child(2)');
    const n = await count('#docTabs .tab');
    await click('#docTabs .tab.active .tab-close');
    await page.waitFor(`document.querySelector('#confirmDialog').open`);
    await click('#confirmDialog .popup-foot button[value="cancel"]');
    assert.equal(await count('#docTabs .tab'), n);
    await click('#docTabs .tab.active .tab-close');
    await page.waitFor(`document.querySelector('#confirmDialog').open`);
    await click('#confirmOkBtn');
    await page.waitFor(`document.querySelectorAll('#docTabs .tab').length === ${n - 1}`);
  });
  add('Tabs: middle click closes; closing the last tab leaves a fresh one', async () => {
    const n = await count('#docTabs .tab');
    await page.click('#docTabs .tab:last-child .tab-name', { button: 'middle' });
    await page.waitFor(`document.querySelectorAll('#docTabs .tab').length === ${n - 1}`);
    await ev(`(async () => { while (document.querySelectorAll('#docTabs .tab').length > 1) { document.querySelectorAll('#docTabs .tab-close')[0].click(); await new Promise((r) => setTimeout(r, 30)); if (document.querySelector('#confirmDialog').open) document.querySelector('#confirmOkBtn').click(); await new Promise((r) => setTimeout(r, 30)); } return true; })()`);
    await page.key('w', { ctrl: true });
    await page.waitFor(`document.querySelectorAll('#docTabs .tab').length === 1`);
    assert.equal(await ev(`document.querySelector('#docTabs .tab-name').textContent`), '새 텍스트');
  });
  add('Tabs: context menu (coloured icons) closes the other tabs', async () => {
    await domClick('#docTabs [data-tab-add]');
    await domClick('#docTabs [data-tab-add]');
    const tab = await page.center('#docTabs .tab:first-child');
    await page.mouse('mousePressed', tab.x, tab.y, { button: 'right' });
    await page.mouse('mouseReleased', tab.x, tab.y, { button: 'right' });
    await page.waitFor(`document.querySelector('.context-menu')`);
    assert.equal((await allIconsColoured('.context-menu .menu-item')).plain, 0);
    await ev(`([...document.querySelectorAll('.context-menu .menu-item')].find((b) => b.textContent.includes('다른 탭 모두 닫기')).click(), true)`);
    await page.waitFor(`document.querySelectorAll('#docTabs .tab').length === 1`);
  });

  // ── editor ──
  add('Editor: context menu has coloured icons and the editing commands', async () => {
    await ev(`(() => { const t = document.querySelector('#textInput'); t.value = 'Hello world. This is English.'; t.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    const box = await page.center('#textInput');
    await page.mouse('mousePressed', box.x, box.y, { button: 'right' });
    await page.mouse('mouseReleased', box.x, box.y, { button: 'right' });
    await page.waitFor(`document.querySelector('.context-menu')`);
    const items = await ev(`[...document.querySelectorAll('.context-menu .menu-item')].map((b) => b.textContent.trim().replace(/\\s+/g, ' '))`);
    for (const word of ['실행 취소', '다시 실행', '잘라내기', '복사', '붙여넣기', '모두 선택', '읽기', '모든 화자로 생성', '텍스트 모두 지우기']) assert.ok(items.some((i) => i.includes(word)), word);
    assert.equal((await allIconsColoured('.context-menu .menu-item')).plain, 0);
    await page.key('Escape');
    assert.equal(await count('.context-menu'), 0);
  });
  add('Editor: "select all" then "clear" empties the text; undo brings it back', async () => {
    const open = async () => { const b = await page.center('#textInput'); await page.mouse('mousePressed', b.x, b.y, { button: 'right' }); await page.mouse('mouseReleased', b.x, b.y, { button: 'right' }); await page.waitFor(`document.querySelector('.context-menu')`); };
    const pick = (word) => ev(`([...document.querySelectorAll('.context-menu .menu-item')].find((b) => b.textContent.includes(${q(word)})).click(), true)`);
    await open(); await pick('모두 선택');
    assert.equal(await ev(`(() => { const t = document.querySelector('#textInput'); return t.selectionEnd - t.selectionStart; })()`), 29);
    await open(); await pick('텍스트 모두 지우기');
    assert.equal(await ev(`document.querySelector('#textInput').value`), '');
    await open(); await pick('실행 취소');
    assert.equal(await ev(`document.querySelector('#textInput').value`), 'Hello world. This is English.');
  });
  add('Editor: the synthesis language follows the text (English → en-US)', async () => {
    await page.waitFor(`document.querySelector('#languageSelect').value === 'en-US'`, 3000);
    await ev(`(() => { const t = document.querySelector('#textInput'); t.value = '한국어 문장입니다.'; t.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await page.waitFor(`document.querySelector('#languageSelect').value === 'ko-KR'`, 3000);
  });

  // ── voice panel ──
  add('Voice panel: sliders update their labels, reset restores defaults', async () => {
    const set = (id, v) => ev(`(() => { const r = document.querySelector('#${id}'); r.value = ${v}; r.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await set('volumeRange', 150); await set('speedRange', 150); await set('pitchRange', -3);
    assert.deepEqual(await ev(`['volumeLabel', 'speedLabel', 'pitchLabel'].map((id) => document.getElementById(id).textContent)`), ['150%', '1.50×', '-3']);
    await click('#saveAudioDefaults');
    assert.deepEqual(await ev(`['volumeLabel', 'speedLabel', 'pitchLabel'].map((id) => document.getElementById(id).textContent)`), ['100%', '1.00×', '±0']);
  });
  add('Voice panel: voice settings are kept for the next start', async () => {
    await ev(`(() => { const r = document.querySelector('#speedRange'); r.value = 130; r.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await page.navigate(url);
    await page.waitFor(`document.querySelectorAll('#toolbar .tool-button').length > 10`);
    assert.equal(await ev(`document.querySelector('#speedLabel').textContent`), '1.30×');
    await ev(`(document.querySelector('#saveAudioDefaults').click(), true)`);
  });
  add('Advanced settings: normalize dims the target level; reset; kept after reload', async () => {
    await toEditor();
    await click('#normalizeCheck');
    assert.equal(await ev(`document.querySelector('#normalizeLevelRow').style.opacity`), '0.35');
    await ev(`(() => { const r = document.querySelector('#noiseScaleRange'); r.value = 120; r.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await page.navigate(url);
    await page.waitFor(`document.querySelectorAll('#toolbar .tool-button').length > 10`);
    assert.equal(await ev(`document.querySelector('#noiseScaleLabel').textContent`), '1.20');
    assert.equal(await ev(`document.querySelector('#normalizeCheck').checked`), false);
    await toEditor();
    await click('#pcmDefaultsBtn');
    assert.deepEqual(await ev(`[document.querySelector('#noiseScaleLabel').textContent, document.querySelector('#noiseScaleRange').value, document.querySelector('#normalizeCheck').checked]`), ['0.67', '67', true]);
  });
  add('Voice panel: the three model buttons fit side by side (no overflow)', async () => {
    const r = await ev(`(() => { const p = document.querySelector('#right-panel'); return { overflow: p.scrollWidth - p.clientWidth, buttons: [...document.querySelectorAll('.model-row .button')].map((b) => b.scrollWidth <= b.clientWidth + 1) }; })()`);
    assert.equal(r.overflow, 0);
    assert.deepEqual(r.buttons, [true, true, true]);
  });

  // ── waveform and reading (web mode) ──
  add('Waveform: right-click menu with coloured icons; audio commands disabled without audio', async () => {
    const box = await page.center('#waveformCanvas');
    await page.mouse('mousePressed', box.x, box.y, { button: 'right' });
    await page.mouse('mouseReleased', box.x, box.y, { button: 'right' });
    await page.waitFor(`!document.querySelector('#waveformContextMenu').hidden`);
    assert.equal((await allIconsColoured('#waveformContextMenu .menu-item')).plain, 0);
    assert.deepEqual(await ev(`[...document.querySelectorAll('#waveformContextMenu [data-action]')].filter((b) => b.disabled).map((b) => b.dataset.action)`), ['save-audio', 'pause', 'stop', 'seek-here', 'seek-start', 'seek-end']);
    await page.key('Escape');
  });
  add('Reading in a browser explains that synthesis needs the desktop program', async () => {
    await click('#speakText');
    await page.waitFor(`document.querySelector('#errorDialog').open`);
    assert.match(await ev(`document.querySelector('#errorDetails').textContent`), /데스크톱 앱\(Tauri\)/);
    assert.equal(await count('#errorDialog #copyError'), 1);
    await click('#errorDialog .popup-foot button[value="close"]');
  });
  add('All speakers: disabled when the model is not installed', async () => {
    assert.equal(await ev(`document.querySelector('#speakAllVoices').disabled`), true);
    assert.equal(await ev(`document.querySelector('#speakerPanel').hidden`), true);
  });

  // ── dialogs ──
  add('About: version, contact and the model table', async () => {
    await click('#toolbar [data-cmd="about"]');
    await page.waitFor(`document.querySelector('#aboutDialog').open`);
    const text = await ev(`document.querySelector('#aboutDialog').textContent`);
    assert.match(text, /v0\.1\.0/);
    assert.match(text, /knix008@naver\.com/);
    assert.match(text, /Tauri 2/);
    assert.ok(await count('#aboutDialog .about-model-table tbody tr') >= 4);
    await click('#aboutDialog .popup-foot button');
    assert.equal(await ev(`document.querySelector('#aboutDialog').open`), false);
  });

  // ── user guide ──
  const guidePage = async (match) => Page.connect(await waitForTarget(browser.port, (t) => t.url.includes('guide.html') && (!match || t.url.includes(match)), 10000));
  add('Help › 사용 설명서 (F1) opens the guide page', async () => {
    await page.key('F5'); // not a browser refresh: the program reads (error dialog in web mode)
    await ev(`(document.querySelector('#errorDialog').open && document.querySelector('#errorDialog').close(), true)`);
    await page.key('F1');
    const g = await guidePage();
    await g.waitFor(`document.querySelectorAll('#guideToc a').length >= 15`, 10000);
    assert.equal(await g.eval(`document.querySelector('#guideContent h1').textContent`), 'TTS Multi OS 0.1 — 사용 설명서');
    g.close();
  });
  add('Guide: every image loads; contents links jump to sections', async () => {
    const g = await guidePage();
    await g.waitFor(`document.querySelectorAll('#guideContent img').length >= 10`, 15000);
    // Lazy images below the fold do not load in a hidden page: fetch each one instead.
    const bad = await g.eval(`Promise.all([...document.querySelectorAll('#guideContent img')].map(async (i) => { const r = await fetch(i.src); const b = await r.blob(); return r.ok && b.type === 'image/png' && b.size > 2000 ? '' : i.getAttribute('src'); })).then((l) => l.filter(Boolean).join())`);
    assert.equal(bad, '');
    await g.send('Page.bringToFront'); // smooth scrolling only runs in a visible page
    await g.eval(`(document.querySelector('#guideToc a[data-toc="7-모든-화자로-생성"]').click(), true)`);
    await g.waitFor(`Math.abs(document.getElementById('7-모든-화자로-생성').getBoundingClientRect().top - document.querySelector('#guideContent').getBoundingClientRect().top) < 40`, 3000);
    g.close();
  });
  add('Guide: tutorial, English and font size switch and persist', async () => {
    const g = await guidePage();
    await g.eval(`(document.querySelector('[data-doc="tutorial"]').click(), true)`);
    await g.waitFor(`document.querySelector('#guideContent h1')?.textContent.includes('튜토리얼')`);
    await g.eval(`(document.querySelector('[data-lang="en"]').click(), true)`);
    await g.waitFor(`document.querySelector('#guideContent h1')?.textContent === 'TTS Multi OS 0.1 — Tutorial'`);
    await g.eval(`(document.querySelector('[data-font="1"]').click(), document.querySelector('[data-font="1"]').click(), true)`);
    assert.equal(await g.eval(`document.querySelector('#guideFontSize').textContent`), '17px');
    assert.equal(await g.eval(`localStorage.getItem('tts-guide-lang')`), '"en"');
    await g.eval(`(document.querySelector('a[data-doc-link^="UsersGuide.en.md#13"]').click(), true)`);
    await g.waitFor(`document.querySelector('#guideContent').dataset.shownDoc === 'guide' && document.querySelector('#guideContent').dataset.shownLang === 'en' && location.pathname.endsWith('guide.html')`);
    await g.eval(`(document.querySelector('[data-lang="ko"]').click(), document.querySelector('[data-font="-1"]').click(), document.querySelector('[data-font="-1"]').click(), true)`);
    g.close();
  });
  add('Guide: follows the program theme', async () => {
    await domClick('#statusTheme');
    await domClick('#themeDialog [data-start="dlg-theme"][data-value="dracula"]');
    await domClick('#themeDialog [data-close]');
    const g = await guidePage();
    await g.navigate(`${url}/guide.html`);
    await g.waitFor(`document.documentElement.dataset.mode === 'dark' && document.documentElement.dataset.theme === 'dracula'`, 5000);
    g.close();
  });

  add('No script errors were logged during the web tests', () => {
    assert.deepEqual(page.consoleErrors, []);
  });
  return list;
}
