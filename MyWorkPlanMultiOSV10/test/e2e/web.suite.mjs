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
  { group: '페이지', name: '제목에 프로그램 이름과 버전, 아이콘', async run(app) {
    assert.equal(await app.main.eval('document.title'), `MyWorkPlan v${VERSION}`);
    assert.ok(await app.main.eval(`Boolean(document.querySelector('link[rel="icon"]'))`));
  } },
  { group: '페이지', name: '처음 열면 튜토리얼 안내 (프레임 팝업)', async run(app) {
    await app.waitFrame('welcome', `document.querySelector('.popup-head h2 svg')`);
    assert.match(await app.frame('welcome', `document.querySelector('.popup').innerText`), /튜토리얼/);
    await app.frame('welcome', `(document.querySelector('[data-value="later"]').click(), 1)`);
    await app.main.waitFor(`!document.querySelector('.web-popup-welcome')`);
  } },
  { group: '시작 페이지', name: '템플릿·예제·튜토리얼·움직이는 배경', async run(app) {
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
  { group: '시작 페이지', name: '카드 보드: MyUMLMaker 모양, 테마 카드 없음, 바로 가기 10개(인쇄 포함), 격자에 빈칸 없음', async run(app) {
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
    assert.equal(info.handles, 6);
    assert.equal(info.corners, 6);
    assert.equal(info.theme, 0, 'no theme picker on the start page');
    assert.deepEqual(info.actions, ['open', 'import', 'print', 'tutorial', 'shortcuts', 'language', 'settings', 'start-settings', 'about', 'exit']);
    assert.equal(info.tools, 3, 'show-at-start toggle, start settings, auto arrange');
    assert.deepEqual(info.docs, ['guide', 'tutorial-doc', 'tutorial-video']);
    assert.ok(info.gaps.every((n) => n === 0), `every grid row is full: ${info.gaps}`);
    assert.equal(info.overlap, false, 'cards never overlap');
    assert.equal(info.sideScroll, false, 'no sideways scrolling');
  } },
  { group: '시작 페이지', name: '예제 40개(8분야×5): 누르면 그 언어의 새 계획 탭, 진행 중 예제는 기준 계획·완료율', async run(app) {
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
  { group: '시작 페이지', name: '카드 옮기기·자동 정렬·불투명도가 저장되고, 인쇄 타일은 열린 계획의 인쇄 창을 엶', async run(app) {
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
  { group: '시작 페이지', name: '튜토리얼 영상 단추: 별도 창(브라우저 탭)의 영상 화면, 언어 국기 단추', async run(app) {
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
  { group: '시작 페이지', name: '설정 › 시작 화면: 항목 숨기기가 시작 화면에 바로 반영', async run(app) {
    await W(app, `(() => { a.showStartPage(); w.popups.open('settings', { tab: 'start' }); return 1; })()`);
    await app.waitFrame('settings', `Boolean(document.querySelector('[data-toggle="startShowSamples"]'))`);
    await app.frame('settings', `(document.querySelector('[data-toggle="startShowSamples"]').click(), 1)`);
    await app.main.waitFor(`!document.querySelector('#start-page .start-card-samples')`, { timeout: 5000, message: 'samples card hidden' });
    await app.frame('settings', `(document.querySelector('[data-toggle="startShowSamples"]').click(), 1)`);
    await app.main.waitFor(`Boolean(document.querySelector('#start-page .start-card-samples'))`, { timeout: 5000, message: 'samples card back' });
    await closeFrames(app);
  } },
  { group: '시작 페이지', name: '배경: 시작할 때마다 무작위, 정한 시간마다 자동으로 바뀜', async run(app) {
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
  { group: '창', name: '메뉴바의 홈 버튼, 좌우 패널은 툴바 바로 아래·탭은 두 패널 사이', async run(app) {
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
  { group: '툴바', name: '모든 버튼에 툴팁, 한 줄, 투명도 조절 없음', async run(app) {
    assert.deepEqual(await app.main.eval(`[...document.querySelectorAll('button')].filter((b) => b.getClientRects().length && !(b.title || '').trim()).map((b) => b.outerHTML.slice(0, 80))`), []);
    const rows = await app.main.eval(`new Set([...document.querySelectorAll('#toolbar .tool-button')].map((b) => { const r = b.getBoundingClientRect(); return Math.round(r.top + r.height / 2); })).size`);
    assert.equal(rows, 1);
    assert.equal(await app.main.eval(`Boolean(document.querySelector('.opacity-control'))`), false);
  } },
  { group: '메뉴', name: '메뉴: 한 줄, 아이콘+이름, 머리글, 바깥 클릭으로 닫힘', async run(app) {
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
  { group: '메뉴', name: '컨텍스트 메뉴: 작업 행·차트·열 머리글이 서로 다름', async run(app) {
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
  { group: '팝업', name: '팝업 프레임: 아이콘+제목, 스크롤 없음, 머리글을 끌어 이동', async run(app) {
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
  { group: '테마', name: '테마 드롭다운: 다크 20 | 라이트 20 두 줄', async run(app) {
    await app.main.click('[data-command="themeMenu"]');
    await app.waitFrame('theme', `document.querySelectorAll('[data-pick-theme]').length > 30`);
    assert.deepEqual(await app.frame('theme', `[...document.querySelectorAll('.picker-column')].map((c) => c.querySelectorAll('[data-pick-theme]').length)`), [20, 20]);
    await app.frame('theme', `(document.querySelector('[data-pick-theme="monokai"]').click(), 1)`);
    await sleep(300);
    assert.equal(await W(app, 'w.state.settings.theme'), 'monokai');
  } },
  { group: '툴바', name: '보기 드롭다운: 보기를 바꿔도 툴바 버튼이 움직이지 않음, 메뉴바에 계획 이름 없음', async run(app) {
    await freshSample(app);
    assert.equal(await app.main.eval(`document.querySelector('#menubar .menubar-title')`), null, 'the menubar shows no plan title');
    const views = ['gantt', 'tracking', 'taskSheet', 'taskUsage', 'network', 'calendar', 'timeline', 'resourceSheet', 'resourceUsage', 'resourceGraph', 'teamPlanner', 'reports'];
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
  { group: '보기', name: '간트 차트 줄: 작업 표와 같은 교차 색·선택 표시, 같은 높이에 정렬', async run(app) {
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
  { group: '창', name: '홈 화면은 좌우 패널을 모두 숨겨도 창 전체 폭을 씀', async run(app) {
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
  { group: '일정', name: '주 공정 표시 버튼: 툴바에서 주 공정 강조를 켜고 끔', async run(app) {
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
  { group: '일정', name: '주 공정 찾기 버튼: 토글, 앞뒤로 계산해 주 공정 작업·연결을 표시', async run(app) {
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
  { group: '편집', name: '작업 추가 → 실행 취소 → 다시 실행 (Ctrl+Z/Y)', async run(app) {
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
  { group: '편집', name: '클립보드: 복사한 작업을 브라우저 클립보드로, 붙여넣기', async run(app) {
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
  { group: '편집', name: 'Ctrl+휠 확대·축소', async run(app) {
    await W(app, `a.updateSettings({ zoom: 100 })`);
    const p = await app.main.center('.grid-body');
    await app.main.wheel(p.x, p.y, -100, 2);
    await sleep(200);
    assert.equal(await W(app, 'w.state.settings.zoom'), 110);
    await W(app, `a.updateSettings({ zoom: 100 })`);
  } },
  { group: '파일', name: '파일 끌어다 놓기: 계획은 새 탭, 이미지는 배경', async run(app) {
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
  { group: '파일', name: '저장(브라우저 저장 창)·XML/CSV 내보내기', async run(app) {
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
  { group: '파일', name: '열기(브라우저 파일 선택)', async run(app) {
    await app.main.eval(`(() => { window.showOpenFilePicker = async () => [{ name: 'picked.mwp', getFile: async () => new File([${JSON.stringify(plan('고른 계획', ['A', 'B', 'C']))}], 'picked.mwp') }]; return 1; })()`);
    await W(app, `w.run('open')`);
    await app.main.waitFor(`window.__myworkplan.api.project()?.title === '고른 계획'`);
    assert.equal(await W(app, 'api.project().tasks.length'), 3);
  } },
  { group: '파일', name: '저장 안 한 변경이 있으면 페이지를 떠날 때 확인', async run(app) {
    await freshSample(app);
    await W(app, `a.insertTask({ name: 'unsaved' }, { edit: false })`);
    app.dialogs.length = 0;
    await app.reload();
    assert.deepEqual(app.dialogs, ['beforeunload']);
    await app.frame('welcome', `(document.querySelector('[data-value="later"]')?.click(), 1)`).catch(() => {});
  } },
  { group: '설정', name: '설정은 새로 고침 뒤에도 남음 (localStorage)', async run(app) {
    await W(app, `a.updateSettings({ theme: 'dracula', language: 'en', timescale: 30 })`);
    await app.reload();
    assert.deepEqual(await W(app, `({ theme: w.state.settings.theme, language: w.state.settings.language, timescale: w.state.settings.timescale })`), { theme: 'dracula', language: 'en', timescale: 30 });
    assert.match(await app.main.eval(`document.querySelector('[data-menu="file"]').textContent`), /File/);
    await W(app, `a.updateSettings({ theme: 'light', language: 'ko', timescale: 16 })`);
  } },
  ...['gantt', 'tracking', 'taskSheet', 'taskUsage', 'network', 'calendar', 'timeline', 'resourceSheet', 'resourceUsage', 'resourceGraph', 'teamPlanner', 'reports'].map((view) => ({ group: '보기', name: `${view}`, async run(app) {
    if (view === 'gantt') await freshSample(app);
    await W(app, `a.switchView('${view}')`);
    await sleep(400);
    assert.ok(await app.main.eval(`document.querySelector('#view-host').querySelectorAll('*').length > 30`));
    assert.deepEqual(await app.main.eval(CLIP_CHECK), [], 'nothing cut off');
    assert.equal(await app.main.eval(`Boolean(document.querySelector('.web-popup-error'))`), false);
  } })),
  { group: '도움말', name: '튜토리얼 문서: 별도 창(브라우저 탭), 장 이동, 국기 단추로 언어, 글자 크기 − px +', async run(app) {
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
  { group: '보기', name: '그래프·보고서 차트: 축 눈금과 눈금자 수치, 격자선, 겹치지 않는 눈금 글자', async run(app) {
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
  { group: '기능 점검', name: '보기 12가지가 모두 오류 없이 그려짐 (예제 계획)', async run(app) {
    await freshSample(app);
    await app.main.eval(TRACK_ERRORS);
    const views = await W(app, `w.state.settings && ${JSON.stringify(['gantt', 'tracking', 'taskSheet', 'taskUsage', 'network', 'calendar', 'timeline', 'resourceSheet', 'resourceUsage', 'resourceGraph', 'teamPlanner', 'reports'])}`);
    for (const view of views) {
      await W(app, `(a.switchView(${JSON.stringify(view)}), 1)`);
      await sleep(250);
      const shown = await app.main.eval(`(() => { const host = document.querySelector('#view-host'); return { visible: !host.hidden, text: host.innerText.trim().length, nodes: host.querySelectorAll('*').length, view: window.__myworkplan.state.viewId ?? window.__myworkplan.debug().view }; })()`);
      assert.ok(shown.visible && shown.nodes > 20 && shown.text > 20, `${view}: ${JSON.stringify(shown)}`);
    }
    assert.deepEqual(await app.main.eval(ERRORS), [], 'no errors');
  } },
  { group: '기능 점검', name: '보고서 10가지(인건비 포함)가 모두 그려지고 복사됨', async run(app) {
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
  { group: '기능 점검', name: '메뉴의 모든 명령을 차례로 실행해도 오류가 없음', async run(app) {
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
  { group: '기능 점검', name: '예제 40개를 모두 열어 간트·추적 간트·자원 시트·인건비 보고서가 오류 없이 그려짐', async run(app) {
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
  { group: '인건비', name: '자원 정보 › 비용: 월급을 넣으면 시간당 단가가 보이고, 확인하면 비용·자원 시트·인건비 보고서에 반영', async run(app) {
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
  { group: '인건비', name: '자원 시트 인건비 표: 임금 기준·임금 칸 편집, 비율 열, 프로젝트 정보 › 통계의 인건비', async run(app) {
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
  { group: '아이콘', name: '메인 창·메뉴·팝업 창의 모든 아이콘에 색이 있고, 툴바는 여러 색', async run(app) {
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
  { group: '하단 패널', name: '일정 점검: 툴바 단추로 켜고 끄기, 탭 5개와 개수, 줄을 누르면 작업·자원으로 이동', async run(app) {
    await freshSample(app);
    await W(app, `(a.updateSettings({ showBottomPanel: true, bottomPanelCollapsed: false, bottomPanelTab: 'problems' }), 1)`);
    await sleep(300);
    const toolbar = await app.main.eval(`[...document.querySelectorAll('#toolbar [data-command]')].map((b) => b.dataset.command).filter((c) => /Panel$/.test(c))`);
    assert.deepEqual(toolbar, ['leftPanel', 'bottomPanel', 'rightPanel'], 'the bottom panel button sits between the side panel buttons');
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
    await app.main.click('#toolbar [data-command="bottomPanel"]');
    await sleep(200);
    assert.equal(await app.main.eval(`document.querySelector('#bottom-panel').hidden`), true, 'off');
    await app.main.click('#toolbar [data-command="bottomPanel"]');
    await sleep(200);
    assert.equal(await app.main.eval(`document.querySelector('#bottom-panel').hidden`), false, 'on');
    // Not on the start page.
    await W(app, `(a.showStartPage(), 1)`);
    await sleep(200);
    assert.equal(await app.main.eval(`document.querySelector('#bottom-panel').hidden`), true, 'hidden on the start page');
    await W(app, `(a.showStartPage(false), 1)`);
  } },
  { group: '하단 패널', name: '접고 펴기: 접어도 아이콘·제목·개수가 보이고 보기가 넓어짐, 높이 끌기, 좌우 패널 접힘도 아이콘·제목', async run(app) {
    await freshSample(app);
    await W(app, `(a.updateSettings({ showBottomPanel: true, bottomPanelCollapsed: false, bottomPanelHeight: 230, showLeftPanel: true, showRightPanel: true }), 1)`);
    await sleep(300);
    const before = await app.main.eval(`document.querySelector('#view-host').getBoundingClientRect().height`);
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
    assert.deepEqual(rails.map((r) => [r.first, r.icon, Boolean(r.text), r.expand]), [['rail-title', true, true, 'foldRight'], ['rail-title', true, true, 'foldLeft']]);
    await W(app, `(a.updateSettings({ showLeftPanel: true, showRightPanel: true }), 1)`);
  } },
  { group: '인쇄', name: '인쇄 미리 보기 → 브라우저 인쇄', async run(app) {
    await freshSample(app);
    await W(app, `(w.run('print'), 1)`);
    await app.waitFrame('print', `window.__myworkplanPopup.printLayout().count >= 1`);
    await app.frame('print', `(window.__myworkplanPrintHook = (layout) => { window.__printed = layout.count; }, 1)`);
    await app.frame('print', `(document.querySelector('[data-action="print"]').click(), 1)`);
    await sleep(300);
    assert.ok(await app.frame('print', 'window.__printed') >= 1);
    await closeFrames(app);
  } },
  { group: '오류', name: '잘못된 파일 → 오류 팝업, 자세히 복사', async run(app) {
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
