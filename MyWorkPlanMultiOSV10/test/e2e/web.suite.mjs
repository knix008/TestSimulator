// Web build end-to-end cases (headless Edge/Chrome). Popups are frames here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sleep } from './cdp.mjs';
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
      const first = document.querySelector('#menubar').firstElementChild;
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
    await app.main.click('#menubar [data-home]');
    await sleep(200);
    assert.equal(await app.main.eval(`!document.querySelector('#start-page').hidden`), true, 'pressing Home again stays home');
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
  { group: '도움말', name: '튜토리얼 문서를 프로그램 안에서 읽기 (홈 화면 항목)', async run(app) {
    await W(app, '(a.showStartPage(), 1)');
    await sleep(300);
    assert.ok(await app.main.eval(`Boolean(document.querySelector('#start-page [data-start="tutorial-doc"]'))`), 'the start page lists the tutorial document');
    await app.main.click('#start-page [data-start="tutorial-doc"]');
    await app.main.waitFor(`document.querySelectorAll('[data-reader-chapter] option').length > 5`, { timeout: 15000 });
    const doc = await app.main.eval(`(() => { const d = document.querySelector('.reader-frame').contentDocument; return { shown: !document.querySelector('#reader-page').hidden, h1: d.querySelector('h1').textContent, steps: d.querySelectorAll('h3').length, images: d.images.length, raw: d.body.innerText.includes('<a id='), chapters: [...document.querySelectorAll('[data-reader-chapter] option')].slice(1).map((o) => o.textContent) }; })()`);
    assert.ok(doc.shown);
    assert.match(doc.h1, /MyWorkPlan/);
    const steps = await app.main.eval(`window.__myworkplan.domain.tutorialSteps()`);
    assert.equal(doc.steps, steps, 'every tutorial step is in the document');
    assert.equal(doc.images, steps, 'with a picture each');
    assert.equal(doc.raw, false, 'no raw HTML shows as text');
    assert.ok(doc.chapters.every((c) => !c.endsWith('#')), JSON.stringify(doc.chapters));
    await app.main.eval(`(() => { const s = document.querySelector('[data-reader-chapter]'); s.value = s.options[4].value; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(300);
    assert.ok(await app.main.eval(`document.querySelector('.reader-frame').contentWindow.scrollY > 200`), 'a chapter can be picked');
    await app.main.click('[data-reader="lang"][data-value="en"]');
    await app.main.waitFor(`/tutorial/.test(document.querySelector('.reader-frame').contentDocument?.querySelector('h1')?.textContent ?? '')`, { timeout: 10000 });
    assert.deepEqual(await app.main.eval(CLIP_CHECK), []);
    await app.main.click('[data-reader="home"]');
    await sleep(300);
    assert.deepEqual(await app.main.eval(`[!document.querySelector('#reader-page').hidden, !document.querySelector('#start-page').hidden]`), [false, true], 'Home goes back to the start page');
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
