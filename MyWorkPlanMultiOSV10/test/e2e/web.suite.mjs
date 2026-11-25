// Web build end-to-end cases (headless Edge/Chrome). Popups are frames here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Page, sleep } from './cdp.mjs';
import { root } from './harness.mjs';
import { ALIGN_CHECK } from './align-check.mjs';
import { CLIP_CHECK } from './clip-check.mjs';
import { CHART_CHECK } from './chart-check.mjs';

const VERSION = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const W = (app, expression) => app.main.eval(`(() => { const w = window.__myworkplan; const a = w.actions; const api = w.api; return ${expression}; })()`);
const iconB64 = fs.readFileSync(path.join(root, 'assets', 'icon-256.png')).toString('base64');
const FRAME_SCROLL_CHECK = `[...document.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return ['auto', 'scroll'].includes(s.overflowY) && e.scrollHeight > e.clientHeight + 1 && !['SELECT', 'TEXTAREA'].includes(e.tagName); }).map((e) => e.className || e.tagName)`;

/** Drops files (name, text|base64, type) at a point, like a drag from the desktop. */
function drop(app, files, point, text = '') {
  return app.main.eval(`(async () => {
    const dt = new DataTransfer();
    for (const f of ${JSON.stringify(files)}) {
      const bytes = f.base64 ? Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0)) : new TextEncoder().encode(f.text);
      dt.items.add(new File([bytes], f.name, { type: f.type ?? '' }));
    }
    if (${JSON.stringify(text)}) dt.setData('text/plain', ${JSON.stringify(text)});
    const p = ${JSON.stringify(point ?? { x: 700, y: 600 })};
    const target = document.elementFromPoint(p.x, p.y) ?? document.body;
    for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: p.x, clientY: p.y }));
    await new Promise((r) => setTimeout(r, 700));
    return 1;
  })()`);
}

async function closeFrames(app) {
  await app.main.eval(`window.__myworkplan.popups.closeAll().then(() => 1)`).catch(() => {});
  await sleep(150);
}

async function freshSample(app) {
  await closeFrames(app);
  await W(app, `(() => { for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true }); a.openSampleBuiltin(); a.switchView('gantt'); return 1; })()`);
  await sleep(400);
}

/** Replaces the browser's save picker: what the app writes lands in window.__saved[name]. */
const stubSavePicker = (app) => app.main.eval(`(() => {
  window.__saved = {};
  window.showSaveFilePicker = async ({ suggestedName }) => ({
    name: suggestedName,
    createWritable: async () => { const parts = []; return { write: async (x) => { parts.push(x); }, close: async () => { window.__saved[suggestedName] = parts.map((p) => typeof p === 'string' ? p : '[blob ' + p.size + ']').join(''); } }; },
  });
  return 1;
})()`);

// Headless browsers deny clipboard reads; record what the page writes instead (the real write still happens).
const CLIP_SPY = `(() => { if (!window.__clip) { window.__clip = []; const c = window.navigator.clipboard; const write = c.writeText.bind(c); c.writeText = (text) => { window.__clip.push(String(text)); return write(text).catch(() => {}); }; } return 1; })()`;
const lastClip = `(window.__clip ?? []).at(-1) ?? ''`;

// Page errors and error popups from here on (the feature sweeps check that nothing went wrong).
const TRACK_ERRORS = `(() => { window.__errs = []; if (!window.__errTrack) { window.__errTrack = true; window.addEventListener('error', (e) => window.__errs.push(String(e.message))); window.addEventListener('unhandledrejection', (e) => window.__errs.push(String(e.reason?.message ?? e.reason))); new MutationObserver(() => { for (const p of document.querySelectorAll('.web-popup-error')) { if (!p.dataset.seen) { p.dataset.seen = '1'; const f = p.querySelector('iframe'); window.__errs.push('error popup: ' + (f?.contentDocument?.body?.innerText ?? '').slice(0, 200)); } } }).observe(document.body, { childList: true, subtree: true }); } return 1; })()`;
const ERRORS = `(window.__errs ?? []).slice()`;

/** The browser tab a document window opened (index.html?viewer=<kind>), once drawn. */
async function docTab(app, kind) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    const list = await (await fetch(`http://127.0.0.1:${app.port}/json/list`)).json();
    const target = list.find((item) => item.type === 'page' && item.url.includes(`viewer=${kind}`));
    if (target) {
      const page = await new Page(target).open();
      // Closing the connection leaves the tab in front of the app (its page then counts as hidden): close the tab.
      const close = page.close.bind(page);
      page.close = () => { close(); fetch(`http://127.0.0.1:${app.port}/json/close/${target.id}`).catch(() => {}); };
      await page.waitFor(`Boolean(window.__myworkplanViewer && (document.querySelector('.viewer-frame')?.contentDocument?.querySelector('h1') || document.querySelector('video')))`, { timeout: 15000 });
      return page;
    }
    await sleep(200);
  }
  throw new Error(`no ${kind} tab`);
}

const plan = (title, names) => JSON.stringify({ format: 'myworkplan', version: 1, project: { title, tasks: names.map((name, i) => ({ id: `w${i}`, name, duration: 480 })) } });

export const cases = [
  { group: 'Page', name: 'Title shows the program name, version and icon', async run(app) {
    assert.equal(await app.main.eval('document.title'), `MyWorkPlan v${VERSION}`);
    assert.ok(await app.main.eval(`Boolean(document.querySelector('link[rel="icon"]'))`));
  } },
  { group: 'Page', name: 'First open offers the tutorial (frame popup)', async run(app) {
    await app.waitFrame('welcome', `document.querySelector('.popup-head h2 svg')`);
    assert.match(await app.frame('welcome', `document.querySelector('.popup').innerText`), /튜토리얼/);
    await app.frame('welcome', `(document.querySelector('[data-value="later"]').click(), 1)`);
    await app.main.waitFor(`!document.querySelector('.web-popup-welcome')`);
  } },
  { group: 'Start page', name: 'Templates, samples, tutorial and animated background', async run(app) {
    await W(app, 'a.showStartPage()');
    await sleep(300);
    const info = await app.main.eval(`({ shown: !document.querySelector('#start-page').hidden, templates: document.querySelectorAll('.template-tile').length, tutorial: Boolean(document.querySelector('[data-start="tutorial"]')) })`);
    assert.deepEqual(info, { shown: true, templates: 8, tutorial: true });
    const pixel = () => app.main.eval(`(() => { const c = document.querySelector('.start-bg'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let y = 0; y < c.height; y += 7) for (let x = 0; x < c.width; x += 7) { const i = (y * c.width + x) * 4; h = (h * 31 + d[i] * 3 + d[i + 1] * 5 + d[i + 2]) >>> 0; } return h; })()`);
    const a = await pixel();
    await sleep(900);
    assert.notEqual(await pixel(), a, 'animated');
    await app.main.click('[data-start="template"][data-value="software"]');
    await sleep(500);
    assert.ok(await W(app, 'api.project().tasks.length > 10'), 'a template opens as a new plan');
  } },
  { group: 'Start page', name: 'Card board: MyUMLMaker look, no theme card, 10 shortcuts (incl. Print), no gaps in the grid', async run(app) {
    await W(app, `(() => { for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true }); a.showStartPage(); return 1; })()`);
    await sleep(400);
    const info = await app.main.eval(`(() => {
      const cols = (el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length;
      const grids = [...document.querySelectorAll('#start-page .start-actions, #start-page .template-grid, #start-page .sample-tiles, #start-page .start-card-background .bg-grid')];
      const rects = [...document.querySelectorAll('#start-page .start-board > .start-card')].map((c) => c.getBoundingClientRect());
      let overlap = false;
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const p = rects[i]; const q = rects[j]; if (p.left < q.right - 1 && q.left < p.right - 1 && p.top < q.bottom - 1 && q.top < p.bottom - 1) overlap = true; }
      const scroller = document.querySelector('#start-page .start-scroll');
      return {
        cards: [...document.querySelectorAll('#start-page .start-board > .start-card')].map((c) => c.dataset.card),
        handles: document.querySelectorAll('#start-page [data-card-handle]').length,
        corners: document.querySelectorAll('#start-page [data-card-resize]').length,
        theme: document.querySelectorAll('#start-page [data-start="pick-theme"], #start-page [data-start="theme-settings"], #start-page .start-card-theme').length,
        actions: [...document.querySelectorAll('#start-page .start-actions [data-start]')].map((b) => b.dataset.start),
        tools: document.querySelectorAll('#start-page .start-tools [data-start], #start-page .start-tools [data-start-toggle]').length,
        docs: [...document.querySelectorAll('#start-page .start-docs [data-start]')].map((b) => b.dataset.start),
        gaps: grids.map((g) => g.children.length % cols(g)),
        overlap,
        sideScroll: scroller.scrollWidth > scroller.clientWidth,
      };
    })()`);
    assert.deepEqual(info.cards, ['hero', 'actions', 'recent', 'templates', 'samples', 'background']);
    // The program information card is fixed: no move handle and no resize corner (the other five have both).
    assert.equal(info.handles, 5);
    assert.equal(info.corners, 5);
    assert.equal(await app.main.eval(`document.querySelectorAll('#start-page .start-card-hero [data-card-handle], #start-page .start-card-hero [data-card-resize]').length`), 0);
    assert.equal(info.theme, 0, 'no theme picker on the start page');
    assert.deepEqual(info.actions, ['open', 'import', 'print', 'tutorial', 'shortcuts', 'language', 'settings', 'start-settings', 'about', 'exit']);
    assert.equal(info.tools, 3, 'show-at-start toggle, start settings, auto arrange');
    assert.deepEqual(info.docs, ['guide', 'tutorial-doc', 'tutorial-video']);
    assert.ok(info.gaps.every((n) => n === 0), `every grid row is full: ${info.gaps}`);
    assert.equal(info.overlap, false, 'cards never overlap');
    assert.equal(info.sideScroll, false, 'no sideways scrolling');
  } },
  { group: 'Start page', name: '40 samples (8 fields x 5): click opens a new plan tab in that language; in-progress samples have a baseline and % complete', async run(app) {
    await W(app, `(() => { for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true }); a.showStartPage(); return 1; })()`);
    await sleep(300);
    const groups = await app.main.eval(`[...document.querySelectorAll('#start-page .sample-group')].map((g) => g.querySelectorAll('[data-start="sample"]').length)`);
    assert.deepEqual(groups, [5, 5, 5, 5, 5, 5, 5, 5]);
    await app.main.click('[data-start="sample"][data-value="wedding"]');
    await sleep(500);
    const plan = await W(app, `({ title: api.project().title, tasks: api.project().tasks.length, done: api.project().tasks.some((t) => t.percentComplete === 100), baseline: api.project().tasks.every((t) => t.baselines?.[0]), start: !document.querySelector('#start-page').hidden })`);
    assert.match(plan.title, /[가-힣]/, 'Korean plan in Korean');
    assert.ok(plan.tasks >= 15 && plan.done && plan.baseline && !plan.start, JSON.stringify(plan));
    await W(app, `(a.showStartPage(), 1)`);
    await sleep(300);
    await app.main.click('[data-start="sample"][data-value="solar-plant"]');
    await sleep(500);
    assert.ok(await W(app, `api.project().tasks.every((t) => !t.percentComplete) && w.state.docs.length === 2`), 'a sample that starts next Monday opens in its own tab');
  } },
  { group: 'Start page', name: 'Card moves, auto-arrange and opacity are saved; the Print tile opens print for the open plan', async run(app) {
    await W(app, `(() => { for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true }); a.updateSettings({ startLayout: null }); a.showStartPage(); return 1; })()`);
    await sleep(400);
    // Drag the Recent card's handle to the left column.
    await app.main.eval(`(() => {
      const el = document.querySelector('[data-card-handle="recent"]');
      const handle = el.getBoundingClientRect();
      const board = document.querySelector('.start-board').getBoundingClientRect();
      const at = (type, x, y, target) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, buttons: 1, clientX: x, clientY: y, pointerId: 1 }));
      const x = handle.left + 5;
      const y = handle.top + 5;
      at('pointerdown', x, y, el);
      for (let i = 1; i <= 10; i++) at('pointermove', x - ((x - board.left - 10) * i) / 10, y, window);
      at('pointerup', board.left + 10, y, window);
      return 1;
    })()`);
    await sleep(400);
    assert.equal(await W(app, `w.state.settings.startLayout?.cards?.recent?.col`), 0, 'the moved card is saved');
    await app.main.click('[data-start="arrange"]');
    await sleep(400);
    assert.equal(await W(app, `w.state.settings.startLayout.cards.recent.col`), 2, 'Auto arrange puts it back');
    await app.main.eval(`(() => { const r = document.querySelector('[data-start-opacity]'); r.value = '45'; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(300);
    assert.equal(await W(app, `w.state.settings.startCardOpacity`), 45);
    assert.equal(await app.main.eval(`document.querySelector('.start-inner').style.getPropertyValue('--start-card-alpha')`), '45%');
    await W(app, `a.updateSettings({ startCardOpacity: 80 })`);
    await W(app, `(() => { a.openSampleBuiltin(); a.showStartPage(); return 1; })()`);
    await sleep(300);
    await app.main.click('#start-page [data-start="print"]');
    await app.waitFrame('print');
    await closeFrames(app);
  } },
  { group: 'Start page', name: 'Tutorial video button: video page in its own window (browser tab), language flag button', async run(app) {
    await W(app, `(a.showStartPage(), 1)`);
    await sleep(300);
    await app.main.click('#start-page [data-start="tutorial-video"]');
    const page = await docTab(app, 'video');
    try {
      const info = await page.eval(`({ video: Boolean(document.querySelector('video')), title: document.querySelector('.viewer-title')?.textContent.trim(), lang: document.querySelector('[data-viewer="lang"]')?.dataset.value, flag: Boolean(document.querySelector('[data-viewer="lang"] .flag-slot')) })`);
      assert.deepEqual(info, { video: true, title: '튜토리얼 영상', lang: 'en', flag: true });
      assert.equal(await app.main.eval(`document.querySelector('#start-page').hidden`), false, 'the main window stays as it was');
    } finally {
      page.close();
    }
  } },
  { group: 'Start page', name: 'Settings › Start page: hiding items applies to the start page at once', async run(app) {
    await W(app, `(() => { a.showStartPage(); w.popups.open('settings', { tab: 'start' }); return 1; })()`);
    await app.waitFrame('settings', `Boolean(document.querySelector('[data-toggle="startShowSamples"]'))`);
    await app.frame('settings', `(document.querySelector('[data-toggle="startShowSamples"]').click(), 1)`);
    await app.main.waitFor(`!document.querySelector('#start-page .start-card-samples')`, { timeout: 5000, message: 'samples card hidden' });
    await app.frame('settings', `(document.querySelector('[data-toggle="startShowSamples"]').click(), 1)`);
    await app.main.waitFor(`Boolean(document.querySelector('#start-page .start-card-samples'))`, { timeout: 5000, message: 'samples card back' });
    await closeFrames(app);
  } },
  { group: 'Start page', name: 'Background: random on every start, changes automatically at the set interval', async run(app) {
    const first = await W(app, 'w.state.settings.animation');
    await app.reload();
    await app.frame('welcome', `(document.querySelector('[data-value="later"]')?.click(), 1)`).catch(() => {});
    const second = await W(app, 'w.state.settings.animation');
    assert.notEqual(second, first, 'a new start picks another background');
    await W(app, `(a.showStartPage(), 1)`);
    await sleep(300);
    assert.equal(await app.main.eval(`document.querySelector('[data-start-random]').checked`), true);
    await app.main.eval(`(() => { const s = document.querySelector('[data-start-interval]'); s.value = '15'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await app.main.waitFor(`window.__myworkplan.state.settings.animation !== ${JSON.stringify(second)}`, { timeout: 20000, message: 'the background changes by itself' });
    await W(app, `a.updateSettings({ animationInterval: 30 })`);
  } },
  { group: 'Window', name: 'Home button in the menu bar; side panels right below the toolbar, tabs between the panels', async run(app) {
    await freshSample(app);
    const layout = await app.main.eval(`(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      // The program's icon, name and version come first (no system title bar), then Home and the menus.
      const first = document.querySelector('#menubar .menubar-item');
      return { homeFirst: first.matches('[data-home]'), homeIcon: Boolean(first.querySelector('svg')), homeTitle: first.title,
        toolbarBottom: Math.round(r('#toolbar').bottom), leftTop: Math.round(r('#left-panel').top), rightTop: Math.round(r('#right-panel').top),
        tabsLeft: Math.round(r('#tabs').left), tabsRight: Math.round(r('#tabs').right), leftRight: Math.round(r('#left-panel').right), rightLeft: Math.round(r('#right-panel').left) };
    })()`);
    assert.ok(layout.homeFirst && layout.homeIcon && layout.homeTitle, JSON.stringify(layout));
    assert.equal(await app.main.eval(`document.querySelectorAll('#tabs .tab:not([data-doc]), #tabs [data-command="startPage"], #tabs [data-home]').length`), 0, 'no home tab: the tabs are only open projects');
    assert.equal(await app.main.eval(`document.querySelectorAll('#toolbar [data-command="startPage"], #toolbar [data-home]').length`), 0, 'no home button on the toolbar: Home is in the menu bar');
    assert.ok(Math.abs(layout.leftTop - layout.toolbarBottom) <= 1 && Math.abs(layout.rightTop - layout.toolbarBottom) <= 1, `panels start right under the toolbar ${JSON.stringify(layout)}`);
    assert.ok(layout.tabsLeft >= layout.leftRight && layout.tabsRight <= layout.rightLeft, `tabs sit between the panels ${JSON.stringify(layout)}`);
    await app.main.click('#menubar [data-home]');
    await sleep(300);
    assert.equal(await app.main.eval(`!document.querySelector('#start-page').hidden`), true, 'Home shows the start page');
    assert.ok(await app.main.eval(`document.querySelector('#menubar [data-home]').classList.contains('current')`));
    // Home is a toggle: pressed again it goes back to the plan.
    const plans = await app.main.eval(`window.__myworkplan.state.docs.length`);
    await app.main.click('#menubar [data-home]');
    await sleep(200);
    assert.equal(await app.main.eval(`document.querySelector('#start-page').hidden`), true, 'pressing Home again goes back to the plan');
    assert.equal(await app.main.eval(`window.__myworkplan.state.docs.length`), plans, 'the same plan, no new one');
    // With no plan open, Home on the start page shows a new blank plan.
    await app.main.eval(`(() => { const w = window.__myworkplan; for (const doc of [...w.state.docs]) w.actions.closeDoc(doc, { force: true }); w.actions.showStartPage(true); return 1; })()`);
    await sleep(200);
    await app.main.click('#menubar [data-home]');
    await sleep(300);
    assert.deepEqual(await app.main.eval(`[document.querySelector('#start-page').hidden, window.__myworkplan.state.docs.length, window.__myworkplan.api.project().tasks.length]`), [true, 1, 0], 'a blank plan');
  } },
  { group: 'Toolbar', name: 'Every button has a tooltip, single row, no opacity control', async run(app) {
    assert.deepEqual(await app.main.eval(`[...document.querySelectorAll('button')].filter((b) => b.getClientRects().length && !(b.title || '').trim()).map((b) => b.outerHTML.slice(0, 80))`), []);
    const rows = await app.main.eval(`new Set([...document.querySelectorAll('#toolbar .tool-button')].map((b) => { const r = b.getBoundingClientRect(); return Math.round(r.top + r.height / 2); })).size`);
    assert.equal(rows, 1);
    assert.equal(await app.main.eval(`Boolean(document.querySelector('.opacity-control'))`), false);
  } },
  { group: 'Menu', name: 'Menus: single column, icon + label, heading, close on outside click', async run(app) {
    await app.main.click('[data-menu="edit"]');
    await app.waitFrame('menu', `document.querySelectorAll('.menu-item').length > 5`);
    const info = await app.frame('menu', `({ lefts: new Set([...document.querySelectorAll('.menu-item')].map((i) => Math.round(i.getBoundingClientRect().left))).size, icons: [...document.querySelectorAll('.menu-item')].every((i) => i.querySelector('.menu-icon svg') && i.querySelector('.menu-label').textContent.trim()), head: document.querySelector('.popup-menu').getAttribute('aria-label'), noHeader: !document.querySelector('.menu-head') })`);
    assert.equal(info.lefts, 1);
    assert.ok(info.icons);
    assert.equal(info.head, '편집');
    assert.ok(info.noHeader, 'items only, no name/icon header');
    await app.main.eval(`document.querySelector('.web-popup-shield').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); 1`);
    await app.main.waitFor(`!document.querySelector('.web-popup-menu')`);
  } },
  { group: 'Menu', name: 'Context menus differ for task rows, chart and column headers', async run(app) {
    await freshSample(app);
    const open = async (selector) => {
      const p = await app.main.center(selector);
      await app.main.realClick(p.x, p.y, { button: 'right' });
      await app.waitFrame('menu', `document.querySelector('.menu-item')`);
      const info = await app.frame('menu', `({ ids: [...document.querySelectorAll('.menu-item')].map((i) => i.dataset.id).join(), icons: [...document.querySelectorAll('.menu-item')].every((i) => i.querySelector('.menu-icon svg')) })`);
      await app.main.eval(`document.querySelector('.web-popup-shield').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); 1`);
      await app.main.waitFor(`!document.querySelector('.web-popup-menu')`);
      assert.ok(info.icons, selector);
      return info.ids;
    };
    const menus = [await open('.grid-row[data-index="2"] .grid-cell[data-field="name"]'), await open('.chart-body'), await open('.grid-hcell[data-field="duration"]')];
    assert.equal(new Set(menus).size, 3);
  } },
  { group: 'Popup', name: 'Popup frame: icon + title, no scrolling, drag the header to move', async run(app) {
    await freshSample(app);
    await W(app, `(w.run('settings'), 1)`);
    await app.waitFrame('settings');
    assert.ok(await app.frame('settings', `Boolean(document.querySelector('.popup-head h2 svg') && document.querySelector('.popup-head h2').textContent.trim())`));
    const tabs = await app.frame('settings', `[...document.querySelectorAll('.tabs [data-action="tab"]')].map((t) => t.dataset.value)`);
    for (const tab of tabs) {
      await app.frame('settings', `(document.querySelector('.tabs [data-value="${tab}"]').click(), 1)`);
      await sleep(120);
      assert.deepEqual(await app.frame('settings', FRAME_SCROLL_CHECK), [], tab);
      assert.deepEqual(await app.frame('settings', ALIGN_CHECK), [], `${tab}: aligned`);
      assert.deepEqual(await app.frame('settings', CLIP_CHECK), [], `${tab}: nothing cut off`);
    }
    const before = await app.main.eval(`(() => { const r = document.querySelector('.web-popup-settings').getBoundingClientRect(); return { x: r.left, y: r.top }; })()`);
    const head = await app.main.eval(`(() => { const f = document.querySelector('.web-popup-settings'); const r = f.getBoundingClientRect(); return { x: r.left + 120, y: r.top + 14 }; })()`);
    await app.main.drag(head, { x: head.x - 150, y: head.y + 60 });
    await sleep(200);
    const after = await app.main.eval(`(() => { const r = document.querySelector('.web-popup-settings').getBoundingClientRect(); return { x: r.left, y: r.top }; })()`);
    assert.ok(Math.abs(after.x - before.x) > 50 || Math.abs(after.y - before.y) > 30, `moved ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    await closeFrames(app);
  } },
  { group: 'Theme', name: 'Theme dropdown: two columns, 20 dark | 20 light', async run(app) {
    await app.main.click('[data-command="themeMenu"]');
    await app.waitFrame('theme', `document.querySelectorAll('[data-pick-theme]').length > 30`);
    assert.deepEqual(await app.frame('theme', `[...document.querySelectorAll('.picker-column')].map((c) => c.querySelectorAll('[data-pick-theme]').length)`), [20, 20]);
    await app.frame('theme', `(document.querySelector('[data-pick-theme="monokai"]').click(), 1)`);
    await sleep(300);
    assert.equal(await W(app, 'w.state.settings.theme'), 'monokai');
  } },
  { group: 'Toolbar', name: 'View dropdown: toolbar buttons stay put when switching views, no plan name in the menu bar', async run(app) {
    await freshSample(app);
    assert.equal(await app.main.eval(`document.querySelector('#menubar .menubar-title')`), null, 'the menubar shows no plan title');
    const views = ['gantt', 'tracking', 'taskSheet', 'taskUsage', 'network', 'calendar', 'timeline', 'kanban', 'resourceSheet', 'resourceUsage', 'resourceGraph', 'teamPlanner', 'reports'];
    const layout = () => app.main.eval(`JSON.stringify([...document.querySelectorAll('#toolbar .tool-button')].map((b) => Math.round(b.getBoundingClientRect().left)))`);
    const first = await layout();
    for (const view of views) {
      await W(app, `(a.switchView('${view}'), 1)`);
      await sleep(150);
      assert.equal(await app.main.eval(`document.querySelector('.view-split [data-view-name]:not(.off)').dataset.viewName`), view, 'the current view is named');
      assert.equal(await layout(), first, `${view}: toolbar buttons stay in place`);
    }
    await W(app, `(a.switchView('gantt'), 1)`);
  } },
  { group: 'Views', name: 'Gantt chart rows: same alternating colors and selection as the task table, aligned at the same height', async run(app) {
    await freshSample(app);
    await W(app, `(a.selectTask(api.project().tasks[4].id), 1)`);
    await sleep(200);
    const rows = await app.main.eval(`JSON.stringify((() => {
      const look = (e) => [e.classList.contains('odd'), e.classList.contains('selected'), Math.round(e.getBoundingClientRect().top), getComputedStyle(e).backgroundColor];
      return { grid: [...document.querySelectorAll('.grid-row[data-id]')].slice(0, 8).map(look), chart: [...document.querySelectorAll('.chart-row')].slice(0, 8).map(look) };
    })())`).then(JSON.parse);
    assert.equal(rows.chart.length, 8, 'a band per row behind the bars');
    assert.deepEqual(rows.chart, rows.grid, 'same stripes, selection, colour and position as the table rows');
    assert.ok(rows.chart.some((r) => r[0]) && rows.chart.some((r) => !r[0]), 'rows alternate');
    assert.ok(rows.chart.some((r) => r[1]), 'the selected row is highlighted in the chart too');
  } },
  { group: 'Window', name: 'Home screen uses the full window width with both side panels hidden', async run(app) {
    await app.main.eval(`window.__myworkplan.popups.closeAll().then(() => 1)`);
    const widths = [];
    for (const [left, right] of [[true, true], [false, true], [true, false], [false, false]]) {
      widths.push(await app.main.eval(`(async () => { const w = window.__myworkplan; w.actions.updateSettings({ showLeftPanel: ${left}, showRightPanel: ${right} }); w.actions.showStartPage(true); await new Promise((r) => setTimeout(r, 250)); const c = document.querySelector('#center').getBoundingClientRect(); return [Math.round(c.left), Math.round(c.width), document.documentElement.clientWidth]; })()`));
    }
    await W(app, `(a.updateSettings({ showLeftPanel: true, showRightPanel: true }), a.showStartPage(false), 1)`);
    for (const [left, width, page] of widths) {
      assert.equal(left, 0);
      assert.ok(width >= page - 2, `home screen ${width}px of ${page}px`);
    }
  } },
  { group: 'Schedule', name: 'Show critical path button: toggles critical path highlighting from the toolbar', async run(app) {
    await freshSample(app);
    await W(app, `a.updateSettings({ showCritical: true })`);
    const sel = '#toolbar [data-command="showCritical"]';
    const state = () => app.main.eval(`({ pressed: document.querySelector('${sel}').getAttribute('aria-pressed'), setting: window.__myworkplan.state.settings.showCritical, rows: document.querySelectorAll('.grid-row.critical-row').length, bars: document.querySelectorAll('.bar.critical').length })`);
    assert.ok(await app.main.eval(`document.querySelector('${sel}').title.length > 3`), 'tooltip');
    const on = await state();
    assert.equal(on.pressed, 'true');
    assert.equal(on.setting, true);
    assert.ok(on.bars > 0, `${on.bars} critical bars shown`);
    await app.main.click(sel);
    await sleep(300);
    const off = await state();
    assert.deepEqual([off.pressed, off.setting, off.rows, off.bars], ['false', false, 0, 0], 'pressing turns the highlight off');
    await app.main.click(sel);
    await sleep(300);
    const again = await state();
    assert.deepEqual([again.pressed, again.setting], ['true', true], 'pressing again turns it back on');
    assert.ok(again.bars > 0);
  } },
  { group: 'Schedule', name: 'Find critical path button: toggle; forward/backward pass marks critical tasks and links', async run(app) {
    await freshSample(app);
    await W(app, `a.updateSettings({ showCritical: false })`);
    const state = () => app.main.eval(`({ pressed: document.querySelector('#toolbar [data-command="criticalPath"]').getAttribute('aria-pressed'), focus: document.querySelector('#app').classList.contains('critical-focus'), rows: document.querySelectorAll('.grid-row.critical-row').length, status: document.querySelector('.critical-status')?.textContent.trim() ?? null, notice: document.querySelector('#statusbar .status-notice').textContent })`);
    assert.ok(await app.main.eval(`document.querySelector('#toolbar [data-command="criticalPath"]').title.length > 3`), 'tooltip');
    const off = await state();
    assert.deepEqual([off.pressed, off.focus, off.rows, off.status], ['false', false, 0, null]);
    await app.main.click('#toolbar [data-command="criticalPath"]');
    await sleep(400);
    const on = await state();
    const expected = await app.main.eval(`(() => { const w = window.__myworkplan; return w.domain.criticalPath(w.api.project(), w.api.sched()).ids.size; })()`);
    assert.ok(expected > 0);
    assert.equal(on.pressed, 'true');
    assert.ok(on.focus, 'the rest of the plan steps back');
    assert.ok(on.rows >= expected, `${on.rows} critical rows shown`);
    assert.match(on.status, new RegExp(String(expected)));
    assert.match(on.notice, /→/, 'the chain is reported from start to finish');
    await app.main.click('#toolbar [data-command="criticalPath"]');
    await sleep(300);
    const again = await state();
    assert.deepEqual([again.pressed, again.focus, again.rows, again.status], ['false', false, 0, null], 'pressing again turns it off');
  } },
  { group: 'Schedule', name: 'Critical path on a big plan: a progress popup shows each stage, closes when done', async run(app) {
    await freshSample(app);
    // 600 more tasks (copies of the sample's leaf tasks) make the plan big enough for the popup to open at once.
    await W(app, `(() => {
      const doc = a.activeDoc();
      const leaves = doc.project.tasks.filter((t) => !doc.sched.info(t.id).summary);
      for (let i = 0; i < 600; i++) { const src = leaves[i % leaves.length]; doc.project.tasks.push({ ...JSON.parse(JSON.stringify(src)), id: 'big-' + i, name: src.name + ' ' + i, outlineLevel: 1, predecessors: i ? [{ taskId: 'big-' + (i - 1), type: 'FS', lag: 0, lagUnit: 'd' }] : [] }); }
      doc.recalculate();
      return 1;
    })()`);
    // Record what the popup shows while the stages run.
    await app.main.eval(`(() => { window.__cpSeen = []; const look = () => { const f = document.querySelector('.web-popup-progress iframe'); const text = f?.contentDocument?.querySelector('#progress-text')?.textContent; if (text && window.__cpSeen.at(-1) !== text) window.__cpSeen.push(text); }; window.__cpTimer = setInterval(look, 5); new MutationObserver(look).observe(document.body, { childList: true, subtree: true }); return 1; })()`);
    await app.main.click('#toolbar [data-command="criticalPath"]');
    await app.main.waitFor(`document.querySelector('#toolbar [data-command="criticalPath"]').getAttribute('aria-pressed') === 'true'`, { timeout: 30000 });
    await sleep(700);
    const seen = await app.main.eval(`(clearInterval(window.__cpTimer), window.__cpSeen)`);
    assert.ok(seen.length >= 2, `the popup showed the stages: ${JSON.stringify(seen)}`);
    assert.ok(seen.some((text) => /\d+ \/ 6/.test(text)), JSON.stringify(seen));
    assert.equal(await app.main.eval(`Boolean(document.querySelector('.web-popup-progress'))`), false, 'the popup closes when done');
    await app.main.click('#toolbar [data-command="criticalPath"]');
    await sleep(300);
  } },
  { group: 'Schedule', name: 'Toolbar schedule zoom: out · current ratio · in; typing a percent sets the timescale', async run(app) {
    await freshSample(app);
    await W(app, `a.updateSettings({ timescale: 16 })`);
    const value = () => app.main.eval(`document.querySelector('#timescale-value').value`);
    assert.equal(await value(), '100%');
    await app.main.click('#toolbar [data-command="timescaleIn"]');
    await sleep(200);
    assert.ok(await W(app, `w.state.settings.timescale > 16`), 'zoom in widens the days');
    assert.notEqual(await value(), '100%');
    await app.main.click('#toolbar [data-command="timescaleOut"]');
    await app.main.click('#toolbar [data-command="timescaleOut"]');
    await sleep(200);
    assert.ok(await W(app, `w.state.settings.timescale < 16`), 'zoom out narrows them');
    await app.main.eval(`(() => { const input = document.querySelector('#timescale-value'); input.focus(); input.value = '200'; input.dispatchEvent(new Event('change', { bubbles: true })); input.blur(); return 1; })()`);
    await sleep(200);
    assert.equal(await W(app, `w.state.settings.timescale`), 32);
    assert.equal(await value(), '200%');
    const box = await app.main.eval(`(() => { const r = document.querySelector('.toolbar-timescale').getBoundingClientRect(); return r.right <= document.querySelector('#toolbar').getBoundingClientRect().right && r.height > 20; })()`);
    assert.ok(box, 'the stepper is fully on the toolbar');
    await W(app, `a.updateSettings({ timescale: 16 })`);
  } },
  { group: 'Edit', name: 'Add task → undo → redo (Ctrl+Z/Y)', async run(app) {
    await freshSample(app);
    const count = await W(app, 'api.project().tasks.length');
    await W(app, `a.insertTask({ name: 'web task' }, { edit: false })`);
    await app.main.eval(`document.querySelector('.grid-body').focus(); 1`);
    await app.main.key('z', 2);
    await sleep(200);
    assert.equal(await W(app, 'api.project().tasks.length'), count);
    await app.main.key('y', 2);
    await sleep(200);
    assert.equal(await W(app, 'api.project().tasks.length'), count + 1);
  } },
  { group: 'Edit', name: 'Clipboard: copied tasks go to the browser clipboard, paste', async run(app) {
    await freshSample(app);
    await app.main.eval(CLIP_SPY);
    await W(app, `(api.select('task', [api.project().tasks[3].id]), document.querySelector('.grid-body').focus(), 1)`);
    await app.main.key('c', 2);
    await sleep(400);
    const name = await W(app, 'api.project().tasks[3].name');
    assert.ok((await app.main.eval(lastClip)).includes(name));
    const count = await W(app, 'api.project().tasks.length');
    await app.main.key('v', 2);
    await sleep(400);
    assert.equal(await W(app, 'api.project().tasks.length'), count + 1);
  } },
  { group: 'Edit', name: 'Ctrl+wheel zoom in/out', async run(app) {
    await W(app, `a.updateSettings({ zoom: 100 })`);
    const p = await app.main.center('.grid-body');
    await app.main.wheel(p.x, p.y, -100, 2);
    await sleep(200);
    assert.equal(await W(app, 'w.state.settings.zoom'), 110);
    await W(app, `a.updateSettings({ zoom: 100 })`);
  } },
  { group: 'File', name: 'Drag and drop files: plans open in a new tab, images become the background', async run(app) {
    await freshSample(app);
    const tabs = await W(app, 'w.state.docs.length');
    await drop(app, [{ name: 'dropped.mwp', text: plan('웹에서 놓음', ['하나', '둘']) }]);
    assert.equal(await W(app, 'w.state.docs.length'), tabs + 1);
    assert.equal(await W(app, 'api.project().title'), '웹에서 놓음');
    await drop(app, [{ name: 'bg.png', base64: iconB64, type: 'image/png' }]);
    await sleep(400);
    assert.equal(await W(app, 'w.state.settings.backgroundKind'), 'image');
    await W(app, `(a.removeBackground(), a.updateSettings({ backgroundKind: 'animated' }), 1)`);
  } },
  { group: 'File', name: 'Save (browser save dialog), XML/CSV export', async run(app) {
    await freshSample(app);
    await stubSavePicker(app);
    await W(app, `a.saveDoc(a.activeDoc(), { saveAs: true })`);
    await sleep(300);
    const saved = await app.main.eval('window.__saved');
    const name = Object.keys(saved).find((n) => n.endsWith('.mwp'));
    assert.ok(name, JSON.stringify(Object.keys(saved)));
    assert.equal(JSON.parse(saved[name]).format, 'myworkplan');
    assert.equal(await W(app, 'a.activeDoc().dirty'), false);
    await W(app, `a.exportAs('xml')`);
    await W(app, `a.exportAs('csv')`);
    await sleep(300);
    const all = await app.main.eval('window.__saved');
    assert.ok(Object.entries(all).some(([n, text]) => n.endsWith('.xml') && text.includes('<Project')));
    assert.ok(Object.keys(all).some((n) => n.endsWith('.csv')));
    for (const [format, ext] of [['png', 'png'], ['jpeg', 'jpg'], ['webp', 'webp'], ['bmp', 'bmp'], ['tiff', 'tiff'], ['svg', 'svg']]) {
      await W(app, `a.exportImage({ format: '${format}', transparent: true, content: 'chart', scale: 1 })`);
      await sleep(150);
      assert.ok(Object.keys(await app.main.eval('window.__saved')).some((n) => n.endsWith(`.${ext}`)), `image ${format}`);
    }
  } },
  { group: 'File', name: 'Open (browser file picker)', async run(app) {
    await app.main.eval(`(() => { window.showOpenFilePicker = async () => [{ name: 'picked.mwp', getFile: async () => new File([${JSON.stringify(plan('고른 계획', ['A', 'B', 'C']))}], 'picked.mwp') }]; return 1; })()`);
    await W(app, `w.run('open')`);
    await app.main.waitFor(`window.__myworkplan.api.project()?.title === '고른 계획'`);
    assert.equal(await W(app, 'api.project().tasks.length'), 3);
  } },
  { group: 'File', name: 'Unsaved changes prompt before leaving the page', async run(app) {
    await freshSample(app);
    await W(app, `a.insertTask({ name: 'unsaved' }, { edit: false })`);
    app.dialogs.length = 0;
    await app.reload();
    assert.deepEqual(app.dialogs, ['beforeunload']);
    await app.frame('welcome', `(document.querySelector('[data-value="later"]')?.click(), 1)`).catch(() => {});
  } },
  { group: 'Settings', name: 'Settings survive a reload (localStorage)', async run(app) {
    await W(app, `a.updateSettings({ theme: 'dracula', language: 'en', timescale: 30 })`);
    await app.reload();
    assert.deepEqual(await W(app, `({ theme: w.state.settings.theme, language: w.state.settings.language, timescale: w.state.settings.timescale })`), { theme: 'dracula', language: 'en', timescale: 30 });
    assert.match(await app.main.eval(`document.querySelector('[data-menu="file"]').textContent`), /File/);
    await W(app, `a.updateSettings({ theme: 'light', language: 'ko', timescale: 16 })`);
  } },
  ...['gantt', 'tracking', 'taskSheet', 'taskUsage', 'network', 'calendar', 'timeline', 'kanban', 'resourceSheet', 'resourceUsage', 'resourceGraph', 'teamPlanner', 'reports'].map((view) => ({ group: 'Views', name: `${view}`, async run(app) {
    if (view === 'gantt') await freshSample(app);
    await W(app, `a.switchView('${view}')`);
    await sleep(400);
    assert.ok(await app.main.eval(`document.querySelector('#view-host').querySelectorAll('*').length > 30`));
    assert.deepEqual(await app.main.eval(CLIP_CHECK), [], 'nothing cut off');
    assert.equal(await app.main.eval(`Boolean(document.querySelector('.web-popup-error'))`), false);
  } })),
  { group: 'Help', name: 'Tutorial document: own window (browser tab), chapter navigation, flag button for language, font size − px +', async run(app) {
    await W(app, '(a.showStartPage(), 1)');
    await sleep(300);
    await app.main.click('#start-page [data-start="tutorial-doc"]');
    const page = await docTab(app, 'tutorial');
    try {
      const doc = await page.eval(`(() => { const d = document.querySelector('.viewer-frame').contentDocument; return { h1: d.querySelector('h1').textContent, steps: d.querySelectorAll('h3').length, images: d.querySelectorAll('img').length, raw: d.body.innerText.includes('<a id=') }; })()`);
      assert.match(doc.h1, /MyWorkPlan/);
      const steps = await app.main.eval(`window.__myworkplan.domain.tutorialSteps()`);
      assert.equal(doc.steps, steps, 'every tutorial step is in the document');
      assert.equal(doc.images, steps, 'with a picture each');
      assert.equal(doc.raw, false, 'no raw HTML shows as text');
      await page.eval(`(() => { const s = document.querySelector('[data-viewer-chapter]'); s.value = s.options[4].value; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
      await sleep(300);
      assert.ok(await page.eval(`document.querySelector('.viewer-frame').contentWindow.scrollY > 200`), 'a chapter can be picked');
      await page.eval(`(window.__myworkplanViewer.setFontSize(16), 1)`);
      await page.click('[data-viewer="font-up"]');
      await sleep(150);
      assert.deepEqual(await page.eval(`[document.querySelector('[data-font-size]').textContent, getComputedStyle(document.querySelector('.viewer-frame').contentDocument.body).fontSize]`), ['17px', '17px']);
      await page.click('[data-viewer="font-down"]');
      await page.click('[data-viewer="font-down"]');
      await sleep(150);
      assert.equal(await page.eval(`document.querySelector('[data-font-size]').textContent`), '15px');
      await page.click('[data-viewer="lang"]');
      await page.waitFor(`/tutorial/i.test(document.querySelector('.viewer-frame').contentDocument?.querySelector('h1')?.textContent ?? '')`, { timeout: 10000 });
      assert.equal(await page.eval(`getComputedStyle(document.querySelector('.viewer-frame').contentDocument.body).fontSize`), '15px', 'the size stays with the other language');
      await page.eval(`(window.__myworkplanViewer.setFontSize(16), 1)`);
      // While the tutorial runs, the document opens as a frame over the app (so a recording shows it).
      await W(app, `(w.popups.inline = true, a.openDocWindow('guide'), 1)`);
      await app.main.waitFor(`Boolean(document.querySelector('.web-popup-doc-guide iframe')?.contentWindow?.__myworkplanViewer)`, { timeout: 10000 });
      await W(app, `(w.popups.closeAll(), w.popups.inline = false, 1)`);
      await sleep(200);
      assert.equal(await app.main.eval(`document.querySelectorAll('.web-popup-doc').length`), 0, 'closed with the other frames');
    } finally {
      page.close();
    }
  } },
  { group: 'Views', name: 'Graph and report charts: axis ticks and ruler values, grid lines, non-overlapping tick labels', async run(app) {
    await freshSample(app);
    const views = [['resourceGraph', null], ...['overview', 'cost', 'work', 'burndown', 'critical', 'late', 'upcoming', 'milestones', 'resources'].map((id) => ['reports', id])];
    let seen = 0;
    for (const [view, report] of views) {
      await W(app, `(${report ? `api.doc().view.report = '${report}', ` : ''}a.switchView('${view}'), 1)`);
      await sleep(500);
      for (const chart of await app.main.eval(CHART_CHECK)) {
        seen += 1;
        const where = `${report ?? view} ${chart.kind}`;
        assert.ok(chart.yLabels.length >= 3, `${where}: a ruler with numbers ${JSON.stringify(chart.yLabels)}`);
        if (chart.kind !== 'bars') assert.ok(chart.xLabels >= 2, `${where}: dated ticks`);
        assert.ok(chart.grid >= 2, `${where}: gridlines`);
        assert.deepEqual(chart.overlaps, [], `${where}: tick labels do not touch`);
        assert.match(chart.yLabels[0], /^[^\d]*0/, `${where}: the ruler starts at 0`);
      }
    }
    assert.ok(seen >= 6, `${seen} charts checked`);
    await W(app, `(a.switchView('gantt'), 1)`);
  } },
  { group: 'Feature check', name: 'All 13 views (incl. Kanban board) render without errors (sample plan)', async run(app) {
    await freshSample(app);
    await app.main.eval(TRACK_ERRORS);
    const views = await W(app, `w.state.settings && ${JSON.stringify(['gantt', 'tracking', 'taskSheet', 'taskUsage', 'network', 'calendar', 'timeline', 'kanban', 'resourceSheet', 'resourceUsage', 'resourceGraph', 'teamPlanner', 'reports'])}`);
    for (const view of views) {
      await W(app, `(a.switchView(${JSON.stringify(view)}), 1)`);
      await sleep(250);
      const shown = await app.main.eval(`(() => { const host = document.querySelector('#view-host'); return { visible: !host.hidden, text: host.innerText.trim().length, nodes: host.querySelectorAll('*').length, view: window.__myworkplan.state.viewId ?? window.__myworkplan.debug().view }; })()`);
      assert.ok(shown.visible && shown.nodes > 20 && shown.text > 20, `${view}: ${JSON.stringify(shown)}`);
    }
    assert.deepEqual(await app.main.eval(ERRORS), [], 'no errors');
  } },
  { group: 'Feature check', name: 'All 10 reports (incl. labor cost) render and copy', async run(app) {
    await freshSample(app);
    await app.main.eval(TRACK_ERRORS);
    await app.main.eval(CLIP_SPY);
    const ids = ['overview', 'cost', 'work', 'burndown', 'critical', 'late', 'upcoming', 'milestones', 'resources', 'labor'];
    for (const id of ids) {
      await W(app, `(() => { a.activeDoc().view.report = ${JSON.stringify(id)}; a.switchView('reports'); return 1; })()`);
      await sleep(300);
      const info = await app.main.eval(`({ title: document.querySelector('#view-host h1, #view-host h2, #view-host .report-title')?.textContent ?? '', blocks: document.querySelectorAll('#view-host svg, #view-host table, #view-host .kpi').length })`);
      assert.ok(info.blocks > 0, `${id}: ${JSON.stringify(info)}`);
      await W(app, `(w.run('copyReport'), 1)`);
      await sleep(150);
      assert.ok((await app.main.eval(lastClip)).length > 20, `${id}: copied`);
    }
    assert.deepEqual(await app.main.eval(ERRORS), [], 'no errors');
  } },
  { group: 'Feature check', name: 'Running every menu command in turn raises no errors', async run(app) {
    await freshSample(app);
    await stubSavePicker(app);
    await app.main.eval(TRACK_ERRORS);
    // Commands that leave the page, need a file picked by a person, or end the session are left out.
    const skip = ['exit', 'closeAll', 'closeTab', 'open', 'import', 'insertProject', 'backgroundImage', 'clearBackground', 'dbOpen', 'dbSave', 'userGuide', 'startPage', 'recent', 'recentFolders'];
    const ids = await W(app, `Object.keys(w.commands).filter((id) => !${JSON.stringify(skip)}.includes(id))`);
    assert.ok(ids.length > 120, `${ids.length} commands`);
    const ran = [];
    try {
    for (const id of ids) {
      const enabled = await W(app, `(() => { if (!w.state.docs.length) { a.openSampleBuiltin(); a.switchView('gantt'); } if (!w.state.selection?.ids?.length && api.project().tasks[3]) a.selectTask(api.project().tasks[3].id); const c = w.commands[${JSON.stringify(id)}]; return !c.enabled || Boolean(c.enabled()); })()`);
      if (!enabled) continue;
      await W(app, `(() => { try { const r = w.run(${JSON.stringify(id)}); if (r?.catch) r.catch((e) => (window.__errs ??= []).push(${JSON.stringify(id)} + ': ' + e.message)); } catch (e) { (window.__errs ??= []).push(${JSON.stringify(id)} + ': ' + e.message); } return 1; })()`);
      await sleep(id === 'tutorial' ? 600 : 120);
      if (id === 'tutorial') await W(app, `w.tutorial()?.stop?.()`).catch(() => {});
      await closeFrames(app);
      await app.main.eval(`(document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), 1)`);
      ran.push(id);
    }
    } finally {
      // The sweep switches the language and the theme: back to Korean for the cases after it.
      await closeFrames(app);
      await W(app, `(a.updateSettings({ language: 'ko', showLeftPanel: true, showRightPanel: true, showStatusBar: true, showBottomPanel: true, bottomPanelCollapsed: false, showCritical: false }), 1)`);
    }
    assert.ok(ran.length > 80, `${ran.length} commands ran`);
    assert.deepEqual(await app.main.eval(ERRORS), [], `no errors after ${ran.length} commands`);
  } },
  { group: 'Feature check', name: 'All 40 samples open and render Gantt, Tracking Gantt, Resource Sheet and labor cost report without errors', async run(app) {
    await closeFrames(app);
    await app.main.eval(TRACK_ERRORS);
    const ids = await app.main.eval(`[...document.querySelectorAll('[data-start="sample"]')].map((b) => b.dataset.value)`).then(async (list) => (list.length ? list : W(app, `(a.showStartPage(), [...document.querySelectorAll('[data-start="sample"]')].map((b) => b.dataset.value))`)));
    assert.equal(ids.length, 40);
    for (const id of ids) {
      await W(app, `(() => { for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true }); a.openSample(${JSON.stringify(id)}); return 1; })()`);
      for (const view of ['gantt', 'tracking', 'resourceSheet']) await W(app, `(a.switchView(${JSON.stringify(view)}), 1)`);
      await W(app, `(() => { a.activeDoc().view.report = 'labor'; a.switchView('reports'); return 1; })()`);
      await sleep(60);
      const ok = await W(app, `api.project().tasks.length >= 15 && document.querySelectorAll('#view-host table, #view-host svg').length > 0`);
      assert.ok(ok, `${id} opens and draws`);
    }
    assert.deepEqual(await app.main.eval(ERRORS), [], 'no errors');
  } },
  { group: 'Labor cost', name: 'Resource info › Costs: a monthly wage shows the hourly rate; OK applies it to costs, Resource Sheet and labor cost report', async run(app) {
    await freshSample(app);
    await W(app, `(a.switchView('resourceSheet'), 1)`);
    const id = await W(app, `api.project().resources.find((r) => r.type === 'work' && !r.wage).id`);
    const before = await W(app, `w.state.docs.find((d) => d.id === w.state.active).sched.cost`);
    await W(app, `(void a.openResourceInfo(${JSON.stringify(id)}), 1)`);
    await app.waitFrame('resource');
    await app.frame('resource', `(document.querySelector('.tabs [data-value="costs"]').click(), 1)`);
    await app.waitFrame('resource', `Boolean(document.querySelector('[data-draft-select="wageBasis"]'))`);
    await app.frame('resource', `(() => { const s = document.querySelector('[data-draft-select="wageBasis"]'); s.value = 'month'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await app.waitFrame('resource', `Boolean(document.querySelector('[data-draft-wage]'))`);
    await app.frame('resource', `(() => { const i = document.querySelector('[data-draft-wage]'); i.value = '4,000,000'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
    assert.match(await app.frame('resource', `document.getElementById('wage-hourly').textContent`), /25,000.*4,000,000.*160/, 'hourly rate shown live');
    await app.frame('resource', `(document.querySelector('[data-action="resource-apply"]').click(), 1)`);
    await app.main.waitFor(`window.__myworkplan.api.project().resources.find((r) => r.id === ${JSON.stringify(id)}).wage?.basis === 'month'`, { timeout: 5000, message: 'wage applied' });
    const r = await W(app, `api.project().resources.find((r) => r.id === ${JSON.stringify(id)})`);
    assert.deepEqual([r.stdRate, r.wage], [25000, { basis: 'month', amount: 4000000 }]);
    assert.notEqual(await W(app, `w.state.docs.find((d) => d.id === w.state.active).sched.cost`), before, 'the plan cost follows the wage');
    await W(app, `(() => { a.activeDoc().view.report = 'labor'; a.switchView('reports'); return 1; })()`);
    await sleep(300);
    const text = await app.main.eval(`document.querySelector('#view-host').innerText`);
    assert.match(text, /인건비 비율/);
    assert.match(text, new RegExp(`${r.name}[\\s\\S]*월급[\\s\\S]*₩4,000,000`), 'the person is listed with the monthly wage');
    await W(app, `(w.run('undo'), 1)`);
    assert.equal(await W(app, `api.project().resources.find((r) => r.id === ${JSON.stringify(id)}).wage`), null, 'undo takes the wage back');
  } },
  { group: 'Kanban board', name: 'Kanban board: four columns (incl. backlog), silhouette and cards shift while dragging, dropping in another column sets % complete, order kept within a column', async run(app) {
    await freshSample(app);
    await W(app, `(a.switchView('kanban'), 1)`);
    await sleep(400);
    const columns = await app.main.eval(`[...document.querySelectorAll('#view-host .kb-column')].map((c) => ({ id: c.dataset.column, cards: c.querySelectorAll('.kb-card').length, count: Number(c.querySelector('.kb-count').textContent) }))`);
    assert.deepEqual(columns.map((c) => c.id), ['backlog', 'todo', 'doing', 'done']);
    assert.ok(columns.every((c) => c.cards === c.count), JSON.stringify(columns));
    const leaves = await W(app, `api.project().tasks.filter((t) => !api.sched().info(t.id).summary && t.active !== false).length`);
    assert.equal(columns.reduce((n, c) => n + c.cards, 0), leaves, 'every leaf task is a card');
    // Drag a "not started" card onto the Done column (real pointer events).
    const id = await app.main.eval(`document.querySelector('.kb-todo .kb-card').dataset.task`);
    const from = await app.main.center(`.kb-card[data-task="${id}"]`);
    const to = await app.main.center('.kb-done .kb-list');
    await app.main.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 8; i++) await app.main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + ((to.x - from.x) * i) / 8, y: from.y + ((to.y - from.y) * i) / 8, button: 'left', buttons: 1 });
    // While dragging: the card is a flat (not tilted) floating copy, its silhouette sits in the Done list where it will land.
    const during = await app.main.eval(`(() => {
      const ghost = document.querySelector('.kb-ghost');
      const holes = [...document.querySelectorAll('.kb-placeholder')];
      return { ghost: Boolean(ghost), transform: ghost && getComputedStyle(ghost).transform, holes: holes.length, inDone: Boolean(document.querySelector('.kb-done .kb-list .kb-placeholder')),
        lifted: getComputedStyle(document.querySelector('.kb-card[data-task="${id}"]')).display };
    })()`);
    assert.deepEqual(during, { ghost: true, transform: 'none', holes: 1, inDone: true, lifted: 'none' }, JSON.stringify(during));
    await app.main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 });
    await sleep(400);
    assert.equal(await W(app, `api.project().tasks.find((t) => t.id === ${JSON.stringify(id)}).percentComplete`), 100, 'dropped on Done: 100%');
    assert.ok(await app.main.eval(`Boolean(document.querySelector('.kb-done .kb-card[data-task="${id}"]'))`), 'the card moved to Done');
    assert.equal(await app.main.eval(`document.querySelectorAll('.kb-placeholder, .kb-ghost').length`), 0);
    await W(app, `(w.run('undo'), 1)`);
    await sleep(300);
    // Backlog: a card in progress dropped there goes back to 0% and stays in the Backlog (not Not started); undo brings it back.
    const busy = await app.main.eval(`document.querySelector('.kb-doing .kb-card').dataset.task`);
    const pct = await W(app, `api.project().tasks.find((t) => t.id === ${JSON.stringify(busy)}).percentComplete`);
    const p = await app.main.center(`.kb-card[data-task="${busy}"]`);
    const b = await app.main.center('.kb-backlog .kb-list');
    await app.main.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 8; i++) await app.main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x + ((b.x - p.x) * i) / 8, y: p.y + ((b.y - p.y) * i) / 8, button: 'left', buttons: 1 });
    await app.main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 });
    await sleep(400);
    assert.deepEqual(await W(app, `(({ percentComplete, backlog }) => ({ percentComplete, backlog }))(api.project().tasks.find((t) => t.id === ${JSON.stringify(busy)}))`), { percentComplete: 0, backlog: true });
    assert.ok(await app.main.eval(`Boolean(document.querySelector('.kb-backlog .kb-card[data-task="${busy}"]'))`), 'the card is in the Backlog');
    await W(app, `(w.run('undo'), 1)`);
    await sleep(300);
    assert.equal(await W(app, `api.project().tasks.find((t) => t.id === ${JSON.stringify(busy)}).percentComplete`), pct, 'undo puts the progress back');
    assert.ok(await app.main.eval(`Boolean(document.querySelector('.kb-doing .kb-card[data-task="${busy}"]'))`));
    // Reorder inside a column: the last card dragged above the first takes the top, the others slide down and keep their order.
    const col = await app.main.eval(`[...document.querySelectorAll('.kb-column')].find((c) => c.querySelectorAll('.kb-card').length >= 3).dataset.column`);
    const order = () => app.main.eval(`[...document.querySelectorAll('.kb-${col} .kb-card')].map((c) => c.dataset.task)`);
    const before = await order();
    const last = before.at(-1);
    await app.main.eval(`document.querySelector('.kb-${col} .kb-card[data-task="${last}"]').scrollIntoView({ block: 'nearest' })`);
    const a = await app.main.center(`.kb-card[data-task="${last}"]`);
    await app.main.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 });
    await app.main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y - 10, button: 'left', buttons: 1 });
    await app.main.eval(`document.querySelector('.kb-${col} .kb-list').scrollTop = 0`);
    const top = await app.main.eval(`(() => { const r = document.querySelector('.kb-${col} .kb-card:not(.kb-lifted)').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 4 }; })()`);
    for (let i = 1; i <= 6; i++) await app.main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: top.x, y: a.y + ((top.y - a.y) * i) / 6, button: 'left', buttons: 1 });
    const slid = await app.main.eval(`(() => { const list = document.querySelector('.kb-${col} .kb-list'); return { first: list.firstElementChild.className, sliding: [...list.querySelectorAll('.kb-card')].some((c) => c.style.transition.includes('transform')) }; })()`);
    assert.equal(slid.first, 'kb-placeholder', 'the silhouette is at the top of the list');
    assert.ok(slid.sliding, 'the cards slide to make room');
    await app.main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: top.x, y: top.y, button: 'left', clickCount: 1 });
    await sleep(400);
    assert.deepEqual(await order(), [last, ...before.slice(0, -1)], 'dropped order is kept');
    await W(app, `(w.run('undo'), 1)`);
    await sleep(300);
    assert.deepEqual(await order(), before, 'undo restores the order');
    await W(app, `(a.switchView('gantt'), 1)`);
  } },
  { group: 'Reports', name: 'Burndown report: key figures, remaining work and remaining tasks; print opens with the burndown chart selected', async run(app) {
    await freshSample(app);
    await W(app, `(api.doc().view.report = 'burndown', a.switchView('reports'), 1)`);
    await sleep(400);
    const info = await app.main.eval(`({ title: document.querySelector('.report-title h2').textContent, kpis: document.querySelectorAll('.burndown-kpis .kpi').length, charts: [...document.querySelectorAll('.burndown-card')].map((c) => c.dataset.burndown), lines: document.querySelectorAll('.burndown-card polyline').length, status: document.querySelectorAll('.burndown-card .status-mark').length })`);
    assert.equal(info.title, '번다운 차트');
    assert.equal(info.kpis, 6);
    assert.deepEqual(info.charts, ['work', 'tasks']);
    assert.ok(info.lines >= 5, `ideal, scheduled, actual lines: ${info.lines}`);
    await app.main.click('[data-report-action="print"]');
    await app.waitFrame('print', `document.querySelector('[data-print="content"]')`);
    const print = await app.frame('print', `({ content: document.querySelector('[data-print="content"]').value, tabs: document.querySelectorAll('.tabs').length, sections: [...document.querySelectorAll('.print-section h3')].map((h) => h.textContent.trim()), columns: document.querySelectorAll('.print-column').length, burndown: document.querySelector('.preview-stage svg')?.outerHTML.includes('번다운 차트') })`);
    assert.equal(print.content, 'burndown', 'opened from the burndown report: that chart is chosen');
    assert.equal(print.tabs, 0, 'no tabs');
    assert.equal(print.columns, 1, 'one column of settings');
    assert.deepEqual(print.sections, ['프린터', '내용', '인쇄 범위', '페이지 설정', '머리글·바닥글']);
    assert.ok(print.burndown, 'the preview is the burndown chart');
    // Print: at once (here the test hook receives the pages and the job).
    await app.main.eval(`(window.__printed = null, 1)`);
    await app.frame('print', `(window.__myworkplanPrintHook = (layout, job) => { window.parent.__printed = { pages: layout.count, width: job.widthMm, height: job.heightMm, copies: job.copies }; }, 1)`);
    await app.frame('print', `(document.querySelector('[data-action="print"]').click(), 1)`);
    await sleep(500);
    assert.deepEqual(await app.main.eval('window.__printed'), { pages: 1, width: 297, height: 210, copies: 1 });
    await closeFrames(app);
    await W(app, `(a.switchView('gantt'), 1)`);
  } },
  { group: 'Menu', name: 'Submenus open beside the menu (menu stays open, each sized on its own)', async run(app) {
    await freshSample(app);
    await app.main.click('[data-menu="view"]');
    await app.waitFrame('menu', `document.querySelector('[data-id="submenu:views"]')`);
    await app.frame('menu', `(document.querySelector('[data-id="submenu:views"]').dispatchEvent(new PointerEvent('pointerover', { bubbles: true })), 1)`);
    await sleep(400);
    const lists = await app.frame('menu', `[...document.querySelectorAll('.popup-menu')].map((m) => { const r = m.getBoundingClientRect(); return { sub: m.classList.contains('sub'), left: r.left, right: r.right, height: Math.round(r.height), items: m.querySelectorAll('.menu-item').length }; })`);
    assert.equal(lists.length, 2, 'the menu and its group');
    assert.ok(lists[1].left >= lists[0].right, 'side by side');
    assert.equal(lists[1].items, 13);
    assert.notEqual(lists[0].height, lists[1].height, 'each keeps its own height');
    await app.frame('menu', `(document.querySelector('.popup-menu.sub [data-id="view:kanban"]').click(), 1)`);
    await sleep(400);
    assert.equal(await W(app, 'w.state.viewId'), 'kanban');
    await W(app, `(a.switchView('gantt'), 1)`);
  } },
  { group: 'Popup', name: 'Settings window: all tabs visible, no < > buttons (Korean and English)', async run(app) {
    for (const language of ['ko', 'en']) {
      await closeFrames(app);
      await W(app, `(a.updateSettings({ language: ${JSON.stringify(language)} }), w.run('settings'), 1)`);
      await app.waitFrame('settings', `document.querySelector('.tabs-strip')`);
      const tabs = await app.frame('settings', `(() => { const s = document.querySelector('.tabs-strip'); return { arrows: document.querySelectorAll('.tabs-scroll').length, hidden: s.scrollWidth - s.clientWidth }; })()`);
      assert.deepEqual(tabs, { arrows: 0, hidden: 0 }, language);
    }
    await closeFrames(app);
    await W(app, `(a.updateSettings({ language: 'ko' }), 1)`);
  } },
  { group: 'Properties panel', name: '% complete: project, summary, task and multiple tasks all edit with [−] value [+], centered value, aligned row height and value column', async run(app) {
    await freshSample(app);
    await W(app, `(a.switchView('gantt'), a.clearSelection?.(), 1)`);
    await sleep(300);
    const stepper = (key) => app.main.eval(`(() => { const s = document.querySelector('#right-panel [data-stepper="${key}"]'); if (!s) return null; const input = s.querySelector('.stepper-value'); return { value: input.value, align: getComputedStyle(input).textAlign, buttons: s.querySelectorAll('.stepper-button').length }; })()`);
    const click = (key, dir) => app.main.eval(`(document.querySelector('#right-panel [data-stepper="${key}"] [data-step-dir="${dir}"]').click(), 1)`);
    const project = await stepper('project:percent');
    assert.ok(project, 'the project panel has a % complete stepper');
    assert.equal(project.buttons, 2);
    assert.equal(project.align, 'center', 'the value is centred');
    const before = await W(app, `api.sched().percentComplete`);
    await click('project:percent', 1);
    await sleep(300);
    assert.ok(await W(app, `api.sched().percentComplete`) > before, 'the + button raises the project % complete');
    await W(app, `(w.run('undo'), 1)`);
    const summary = await W(app, `api.project().tasks.find((t) => api.sched().info(t.id).summary && api.sched().info(t.id).percentComplete > 0 && api.sched().info(t.id).percentComplete < 100)?.id`);
    await W(app, `(a.selectTask(${JSON.stringify(summary)}), 1)`);
    await sleep(300);
    const sumBefore = await W(app, `api.sched().info(${JSON.stringify(summary)}).percentComplete`);
    assert.ok(await stepper('task:percent'), 'a summary task has a % complete stepper');
    await click('task:percent', -1);
    await sleep(300);
    assert.ok(await W(app, `api.sched().info(${JSON.stringify(summary)}).percentComplete`) < sumBefore, 'the − button lowers the summary');
    await W(app, `(w.run('undo'), 1)`);
    const leaves = await W(app, `api.project().tasks.filter((t) => !api.sched().info(t.id).summary).slice(0, 3).map((t) => t.id)`);
    await W(app, `(a.selectTask(${JSON.stringify(leaves[0])}), a.selectTask(${JSON.stringify(leaves[2])}, { ctrlKey: true }), 1)`);
    await sleep(300);
    assert.ok(await stepper('tasks:percent'), 'several tasks: one stepper for all');
    // Rows one field high; plain values start where the text of an input starts.
    const layout = await app.main.eval(`(() => { const rows = [...document.querySelectorAll('#right-panel .prop-row:not(.prop-progress-row):not(.tall)')]; const xs = rows.map((r) => Math.round(r.querySelector('.prop-control').getBoundingClientRect().left)); return { heights: rows.map((r) => Math.round(r.getBoundingClientRect().height)), xs }; })()`);
    assert.ok(layout.heights.every((h) => h >= 28), `row heights: ${layout.heights}`);
    assert.equal(new Set(layout.xs).size, 1, `value column: ${layout.xs}`);
    await W(app, `(a.clearSelection?.(), 1)`);
  } },
  { group: 'Labor cost', name: 'Resource Sheet labor cost table: pay basis and wage cells editable, share column, labor cost in Project info › Statistics', async run(app) {
    await freshSample(app);
    await W(app, `(a.switchView('resourceSheet'), a.setViewOptions({ resourceTable: 'labor' }), 1)`);
    await sleep(300);
    const heads = await app.main.eval(`[...document.querySelectorAll('#view-host .grid-head [data-field]')].map((c) => c.dataset.field)`);
    for (const field of ['wageBasis', 'wageAmount', 'stdRate', 'cost', 'laborShare']) assert.ok(heads.includes(field), `${field} column: ${heads}`);
    const cells = await app.main.eval(`[...document.querySelectorAll('#view-host .grid-rows [data-field="wageBasis"]')].map((c) => c.textContent.trim()).filter(Boolean)`);
    assert.ok(cells.includes('월급') && cells.includes('일급') && cells.includes('연봉') && cells.includes('시급'), `pay bases shown: ${cells}`);
    await W(app, `(w.run('projectInfo'), 1)`);
    await app.waitFrame('project');
    await app.frame('project', `(document.querySelector('.tabs [data-value="statistics"]').click(), 1)`);
    await app.waitFrame('project', `document.body.innerText.includes('인건비')`);
    assert.match(await app.frame('project', `document.body.innerText`), /인건비 비율[\s\S]*%/);
    await closeFrames(app);
  } },
  { group: 'Icons', name: 'Every icon in the main window, menus and popups is colored; the toolbar uses many colors', async run(app) {
    await freshSample(app);
    const main = await app.main.eval(`(() => {
      const icons = [...document.querySelectorAll('#app svg.icon')];
      const colors = new Set([...document.querySelectorAll('#toolbar .tool-button:not(:disabled) svg.icon')].map((i) => getComputedStyle(i).color));
      return { total: icons.length, plain: icons.filter((i) => !i.dataset.tone).map((i) => i.outerHTML.slice(0, 60)), colors: colors.size };
    })()`);
    assert.ok(main.total > 80, `${main.total} icons`);
    assert.deepEqual(main.plain, [], 'every icon has a colour');
    assert.ok(main.colors >= 6, `toolbar colours: ${main.colors}`);
    await W(app, `(a.openMenubarMenu('file'), 1)`);
    await app.waitFrame('menu');
    const menu = await app.frame('menu', `(() => { const icons = [...document.querySelectorAll('svg.icon')]; return { total: icons.length, plain: icons.filter((i) => !i.dataset.tone).length, colors: new Set(icons.map((i) => getComputedStyle(i).color)).size }; })()`);
    assert.ok(menu.total > 10 && menu.plain === 0 && menu.colors >= 5, JSON.stringify(menu));
    await closeFrames(app);
    await app.main.eval(`(document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), 1)`);
    await W(app, `(a.selectTask(api.project().tasks[2].id), 1)`);
    for (const [kind, command] of [['settings', 'settings'], ['about', 'about'], ['print', 'print'], ['task', 'taskInfo']]) {
      await W(app, `(w.run(${JSON.stringify(command)}), 1)`);
      await app.waitFrame(kind);
      const info = await app.frame(kind, `(() => { const icons = [...document.querySelectorAll('svg.icon')]; return { total: icons.length, plain: icons.filter((i) => !i.dataset.tone).length, colors: new Set(icons.map((i) => getComputedStyle(i).color)).size }; })()`);
      assert.ok(info.total > 3 && info.plain === 0 && info.colors >= 3, `${kind}: ${JSON.stringify(info)}`);
      await closeFrames(app);
    }
    // Dark themes use the brighter shades.
    await W(app, `(a.updateSettings({ theme: w.state.settings.theme }), document.documentElement.dataset.mode)`);
    assert.ok(['dark', 'light'].includes(await app.main.eval(`document.documentElement.dataset.mode`)));
  } },
  { group: 'Bottom panel', name: 'Schedule check: toggled from the toolbar, 5 tabs with counts, clicking a row goes to the task or resource', async run(app) {
    await freshSample(app);
    await W(app, `(a.updateSettings({ showBottomPanel: true, bottomPanelCollapsed: false, bottomPanelTab: 'problems' }), 1)`);
    await sleep(300);
    // The panel buttons sit on the menu bar (left of the window buttons on the desktop), not on the toolbar.
    const toolbar = await app.main.eval(`({ bar: [...document.querySelectorAll('#menubar .menubar-panels [data-command]')].map((b) => b.dataset.command), onToolbar: document.querySelectorAll('#toolbar [data-command$="Panel"]').length, last: document.querySelector('#menubar').lastElementChild?.className })`);
    assert.deepEqual(toolbar.bar, ['leftPanel', 'bottomPanel', 'rightPanel'], 'the bottom panel button sits between the side panel buttons');
    assert.equal(toolbar.onToolbar, 0, 'not on the toolbar any more');
    const info = await app.main.eval(`(() => {
      const p = document.querySelector('#bottom-panel');
      return { shown: !p.hidden, title: p.querySelector('.bp-title')?.textContent.trim(), titleIcon: Boolean(p.querySelector('.bp-title svg.icon')),
        tabs: [...p.querySelectorAll('[data-bottom-tab]')].map((b) => b.dataset.bottomTab), counts: [...p.querySelectorAll('.bp-count')].map((c) => Number(c.textContent)),
        rows: p.querySelectorAll('.bp-row').length, height: p.getBoundingClientRect().height };
    })()`);
    assert.equal(info.shown, true);
    assert.equal(info.title, '일정 점검');
    assert.ok(info.titleIcon);
    assert.deepEqual(info.tabs, ['problems', 'critical', 'overallocation', 'delays', 'milestones']);
    assert.ok(info.counts[0] === info.rows && info.counts[1] > 0 && info.counts[2] === 1 && info.counts[4] > 0, JSON.stringify(info));
    // A problem row goes to its task.
    const taskId = await app.main.eval(`document.querySelector('#bottom-panel [data-bottom-task]').dataset.bottomTask`);
    await app.main.click('#bottom-panel [data-bottom-task]');
    await sleep(200);
    assert.deepEqual(await W(app, `w.state.selection.ids`), [taskId], 'the task is selected');
    // The overallocation tab: the person, then the resource sheet with them selected.
    await app.main.click('#bottom-panel [data-bottom-tab="overallocation"]');
    await sleep(200);
    assert.equal(await W(app, `w.state.settings.bottomPanelTab`), 'overallocation');
    const resourceId = await app.main.eval(`document.querySelector('#bottom-panel [data-bottom-resource]').dataset.bottomResource`);
    await app.main.click('#bottom-panel [data-bottom-resource]');
    await sleep(300);
    assert.deepEqual(await W(app, `[w.state.viewId ?? w.debug().view, w.state.selection.kind, w.state.selection.ids]`), ['resourceSheet', 'resource', [resourceId]]);
    for (const tab of ['critical', 'delays', 'milestones']) {
      await app.main.click(`#bottom-panel [data-bottom-tab="${tab}"]`);
      await sleep(150);
      assert.ok(await app.main.eval(`document.querySelectorAll('#bottom-panel .bp-row').length > 0`), `${tab} has rows`);
    }
    // Off and on from the toolbar.
    await app.main.click('#menubar [data-command="bottomPanel"]');
    await sleep(200);
    assert.equal(await app.main.eval(`document.querySelector('#bottom-panel').hidden`), true, 'off');
    await app.main.click('#menubar [data-command="bottomPanel"]');
    await sleep(200);
    assert.equal(await app.main.eval(`document.querySelector('#bottom-panel').hidden`), false, 'on');
    // Not on the start page.
    await W(app, `(a.showStartPage(), 1)`);
    await sleep(200);
    assert.equal(await app.main.eval(`document.querySelector('#bottom-panel').hidden`), true, 'hidden on the start page');
    await W(app, `(a.showStartPage(false), 1)`);
  } },
  { group: 'Bottom panel', name: 'Collapse/expand: icon, title and counts stay visible and the view grows; drag to resize height; folded side panels show icon and title too', async run(app) {
    await freshSample(app);
    await W(app, `(a.updateSettings({ showBottomPanel: true, bottomPanelCollapsed: false, bottomPanelHeight: 230, showLeftPanel: true, showRightPanel: true }), 1)`);
    await sleep(300);
    const before = await app.main.eval(`document.querySelector('#view-host').getBoundingClientRect().height`);
    assert.equal(await app.main.eval(`document.querySelectorAll('#bottom-panel .bp-head [data-command="bottomPanel"], #bottom-panel .bp-head svg[data-icon="close"]').length`), 0, 'no "×" in the header: folding is enough');
    // Folded side panels: the expand button is the topmost thing on the rail (above the panel's icon and name).
    await W(app, `(a.updateSettings({ showLeftPanel: false, showRightPanel: false }), 1)`);
    await sleep(300);
    for (const side of ['left', 'right']) {
      const top = await app.main.eval(`(() => { const rail = document.querySelector('#${side}-panel .panel-rail'); const e = rail.querySelector('.rail-button.expand'); return [...rail.children].every((el) => el === e || el.getBoundingClientRect().top >= e.getBoundingClientRect().bottom - 1); })()`);
      assert.ok(top, `${side} rail: expand button on top`);
    }
    await W(app, `(a.updateSettings({ showLeftPanel: true, showRightPanel: true }), 1)`);
    await sleep(300);
    await app.main.click('#bottom-panel [data-command="bottomPanelFold"]');
    await sleep(300);
    const folded = await app.main.eval(`(() => { const p = document.querySelector('#bottom-panel'); return { body: Boolean(p.querySelector('.bp-body')), title: p.querySelector('.bp-title')?.textContent.trim(), icon: Boolean(p.querySelector('.bp-title svg')), counts: p.querySelectorAll('.bp-count').length, height: p.getBoundingClientRect().height, fold: p.querySelector('[data-command="bottomPanelFold"] svg')?.dataset.icon }; })()`);
    assert.deepEqual([folded.body, folded.title, folded.icon, folded.counts, folded.fold], [false, '일정 점검', true, 5, 'foldUp']);
    assert.ok(folded.height < 50, `one header line (${folded.height}px)`);
    const after = await app.main.eval(`document.querySelector('#view-host').getBoundingClientRect().height`);
    assert.ok(after > before + 150, `the view gets the room (${before} → ${after})`);
    await app.main.click('#bottom-panel [data-command="bottomPanelFold"]');
    await sleep(300);
    assert.equal(await W(app, `w.state.settings.bottomPanelCollapsed`), false);
    // Drag the top edge up by 80 px.
    await app.main.eval(`(() => {
      const s = document.querySelector('.bottom-split'); const r = s.getBoundingClientRect(); const x = r.left + 200; const y = r.top + 2;
      const ev = (type, yy, t) => t.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, buttons: 1, clientX: x, clientY: yy, pointerId: 7 }));
      ev('pointerdown', y, s); for (let i = 1; i <= 8; i++) ev('pointermove', y - i * 10, s); ev('pointerup', y - 80, s); return 1;
    })()`);
    await sleep(300);
    const height = await W(app, `w.state.settings.bottomPanelHeight`);
    assert.ok(Math.abs(height - 310) <= 4, `height ${height}`);
    await W(app, `(a.updateSettings({ bottomPanelHeight: 230 }), 1)`);
    // Side panels: new fold icons; folded rails still show icon and title first.
    assert.equal(await app.main.eval(`document.querySelector('#left-panel .panel-header [data-command="leftPanel"] svg').dataset.icon`), 'foldLeft');
    assert.equal(await app.main.eval(`document.querySelector('#right-panel .panel-header [data-command="rightPanel"] svg').dataset.icon`), 'foldRight');
    await W(app, `(a.updateSettings({ showLeftPanel: false, showRightPanel: false }), 1)`);
    await sleep(300);
    const rails = await app.main.eval(`['#left-panel', '#right-panel'].map((id) => { const rail = document.querySelector(id + ' .panel-rail'); const first = [...rail.children].sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top)[0]; return { first: first.className, icon: Boolean(first.querySelector('svg.icon')), text: first.textContent.trim(), expand: rail.querySelector('.rail-button.expand svg').dataset.icon }; })`);
    assert.deepEqual(rails.map((r) => [r.first, r.icon, Boolean(r.text), r.expand]), [['rail-button expand', true, true, 'foldRight'], ['rail-button expand', true, true, 'foldLeft']], 'the expand button is the topmost thing on a folded rail');
    await W(app, `(a.updateSettings({ showLeftPanel: true, showRightPanel: true }), 1)`);
  } },
  { group: 'Print', name: 'Print preview → browser print', async run(app) {
    await freshSample(app);
    await W(app, `(w.run('print'), 1)`);
    await app.waitFrame('print', `window.__myworkplanPopup.printLayout().count >= 1`);
    await app.frame('print', `(window.__myworkplanPrintHook = (layout) => { window.__printed = layout.count; }, 1)`);
    await app.frame('print', `(document.querySelector('[data-action="print"]').click(), 1)`);
    await sleep(300);
    assert.ok(await app.frame('print', 'window.__printed') >= 1);
    await closeFrames(app);
  } },
  { group: 'Errors', name: 'Invalid file → error popup, copy details', async run(app) {
    await drop(app, [{ name: 'broken.mwp', text: '{ nope' }]);
    await app.waitFrame('error', `document.querySelector('#error-detail')`);
    assert.match(await app.frame('error', `document.querySelector('#error-detail').value`), /broken\.mwp/);
    await app.frame('error', CLIP_SPY);
    await app.frame('error', `(document.querySelector('[data-action="copy-error"]').click(), 1)`);
    await sleep(300);
    assert.match(await app.frame('error', lastClip), /broken\.mwp/);
    await closeFrames(app);
  } },
];
