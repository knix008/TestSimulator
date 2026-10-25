// Web build end-to-end cases (headless Edge/Chrome). Popups are frames here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from './cdp.mjs';
import { root } from './harness.mjs';
import { ALIGN_CHECK } from './align-check.mjs';
import { CLIP_CHECK } from './clip-check.mjs';

const VERSION = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const W = (app, expression) => app.main.eval(`(() => { const w = window.__mydiagram; const a = w.actions; const api = w.api; return ${expression}; })()`);
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

/** Main-page point of an element inside the menu frame. */
function menuPoint(app, selector) {
  return app.main.eval(`(() => { const f = document.querySelector('.web-popup-menu iframe'); const fr = f.getBoundingClientRect(); const r = f.contentDocument.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: fr.left + r.left + r.width / 2, y: fr.top + r.top + r.height / 2 }; })()`);
}

/** Real mouse moves onto a menu row. */
async function hoverMenu(app, selector) {
  const p = await menuPoint(app, selector);
  await app.main.mouse('mouseMoved', p.x - 20, p.y, { button: 'none' });
  await app.main.mouse('mouseMoved', p.x, p.y, { button: 'none' });
}

async function closeMenuFrame(app) {
  await app.main.eval(`document.querySelector('.web-popup-shield').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); 1`);
  await app.main.waitFor(`!document.querySelector('.web-popup-menu')`);
}

async function closeFrames(app) {
  await app.main.eval(`window.__mydiagram.popups.closeAll().then(() => 1)`).catch(() => {});
  await sleep(150);
}

async function freshSample(app) {
  await closeFrames(app);
  await W(app, `(() => { for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true }); a.openSampleBuiltin(); a.switchView('drawing'); return 1; })()`);
  await sleep(400);
}

/** A new empty drawing with two shapes (ids a, b) far enough apart to connect. */
async function freshDrawing(app) {
  await closeFrames(app);
  return W(app, `(() => {
    for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true });
    a.newDrawing();
    a.switchView('drawing');
    const s1 = a.addShapeAt('rect', { x: 120, y: 140, w: 140, h: 70 });
    const s2 = a.addShapeAt('ellipse', { x: 460, y: 140, w: 140, h: 70 });
    a.setCanvasZoom(100);
    a.select([]);
    return { a: s1.id, b: s2.id };
  })()`);
}

/** Client point of a page point on the drawing canvas (the shape is scrolled into view first). */
const clientOf = (app, id, fx = 0.5, fy = 0.5) => W(app, `(() => {
  const v = w.state.view; v.scrollToShape(${JSON.stringify(id)});
  const s = api.page().shapes.find((x) => x.id === ${JSON.stringify(id)});
  const r = v.stage.getBoundingClientRect();
  return { x: r.left - v.world.x * v.z + (s.x + s.w * ${fx}) * v.z, y: r.top - v.world.y * v.z + (s.y + s.h * ${fy}) * v.z };
})()`);
const noError = async (app, where) => assert.equal(await app.main.eval(`document.querySelector('.web-popup-error') ? (document.querySelector('.web-popup-error iframe').contentDocument?.querySelector('#error-detail')?.value ?? 'error') : ''`), '', `${where}: no error popup`);
const shape = (app, id) => W(app, `JSON.parse(JSON.stringify(api.page().shapes.find((x) => x.id === ${JSON.stringify(id)}) ?? null))`);

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

/** A small drawing file: one page with the given shape texts. */
const drawing = (title, texts) => JSON.stringify({ format: 'mydiagram', version: 1, kind: 'drawing', document: { title, pages: [{ name: 'P1', shapes: texts.map((text, i) => ({ id: `w${i}`, master: 'rect', x: 100 + i * 180, y: 100, w: 120, h: 60, text })) }] } });
const VIEW_IDS = ['drawing', 'pages', 'shapeSheet', 'shapeData', 'reports'];

export const cases = [
  { group: '페이지', name: '제목에 프로그램 이름과 버전, 아이콘', async run(app) {
    assert.equal(await app.main.eval('document.title'), `MyDiagram v${VERSION}`);
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
    const templates = await W(app, 'w.domain.TEMPLATES.length');
    const info = await app.main.eval(`({ shown: !document.querySelector('#start-page').hidden, templates: document.querySelectorAll('.template-tile').length, tutorial: Boolean(document.querySelector('[data-start="tutorial"]')), sample: Boolean(document.querySelector('[data-start="builtin-sample"], [data-start="open-sample"]')) })`);
    assert.deepEqual(info, { shown: true, templates, tutorial: true, sample: true });
    assert.ok(templates >= 12, `${templates} templates`);
    const pixel = () => app.main.eval(`(() => { const c = document.querySelector('.start-bg'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let y = 0; y < c.height; y += 7) for (let x = 0; x < c.width; x += 7) { const i = (y * c.width + x) * 4; h = (h * 31 + d[i] * 3 + d[i + 1] * 5 + d[i + 2]) >>> 0; } return h; })()`);
    const a = await pixel();
    await sleep(900);
    assert.notEqual(await pixel(), a, 'animated');
    await app.main.click('[data-start="template"][data-value="flowchart"]');
    await sleep(500);
    assert.ok(await W(app, 'api.page().shapes.length > 3'), 'a template opens as a new drawing');
    assert.equal(await W(app, 'w.state.viewId ?? api.doc().view.id'), 'drawing');
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
    await app.main.waitFor(`window.__mydiagram.state.settings.animation !== ${JSON.stringify(second)}`, { timeout: 20000, message: 'the background changes by itself' });
    await W(app, `a.updateSettings({ animationInterval: 30 })`);
  } },
  { group: '창', name: '메뉴바: 아이콘·이름·버전, 드로잉 이름, 홈; 좌우 패널은 툴바 바로 아래·페이지 탭은 두 패널 사이 위쪽', async run(app) {
    await freshSample(app);
    const layout = await app.main.eval(`(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const bar = document.querySelector('#menubar');
      const home = bar.querySelector('[data-home]');
      const kids = [...bar.children];
      return { brandFirst: kids[0].matches('.app-brand') && /MyDiagram/.test(kids[0].textContent) && /v[0-9]/.test(kids[0].textContent) && Boolean(kids[0].querySelector('img')),
        title: document.querySelector('#doc-title .doc-title-name')?.textContent, titleGap: Math.round(r('#doc-title').left - r('.app-brand').right),
        homeBeforeMenus: kids.indexOf(home) < kids.indexOf(bar.querySelector('[data-menu]')), homeIcon: Boolean(home.querySelector('svg')), homeTitle: home.title,
        drawingTabs: document.querySelectorAll('.tab[data-doc], #tabs').length,
        toolbarBottom: Math.round(r('#toolbar').bottom), leftTop: Math.round(r('#left-panel').top), rightTop: Math.round(r('#right-panel').top),
        tabsLeft: Math.round(r('.page-tabs').left), tabsRight: Math.round(r('.page-tabs').right), tabsTop: Math.round(r('.page-tabs').top), canvasTop: Math.round(r('.canvas-main').top),
        leftRight: Math.round(r('#left-panel').right), rightLeft: Math.round(r('#right-panel').left) };
    })()`);
    assert.ok(layout.brandFirst && layout.homeBeforeMenus && layout.homeIcon && layout.homeTitle, JSON.stringify(layout));
    assert.ok(layout.title && layout.titleGap >= 20, `the drawing's name, a little apart from the program name ${JSON.stringify(layout)}`);
    assert.equal(layout.drawingTabs, 0, 'drawings have no tabs');
    assert.ok(layout.tabsTop < layout.canvasTop, `page tabs above the drawing ${JSON.stringify(layout)}`);
    assert.equal(await app.main.eval(`document.querySelectorAll('#toolbar [data-command="startPage"], #toolbar [data-home]').length`), 0, 'no home button on the toolbar: Home is in the menu bar');
    assert.ok(Math.abs(layout.leftTop - layout.toolbarBottom) <= 1 && Math.abs(layout.rightTop - layout.toolbarBottom) <= 1, `panels start right under the toolbar ${JSON.stringify(layout)}`);
    assert.ok(layout.tabsLeft >= layout.leftRight && layout.tabsRight <= layout.rightLeft, `tabs sit between the panels ${JSON.stringify(layout)}`);
    await app.main.click('#menubar [data-home]');
    await sleep(300);
    assert.equal(await app.main.eval(`!document.querySelector('#start-page').hidden`), true, 'Home shows the start page');
    await app.main.click('#menubar [data-home]');
    await sleep(200);
    assert.equal(await app.main.eval(`!document.querySelector('#start-page').hidden`), true, 'pressing Home again stays home');
  } },
  { group: '툴바', name: '모든 버튼에 툴팁, 한 줄, 투명도 조절 없음', async run(app) {
    await freshSample(app);
    assert.deepEqual(await app.main.eval(`[...document.querySelectorAll('button')].filter((b) => b.getClientRects().length && !(b.title || '').trim()).map((b) => b.outerHTML.slice(0, 80))`), []);
    const rows = await app.main.eval(`new Set([...document.querySelectorAll('#toolbar .tool-button')].map((b) => { const r = b.getBoundingClientRect(); return Math.round(r.top + r.height / 2); })).size`);
    assert.equal(rows, 1);
    assert.equal(await app.main.eval(`Boolean(document.querySelector('.opacity-control'))`), false);
  } },
  { group: '메뉴', name: '메뉴: 한 줄, 아이콘+이름, 머리글, 바깥 클릭으로 닫힘', async run(app) {
    await app.main.click('[data-menu="edit"]');
    await app.waitFrame('menu', `document.querySelectorAll('.menu-item').length > 5`);
    const info = await app.frame('menu', `({ lefts: new Set([...document.querySelectorAll('.menu-item')].map((i) => Math.round(i.getBoundingClientRect().left))).size, icons: [...document.querySelectorAll('.menu-item')].every((i) => i.querySelector('.menu-icon svg') && i.querySelector('.menu-label').textContent.trim()), head: document.querySelector('.popup-menu').getAttribute('aria-label') })`);
    assert.equal(info.lefts, 1);
    assert.ok(info.icons);
    assert.equal(info.head, '편집');
    await app.main.eval(`document.querySelector('.web-popup-shield').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); 1`);
    await app.main.waitFor(`!document.querySelector('.web-popup-menu')`);
  } },
  { group: '메뉴', name: '하위 메뉴: 마우스를 올리면 옆에 펼쳐지고, 다른 줄로 가면 닫힘 (실제 마우스)', async run(app) {
    await freshSample(app);
    await app.main.click('[data-menu="view"]');
    await app.waitFrame('menu', `document.querySelector('[data-id="submenu:views"]')`);
    await hoverMenu(app, '[data-id="submenu:views"]');
    await app.waitFrame('menu', `document.querySelector('.popup-menu.sub [data-id="view:shapeSheet"]')`, 3000);
    const layout = await app.frame('menu', `(() => { const m = document.querySelector('.popup-menu.main').getBoundingClientRect(); const s = document.querySelector('.popup-menu.sub').getBoundingClientRect(); const row = document.querySelector('[data-id="submenu:views"]'); const r = row.getBoundingClientRect(); return { beside: Math.abs(s.left - m.right) < 6 || Math.abs(s.right - m.left) < 6, level: Math.abs(s.top - r.top) < 12, open: row.classList.contains('sub-open'), count: document.querySelectorAll('.popup-menu.sub .menu-item').length, label: document.querySelector('.popup-menu.sub').getAttribute('aria-label'), inside: s.right <= innerWidth && s.bottom <= innerHeight && m.left >= 0 }; })()`);
    assert.ok(layout.count >= 5, JSON.stringify(layout));
    assert.deepEqual({ ...layout, count: 0 }, { beside: true, level: true, open: true, count: 0, label: '보기 전환', inside: true });
    // Another group swaps the submenu; a plain row closes it.
    await hoverMenu(app, '[data-id="submenu:zoom"]');
    await app.waitFrame('menu', `document.querySelector('.popup-menu.sub [data-id="zoomIn"]')`, 3000);
    await hoverMenu(app, '[data-id="presentation"]');
    await app.waitFrame('menu', `!document.querySelector('.popup-menu.sub')`, 3000);
    await hoverMenu(app, '[data-id="submenu:views"]');
    await app.waitFrame('menu', `document.querySelector('.popup-menu.sub [data-id="view:shapeSheet"]')`, 3000);
    const target = await menuPoint(app, '.popup-menu.sub [data-id="view:shapeSheet"]');
    await app.main.realClick(target.x, target.y);
    await app.main.waitFor(`!document.querySelector('.web-popup-menu')`);
    await app.main.waitFor(`window.__mydiagram.api.doc().view.id === 'shapeSheet'`);
    await W(app, `a.switchView('drawing')`);
    await sleep(350); // the menu bar ignores a click on the menu that just closed
    // Keyboard: Right opens and enters the submenu, Left goes back.
    await app.main.click('[data-menu="view"]');
    await app.waitFrame('menu', `document.querySelector('[data-id="submenu:zoom"]')`);
    await app.frame('menu', `(document.querySelector('[data-id="submenu:zoom"]').focus(), document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })), 1)`);
    assert.equal(await app.frame('menu', `document.activeElement?.dataset.id`), 'zoomIn');
    await app.frame('menu', `(document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })), 1)`);
    assert.deepEqual(await app.frame('menu', `[document.activeElement?.dataset.id, Boolean(document.querySelector('.popup-menu.sub'))]`), ['submenu:zoom', false]);
    await closeMenuFrame(app);
  } },
  { group: '메뉴', name: '컨텍스트 메뉴의 하위 메뉴: 도형 › 정렬 순서 (실제 마우스)', async run(app) {
    const ids = await freshDrawing(app);
    const p = await clientOf(app, ids.a);
    await app.main.realClick(p.x, p.y, { button: 'right' });
    await app.waitFrame('menu', `document.querySelector('[data-id="submenu:order"]')`);
    await hoverMenu(app, '[data-id="submenu:order"]');
    await app.waitFrame('menu', `document.querySelector('.popup-menu.sub [data-id="bringFront"]')`, 3000);
    assert.ok(await app.frame('menu', `Boolean(document.querySelector('.popup-menu.main [data-id="cut"]'))`), 'the context menu stays open beside its submenu');
    await closeMenuFrame(app);
  } },
  { group: '툴바', name: '툴바: 저장 바로 오른쪽 인쇄, 눈금자·격자 켜고 끄기 (실제 클릭)', async run(app) {
    await freshSample(app);
    const order = await app.main.eval(`[...document.querySelectorAll('#toolbar [data-command]')].map((b) => b.dataset.command)`);
    assert.equal(order[order.indexOf('save') + 1], 'print', order.join(','));
    for (const [command, key] of [['rulers', 'showRulers'], ['grid', 'showGrid']]) {
      const before = await W(app, `w.state.settings.${key}`);
      const p = await app.main.center(`#toolbar [data-command="${command}"]`);
      await app.main.realClick(p.x, p.y);
      await sleep(250);
      assert.equal(await W(app, `w.state.settings.${key}`), !before, command);
      assert.equal(await app.main.eval(`document.querySelector('#toolbar [data-command="${command}"]').getAttribute('aria-pressed')`), String(!before), `${command}: the button shows the state`);
      await app.main.realClick(p.x, p.y);
      await sleep(250);
      assert.equal(await W(app, `w.state.settings.${key}`), before);
    }
  } },
  { group: '팝업', name: '인쇄 창: 탭 없이 범위·페이지 설정·머리글을 한 열에, 좁은 설정 열', async run(app) {
    await freshSample(app);
    await W(app, `(w.run('print'), 1)`);
    await app.waitFrame('print', `document.querySelector('.print-options')`);
    await sleep(400);
    const info = await app.frame('print', `({ tabs: document.querySelectorAll('.tabs, [data-action="tab"]').length, sections: document.querySelectorAll('.print-options .print-section').length, width: document.querySelector('.print-options').offsetWidth, all: ['[data-print-range]', '[data-print="paper"]', '[data-print-text="headerText"]'].every((q) => document.querySelector(q)) })`);
    assert.deepEqual({ ...info, width: info.width <= 460 }, { tabs: 0, sections: 3, width: true, all: true }, JSON.stringify(info));
    assert.deepEqual(await app.frame('print', FRAME_SCROLL_CHECK), [], 'no scroll bar');
    assert.deepEqual(await app.frame('print', CLIP_CHECK), [], 'nothing cut off');
    await closeFrames(app);
  } },
  { group: '보기', name: '페이지 탭은 늘 보임: 숨기는 버튼·명령 없음', async run(app) {
    await freshSample(app);
    assert.ok(await app.main.eval(`document.querySelector('.page-tabs').getBoundingClientRect().height > 0`));
    assert.equal(await app.main.eval(`document.querySelectorAll('[data-command="pageTabs"], [data-command="bottomPanel"]').length`), 0, 'no toggle on the toolbar');
    assert.equal(await W(app, `'pageTabs' in w.commands || 'showPageTabs' in w.state.settings`), false);
  } },
  { group: '메뉴', name: '컨텍스트 메뉴: 도형·연결선·빈 캔버스·페이지 탭이 서로 다름', async run(app) {
    const ids = await freshDrawing(app);
    await W(app, `(a.connectShapes({ id: ${JSON.stringify(ids.a)}, pt: 'auto' }, { id: ${JSON.stringify(ids.b)}, pt: 'auto' }), 1)`);
    await sleep(200);
    const menuAt = async (point) => {
      await app.main.realClick(point.x, point.y, { button: 'right' });
      await app.waitFrame('menu', `document.querySelector('.menu-item')`);
      const info = await app.frame('menu', `({ ids: [...document.querySelectorAll('.menu-item')].map((i) => i.dataset.id).join(), icons: [...document.querySelectorAll('.menu-item')].every((i) => i.querySelector('.menu-icon svg')) })`);
      await app.main.eval(`document.querySelector('.web-popup-shield').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); 1`);
      await app.main.waitFor(`!document.querySelector('.web-popup-menu')`);
      assert.ok(info.icons, JSON.stringify(point));
      return info.ids;
    };
    const onShape = await clientOf(app, ids.a);
    const between = await W(app, `(() => { const v = w.state.view; const r = v.stage.getBoundingClientRect(); const route = api.doc().routes().values().next().value; const p = route.points[Math.floor(route.points.length / 2) - 1]; const q = route.points[Math.floor(route.points.length / 2)]; return { x: r.left - v.world.x * v.z + ((p.x + q.x) / 2) * v.z, y: r.top - v.world.y * v.z + ((p.y + q.y) / 2) * v.z }; })()`);
    const empty = { x: onShape.x, y: onShape.y + 200 };
    const tab = await app.main.center('.page-tab');
    const menus = [await menuAt(onShape), await menuAt(between), await menuAt(empty), await menuAt(tab)];
    assert.equal(new Set(menus).size, 4, menus.join(' | '));
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
  { group: '팝업', name: '도형 서식·페이지 설정·디자인·레이어·찾기 팝업이 잘리지 않음', async run(app) {
    await freshSample(app);
    await W(app, `(a.select([api.page().shapes.find((s) => s.type === 'shape').id]), 1)`);
    for (const [command, kind] of [['formatShape', 'shape'], ['pageSetup', 'page'], ['design', 'design'], ['layers', 'layers'], ['find', 'find'], ['shapeData', 'data'], ['layout', 'layout']]) {
      await W(app, `(w.run('${command}'), 1)`);
      await app.waitFrame(kind);
      assert.ok(await app.frame(kind, `Boolean(document.querySelector('.popup-head h2 svg'))`), `${kind}: icon and title`);
      assert.deepEqual(await app.frame(kind, FRAME_SCROLL_CHECK), [], `${kind}: no scrollbar`);
      assert.deepEqual(await app.frame(kind, CLIP_CHECK), [], `${kind}: nothing cut off`);
      await closeFrames(app);
    }
  } },
  { group: '테마', name: '테마 드롭다운: 다크 20 | 라이트 20 두 줄', async run(app) {
    await app.main.click('[data-command="themeMenu"]');
    await app.waitFrame('theme', `document.querySelectorAll('[data-pick-theme]').length > 30`);
    assert.deepEqual(await app.frame('theme', `[...document.querySelectorAll('.picker-column')].map((c) => c.querySelectorAll('[data-pick-theme]').length)`), [20, 20]);
    // Narrow, under the dropdown button: left edges lined up, or right edges when the page ends first.
    const fit = await app.main.eval(`(() => { const b = document.querySelector('#toolbar [data-command="themeMenu"]').closest('.split-button').getBoundingClientRect(); const f = document.querySelector('.web-popup-theme').getBoundingClientRect(); return { width: Math.round(f.width), left: Math.abs(f.left - b.left) < 2, right: Math.abs(f.right - b.right) < 2, roomRight: b.left + f.width <= innerWidth - 4, below: f.top >= b.bottom }; })()`);
    assert.ok(fit.width < 560, JSON.stringify(fit));
    assert.ok(fit.below && (fit.roomRight ? fit.left : fit.right), JSON.stringify(fit));
    assert.deepEqual(await app.frame('theme', CLIP_CHECK), [], 'theme names are not cut off');
    await app.frame('theme', `(document.querySelector('[data-pick-theme="monokai"]').click(), 1)`);
    await sleep(300);
    assert.equal(await W(app, 'w.state.settings.theme'), 'monokai');
  } },
  { group: '툴바', name: '보기 드롭다운: 보기를 바꿔도 툴바 버튼이 움직이지 않음', async run(app) {
    await freshSample(app);
    const layout = () => app.main.eval(`JSON.stringify([...document.querySelectorAll('#toolbar .tool-button')].map((b) => Math.round(b.getBoundingClientRect().left)))`);
    const first = await layout();
    for (const view of VIEW_IDS) {
      await W(app, `(a.switchView('${view}'), 1)`);
      await sleep(150);
      assert.equal(await W(app, 'api.doc().view.id'), view);
      assert.equal(await layout(), first, `${view}: toolbar buttons stay in place`);
    }
    await W(app, `(a.switchView('drawing'), 1)`);
  } },
  { group: '창', name: '홈 화면은 좌우 패널을 모두 숨겨도 창 전체 폭을 씀', async run(app) {
    await closeFrames(app);
    const widths = [];
    for (const [left, right] of [[true, true], [false, true], [true, false], [false, false]]) {
      widths.push(await app.main.eval(`(async () => { const w = window.__mydiagram; w.actions.updateSettings({ showLeftPanel: ${left}, showRightPanel: ${right} }); w.actions.showStartPage(true); await new Promise((r) => setTimeout(r, 250)); const c = document.querySelector('#center').getBoundingClientRect(); return [Math.round(c.left), Math.round(c.width), document.documentElement.clientWidth]; })()`));
    }
    await W(app, `(a.updateSettings({ showLeftPanel: true, showRightPanel: true }), a.showStartPage(false), 1)`);
    for (const [left, width, page] of widths) {
      assert.equal(left, 0);
      assert.ok(width >= page - 2, `home screen ${width}px of ${page}px`);
    }
  } },
  { group: '도형', name: '스텐실 도형 클릭 → 캔버스에 추가, Ctrl+Z / Ctrl+Y', async run(app) {
    await freshDrawing(app);
    const count = await W(app, 'api.page().shapes.length');
    await app.main.click('.stencil-tile[data-master="diamond"], .stencil-tile[data-master="decision"]');
    await sleep(300);
    assert.equal(await W(app, 'api.page().shapes.length'), count + 1);
    assert.equal(await W(app, 'api.selection().ids.length'), 1, 'the new shape is selected');
    await app.main.eval(`document.querySelector('.canvas-scroll').focus(); 1`);
    await app.main.key('z', 2);
    await sleep(200);
    assert.equal(await W(app, 'api.page().shapes.length'), count);
    await app.main.key('y', 2);
    await sleep(200);
    assert.equal(await W(app, 'api.page().shapes.length'), count + 1);
  } },
  { group: '도형', name: '스텐실에서 캔버스로 끌어다 놓으면 놓은 자리에 도형 하나 (실제 마우스)', async run(app) {
    const ids = await freshDrawing(app);
    const at = await clientOf(app, ids.a, 0.5, 4);
    const tile = await app.main.eval(`(() => { const t = document.querySelector('.stencil-tile[data-master="rect"]'); t.scrollIntoView({ block: 'nearest' }); const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, draggable: t.draggable }; })()`);
    assert.equal(tile.draggable, false, 'tiles use the pointer, not HTML5 drag (which the desktop window takes for files)');
    const count = await W(app, 'api.page().shapes.length');
    await app.main.drag(tile, at, 20);
    await sleep(300);
    const placed = await W(app, `(() => { const s = api.page().shapes.at(-1); const p = w.state.view.toPage(${at.x}, ${at.y}); return { count: api.page().shapes.length, master: s.master, dx: Math.abs(s.x + s.w / 2 - p.x), dy: Math.abs(s.y + s.h / 2 - p.y), ghost: Boolean(document.querySelector('.stencil-ghost')) }; })()`);
    assert.equal(placed.count, count + 1, 'exactly one shape (the click after the drag adds none)');
    assert.equal(placed.master, 'rect');
    assert.ok(placed.dx < 25 && placed.dy < 25, `centred where dropped ${JSON.stringify(placed)}`);
    assert.equal(placed.ghost, false, 'the drag picture is gone');
  } },
  { group: '도형', name: '사각형 도구로 실제 마우스 끌기 → 새 도형, 끌어서 이동, 화살표로 미세 이동', async run(app) {
    const ids = await freshDrawing(app);
    const start = await clientOf(app, ids.a, 0, 3);
    await W(app, `(a.setTool('rect'), 1)`);
    await app.main.drag(start, { x: start.x + 160, y: start.y + 90 });
    await sleep(250);
    const made = await W(app, `(() => { const s = api.page().shapes.at(-1); return { master: s.master, w: Math.round(s.w), h: Math.round(s.h), tool: api.tool() }; })()`);
    assert.equal(made.master, 'rect');
    assert.ok(Math.abs(made.w - 160) <= 20 && Math.abs(made.h - 90) <= 20, JSON.stringify(made));
    await W(app, `(a.setTool('pointer'), 1)`);
    const before = await shape(app, ids.b);
    const from = await clientOf(app, ids.b);
    await app.main.drag(from, { x: from.x + 100, y: from.y + 60 });
    await sleep(250);
    const after = await shape(app, ids.b);
    assert.ok(Math.abs(after.x - before.x - 100) <= 12 && Math.abs(after.y - before.y - 60) <= 12, `moved by the mouse ${before.x},${before.y} → ${after.x},${after.y}`);
    await noError(app, 'move');
    await W(app, '(w.run("undo"), 1)');
    assert.deepEqual([(await shape(app, ids.b)).x, (await shape(app, ids.b)).y], [before.x, before.y], 'the mouse move is one undo step');
    await W(app, '(w.run("redo"), 1)');
    await app.main.key('ArrowRight');
    await sleep(150);
    assert.ok((await shape(app, ids.b)).x > after.x, 'nudged with the arrow key');
  } },
  { group: '도형', name: '크기 조절 핸들과 회전 핸들 (실제 마우스)', async run(app) {
    const ids = await freshDrawing(app);
    await W(app, `(a.select([${JSON.stringify(ids.a)}]), 1)`);
    await sleep(150);
    const corner = await clientOf(app, ids.a, 1, 1);
    const before = await shape(app, ids.a);
    await app.main.drag(corner, { x: corner.x + 60, y: corner.y + 40 });
    await sleep(250);
    const sized = await shape(app, ids.a);
    assert.ok(sized.w > before.w + 30 && sized.h > before.h + 20, `resized ${before.w}x${before.h} → ${sized.w}x${sized.h}`);
    await noError(app, 'resize');
    assert.equal(await W(app, 'api.doc().history.canUndo'), true);
    const center = await clientOf(app, ids.a);
    const handle = await app.main.eval(`(() => { const h = document.querySelector('.canvas-overlay [data-handle="rotate"]'); if (!h) return null; const r = h.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    assert.ok(handle, 'a rotation handle is shown');
    await app.main.drag(handle, { x: center.x + 200, y: center.y });
    await sleep(250);
    const turned = await shape(app, ids.a);
    assert.ok(Math.abs(turned.angle - 90) < 3, `rotated to ${turned.angle}`);
    await noError(app, 'rotate');
  } },
  { group: '연결선', name: '연결선이 도형을 잇고, 도형을 옮기면 따라감', async run(app) {
    const ids = await freshDrawing(app);
    await W(app, `(a.connectShapes({ id: ${JSON.stringify(ids.a)}, pt: 'auto' }, { id: ${JSON.stringify(ids.b)}, pt: 'auto' }), 1)`);
    await sleep(250);
    const pathOf = () => W(app, `(() => { const c = api.page().shapes.find((s) => s.type === 'connector'); return { d: document.querySelector('.canvas-svg [data-id="' + c.id + '"] path')?.getAttribute('d') ?? null, points: api.doc().routes().get(c.id).points.length }; })()`);
    const first = await pathOf();
    assert.ok(first.d, 'the connector is drawn');
    await W(app, `(a.select([${JSON.stringify(ids.b)}]), api.moveSelection([${JSON.stringify(ids.b)}], 0, 160), 1)`);
    await sleep(250);
    const second = await pathOf();
    assert.notEqual(second.d, first.d, 'the connector follows the moved shape');
    assert.ok(second.points >= 3, 'an orthogonal route bends');
  } },
  { group: '연결선', name: '연결선 도구: 도형에서 도형으로 끌면 붙은 연결선', async run(app) {
    const ids = await freshDrawing(app);
    await W(app, `(a.setTool('connector'), 1)`);
    const from = await clientOf(app, ids.a);
    const to = await clientOf(app, ids.b);
    await app.main.drag(from, to, 20);
    await sleep(300);
    const con = await W(app, `(() => { const c = api.page().shapes.find((s) => s.type === 'connector'); return c ? { from: c.from.id, to: c.to.id } : null; })()`);
    await W(app, `(a.setTool('pointer'), 1)`);
    assert.deepEqual(con, { from: ids.a, to: ids.b });
  } },
  { group: '텍스트', name: '두 번 클릭해 텍스트 입력, Ctrl+Enter 로 끝냄', async run(app) {
    const ids = await freshDrawing(app);
    const p = await clientOf(app, ids.a);
    await app.main.realClick(p.x, p.y);
    await noError(app, 'click on a shape');
    await app.main.realClick(p.x, p.y, { clickCount: 2 });
    await app.main.waitFor(`Boolean(document.querySelector('.text-editor'))`, { message: 'a text editor opens' });
    await app.main.type('주문 접수');
    await app.main.key('Enter', 2);
    await sleep(200);
    assert.equal((await shape(app, ids.a)).text, '주문 접수');
    assert.match(await app.main.eval(`document.querySelector('.canvas-svg').textContent`), /주문 접수/);
  } },
  { group: '편집', name: '클립보드: Ctrl+C 로 브라우저 클립보드에 글자, Ctrl+V 로 붙여넣기', async run(app) {
    const ids = await freshDrawing(app);
    await W(app, `(a.setShapeText ? a.setShapeText(${JSON.stringify(ids.a)}, '복사할 도형') : null, a.select([${JSON.stringify(ids.a)}]), document.querySelector('.canvas-scroll').focus(), 1)`);
    await app.main.eval(CLIP_SPY);
    await app.main.key('c', 2);
    await sleep(400);
    assert.match(await app.main.eval(lastClip), /복사할 도형/);
    const count = await W(app, 'api.page().shapes.length');
    await app.main.key('v', 2);
    await sleep(400);
    assert.equal(await W(app, 'api.page().shapes.length'), count + 1);
  } },
  { group: '편집', name: 'Ctrl+휠 확대·축소 (캔버스)', async run(app) {
    await freshDrawing(app);
    const z = () => W(app, 'Math.round(w.state.view.z * 100)');
    const before = await z();
    const p = await app.main.center('.canvas-scroll');
    await app.main.wheel(p.x, p.y, -200, 2);
    await sleep(200);
    assert.ok(await z() > before, 'zoomed in');
    await app.main.wheel(p.x, p.y, 400, 2);
    await sleep(200);
    assert.ok(await z() < before, 'zoomed out');
  } },
  { group: '서식', name: '빠른 스타일·디자인·정렬·그룹', async run(app) {
    const ids = await freshDrawing(app);
    const fill = () => W(app, `document.querySelector('.canvas-svg [data-id="${ids.a}"] path, .canvas-svg [data-id="${ids.a}"] rect')?.getAttribute('fill')`);
    const first = await fill();
    await W(app, `(a.select([${JSON.stringify(ids.a)}]), a.setStyle({ fill: '#ff0000' }), 1)`);
    await sleep(150);
    assert.equal((await shape(app, ids.a)).style.fill, '#ff0000');
    assert.notEqual(await fill(), first, 'the fill shows');
    await W(app, `(a.select([${JSON.stringify(ids.a)}, ${JSON.stringify(ids.b)}]), a.align('top'), a.groupSelection(), 1)`);
    await sleep(150);
    assert.equal(await W(app, `api.page().shapes.filter((s) => s.type === 'group').length`), 1);
    await W(app, `(a.ungroupSelection(), 1)`);
    assert.equal(await W(app, `api.page().shapes.filter((s) => s.type === 'group').length`), 0);
    assert.equal((await shape(app, ids.a)).y, (await shape(app, ids.b)).y, 'aligned at the top');
  } },
  { group: '페이지', name: '페이지 추가·이름 바꾸기·이동·삭제 (페이지 탭)', async run(app) {
    await freshDrawing(app);
    await W(app, `(a.addPage(), 1)`);
    await sleep(200);
    assert.equal(await app.main.eval(`document.querySelectorAll('.page-tab').length`), 2);
    await W(app, `(a.renamePage(api.page().id, '상세 흐름'), 1)`);
    await sleep(150);
    assert.match(await app.main.eval(`document.querySelector('.page-tab.active, .page-tab.current')?.textContent ?? ''`), /상세 흐름/);
    await W(app, `(a.goToPage(api.doc().doc.pages[0].id), 1)`);
    assert.equal(await W(app, 'api.doc().doc.pages.indexOf(api.page())'), 0);
    await W(app, `(a.deletePage(api.doc().doc.pages[1].id, { force: true }), 1)`);
    await sleep(200);
    assert.equal(await W(app, 'api.doc().doc.pages.length'), 1);
  } },
  { group: '파일', name: '파일 끌어다 놓기: 드로잉은 새 탭, 이미지는 그림 도형', async run(app) {
    await freshSample(app);
    const tabs = await W(app, 'w.state.docs.length');
    await drop(app, [{ name: 'dropped.mdg', text: drawing('웹에서 놓음', ['하나', '둘']) }]);
    assert.equal(await W(app, 'w.state.docs.length'), tabs + 1);
    assert.equal(await W(app, 'api.doc().doc.title'), '웹에서 놓음');
    const count = await W(app, 'api.page().shapes.length');
    await drop(app, [{ name: 'pic.png', base64: iconB64, type: 'image/png' }]);
    await sleep(400);
    assert.equal(await W(app, 'api.page().shapes.length'), count + 1);
    assert.equal(await W(app, 'api.page().shapes.at(-1).master'), 'image');
  } },
  { group: '파일', name: '저장(브라우저 저장 창)·Visio/SVG/HTML/CSV/그림 내보내기', async run(app) {
    await freshSample(app);
    await stubSavePicker(app);
    await W(app, `a.saveDoc(a.activeDoc(), { saveAs: true })`);
    await sleep(300);
    const saved = await app.main.eval('window.__saved');
    const name = Object.keys(saved).find((n) => n.endsWith('.mdg'));
    assert.ok(name, JSON.stringify(Object.keys(saved)));
    assert.equal(JSON.parse(saved[name]).format, 'mydiagram');
    assert.equal(await W(app, 'a.activeDoc().dirty'), false);
    for (const type of ['vsdx', 'svg', 'html', 'csv', 'mdgt']) await W(app, `a.exportAs('${type}')`);
    await sleep(500);
    const all = await app.main.eval('window.__saved');
    for (const ext of ['vsdx', 'svg', 'html', 'csv', 'mdgt']) assert.ok(Object.keys(all).some((n) => n.endsWith(`.${ext}`)), `${ext}: ${Object.keys(all)}`);
    assert.ok(Object.entries(all).some(([n, text]) => n.endsWith('.svg') && text.includes('<svg')));
    for (const [format, ext] of [['png', 'png'], ['jpeg', 'jpg'], ['webp', 'webp'], ['bmp', 'bmp'], ['tiff', 'tiff'], ['svg', 'svg']]) {
      await W(app, `a.exportImage({ format: '${format}', transparent: true, area: 'content', scale: 1 })`);
      await sleep(150);
      assert.ok(Object.keys(await app.main.eval('window.__saved')).some((n) => n.endsWith(`.${ext}`) && n.includes(' - ')), `image ${format}`);
    }
    await W(app, `a.exportPdf()`);
    await sleep(800);
    assert.ok(Object.keys(await app.main.eval('window.__saved')).some((n) => n.endsWith('.pdf')), 'PDF');
  } },
  { group: '파일', name: 'Visio(.vsdx)로 내보낸 것을 다시 열면 같은 도형·연결', async run(app) {
    await freshSample(app);
    await stubSavePicker(app);
    await app.main.eval(`(() => { const orig = window.showSaveFilePicker; window.showSaveFilePicker = async (o) => { const h = await orig(o); return { ...h, createWritable: async () => { const parts = []; return { write: async (x) => { parts.push(x); }, close: async () => { window.__vsdxBlob = new Blob(parts); window.__saved[o.suggestedName] = 'vsdx'; } }; } }; }; return 1; })()`);
    const counts = await W(app, `({ shapes: api.page().shapes.filter((s) => s.type === 'shape').length, connectors: api.page().shapes.filter((s) => s.type === 'connector').length, pages: api.doc().doc.pages.length })`);
    await W(app, `a.exportAs('vsdx')`);
    await app.main.waitFor('Boolean(window.__vsdxBlob)');
    await app.main.eval(`(async () => { const bytes = new Uint8Array(await window.__vsdxBlob.arrayBuffer()); await window.__mydiagram.actions.openContent('round.vsdx', bytes); return 1; })()`);
    await sleep(500);
    const back = await W(app, `({ shapes: api.page().shapes.filter((s) => s.type === 'shape').length, connectors: api.page().shapes.filter((s) => s.type === 'connector').length, pages: api.doc().doc.pages.length })`);
    assert.deepEqual({ shapes: back.shapes, connectors: back.connectors, pages: back.pages }, counts);
  } },
  { group: '툴바', name: '내보내기 버튼: 그림 형식 고르기, 투명 배경은 지원하는 형식에서만, 화살표는 모든 내보내기 형식', async run(app) {
    await freshSample(app);
    await stubSavePicker(app);
    await app.main.click('#toolbar .split-button [data-command="exportImage"]');
    await app.waitFrame('image');
    const formats = await app.frame('image', `[...document.querySelectorAll('[data-draft-segment="format"]')].map((b) => b.dataset.value)`);
    assert.deepEqual(formats, ['png', 'jpeg', 'webp', 'bmp', 'tiff', 'svg']);
    const backgroundRow = `document.querySelector('[data-draft-segment="transparent"]').closest('.row').classList.contains('disabled-row')`;
    assert.equal(await app.frame('image', backgroundRow), false, 'PNG: transparent background can be chosen');
    await app.frame('image', `(document.querySelector('[data-draft-segment="format"][data-value="jpeg"]').click(), 1)`);
    await sleep(150);
    assert.equal(await app.frame('image', backgroundRow), true, 'JPEG has no transparency');
    await app.frame('image', `(document.querySelector('[data-draft-segment="format"][data-value="webp"]').click(), 1)`);
    await sleep(150);
    await app.frame('image', `(document.querySelector('[data-draft-segment="transparent"][data-value="true"]').click(), 1)`);
    await sleep(150);
    await app.frame('image', `(document.querySelector('[data-action="image-apply"]').click(), 1)`);
    await app.main.waitFor(`Object.keys(window.__saved).some((n) => n.endsWith('.webp'))`, { message: 'WebP saved' });
    await app.main.click('#toolbar [data-command="exportMenu"]');
    await app.waitFrame('menu', `document.querySelectorAll('.menu-item').length >= 5`);
    const items = await app.frame('menu', `[...document.querySelectorAll('.menu-item')].map((i) => i.dataset.id)`);
    for (const id of ['exportVsdx', 'exportPdf', 'exportSvg', 'exportImage', 'exportHtml']) assert.ok(items.includes(id), `${id} in ${items}`);
    await closeFrames(app);
  } },
  { group: '파일', name: '열기(브라우저 파일 선택)', async run(app) {
    await app.main.eval(`(() => { window.showOpenFilePicker = async () => [{ name: 'picked.mdg', getFile: async () => new File([${JSON.stringify(drawing('고른 드로잉', ['A', 'B', 'C']))}], 'picked.mdg') }]; return 1; })()`);
    await W(app, `w.run('open')`);
    await app.main.waitFor(`window.__mydiagram.api.doc()?.doc.title === '고른 드로잉'`);
    assert.equal(await W(app, 'api.page().shapes.length'), 3);
  } },
  { group: '파일', name: '저장 안 한 변경이 있으면 페이지를 떠날 때 확인', async run(app) {
    await freshSample(app);
    await W(app, `(a.addShapeAt('rect', { x: 10, y: 10, w: 50, h: 40 }), 1)`);
    app.dialogs.length = 0;
    await app.reload();
    assert.deepEqual(app.dialogs, ['beforeunload']);
    await app.frame('welcome', `(document.querySelector('[data-value="later"]')?.click(), 1)`).catch(() => {});
  } },
  { group: '설정', name: '설정은 새로 고침 뒤에도 남음 (localStorage)', async run(app) {
    await W(app, `a.updateSettings({ theme: 'dracula', language: 'en', gridSize: 'fine' })`);
    await app.reload();
    assert.deepEqual(await W(app, `({ theme: w.state.settings.theme, language: w.state.settings.language, gridSize: w.state.settings.gridSize })`), { theme: 'dracula', language: 'en', gridSize: 'fine' });
    assert.match(await app.main.eval(`document.querySelector('[data-menu="file"]').textContent`), /File/);
    await W(app, `a.updateSettings({ theme: 'light', language: 'ko', gridSize: 'normal' })`);
  } },
  ...VIEW_IDS.map((view) => ({ group: '보기', name: `${view}`, async run(app) {
    if (view === 'drawing') await freshSample(app);
    await W(app, `a.switchView('${view}')`);
    await sleep(400);
    assert.ok(await app.main.eval(`document.querySelector('#view-host').querySelectorAll('*').length > 30`));
    assert.deepEqual(await app.main.eval(CLIP_CHECK), [], 'nothing cut off');
    assert.equal(await app.main.eval(`Boolean(document.querySelector('.web-popup-error'))`), false);
  } })),
  { group: '보기', name: '보고서: 모든 보고서가 그려지고 HTML·CSV 로 내보냄', async run(app) {
    await freshSample(app);
    await stubSavePicker(app);
    await W(app, `a.switchView('reports')`);
    await sleep(300);
    const reports = await app.main.eval(`[...document.querySelectorAll('[data-report]')].map((b) => b.dataset.report)`);
    assert.ok(reports.length >= 5, JSON.stringify(reports));
    for (const id of [...new Set(reports)]) {
      await app.main.click(`[data-report="${id}"]`);
      await sleep(150);
      assert.ok(await app.main.eval(`document.querySelector('#view-host').innerText.trim().length > 20`), id);
    }
  } },
  { group: '도움말', name: '튜토리얼 문서를 프로그램 안에서 읽기 (홈 화면 항목)', async run(app) {
    await W(app, '(a.showStartPage(), 1)');
    await sleep(300);
    assert.ok(await app.main.eval(`Boolean(document.querySelector('#start-page [data-start="tutorial-doc"]'))`), 'the start page lists the tutorial document');
    await app.main.click('#start-page [data-start="tutorial-doc"]');
    await app.main.waitFor(`document.querySelectorAll('[data-reader-chapter] option').length > 5`, { timeout: 15000 });
    const doc = await app.main.eval(`(() => { const d = document.querySelector('.reader-frame').contentDocument; return { shown: !document.querySelector('#reader-page').hidden, h1: d.querySelector('h1').textContent, steps: d.querySelectorAll('h3').length, raw: d.body.innerText.includes('<a id=') }; })()`);
    assert.ok(doc.shown);
    assert.match(doc.h1, /MyDiagram/);
    const steps = await app.main.eval(`window.__mydiagram.domain.tutorialSteps()`);
    assert.equal(doc.steps, steps, 'every tutorial step is in the document');
    assert.equal(doc.raw, false, 'no raw HTML shows as text');
    await app.main.click('[data-reader="lang"][data-value="en"]');
    await app.main.waitFor(`/tutorial/i.test(document.querySelector('.reader-frame').contentDocument?.querySelector('h1')?.textContent ?? '')`, { timeout: 10000 });
    assert.deepEqual(await app.main.eval(CLIP_CHECK), []);
    await app.main.click('[data-reader="home"]');
    await sleep(300);
    assert.deepEqual(await app.main.eval(`[!document.querySelector('#reader-page').hidden, !document.querySelector('#start-page').hidden]`), [false, true], 'Home goes back to the start page');
  } },
  { group: '인쇄', name: '인쇄 미리 보기 → 브라우저 인쇄', async run(app) {
    await freshSample(app);
    await W(app, `(w.run('print'), 1)`);
    await app.waitFrame('print', `window.__mydiagramPopup.printLayout().count >= 1`);
    await app.frame('print', `(window.__mydiagramPrintHook = (layout) => { window.__printed = layout.count; }, 1)`);
    await app.frame('print', `(document.querySelector('[data-action="print"]').click(), 1)`);
    await sleep(300);
    assert.ok(await app.frame('print', 'window.__printed') >= 1);
    await closeFrames(app);
  } },
  { group: '프레젠테이션', name: 'F5 전체 화면 프레젠테이션: 페이지 넘김, Esc·전체 화면 해제로 끝', async run(app) {
    await freshSample(app);
    await W(app, `(a.startPresentation(), 1)`);
    await app.main.waitFor(`!document.querySelector('#presentation').hidden`);
    const first = await app.main.eval(`document.querySelector('#presentation .present-bar span').textContent`);
    await W(app, `(a.presentStep(1), 1)`);
    await sleep(200);
    assert.notEqual(await app.main.eval(`document.querySelector('#presentation .present-bar span').textContent`), first, 'the next page shows');
    // Esc: the page gets it when not in full screen; in full screen the browser leaves full screen, which ends the show.
    await app.main.key('Escape');
    await sleep(300);
    await app.main.eval(`(document.fullscreenElement ? document.exitFullscreen() : Promise.resolve()).then(() => 1)`);
    await app.main.waitFor(`document.querySelector('#presentation').hidden`);
  } },
  { group: '오류', name: '잘못된 파일 → 오류 팝업, 자세히 복사', async run(app) {
    await drop(app, [{ name: 'broken.mdg', text: '{ nope' }]);
    await app.waitFrame('error', `document.querySelector('#error-detail')`);
    assert.match(await app.frame('error', `document.querySelector('#error-detail').value`), /broken\.mdg/);
    await app.frame('error', CLIP_SPY);
    await app.frame('error', `(document.querySelector('[data-action="copy-error"]').click(), 1)`);
    await sleep(300);
    assert.match(await app.frame('error', lastClip), /broken\.mdg/);
    await closeFrames(app);
  } },
];
