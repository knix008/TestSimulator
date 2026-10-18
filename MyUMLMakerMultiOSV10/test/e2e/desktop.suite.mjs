// Desktop end-to-end cases against the real MyUMLMaker app (see harness.mjs).
// Each case gets the started App and throws on failure. Cases run in order and
// share the app; each leaves it in a usable state. Popups are their own OS
// windows here (app.popup(kind)); files go to os.tmpdir() folders only.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Page, sleep, waitTarget } from './cdp.mjs';
import { root } from './harness.mjs';
import { ALIGN_CHECK } from './align-check.mjs';
import { CLIP_CHECK } from './clip-check.mjs';

const VERSION = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const TITLE = `MyUMLMaker v${VERSION}`;
const WS_THICKFRAME = 0x40000;
// Lists that page or scroll on purpose (result lists, the code preview, the code options column).
const POPUP_SCROLL_CHECK = `(() => [...document.querySelectorAll('*')].filter((e) => {
  const style = getComputedStyle(e);
  return ['auto', 'scroll'].includes(style.overflowY) && e.scrollHeight > e.clientHeight + 1 && !['SELECT', 'TEXTAREA', 'PRE'].includes(e.tagName) && !e.classList.contains('result-list') && !e.classList.contains('codegen-options');
}).map((e) => e.className || e.tagName))()`;
const MENUS = ['file', 'edit', 'model', 'view', 'format', 'arrange', 'tools', 'help'];

// windowsHide: a console window would take the focus away (and close an open menu).
const ps = (script) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }).toString().trim();
const getClipboard = () => ps('[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Clipboard -Raw');

const W = (app, expression) => app.main.eval(`(() => { const w = window.__myumlmaker; const a = w.actions; const api = w.api; const M = w.domain.M; return ${expression}; })()`);
const resize = (app, width, height) => app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: ${width}, height: ${height} } } }).then(() => 1)`);
const mainWindow = (app) => app.windowInfo().find((w) => w.owner === 0 && w.visible && w.title === TITLE);
const closeAllDocs = `(() => { for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true }); return 1; })()`;
const now = (app) => app.main.eval('Date.now()');

async function closePopups(app) {
  await app.main.eval(`window.__myumlmaker.popups.closeAll().then(() => 1)`).catch(() => {});
  await sleep(200);
}

/** The built-in sample project (eleven diagrams), class diagram open, at 100 %. */
async function freshSample(app) {
  await closePopups(app);
  await W(app, `(() => { for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true }); a.openSampleBuiltin(); a.setCanvasZoom(100); a.select([]); return 1; })()`);
  await sleep(500);
}

/** A new project from a template (blank: an empty class diagram) at 100 %. */
async function freshProject(app, template = 'blank') {
  await closePopups(app);
  await W(app, `(() => { for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true }); a.newProject(${JSON.stringify(template)}); a.setCanvasZoom(100); return 1; })()`);
  await sleep(400);
}

/** The view of the element named `name` on the current diagram: { id, model, x, y, box } (client point near the top of its box). */
const viewAt = (app, name, fx = 0.5, dy = 12) => W(app, `(() => {
  const tab = a.activeDoc(); const v = api.view;
  const el = [...tab.index.byId.values()].find((e) => e.name === ${JSON.stringify(name)} && !/View$/.test(e._type));
  const view = api.diagram().ownedViews.find((x) => x.model?.$ref === el?._id);
  if (!view) return null;
  v.reveal(view._id);
  const b = v.boxOf(view._id); const r = v.stage.getBoundingClientRect(); const p = v.toStage({ x: b.x + b.w * ${fx}, y: b.y + ${dy} });
  return { id: view._id, model: el._id, x: r.left + p.x, y: r.top + p.y, box: b };
})()`);
/** A client point inside the visible canvas (fractions of the scroll area). */
/** A client point on the canvas with no view and no minimap under it. */
const emptyCanvasPoint = (app) => app.main.eval(`(() => { const r = window.__myumlmaker.api.view.scroll.getBoundingClientRect(); for (let fy = 0.95; fy > 0.1; fy -= 0.05) for (let fx = 0.1; fx < 0.9; fx += 0.05) { const x = r.left + r.width * fx; const y = r.top + r.height * fy; const e = document.elementFromPoint(x, y); if (e?.closest('.canvas-scroll') && !e.closest('[data-view], .minimap, .quick-bar, .canvas-overlay [data-resize]')) return { x, y }; } return null; })()`);
const canvasPoint = (app, fx, fy) => app.main.eval(`(() => { const r = window.__myumlmaker.api.view.scroll.getBoundingClientRect(); return { x: r.left + r.width * ${fx}, y: r.top + r.height * ${fy} }; })()`);
const elementNamed = (app, name) => W(app, `(() => { const e = [...a.activeDoc().index.byId.values()].find((x) => x.name === ${JSON.stringify(name)} && !/View$/.test(x._type)); return e ? JSON.parse(JSON.stringify(e)) : null; })()`);
const countOf = (app, type) => W(app, `M.elementsWhere(a.activeDoc().project, (e) => e._type === ${JSON.stringify(type)}).length`);
const noErrorPopup = async (app, where) => assert.equal(await app.hasPopup('error'), false, `${where}: no error popup`);
const treeRow = (app, name) => app.main.eval(`(() => { const r = [...document.querySelectorAll('#explorer .tree-row')].find((x) => x.querySelector('.tree-name')?.textContent === ${JSON.stringify(name)})?.getBoundingClientRect(); return r ? { x: r.left + 60, y: r.top + r.height / 2 } : null; })()`);

/**
 * The menu window (one prewarmed OS window reused by every menu) once it shows a
 * menu opened at or after `since` (main-page clock) — never the items of an older menu.
 */
async function menuWindow(app, since, timeout = 15000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    const target = await waitTarget(app.port, (item) => item.title === 'popup-menu', Math.max(1000, end - Date.now()));
    const page = await new Page(target).open().catch((error) => { last = error; return null; });
    if (!page) { await sleep(200); continue; }
    try {
      await page.waitFor(`(window.__myumlmakerPopup?.state.params.at ?? 0) >= ${since} && Boolean(document.querySelector('.popup-menu .menu-item'))`, { timeout: Math.max(1000, end - Date.now()) });
      await sleep(250);
      return page;
    } catch (error) {
      last = error;
      page.close();
      if (!/window closed/.test(error.message)) throw error;
    }
  }
  throw last ?? new Error('no menu');
}

/** OS window checks for a popup: its own window titled "<title> — MyUMLMaker vX", owned by the main window, fixed size, no scroll bars, icon + title. */
async function expectPopupWindow(app, page, kind, { resizable = false } = {}) {
  assert.equal(await page.eval('document.title'), `popup-${kind}`);
  const head = await page.eval(`(() => { if (${kind === 'menu'}) { const m = document.querySelector('.popup-menu'); return m ? { icon: true, text: m.getAttribute('aria-label') || '', drag: true } : null; } const h = document.querySelector('.popup-head h2'); return h ? { icon: Boolean(h.querySelector('svg')), text: h.textContent.trim(), drag: Boolean(document.querySelector('[data-tauri-drag-region]')) } : null; })()`);
  assert.ok(head?.icon && head.text, `${kind}: header has an icon and a title (${JSON.stringify(head)})`);
  assert.ok(head.drag, `${kind}: can be moved by its title bar`);
  assert.deepEqual(await page.eval(POPUP_SCROLL_CHECK), [], `${kind}: no scroll bars inside the popup`);
  let windows = [];
  let popup;
  for (let i = 0; i < 16 && !popup; i++) {
    if (i) await sleep(150);
    windows = app.windowInfo().filter((w) => w.visible && w.title.endsWith(TITLE));
    popup = windows.find((w) => w.owner !== 0 && w.title === `${head.text} — ${TITLE}`);
  }
  const main = windows.find((w) => w.owner === 0);
  assert.ok(main, 'main window found');
  assert.ok(popup, `${kind}: its own OS window "${head.text} — ${TITLE}" (${JSON.stringify(windows.map((w) => w.title))})`);
  assert.equal(popup.owner, main.handle, `${kind}: owned by the main window (closes with it)`);
  if (!resizable) assert.equal(popup.style & WS_THICKFRAME, 0, `${kind}: fixed size`);
  return { main, popup };
}

/** Right-clicks a point and returns the context menu's title and item ids (the menu is closed again). */
async function contextMenuAt(app, point, where) {
  const since = await now(app);
  await app.main.realClick(point.x, point.y, { button: 'right' });
  const menu = await menuWindow(app, since);
  const info = await menu.eval(`({ head: document.querySelector('.popup-menu').getAttribute('aria-label'), ids: [...document.querySelectorAll('.menu-item')].map((i) => i.dataset.id), noIcon: [...document.querySelectorAll('.menu-item')].filter((i) => !i.querySelector('.menu-icon svg')).map((i) => i.dataset.id) })`);
  await menu.key('Escape');
  menu.close();
  await sleep(300);
  assert.deepEqual(info.noIcon, [], `${where}: every item has an icon`);
  assert.ok(info.head, `${where}: the menu has a title`);
  return { head: info.head, ids: info.ids.join(',') };
}

/** After a restart: a welcome popup (only if the first-run flag did not reach the disk) is dismissed. */
async function afterStart(app) {
  await app.popup('welcome', 2500).then((p) => p.close()).catch(() => {});
  await closePopups(app);
}

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `myuml-${name}-`));
}

async function waitFile(file, tries = 40) {
  for (let i = 0; i < tries && !fs.existsSync(file); i++) await sleep(150);
  await sleep(100);
  assert.ok(fs.existsSync(file), `${path.basename(file)} written`);
  return fs.readFileSync(file);
}

/** The text of a project file made from a template (for files written to the temp folder). */
const templateText = (app, template) => W(app, `(() => { const doc = a.newProject(${JSON.stringify(template)}); const text = doc.text(); a.closeDoc(doc, { force: true }); return text; })()`);

export const cases = [
  // ───────────────────────── first start
  { group: '처음 실행', name: '튜토리얼 안내 팝업 (독립 OS 창) → 나중에', async run(app) {
    const page = await app.popup('welcome');
    await expectPopupWindow(app, page, 'welcome');
    const text = await page.eval(`document.querySelector('.popup').innerText`);
    assert.match(text, /튜토리얼|tutorial/i);
    assert.deepEqual(await page.eval(`[...document.querySelectorAll('[data-action="choice"]')].map((b) => b.dataset.value)`), ['later', 'sample', 'tutorial']);
    await page.click('[data-value="later"]');
    page.close();
    await sleep(400);
    assert.equal(await W(app, 'w.state.settings.tutorialOffered'), true, 'offered once');
    assert.equal(await W(app, 'Boolean(w.tutorial()?.state().active)'), false, 'no tutorial started');
  } },
  { group: '처음 실행', name: '시작 페이지: 템플릿 전부, 최근 파일·폴더, 예제, 튜토리얼·도움말, 패널 숨김', async run(app) {
    await W(app, '(a.showStartPage(true), 1)');
    await sleep(300);
    const templates = await W(app, 'w.domain.TEMPLATES.length');
    const info = await app.main.eval(`({ shown: !document.querySelector('#start-page').hidden, templates: document.querySelectorAll('.template-tile').length, tutorial: Boolean(document.querySelector('.start-hero [data-start="tutorial"]')), banner: Boolean(document.querySelector('.start-banner')), recent: Boolean(document.querySelector('.start-card.recent')), samples: [...document.querySelectorAll('[data-start="open-sample"], [data-start="builtin-sample"]')].map((b) => b.dataset.value), help: ['tutorial-doc', 'guide', 'shortcuts'].every((x) => document.querySelector('[data-start="' + x + '"]')), left: getComputedStyle(document.querySelector('#left-panel')).display, version: document.querySelector('.start-hero h1').textContent })`);
    assert.ok(info.shown, 'start page shown');
    assert.equal(templates, 17, 'MyUMLMaker has 17 templates');
    assert.equal(info.templates, templates, 'a tile per template');
    assert.ok(info.tutorial && info.banner && info.recent && info.help, JSON.stringify(info));
    assert.ok(info.samples.length >= 1 && info.samples.every((p) => !p || /\.ko\.(myuml|mdj)$/.test(p)), `sample projects in the UI language ${JSON.stringify(info.samples)}`);
    assert.match(info.version, new RegExp(VERSION.replace(/\./g, '\\.')));
    assert.equal(info.left, 'none', 'the side panels are hidden on the start page');
  } },
  { group: '처음 실행', name: '시작 페이지 배경이 움직이고, 섞기·애니메이션 선택으로 바뀜', async run(app) {
    await W(app, `(a.updateSettings({ backgroundKind: 'animated' }), a.showStartPage(true), 1)`);
    await sleep(400);
    const frames = async () => app.main.eval(`(() => { const c = document.querySelector('.start-bg'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let y = 0; y < c.height; y += 7) for (let x = 0; x < c.width; x += 7) { const i = (y * c.width + x) * 4; h = (h * 31 + d[i] * 3 + d[i + 1] * 5 + d[i + 2]) >>> 0; } return h; })()`);
    const first = await frames();
    await sleep(900);
    assert.notEqual(await frames(), first, 'the background pixels change over time (animated)');
    const before = await W(app, 'w.state.settings.animation');
    await app.main.click('[data-start="shuffle"]');
    await sleep(300);
    assert.notEqual(await W(app, 'w.state.settings.animation'), before, 'shuffle picks another animation');
    await app.main.click('[data-start="animation"][data-value="flowchart"]');
    await sleep(200);
    assert.equal(await W(app, 'w.state.settings.animation'), 'flowchart');
    assert.ok(await app.main.eval(`document.querySelector('[data-start="animation"][data-value="flowchart"]').classList.contains('active')`), 'the chip shows the choice');
  } },
  { group: '처음 실행', name: '템플릿 타일을 누르면 새 프로젝트 (시퀀스 다이어그램)', async run(app) {
    await W(app, closeAllDocs);
    await W(app, '(a.showStartPage(true), 1)');
    await sleep(200);
    await app.main.click('[data-start="template"][data-value="sequence"]');
    await sleep(600);
    assert.equal(await W(app, 'w.state.docs.length'), 1);
    assert.equal(await W(app, 'api.diagram()._type'), 'UMLSequenceDiagram');
    assert.ok(await W(app, 'api.diagram().ownedViews.length >= 4'), 'the template has views');
    assert.equal(await app.main.eval(`document.querySelector('#start-page').hidden`), true, 'the start page is gone');
    assert.ok(await app.main.eval(`document.querySelectorAll('.canvas-svg [data-view]').length >= 4`), 'drawn on the canvas');
    await noErrorPopup(app, 'template');
  } },

  // ───────────────────────── window
  { group: '창', name: '타이틀 바: 프로그램 이름과 버전', async run(app) {
    assert.equal(mainWindow(app)?.title, TITLE);
    assert.equal(await app.main.eval('document.title'), TITLE);
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
    assert.ok(Math.abs(layout.leftTop - layout.toolbarBottom) <= 1 && Math.abs(layout.rightTop - layout.toolbarBottom) <= 1, `panels start right under the toolbar ${JSON.stringify(layout)}`);
    assert.ok(layout.tabsLeft >= layout.leftRight && layout.tabsRight <= layout.rightLeft, `tabs sit between the panels ${JSON.stringify(layout)}`);
    await app.main.click('#menubar [data-home]');
    await sleep(300);
    assert.equal(await app.main.eval(`!document.querySelector('#start-page').hidden`), true, 'Home shows the start page');
    assert.deepEqual(await app.main.eval(`[getComputedStyle(document.querySelector('#left-panel')).display, getComputedStyle(document.querySelector('#right-panel')).display, document.querySelector('#start-page').getBoundingClientRect().height > 300]`), ['none', 'none', true], 'with a project open the start page fills the window (no panels over it)');
    assert.ok(await app.main.eval(`document.querySelector('#menubar [data-home]').classList.contains('current')`));
    await W(app, `(w.run('startPage'), 1)`);
    await sleep(300);
    assert.equal(await app.main.eval(`document.querySelector('#start-page').hidden`), true, 'File › Start page brings the diagram back');
    // One project at a time: the bar shows the project and a tab per diagram (model order), then +.
    const bar = await app.main.eval(`(() => {
      const tabs = document.querySelector('#tabs');
      const kids = [...tabs.children].map((e) => e.className.split(' ')[0]);
      const old = document.querySelector('.diagram-tabs');
      return { kids, project: tabs.querySelector('.tab-project .tab-name')?.textContent, ids: [...tabs.querySelectorAll('.tab[data-diagram-tab]')].map((t) => t.dataset.diagramTab),
        active: tabs.querySelector('.tab.active')?.dataset.diagramTab, docTabs: tabs.querySelectorAll('[data-doc], [data-tab-new], [data-close-doc]').length, oldBar: Boolean(old && old.getClientRects().length) };
    })()`);
    const model = await W(app, `({ ids: M.elementsWhere(a.activeDoc().project, (e) => M.isDiagram(e)).map((d) => d._id), current: api.diagram()._id, name: a.activeDoc().project.name, docs: w.state.docs.length })`);
    assert.deepEqual(bar.kids.slice(0, 2), ['tab-project', 'tab-strip'], `project first, then the diagram tabs ${JSON.stringify(bar.kids)}`);
    assert.ok(bar.kids.includes('tab-add'), '+ adds a diagram');
    assert.equal(model.docs, 1, 'one project');
    assert.equal(bar.project, model.name, 'the project name comes first');
    assert.deepEqual(bar.ids, model.ids, 'a tab per diagram, in model order');
    assert.equal(bar.active, model.current, 'the open diagram is the active tab');
    assert.equal(bar.docTabs, 0, 'no project tabs, no new-tab / close-tab buttons');
    assert.equal(bar.oldBar, false, 'the bottom working-diagrams bar is gone');
  } },
  { group: '창', name: '이미 실행 중이면 오류 메시지 상자 후 종료 (두 번째 실행)', async run(app) {
    const lockDir = tempDir('lock');
    const report = path.join(lockDir, 'already.txt');
    const profile = tempDir('profile2');
    const exe = path.join(root, 'src-tauri', 'target', 'debug', 'myumlmaker.exe');
    const env = { ...process.env, MYUMLMAKER_LOCK_DIR: lockDir, MYUMLMAKER_CONFIG_DIR: profile, MYUMLMAKER_DATA_DIR: profile, WEBVIEW2_USER_DATA_FOLDER: profile, MYUMLMAKER_NO_OPEN: '1' };
    delete env.MYUMLMAKER_MULTI;
    delete env.ELECTRON_RUN_AS_NODE;
    const first = spawn(exe, [], { env, stdio: 'ignore' });
    try {
      await sleep(2500);
      // The real message box (no test hook): it must open in front of everything.
      const second = spawn(exe, [], { env, stdio: 'ignore' });
      const exited = new Promise((resolve) => second.once('exit', resolve));
      const probe = (close = false) => JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'test', 'e2e', 'dialogs.ps1'), '-ProcessId', String(second.pid), ...(close ? ['-Close'] : [])], { windowsHide: true }).toString() || '[]');
      let box;
      for (let i = 0; i < 40 && !box; i++) { await sleep(250); box = [].concat(probe()).find((w) => w.class === '#32770'); }
      assert.ok(box, 'the second copy shows a message box');
      assert.match(box.title, /MyUMLMaker/);
      assert.ok(box.topmost, `the message box is in front of every window ${JSON.stringify(box)}`);
      assert.equal(first.exitCode, null, 'the first copy keeps running');
      probe(true); // OK
      const code = await Promise.race([exited, sleep(10000).then(() => 'running')]);
      assert.equal(code, 3, 'the second copy quits after the message');
      // The wording (Korean/English) through the text hook:
      const third = spawn(exe, [], { env: { ...env, MYUMLMAKER_ALREADY_RUNNING_FILE: report }, stdio: 'ignore' });
      await Promise.race([new Promise((resolve) => third.once('exit', resolve)), sleep(10000)]);
      assert.match(fs.readFileSync(report, 'utf8'), /이미 실행 중|already running/);
    } finally {
      spawn('taskkill', ['/PID', String(first.pid), '/T', '/F'], { stdio: 'ignore' });
      await sleep(800);
    }
  } },
  { group: '창', name: '최소 창 폭: 툴바·메뉴가 가려지지 않고 툴바는 한 줄', async run(app) {
    await freshSample(app);
    const min = await W(app, 'w.state.minWidth');
    assert.ok(min > 800, `minimum width ${min}`);
    await resize(app, 600, 500);
    await sleep(700);
    const result = await app.main.eval(`(() => {
      const items = [...document.querySelectorAll('#toolbar .tool-button, #toolbar .stepper-value, #menubar .menubar-item')];
      const toolbar = document.querySelector('#toolbar').getBoundingClientRect();
      const tools = [...document.querySelectorAll('#toolbar .tool-button')];
      return {
        width: innerWidth,
        hidden: items.filter((b) => { const r = b.getBoundingClientRect(); return r.right > innerWidth + 0.5 || r.left < -0.5 || r.width < 14; }).map((b) => b.dataset.command ?? b.dataset.menu ?? b.className),
        rows: new Set(tools.map((b) => Math.round(b.getBoundingClientRect().top + b.getBoundingClientRect().height / 2))).size,
        height: toolbar.height,
      };
    })()`);
    await resize(app, 1480, 900);
    await sleep(400);
    assert.ok(result.width >= min - 2, `window kept ${result.width}px ≥ ${min}px`);
    assert.equal(result.rows, 1, 'one toolbar row');
    assert.ok(result.height < 48, `${result.height}px high`);
    assert.deepEqual(result.hidden, []);
  } },
  { group: '창', name: '오른쪽 아래 모서리의 크기 조절 표시로 창 크기 바꾸기 (실제 마우스)', async run(app) {
    await resize(app, 1300, 820);
    await sleep(400);
    const grip = await app.main.eval(`(() => { const g = document.querySelector('[data-resize-grip]'); const r = g.getBoundingClientRect(); return { right: innerWidth - r.right, bottom: innerHeight - r.bottom, cursor: getComputedStyle(g).cursor, title: g.title, x: r.left + r.width / 2, y: r.top + r.height / 2, dpr: devicePixelRatio }; })()`);
    assert.ok(grip.right < 1 && grip.bottom < 1, `in the corner ${JSON.stringify(grip)}`);
    assert.equal(grip.cursor, 'nwse-resize');
    assert.ok(grip.title);
    const before = await app.main.eval('({ w: innerWidth, h: innerHeight })');
    const main = mainWindow(app);
    // The OS resize loop (startResizeDragging) only follows the real mouse.
    const script = `Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class M{[DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);[DllImport("user32.dll")]public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern void keybd_event(byte k,byte s,uint f,UIntPtr e);[DllImport("user32.dll")]public static extern bool ClientToScreen(IntPtr h,ref P p);[DllImport("user32.dll")]public static extern IntPtr WindowFromPoint(P p);[DllImport("user32.dll")]public static extern IntPtr GetAncestor(IntPtr h,uint f);public struct P{public int X,Y;}}';
$h=[IntPtr]${main.handle};[M]::keybd_event(0x12,0,0,[UIntPtr]::Zero);[M]::keybd_event(0x12,0,2,[UIntPtr]::Zero);[void][M]::SetForegroundWindow($h);Start-Sleep -Milliseconds 200;$p=New-Object M+P;$p.X=${Math.round(grip.x * grip.dpr)};$p.Y=${Math.round(grip.y * grip.dpr)};[void][M]::ClientToScreen($h,[ref]$p);
[void][M]::SetCursorPos($p.X,$p.Y);Start-Sleep -Milliseconds 150;$hit=[M]::GetAncestor([M]::WindowFromPoint($p),2);[M]::mouse_event(2,0,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 450;
for($i=1;$i -le 10;$i++){[void][M]::SetCursorPos($p.X+12*$i,$p.Y+8*$i);Start-Sleep -Milliseconds 40};Start-Sleep -Milliseconds 150;[M]::mouse_event(4,0,0,0,[UIntPtr]::Zero);"hit=$hit"`;
    // The press can miss when Windows keeps another window in front for a moment: try again.
    let after = before;
    const hits = [];
    for (let attempt = 0; attempt < 3 && !(after.w > before.w + 40); attempt++) {
      hits.push(ps(script));
      await sleep(600);
      after = await app.main.eval('({ w: innerWidth, h: innerHeight })');
    }
    assert.ok(after.w > before.w + 40, `the window grew (${hits.join(' ')}; main ${main.handle})`);
    await resize(app, 1480, 900);
    await sleep(300);
    assert.ok(after.w > before.w + 40 && after.h > before.h + 25, `window grew ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  } },
  { group: '창', name: '상태 표시줄: 명령 결과·다이어그램·저장 상태·뷰 수·선택 크기·테마·언어·확대 비율', async run(app) {
    await freshSample(app);
    await W(app, `(w.run('selectAll'), w.run('copy'), a.select([]), 1)`);
    await app.main.waitFor(`document.querySelector('#statusbar .status-notice')?.textContent.trim().length > 3`, { timeout: 3000 });
    await sleep(200);
    const items = await app.main.eval(`[...document.querySelectorAll('#statusbar .status-item, #statusbar .status-notice')].map((e) => e.textContent.trim())`);
    const diagram = await W(app, 'api.diagram().name');
    assert.ok(items[0].length > 3, `the last command result is shown ${JSON.stringify(items)}`);
    assert.ok(items.includes(diagram), `the diagram name ${JSON.stringify(items)}`);
    assert.ok(items.some((text) => /수정됨|저장됨/.test(text)), 'saved state');
    assert.ok(items.some((text) => /뷰 \d+개/.test(text)), 'view count');
    assert.ok(items.some((text) => /^\d+%$/.test(text)), 'zoom percent');
    const v = await viewAt(app, 'Customer');
    await W(app, `(a.select([${JSON.stringify(v.id)}]), 1)`);
    await sleep(200);
    assert.match(await app.main.eval(`document.querySelector('#statusbar').textContent`), /\d+, \d+ · \d+ × \d+/, 'position and size of the selected view');
    await W(app, `(a.updateSettings({ showStatusBar: false }), 1)`);
    await sleep(200);
    assert.equal(await app.main.eval(`getComputedStyle(document.querySelector('#statusbar')).display`), 'none', 'the status bar can be hidden');
    await W(app, `(a.updateSettings({ showStatusBar: true }), 1)`);
  } },
  { group: '창', name: '좌우 패널: 접으면 아이콘+제목 레일, 구분자로 너비 조절, 최소 너비 (실제 마우스)', async run(app) {
    await freshSample(app);
    await app.main.click('#left-panel .panel-header [data-command="leftPanel"]');
    await sleep(300);
    const rail = await app.main.eval(`(() => { const p = document.querySelector('#left-panel'); const expand = p.querySelector('.rail-button.expand'); const title = p.querySelector('.rail-title'); const buttons = [...p.querySelectorAll('.rail-button')]; return { width: p.offsetWidth, expandFirst: buttons[0] === expand, title: title?.textContent.trim(), icons: buttons.every((b) => b.querySelector('svg')), tools: p.querySelectorAll('[data-tool]').length }; })()`);
    assert.ok(rail.width < 80 && rail.expandFirst && rail.title && rail.icons && rail.tools > 0, JSON.stringify(rail));
    await app.main.click('#left-panel .rail-button.expand');
    await app.main.click('#right-panel .panel-header [data-command="rightPanel"]');
    await sleep(300);
    assert.ok(await app.main.eval(`Boolean(document.querySelector('#right-panel .rail-title') && document.querySelector('#right-panel .rail-button.expand') === document.querySelector('#right-panel .rail-button'))`));
    await app.main.click('#right-panel .rail-button.expand');
    await sleep(300);
    assert.ok(await app.main.eval(`Boolean(document.querySelector('#explorer .tree-row'))`), 'the model explorer is back');
    const split = await app.main.center('[data-split="left"]');
    const before = await app.main.eval(`document.querySelector('#left-panel').offsetWidth`);
    await app.main.drag(split, { x: split.x + 80, y: split.y });
    await sleep(300);
    assert.ok(await app.main.eval(`document.querySelector('#left-panel').offsetWidth`) > before + 50, 'wider');
    await app.main.drag({ x: split.x + 80, y: split.y }, { x: split.x - 300, y: split.y });
    await sleep(300);
    const min = await app.main.eval(`document.querySelector('#left-panel').offsetWidth`);
    const floor = await app.main.eval(`import('/src/domain/settings.js').then((m) => m.PANEL_MIN.left)`);
    assert.ok(min >= floor - 1, `never narrower than its minimum (${min} ≥ ${floor})`);
    const clipped = await app.main.eval(`[...document.querySelectorAll('#left-panel .stencil-toggle span, #left-panel .panel-header span, #left-panel .tool-item span')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).textOverflow !== 'ellipsis').map((e) => e.textContent)`);
    assert.deepEqual(clipped, [], 'all labels fit at the minimum width');
    await W(app, `(a.updateSettings({ leftWidth: 240 }), 1)`);
  } },
  { group: '창', name: '다이어그램 탭이 넘치면 스크롤바 대신 오른쪽 끝에 ‹ › 버튼 (넘칠 때만, 실제 마우스)', async run(app) {
    await freshProject(app);
    const nav = () => app.main.eval(`(() => { const tabs = document.querySelector('#tabs'); const n = tabs.querySelector('.tab-nav'); const strip = tabs.querySelector('.tab-strip'); const r = n.getBoundingClientRect(); return { shown: getComputedStyle(n).display !== 'none' && r.width > 0, overflowClass: tabs.classList.contains('overflow'), overflow: strip.scrollWidth > strip.clientWidth + 1, navRight: tabs.getBoundingClientRect().right - r.right, scrollbar: strip.offsetHeight - strip.clientHeight, scroll: strip.scrollLeft, tabs: tabs.querySelectorAll('[data-diagram-tab]').length }; })()`);
    const idle = await nav();
    assert.deepEqual([idle.shown, idle.overflowClass, idle.overflow], [false, false, false], `no ‹ › while the tabs fit ${JSON.stringify(idle)}`);
    await W(app, `(() => { for (let i = 0; i < 30; i++) a.addDiagram(i % 2 ? 'UMLSequenceDiagram' : 'UMLClassDiagram'); return 1; })()`);
    await sleep(500);
    const full = await nav();
    assert.equal(full.tabs, 31, 'a tab per diagram');
    assert.ok(full.overflow && full.overflowClass && full.shown, `‹ › appear when the tabs overflow ${JSON.stringify(full)}`);
    assert.ok(full.navRight < 12 && full.scrollbar === 0, `at the right end, no scroll bar ${JSON.stringify(full)}`);
    assert.ok(full.scroll > 0, 'the new (active) tab was scrolled into view');
    const left = await app.main.center('#tabs [data-tab-scroll="-1"]');
    await app.main.realClick(left.x, left.y);
    await sleep(250);
    const back = await nav();
    assert.ok(back.scroll < full.scroll, `‹ scrolls the tabs back ${full.scroll} → ${back.scroll}`);
    const right = await app.main.center('#tabs [data-tab-scroll="1"]');
    await app.main.realClick(right.x, right.y);
    await sleep(250);
    assert.ok((await nav()).scroll > back.scroll, '› scrolls them on');
    await freshProject(app);
    assert.equal((await nav()).shown, false, 'gone again when the tabs fit');
  } },

  // ───────────────────────── one project: diagram tabs, type tabs, rulers, grid
  { group: '프로젝트·탭', name: '다이어그램 탭: 누르면 그 다이어그램, 두 번 누르면 이름 바꾸기, Ctrl+Tab·Ctrl+PageDown 으로 다음, Ctrl+W 로 프로젝트 닫기 (실제 마우스)', async run(app) {
    await freshSample(app);
    const ids = await W(app, `M.elementsWhere(a.activeDoc().project, (e) => M.isDiagram(e)).map((d) => d._id)`);
    assert.ok(ids.length >= 3, `${ids.length} diagrams`);
    const tabAt = async (id) => { await app.main.eval(`(document.querySelector('#tabs [data-diagram-tab="${id}"]').scrollIntoView({ inline: 'nearest' }), 1)`); return app.main.center(`#tabs [data-diagram-tab="${id}"]`); };
    let p = await tabAt(ids[2]);
    await app.main.realClick(p.x, p.y);
    await sleep(300);
    assert.equal(await W(app, 'api.diagram()._id'), ids[2], 'a click opens that diagram');
    assert.equal(await app.main.eval(`document.querySelector('#tabs .tab.active')?.dataset.diagramTab`), ids[2], 'and marks its tab');
    assert.ok(await app.main.eval(`document.querySelectorAll('.canvas-svg [data-view]').length > 0`), 'drawn on the canvas');
    p = await tabAt(ids[1]);
    await app.main.realClick(p.x, p.y, { clickCount: 2 });
    await app.main.waitFor(`(() => { const i = document.querySelector('#tabs .page-tab-input'); return Boolean(i && i.isConnected && i.getClientRects().length && document.activeElement === i); })()`, { timeout: 4000, message: 'a double click opens a visible name box on the tab' });
    await app.main.eval(`(document.querySelector('#tabs .page-tab-input').select(), 1)`);
    await app.main.type('바꾼 이름');
    await app.main.key('Enter');
    await sleep(300);
    assert.equal(await W(app, `a.activeDoc().index.get(${JSON.stringify(ids[1])}).name`), '바꾼 이름', 'renamed in the model');
    assert.equal(await app.main.eval(`document.querySelector('#tabs [data-diagram-tab="${ids[1]}"] .tab-name').textContent`), '바꾼 이름', 'and on the tab');
    await app.main.eval(`document.querySelector('.canvas-scroll').focus(); 1`);
    await app.main.key('Tab', 2);
    await sleep(300);
    assert.equal(await W(app, 'api.diagram()._id'), ids[2], 'Ctrl+Tab: the next diagram tab');
    await app.main.key('Tab', 2 | 8);
    await sleep(300);
    assert.equal(await W(app, 'api.diagram()._id'), ids[1], 'Ctrl+Shift+Tab: the previous one');
    await app.main.key('PageDown', 2);
    await sleep(300);
    assert.equal(await W(app, 'api.diagram()._id'), ids[2], 'Ctrl+PageDown: the next one');
    await app.main.key('PageUp', 2);
    await sleep(300);
    assert.equal(await W(app, 'api.diagram()._id'), ids[1], 'Ctrl+PageUp: the previous one');
    assert.equal(await W(app, 'a.activeDoc().dirty'), true, 'the rename is a change');
    await app.main.eval(`document.querySelector('.canvas-scroll').focus(); 1`);
    await app.main.key('w', 2);
    const asked = await app.popup('confirm');
    assert.equal(await asked.eval(`document.querySelector('.popup-head h2').textContent.trim()`), await W(app, `w.t('confirm.closeTitle')`), 'Ctrl+W asks about the change first');
    await asked.click('[data-value="discard"]');
    asked.close();
    await sleep(500);
    assert.equal(await W(app, 'w.state.docs.length'), 0, 'Ctrl+W closes the project');
    assert.equal(await app.main.eval(`!document.querySelector('#start-page').hidden`), true, 'and the start page shows');
    await noErrorPopup(app, 'diagram tabs');
  } },
  { group: '프로젝트·탭', name: '다이어그램 종류 탭: 누르면 그 종류를 열거나 만들고 도구 상자가 그 도구로 바뀜, + 는 같은 종류 하나 더 (실제 마우스)', async run(app) {
    await freshProject(app);
    const click = async (selector) => { const p = await app.main.center(selector); await app.main.realClick(p.x, p.y); await sleep(350); };
    const info = await app.main.eval(`(() => { const t = document.querySelector('.type-tabs'); const r = t.getBoundingClientRect(); const c = document.querySelector('.canvas-scroll').getBoundingClientRect(); return { shown: !t.hidden && r.height > 10, above: r.bottom <= c.top + 1, families: [...t.querySelectorAll('.type-family')].map((f) => f.dataset.typeGroup), active: t.querySelector('.type-tab.active')?.dataset.diagramType }; })()`);
    assert.ok(info.shown && info.above, `type tabs above the canvas ${JSON.stringify(info)}`);
    assert.ok(info.families.includes('umlStructure') && info.families.includes('umlBehavior') && info.families.length >= 10, JSON.stringify(info.families));
    assert.equal(info.active, 'UMLClassDiagram', 'the open diagram type is marked');
    const diagrams = () => W(app, `M.elementsWhere(a.activeDoc().project, (e) => M.isDiagram(e)).length`);
    const before = await diagrams();
    await click('.type-family[data-type-group="umlBehavior"]');
    assert.ok(await app.main.eval(`Boolean(document.querySelector('.type-tab[data-diagram-type="UMLSequenceDiagram"]'))`), 'the family shows its types');
    await click('.type-tab[data-diagram-type="UMLSequenceDiagram"]');
    assert.equal(await W(app, 'api.diagram()._type'), 'UMLSequenceDiagram', 'a sequence diagram opens');
    assert.equal(await diagrams(), before + 1, 'created, since the project had none');
    const tools = await W(app, `w.domain.toolboxFor('UMLSequenceDiagram').flatMap(([, , , list]) => list).map((t) => t.id)`);
    const shown = await app.main.eval(`[...document.querySelectorAll('#left-panel .tool-item[data-tool]')].map((t) => t.dataset.tool)`);
    assert.ok(shown.length > 3 && shown.every((id) => tools.includes(id)) && shown.includes('UMLLifeline'), `the toolbox shows the sequence tools ${JSON.stringify(shown.slice(0, 8))}`);
    assert.ok(await app.main.eval(`Boolean(document.querySelector('#tabs [data-diagram-tab].active'))`), 'and the diagram has its tab');
    await click('.type-family[data-type-group="umlStructure"]');
    await click('.type-tab[data-diagram-type="UMLClassDiagram"]');
    assert.equal(await W(app, 'api.diagram()._type'), 'UMLClassDiagram', 'back to the class diagram');
    assert.equal(await diagrams(), before + 1, 'the existing one is opened, none created');
    assert.ok(await app.main.eval(`Boolean(document.querySelector('#left-panel .tool-item[data-tool="UMLClass"]'))`), 'class tools again');
    await click('.type-tabs .type-add');
    assert.equal(await diagrams(), before + 2, '+ adds another diagram of the type');
    assert.equal(await W(app, 'api.diagram()._type'), 'UMLClassDiagram');
    assert.match(await app.main.eval(`document.querySelector('.type-tab[data-diagram-type="UMLClassDiagram"] .type-count')?.textContent ?? ''`), /^2$/, 'the type tab counts its diagrams');
    await noErrorPopup(app, 'type tabs');
  } },
  { group: '프로젝트·탭', name: '저장 안 한 프로젝트가 있을 때 다른 프로젝트를 열면 물어봄: 취소하면 그대로, 저장 안 함이면 바뀜 (실제 마우스)', async run(app) {
    await freshSample(app);
    await W(app, `(a.change('op.edit', (p) => { p.name = '고친 프로젝트'; }), 1)`);
    assert.equal(await W(app, 'a.activeDoc().dirty'), true);
    const id = await W(app, 'a.activeDoc().id');
    const newButton = await app.main.center('#toolbar [data-command="new"]');
    const askNew = async () => {
      await app.main.realClick(newButton.x, newButton.y);
      const page = await app.popup('confirm');
      await expectPopupWindow(app, page, 'confirm');
      const info = await page.eval(`({ title: document.querySelector('.popup-head h2').textContent.trim(), buttons: [...document.querySelectorAll('[data-action="choice"]')].map((b) => b.dataset.value).sort() })`);
      assert.equal(info.title, await W(app, `w.t('confirm.replaceTitle')`), 'asks about the unsaved changes');
      assert.deepEqual(info.buttons, ['cancel', 'discard', 'save']);
      return page;
    };
    let page = await askNew();
    await page.click('[data-value="cancel"]');
    page.close();
    await sleep(400);
    assert.deepEqual(await W(app, `[w.state.docs.length, a.activeDoc().id, a.activeDoc().project.name, a.activeDoc().dirty]`), [1, id, '고친 프로젝트', true], 'Cancel keeps the project and its changes');
    page = await askNew();
    await page.click('[data-value="discard"]');
    page.close();
    await sleep(500);
    assert.equal(await W(app, 'w.state.docs.length'), 1, 'still one project');
    assert.notEqual(await W(app, 'a.activeDoc().id'), id, "Don't save: replaced by the new project");
    assert.equal(await W(app, 'a.activeDoc().dirty'), false);
    await noErrorPopup(app, 'replace');
  } },
  { group: '프로젝트·탭', name: '눈금자: 위·왼쪽에 보이고 보기 › 표시 › 눈금자로 숨김 (실제 클릭)', async run(app) {
    await freshSample(app);
    await W(app, `(a.updateSettings({ showRulers: true }), 1)`);
    await sleep(200);
    const rulers = () => app.main.eval(`(() => { const s = (q) => { const e = document.querySelector(q); const r = e?.getBoundingClientRect(); return e && r.width > 4 && r.height > 4 && getComputedStyle(e).display !== 'none' ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null; }; const c = document.querySelector('.canvas-scroll').getBoundingClientRect(); return { h: s('.ruler-h'), v: s('.ruler-v'), corner: s('.ruler-corner'), canvas: [Math.round(c.left), Math.round(c.top)] }; })()`);
    const on = await rulers();
    assert.ok(on.h && on.v && on.corner, `rulers shown ${JSON.stringify(on)}`);
    assert.ok(on.h[3] < 40 && on.v[2] < 40 && on.h[1] + on.h[3] <= on.canvas[1] + 1 && on.v[0] + on.v[2] <= on.canvas[0] + 1, `along the top and left of the canvas ${JSON.stringify(on)}`);
    assert.ok(await app.main.eval(`(() => { const c = document.querySelector('.ruler-h'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let ink = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) ink++; return ink > 50; })()`), 'the horizontal ruler has ticks drawn');
    const toggle = async () => {
      let since = await now(app);
      await app.main.click('[data-menu="view"]');
      let menu = await menuWindow(app, since);
      since = await now(app);
      let p = await menu.center('[data-id="submenu:show"]');
      await menu.realClick(p.x, p.y);
      menu.close();
      menu = await menuWindow(app, since);
      p = await menu.center('[data-id="rulers"]');
      await menu.realClick(p.x, p.y);
      menu.close();
      await sleep(500);
    };
    await toggle();
    assert.equal(await W(app, 'w.state.settings.showRulers'), false, 'View › Show › Rulers turns them off');
    const off = await rulers();
    assert.deepEqual([off.h, off.v, off.corner], [null, null, null], 'the rulers are gone');
    assert.ok(off.canvas[1] < on.canvas[1] && off.canvas[0] < on.canvas[0], 'the canvas takes their place');
    await toggle();
    assert.equal(await W(app, 'w.state.settings.showRulers'), true, 'and on again');
    await noErrorPopup(app, 'rulers');
  } },
  { group: '프로젝트·탭', name: '격자: 50 %·100 %·200 % 에서 화면 간격이 같고, 맞춤도 화면 격자를 따름', async run(app) {
    await freshSample(app);
    await W(app, `(a.updateSettings({ showGrid: true, snapToGrid: true, gridSize: 10 }), 1)`);
    const sizes = {};
    for (const zoom of [50, 100, 200]) {
      await W(app, `(a.setCanvasZoom(${zoom}), 1)`);
      await sleep(300);
      sizes[zoom] = await app.main.eval(`(() => { const p = document.querySelector('#view-host pattern#grid-pattern'); const z = window.__myumlmaker.actions.activeDoc().view.zoom[window.__myumlmaker.api.diagram()._id] / 100; return { screen: Math.round(Number(p.getAttribute('width')) * z * 100) / 100, step: window.__myumlmaker.api.view.gridStep(), snap: window.__myumlmaker.api.view.snap(13) }; })()`);
    }
    assert.ok(sizes[50].screen === sizes[100].screen && sizes[100].screen === sizes[200].screen && sizes[100].screen > 0, `the grid pattern is the same size on the screen ${JSON.stringify(sizes)}`);
    assert.deepEqual([sizes[50].step, sizes[100].step, sizes[200].step], [20, 10, 5], 'grid step in page units = grid size / zoom');
    assert.deepEqual([sizes[50].snap, sizes[100].snap, sizes[200].snap], [20, 10, 15], 'snapping follows the visible grid');
    await W(app, `(a.setCanvasZoom(100), 1)`);
  } },

  // ───────────────────────── toolbar
  { group: '툴바', name: '모든 버튼에 툴팁 · 한 줄 · 아이콘은 서로 다름', async run(app) {
    await freshSample(app);
    const missing = await app.main.eval(`[...document.querySelectorAll('#menubar button, #toolbar button, #toolbar input, #tabs button, #left-panel button, #right-panel .panel-header button, #right-panel .explorer-tools button, #editor-tabs button, #statusbar button, .diagram-tabs button')].filter((b) => !(b.title || '').trim()).map((b) => b.outerHTML.slice(0, 90))`);
    assert.deepEqual(missing, []);
    const rows = await app.main.eval(`new Set([...document.querySelectorAll('#toolbar .tool-button')].map((b) => { const r = b.getBoundingClientRect(); return Math.round(r.top + r.height / 2); })).size`);
    assert.equal(rows, 1, 'one row');
    const icons = await app.main.eval(`[...document.querySelectorAll('#toolbar [data-command]')].filter((b) => b.dataset.command !== 'language' && !b.matches('.split-arrow')).map((b) => b.dataset.command + '|' + (b.querySelector('svg')?.innerHTML ?? ''))`);
    const seen = new Map();
    const dupes = [];
    for (const entry of icons) {
      const [command, svg] = [entry.slice(0, entry.indexOf('|')), entry.slice(entry.indexOf('|') + 1)];
      if (seen.has(svg)) dupes.push(`${seen.get(svg)} = ${command}`);
      else seen.set(svg, command);
    }
    assert.deepEqual(dupes, [], 'no two toolbar buttons share an icon');
    assert.ok(icons.length >= 25, `${icons.length} toolbar buttons`);
  } },
  { group: '툴바', name: '프로그램 정보 버튼: 버전·빌드 정보·제작자', async run(app) {
    await closePopups(app);
    await app.main.click('#toolbar [data-command="about"]');
    const page = await app.popup('about');
    await expectPopupWindow(app, page, 'about');
    const text = await page.eval(`document.querySelector('.popup').innerText`);
    assert.match(text, /SHKWON\(knix008@naver\.com\)/);
    assert.doesNotMatch(text, /©|저작권|Copyright/, 'no copyright line');
    assert.match(text, new RegExp(VERSION.replace(/\./g, '\\.')));
    assert.match(text, /빌드|Build/);
    assert.match(text, /Tauri/);
    page.close();
    await closePopups(app);
  } },
  { group: '툴바', name: '테마 버튼은 매번 다른 테마를 무작위로', async run(app) {
    const seen = new Set();
    let previous = await W(app, 'w.state.settings.theme');
    for (let i = 0; i < 6; i++) {
      await app.main.click('#toolbar [data-command="theme"]');
      await sleep(150);
      const theme = await W(app, 'w.state.settings.theme');
      assert.notEqual(theme, previous);
      seen.add(theme);
      previous = theme;
    }
    assert.ok(seen.size >= 4, `${seen.size} different themes`);
    assert.match(await app.main.eval(`document.querySelector('#statusbar').textContent`), new RegExp(await app.main.eval(`(async () => (await import('/src/themes.js')).themeName(window.__myumlmaker.state.settings.theme, 'ko'))()`)), 'the status bar names the theme');
  } },
  { group: '툴바', name: '테마 드롭다운 (독립 창): 다크 | 라이트 두 줄, 사용자 정의, 고르면 적용', async run(app) {
    await closePopups(app);
    await app.main.click('#toolbar [data-command="themeMenu"]');
    const page = await app.popup('theme');
    await expectPopupWindow(app, page, 'theme');
    const info = await page.eval(`(() => { const cols = [...document.querySelectorAll('.picker-column')]; return { cols: cols.length, counts: cols.map((c) => c.querySelectorAll('[data-pick-theme]').length), lefts: cols.map((c) => Math.round(c.getBoundingClientRect().left)), custom: Boolean(document.querySelector('[data-pick-theme="custom"]')), second: cols[0].querySelectorAll('[data-pick-theme]')[1].dataset.pickTheme }; })()`);
    assert.equal(info.cols, 2);
    assert.deepEqual(info.counts, [20, 20]);
    assert.ok(info.lefts[0] < info.lefts[1], 'side by side');
    assert.ok(info.custom);
    await page.click(`[data-pick-theme="${info.second}"]`);
    page.close();
    await sleep(400);
    assert.equal(await W(app, 'w.state.settings.theme'), info.second);
    await W(app, `a.updateSettings({ theme: 'light' })`);
  } },
  { group: '툴바', name: '모든 테마에서 글자가 잘 보임 (실제 화면 색 대비)', async run(app) {
    await freshSample(app);
    const v = await viewAt(app, 'Customer');
    await W(app, `(a.select([${JSON.stringify(v.id)}]), 1)`);
    const ids = await app.main.eval(`(async () => { const m = await import('/src/themes.js'); return m.THEMES.map((t) => t.id); })()`);
    const problems = [];
    for (const id of ids) {
      await W(app, `a.updateSettings({ theme: '${id}' })`);
      await sleep(60);
      const bad = await app.main.eval(`(() => {
        // rgb()/rgba() are 0–255; color(srgb r g b / a) (what color-mix() computes to) is 0–1.
        const rgb = (c) => { const n = (c.match(/[\\d.]+/g) || []).map(Number); if (!c.startsWith('color(')) return n.slice(0, 4); const v = n.slice(0, 3).map((x) => x * 255); return n.length > 3 ? [...v, n[3]] : v; };
        const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
        const bg = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c.length === 3 || c[3] > 0.9) return c; } return rgb(getComputedStyle(document.body).backgroundColor); };
        const out = [];
        for (const el of document.querySelectorAll('.menubar-item span, .panel-header span, .tool-item span, .stencil-toggle span, .diagram-tabs .page-tab span, .status-item span, .tab-name, .tree-name, .editor-tab span, .prop-label span')) {
          if (!el.textContent.trim() || !el.getClientRects().length) continue;
          const fg = rgb(getComputedStyle(el).color);
          const a = lum(fg); const b = lum(bg(el));
          const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          if (ratio < 3) out.push((el.className || el.parentElement.className) + ' "' + el.textContent.trim().slice(0, 20) + '" ' + ratio.toFixed(2));
        }
        return out.slice(0, 3);
      })()`);
      if (bad.length) problems.push(`${id}: ${bad.join(', ')}`);
    }
    await W(app, `a.updateSettings({ theme: 'light' })`);
    assert.equal(problems.length, 0, `low contrast: ${problems.join(' | ')}`);
  } },
  { group: '툴바', name: '언어 버튼: 한국어일 때 영국 국기, 영어일 때 태극기 (같은 크기)', async run(app) {
    await W(app, `a.updateSettings({ language: 'ko' })`);
    await sleep(200);
    const flag = () => app.main.eval(`document.querySelector('[data-command="language"] svg').innerHTML.includes('012169') ? 'uk' : document.querySelector('[data-command="language"] svg').innerHTML.includes('cd2e3a') ? 'kr' : '?'`);
    const flagSize = () => app.main.eval(`(() => { const f = document.querySelector('[data-command="language"] .flag'); const box = f.getBoundingClientRect(); return [Math.round(box.width), Math.round(box.height)]; })()`);
    assert.equal(await flag(), 'uk');
    const ukSize = await flagSize();
    await app.main.click('#toolbar [data-command="language"]');
    await sleep(400);
    assert.equal(await W(app, 'w.state.settings.language'), 'en');
    assert.equal(await flag(), 'kr');
    assert.deepEqual(await flagSize(), ukSize, 'both flags are the same size');
    assert.match(await app.main.eval(`document.querySelector('[data-menu="file"]').textContent`), /File/);
    assert.match(await app.main.eval(`document.querySelector('#left-panel .panel-header').textContent`), /Toolbox/i);
    await app.main.click('#toolbar [data-command="language"]');
    await sleep(400);
    assert.match(await app.main.eval(`document.querySelector('[data-menu="file"]').textContent`), /파일/);
  } },
  { group: '툴바', name: '도구 상자 도구를 누르면 눌림 표시·상태 표시줄, Esc 로 포인터', async run(app) {
    await freshProject(app);
    await app.main.click('#left-panel [data-tool="UMLInterface"]');
    await sleep(150);
    assert.equal(await W(app, 'w.state.tool?.id'), 'UMLInterface');
    assert.equal(await app.main.eval(`document.querySelector('#left-panel [data-tool="UMLInterface"]').getAttribute('aria-pressed')`), 'true');
    assert.ok(await app.main.eval(`Boolean(document.querySelector('#statusbar .status-item.warn'))`), 'the status bar names the tool');
    assert.equal(await app.main.eval(`document.querySelector('#toolbar [data-command="tool:pointer"]').getAttribute('aria-pressed')`), 'false');
    await app.main.eval(`document.querySelector('.canvas-scroll').focus(); 1`);
    await app.main.key('Escape');
    await sleep(150);
    assert.equal(await W(app, 'w.state.tool'), null, 'Esc goes back to the pointer');
    assert.equal(await app.main.eval(`document.querySelector('#toolbar [data-command="tool:pointer"]').getAttribute('aria-pressed')`), 'true');
  } },
  { group: '툴바', name: '확대: −/+ 버튼·값 입력·Ctrl+마우스 휠, 상태 표시줄이 따라감', async run(app) {
    await freshSample(app);
    const z = () => W(app, `a.activeDoc().view.zoom[api.diagram()._id] ?? 100`);
    await app.main.click('#toolbar [data-command="zoomIn"]');
    await sleep(200);
    assert.equal(await z(), 125);
    assert.equal(await app.main.eval(`document.querySelector('#zoom-value').value`), '125%');
    await app.main.eval(`(() => { const i = document.querySelector('#zoom-value'); i.value = '200'; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(200);
    assert.equal(await z(), 200);
    assert.match(await app.main.eval(`document.querySelector('#status-zoom').textContent`), /^200%/);
    const p = await canvasPoint(app, 0.5, 0.5);
    await app.main.wheel(p.x, p.y, 240, 2);
    await sleep(300);
    assert.ok(await z() < 200, 'Ctrl+wheel zooms out');
    await app.main.click('#toolbar [data-command="fitPage"]');
    await sleep(200);
    assert.ok(await z() <= 100, 'fit the diagram');
    await W(app, `(a.setCanvasZoom(100), 1)`);
  } },

  // ───────────────────────── menus
  ...MENUS.map((name) => ({ group: '메뉴', name: `메뉴 "${name}": 독립 창, 한 줄, 아이콘+이름, 모두 보임`, async run(app) {
    if (!(await W(app, 'Boolean(a.activeDoc()) && !w.state.showStart'))) await freshSample(app);
    const title = await app.main.eval(`document.querySelector('[data-menu="${name}"] span').textContent`);
    let menu;
    let info;
    // A menu closes when it loses focus (as menus do): if something took the focus meanwhile, open it once more.
    for (let attempt = 0; attempt < 2 && !info; attempt++) {
      const since = await now(app);
      await app.main.click(`[data-menu="${name}"]`);
      menu = await menuWindow(app, since);
      await menu.waitFor(`document.querySelector('.popup-menu')?.getAttribute('aria-label') === ${JSON.stringify(title)}`);
      info = await menu.eval(`(() => { const items = [...document.querySelectorAll('.menu-item')]; return { count: items.length, lefts: [...new Set(items.map((i) => Math.round(i.getBoundingClientRect().left)))], noIcon: items.filter((i) => !i.querySelector('.menu-icon svg')).length, noLabel: items.filter((i) => !i.querySelector('.menu-label').textContent.trim()).length, fits: document.documentElement.scrollHeight <= innerHeight + 2 && document.documentElement.scrollWidth <= innerWidth + 2 }; })()`);
      try {
        await expectPopupWindow(app, menu, 'menu');
      } catch (error) {
        if (attempt) throw error;
        info = null;
        menu.close();
        await sleep(400);
      }
    }
    assert.ok(info.count >= 4, `${info.count} items`);
    assert.equal(info.lefts.length, 1, 'single column');
    assert.equal(info.noIcon, 0, 'every item has an icon');
    assert.equal(info.noLabel, 0, 'every item has a label');
    assert.ok(info.fits, 'the menu window shows every item');
    assert.ok(await W(app, `document.querySelector('[data-menu="${name}"]').classList.contains('open')`), 'the menubar shows the open menu');
    await menu.key('Escape');
    await sleep(300);
    menu.close();
  } })),
  { group: '메뉴', name: '메뉴는 작은 주 창 밖으로 펼쳐짐', async run(app) {
    const min = await W(app, 'w.state.minWidth');
    await resize(app, min, 600);
    await sleep(500);
    const since = await now(app);
    await app.main.click('[data-menu="file"]');
    const menu = await menuWindow(app, since);
    await sleep(300);
    const windows = app.windowInfo().filter((w) => w.visible);
    const main = windows.find((w) => w.owner === 0 && w.title === TITLE);
    const popup = windows.find((w) => w.owner === main?.handle && w.title.startsWith('파일'));
    await menu.key('Escape');
    menu.close();
    await resize(app, 1480, 900);
    await sleep(300);
    assert.ok(popup, 'menu window');
    assert.ok(popup.bottom > main.bottom || popup.top < main.top, `menu ${popup.top}..${popup.bottom} goes beyond the window ${main.top}..${main.bottom}`);
  } },
  { group: '메뉴', name: '하위 메뉴: 보기 › 다이어그램 색 구성 › 청사진 (행 옆에 열림, 실제 클릭)', async run(app) {
    await freshSample(app);
    let since = await now(app);
    await app.main.click('[data-menu="view"]');
    let menu = await menuWindow(app, since);
    const groups = await menu.eval(`[...document.querySelectorAll('.menu-item.has-sub')].map((i) => ({ id: i.dataset.id, arrow: Boolean(i.querySelector('.menu-check svg')) }))`);
    assert.ok(groups.length >= 4 && groups.every((g) => g.arrow), JSON.stringify(groups));
    const parent = await menu.eval(`(() => { const r = document.querySelector('[data-id="submenu:diagramTheme"]').getBoundingClientRect(); return { right: window.screenX + r.right, top: window.screenY + r.top }; })()`);
    since = await now(app);
    await menu.click('[data-id="submenu:diagramTheme"]');
    menu.close();
    menu = await menuWindow(app, since);
    const place = await menu.eval(`({ x: window.screenX, y: window.screenY, head: document.querySelector('.popup-menu').getAttribute('aria-label'), ids: [...document.querySelectorAll('.menu-item')].map((i) => i.dataset.id) })`);
    assert.equal(place.head, '다이어그램 색 구성');
    assert.deepEqual(place.ids, ['diagramTheme:classic', 'diagramTheme:pastel', 'diagramTheme:blueprint', 'diagramTheme:dark']);
    assert.ok(Math.abs(place.x - parent.right) < 14 && Math.abs(place.y - parent.top) < 20, `submenu opens beside its row ${JSON.stringify({ parent, place })}`);
    await menu.click('[data-id="diagramTheme:blueprint"]');
    menu.close();
    await sleep(500);
    assert.equal(await W(app, 'w.state.settings.diagramTheme'), 'blueprint');
    await W(app, `(a.updateSettings({ diagramTheme: 'classic' }), 1)`);
    await noErrorPopup(app, 'submenu');
  } },
  { group: '메뉴', name: '키보드: ↓ 로 항목 이동, Enter 로 실행 (편집 › 모두 선택), Esc 로 닫힘', async run(app) {
    await freshProject(app, 'classModel');
    await W(app, '(a.select([]), 1)');
    let since = await now(app);
    await app.main.click('[data-menu="edit"]');
    let menu = await menuWindow(app, since);
    let focused = null;
    for (let i = 0; i < 20 && focused !== 'selectAll'; i++) {
      await menu.key('ArrowDown');
      focused = await menu.eval(`document.activeElement?.dataset.id ?? null`);
      assert.ok(focused && !(await menu.eval(`document.activeElement.disabled`)), 'only enabled items get the focus');
    }
    assert.equal(focused, 'selectAll');
    await menu.key('Enter');
    menu.close();
    await sleep(400);
    assert.equal(await W(app, 'w.state.selection.ids.length'), await W(app, 'api.diagram().ownedViews.length'), 'Enter ran "select all"');
    since = await now(app);
    await app.main.click('[data-menu="edit"]');
    menu = await menuWindow(app, since);
    await menu.key('Escape');
    menu.close();
    await sleep(400);
    const shown = app.windowInfo().filter((w) => w.visible && w.title.startsWith('편집 —'));
    assert.deepEqual(shown, [], 'Esc closes the menu window');
    assert.equal(await W(app, 'w.state.openMenu'), null);
  } },
  { group: '메뉴', name: '메뉴 항목 실행: 모델 › 통계 → 확인 팝업 (실제 클릭)', async run(app) {
    await freshProject(app, 'classModel');
    const since = await now(app);
    await app.main.click('[data-menu="model"]');
    const menu = await menuWindow(app, since);
    await menu.click('[data-id="statistics"]');
    menu.close();
    const page = await app.popup('confirm');
    await expectPopupWindow(app, page, 'confirm');
    const text = await page.eval(`document.querySelector('.popup').innerText`);
    assert.match(text, /클래스: 3/, text);
    await page.click('[data-action="choice"][data-value="ok"]');
    page.close();
    await sleep(300);
    assert.equal(await app.hasPopup('confirm'), false, 'closed');
  } },

  // ───────────────────────── context menus
  { group: '컨텍스트 메뉴', name: '대상마다 다른 메뉴 (클래스·관계선·여러 개·빈 캔버스·탐색기·다이어그램 탭·도구 상자·상태 표시줄·시작 페이지), 모든 항목에 아이콘', async run(app) {
    await freshProject(app, 'classModel');
    await W(app, '(a.select([]), 1)');
    const person = await viewAt(app, '사람');
    const node = await contextMenuAt(app, person, 'class');
    const edgePoint = await W(app, `(() => { const v = api.view; const e = api.diagram().ownedViews.find((x) => x._type === 'UMLGeneralizationView'); const pts = v.ctx.routes.get(e._id).points; const i = Math.max(1, Math.floor(pts.length / 2)); const m = { x: (pts[i - 1].x + pts[i].x) / 2, y: (pts[i - 1].y + pts[i].y) / 2 }; const r = v.stage.getBoundingClientRect(); const s = v.toStage(m); return { x: r.left + s.x, y: r.top + s.y }; })()`);
    await sleep(600);
    const edge = await contextMenuAt(app, edgePoint, 'relationship');
    const student = await viewAt(app, '학생');
    await W(app, `(a.select([${JSON.stringify(person.id)}, ${JSON.stringify(student.id)}]), 1)`);
    await sleep(150);
    const multi = await contextMenuAt(app, student, 'several');
    await W(app, '(a.select([]), 1)');
    const canvas = await contextMenuAt(app, await emptyCanvasPoint(app), 'canvas');
    await W(app, `(api.explorer.expanded.add(a.activeDoc().project.ownedElements[0]._id), api.explorer.renderTree(), 1)`);
    await sleep(200);
    const element = await contextMenuAt(app, await treeRow(app, '과목'), 'explorer');
    const diagramTab = await contextMenuAt(app, await app.main.center('#tabs .tab[data-diagram-tab]'), 'diagram tab');
    const toolbox = await contextMenuAt(app, await app.main.center('#left-panel .panel-header'), 'toolbox');
    const status = await contextMenuAt(app, await app.main.center('#statusbar .status-notice'), 'status bar');
    await W(app, '(a.showStartPage(true), 1)');
    await sleep(300);
    const startPoint = await app.main.eval(`(() => { const r = document.querySelector('.start-hero p').getBoundingClientRect(); const x = r.left + 20; const y = r.top + r.height / 2; const e = document.elementFromPoint(x, y); return { x, y, at: e?.outerHTML.slice(0, 80) }; })()`);
    assert.ok(/start|<p/.test(startPoint.at), `the start page is under the pointer (${startPoint.at})`);
    const start = await contextMenuAt(app, startPoint, 'start page');
    await W(app, '(a.showStartPage(false), 1)');
    const all = [node, edge, multi, canvas, element, diagramTab, toolbox, status, start].map((m) => m.ids);
    assert.equal(new Set(all).size, all.length, `every target has its own menu:\n${all.join('\n')}`);
    assert.match(node.ids, /custom:edit.*submenu:related.*deleteFromModel/, 'class: edit, related elements, delete from model');
    assert.match(node.head, /사람/, 'the class menu is titled with the class');
    assert.match(edge.ids, /submenu:lineStyle/, 'relationship: line style');
    assert.match(multi.ids, /submenu:align/, 'several: align');
    assert.match(canvas.ids, /quickAddHere/, 'canvas: quick add');
    assert.match(element.ids, /custom:rename.*custom:codegen/, 'explorer: rename, generate code');
    assert.match(diagramTab.ids, /custom:rename.*custom:select.*prevDiagram.*nextDiagram/, 'diagram tab: rename, show in the explorer, previous / next');
    assert.doesNotMatch(diagramTab.ids, /closeDiagram|closeTab/, 'diagram tab: nothing to close (every diagram has a tab)');
    assert.match(start.ids, /shuffleBackground/, `start page: background (${start.head}: ${start.ids})`);
    await noErrorPopup(app, 'context menus');
  } },

  // ───────────────────────── popups
  ...[
    ['settings', `w.run('settings')`],
    ['about', `w.run('about')`],
    ['find', `w.run('find')`],
    ['validation', `w.popups.open('validation', { title: '검증', problems: [{ id: '', severity: 'warning', name: 'a', message: { ko: '경고', en: 'warning' } }] })`],
    ['codegen', `w.run('generateCode')`],
    ['textimport', `w.run('importText')`],
    ['image', `w.run('exportImage')`],
    ['print', `w.run('print')`],
    ['recent', `w.run('recent')`],
    ['confirm', `w.run('statistics')`],
    ['error', `a.showError('error.unexpected', new Error('테스트 오류'), 'e2e')`],
  ].map(([kind, js]) => ({ group: '팝업', name: `"${kind}": 독립 OS 창 · 크기 고정 · 스크롤 없음 · 아이콘+제목 · 정렬 · 잘림 없음 · 이동 가능`, async run(app) {
    await freshSample(app);
    await W(app, `(${js}, 1)`);
    const page = await app.popup(kind);
    await sleep(kind === 'codegen' || kind === 'print' ? 900 : 350);
    const { popup } = await expectPopupWindow(app, page, kind);
    assert.deepEqual(await page.eval(ALIGN_CHECK), [], `${kind}: controls and buttons line up`);
    assert.deepEqual(await page.eval(CLIP_CHECK), [], `${kind}: nothing cut off`);
    const tabs = await page.eval(`[...document.querySelectorAll('.tabs .tab[data-value]')].map((t) => t.dataset.value)`);
    if (tabs.length) {
      const nav = await page.eval(`(() => { const n = document.querySelector('.tabs .tabs-nav'); if (!n) return null; const r = n.getBoundingClientRect(); return { right: document.querySelector('.tabs').getBoundingClientRect().right - r.right, buttons: n.querySelectorAll('.tabs-scroll').length, scrollbar: document.querySelector('.tabs-strip').offsetHeight - document.querySelector('.tabs-strip').clientHeight }; })()`);
      assert.ok(nav && nav.buttons === 2 && nav.right < 16 && nav.scrollbar === 0, `${kind}: < > at the right end of the tabs ${JSON.stringify(nav)}`);
    }
    for (const tab of tabs) {
      await page.eval(`document.querySelector('.tabs .tab[data-value="${tab}"]').click(); 1`);
      await sleep(tab === 'font' ? 600 : 150);
      assert.deepEqual(await page.eval(POPUP_SCROLL_CHECK), [], `${kind} › ${tab}: no scroll bars`);
      const over = await page.eval(`(() => { const b = document.querySelector('.popup-body'); return b.scrollHeight > b.clientHeight + 1; })()`);
      assert.equal(over, false, `${kind} › ${tab}: content fits`);
      assert.deepEqual(await page.eval(ALIGN_CHECK), [], `${kind} › ${tab}: controls and buttons line up`);
      assert.deepEqual(await page.eval(CLIP_CHECK), [], `${kind} › ${tab}: nothing cut off`);
    }
    // Moved with its title bar (OS drag region) — here: the window can be placed anywhere.
    await page.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_position', { label: 'popup-${kind}', value: { Logical: { x: 20, y: 20 } } }).then(() => 1)`);
    await sleep(250);
    const moved = app.windowInfo().find((w) => w.handle === popup.handle);
    assert.ok(Math.abs(moved.left - popup.left) > 5 || Math.abs(moved.top - popup.top) > 5, 'moved');
    page.close();
    await closePopups(app);
    await sleep(200);
    assert.equal(await app.hasPopup(kind), false, `${kind}: the window is gone after closing`);
  } })),

  // ───────────────────────── diagrams (real mouse)
  { group: '다이어그램', name: '도구 상자: 클래스를 눌러 그리고 이름 입력 → 일반화를 끌어 연결 (실제 마우스)', async run(app) {
    await freshProject(app);
    for (const [name, fy] of [['Animal', 0.25], ['Dog', 0.7]]) {
      await app.main.click('#left-panel [data-tool="UMLClass"]');
      const p = await canvasPoint(app, 0.2, fy);
      await app.main.realClick(p.x, p.y);
      await app.main.waitFor(`Boolean(document.querySelector('.text-editor'))`, { message: 'the name editor opens' });
      await app.main.type(name);
      await app.main.key('Enter', 2);
      await sleep(250);
    }
    assert.ok(await elementNamed(app, 'Animal') && await elementNamed(app, 'Dog'), 'both classes named');
    assert.ok(await app.main.eval(`document.querySelector('.canvas-svg').textContent.includes('Animal')`), 'drawn with its name');
    await app.main.click('#left-panel [data-tool="UMLGeneralization"]');
    const dog = await viewAt(app, 'Dog');
    const animal = await viewAt(app, 'Animal');
    await app.main.drag({ x: dog.x, y: dog.y }, { x: animal.x, y: animal.y }, 16);
    await sleep(300);
    const gen = await W(app, `M.elementsWhere(a.activeDoc().project, (e) => e._type === 'UMLGeneralization').map((g) => [g.source.$ref, g.target.$ref])`);
    assert.deepEqual(gen, [[dog.model, animal.model]]);
    assert.equal(await W(app, 'w.state.tool'), null, 'the tool goes back to the pointer');
    assert.ok(await app.main.eval(`Boolean(document.querySelector('#explorer .tree-row .tree-name'))`) && await treeRow(app, 'Dog'), 'the model explorer lists the new class');
    await noErrorPopup(app, 'create');
  } },
  { group: '다이어그램', name: '도구 상자에서 캔버스로 끌어다 놓으면 그 자리에 하나 (실제 마우스)', async run(app) {
    await freshProject(app);
    const tile = await app.main.eval(`(() => { const t = document.querySelector('#left-panel .tool-item[data-tool="UMLEnumeration"]'); t.scrollIntoView({ block: 'nearest' }); const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, draggable: t.draggable }; })()`);
    assert.equal(tile.draggable, false, 'tools use the pointer, not HTML5 drag (which the desktop window takes for files)');
    const at = await canvasPoint(app, 0.5, 0.4);
    await app.main.drag(tile, at, 20);
    await sleep(400);
    const placed = await W(app, `(() => { const views = api.diagram().ownedViews; const v = views.at(-1); const b = api.view.boxOf(v._id); const p = api.view.toPage(${at.x}, ${at.y}); return { count: views.length, type: v._type, dx: Math.abs(b.x - p.x), dy: Math.abs(b.y - p.y), ghost: Boolean(document.querySelector('.stencil-ghost')) }; })()`);
    assert.equal(placed.count, 1, 'exactly one (the click after the drag adds none)');
    assert.equal(placed.type, 'UMLEnumerationView');
    assert.ok(placed.dx < 25 && placed.dy < 25, `placed where dropped ${JSON.stringify(placed)}`);
    assert.equal(placed.ghost, false, 'the drag picture is gone');
    await app.main.key('Escape');
    await noErrorPopup(app, 'drop tool');
  } },
  { group: '다이어그램', name: '끌어 옮기기는 실행 취소 한 단계 (Ctrl+Z / Ctrl+Y), 격자에 맞춤, 화살표 키로 이동 (실제 마우스)', async run(app) {
    await freshSample(app);
    const v = await viewAt(app, 'Payable');
    const steps = await W(app, 'a.activeDoc().history.undoStack.length');
    await app.main.drag({ x: v.x, y: v.y }, { x: v.x + 47, y: v.y + 31 });
    await sleep(300);
    const after = await W(app, `M.findView(api.diagram(), ${JSON.stringify(v.id)})`);
    assert.equal(after.left % 10, 0, 'snapped to the 10 px grid');
    assert.notEqual(after.left, v.box.x);
    assert.equal(await W(app, 'a.activeDoc().history.undoStack.length'), steps + 1, 'one undo step');
    await app.main.eval(`document.querySelector('.canvas-scroll').focus(); 1`);
    await app.main.key('z', 2);
    await sleep(250);
    assert.equal(await W(app, `M.findView(api.diagram(), ${JSON.stringify(v.id)}).left`), v.box.x, 'Ctrl+Z');
    await app.main.key('y', 2);
    await sleep(250);
    assert.equal(await W(app, `M.findView(api.diagram(), ${JSON.stringify(v.id)}).left`), after.left, 'Ctrl+Y');
    await W(app, `(a.select([${JSON.stringify(v.id)}]), 1)`);
    await app.main.key('ArrowRight');
    await sleep(200);
    assert.equal(await W(app, `M.findView(api.diagram(), ${JSON.stringify(v.id)}).left`), after.left + 10, 'nudged by one grid step');
    await noErrorPopup(app, 'move');
  } },
  { group: '다이어그램', name: '빠른 편집: 두 번 눌러 이름·스테레오타입·속성·오퍼레이션을 글로 고침 (실제 더블클릭)', async run(app) {
    await freshProject(app, 'classModel');
    const v = await viewAt(app, '과목');
    await app.main.realClick(v.x, v.y, { clickCount: 2 });
    await app.main.waitFor(`Boolean(document.querySelector('.text-editor.multi'))`, { message: 'the quick edit box opens' });
    await app.main.eval(`(() => { const e = document.querySelector('.text-editor'); e.value = '«entity» Lecture\\n--\\n-title: String\\n+credits: int = 3\\n--\\n+enroll(student: 학생): boolean {query}'; return 1; })()`);
    await app.main.key('Enter', 2);
    await sleep(300);
    const lecture = await elementNamed(app, 'Lecture');
    assert.ok(lecture, 'renamed');
    assert.equal(lecture.stereotype, 'entity');
    assert.deepEqual(lecture.attributes.map((x) => [x.name, x.visibility, x.defaultValue ?? '']), [['title', 'private', ''], ['credits', 'public', '3']]);
    assert.equal(lecture.operations[0].name, 'enroll');
    assert.equal(lecture.operations[0].isQuery, true);
    assert.equal(lecture.operations[0].parameters[0].type.$ref, (await elementNamed(app, '학생'))._id, '학생 became a reference to the class');
    assert.match(await app.main.eval(`document.querySelector('.canvas-svg').textContent`), /Lecture.*title.*enroll/s, 'drawn');
    assert.equal(await app.main.eval(`document.querySelector('#editors [data-field="name"]').value`), 'Lecture', 'the property editor follows');
    await noErrorPopup(app, 'quick edit');
  } },
  { group: '다이어그램', name: '모델 탐색기: 누르면 선택·속성 표시, 다이어그램으로 끌어 놓으면 뷰와 관계 (실제 마우스)', async run(app) {
    await freshProject(app, 'classModel');
    await W(app, `(() => { const d = api.diagram(); d.ownedViews = []; a.activeDoc().touch(); api.view.update(); return 1; })()`);
    await W(app, `(api.explorer.expanded.add(a.activeDoc().project.ownedElements[0]._id), api.explorer.renderTree(), 1)`);
    await sleep(200);
    const row = await treeRow(app, '과목');
    await app.main.realClick(row.x, row.y);
    await sleep(300);
    assert.deepEqual(await W(app, 'w.state.explorer'), [(await elementNamed(app, '과목'))._id], 'selected in the explorer');
    assert.equal(await app.main.eval(`document.querySelector('#editors [data-field="name"]').value`), '과목', 'its properties are shown');
    for (const name of ['사람', '학생']) {
      const from = await treeRow(app, name);
      assert.ok(from, `${name} row`);
      const target = await canvasPoint(app, 0.3, name === '사람' ? 0.2 : 0.6);
      await app.main.drag(from, target, 14);
      await sleep(400);
    }
    const kinds = await W(app, `api.diagram().ownedViews.map((v) => v._type).sort()`);
    assert.deepEqual(kinds, ['UMLClassView', 'UMLClassView', 'UMLGeneralizationView']);
    await noErrorPopup(app, 'explorer drop');
  } },
  { group: '다이어그램', name: 'Delete 는 다이어그램에서만, Ctrl+Delete 는 확인 팝업 뒤 모델에서도 지움', async run(app) {
    await freshProject(app, 'classModel');
    await W(app, `(a.updateSettings({ confirmDelete: true }), 1)`);
    const v = await viewAt(app, '과목');
    await app.main.realClick(v.x, v.y);
    await sleep(300);
    await app.main.key('Delete');
    await sleep(300);
    assert.ok(await elementNamed(app, '과목'), 'still in the model');
    assert.equal(await W(app, `M.findView(api.diagram(), ${JSON.stringify(v.id)})`), null, 'gone from the diagram');
    await W(app, '(a.undo(), 1)');
    await W(app, `(a.select([${JSON.stringify(v.id)}]), document.querySelector('.canvas-scroll').focus(), 1)`);
    await app.main.key('Delete', 2);
    const page = await app.popup('confirm');
    await expectPopupWindow(app, page, 'confirm');
    assert.match(await page.eval(`document.querySelector('.confirm-items').textContent`), /과목/, 'names what will be deleted');
    await page.click('[data-action="choice"][data-value="delete"]');
    page.close();
    await sleep(400);
    assert.equal(await elementNamed(app, '과목'), null, 'gone from the model');
    assert.equal(await treeRow(app, '과목'), null, 'and from the explorer');
  } },
  { group: '다이어그램', name: '모든 다이어그램 종류: 도구 상자의 모든 도구로 그려도 오류 없음', async run(app) {
    await freshProject(app);
    app.main.errors.length = 0;
    const types = await W(app, 'Object.keys(w.domain.DIAGRAM_TYPES)');
    assert.ok(types.length >= 20, `${types.length} diagram types`);
    const report = [];
    for (const type of types) report.push(...await W(app, `(() => {
      const out = [];
      const type = ${JSON.stringify(type)};
      a.addDiagram(type);
      if (api.diagram()?._type !== type) return [type + ': not opened'];
      let i = 0;
      for (const [, , , tools] of w.domain.toolboxFor(type)) for (const tool of tools) {
        if (tool.kind !== 'node' || /Pin$/.test(tool.type)) continue;
        const r = a.createNodeAt(tool, { x: 40 + (i % 6) * 210, y: 40 + Math.floor(i / 6) * 180, w: 0, h: 0 });
        api.view?.finishEdit?.(true);
        i += 1;
        if (!r?.view) out.push(type + ':' + tool.id);
      }
      if (!document.querySelectorAll('.canvas-svg [data-view]').length) out.push(type + ': nothing drawn');
      return out;
    })()`));
    assert.deepEqual(report, []);
    assert.deepEqual(app.main.errors, [], 'no exceptions');
    await noErrorPopup(app, 'all tools');
  } },
  { group: '다이어그램', name: '시퀀스: 라이프라인 사이에 메시지를 그림 (실제 마우스)', async run(app) {
    await freshProject(app, 'sequence');
    const count = await W(app, `api.diagram().ownedViews.filter((v) => v._type === 'UMLMessageView').length`);
    await app.main.click('#left-panel [data-tool="message:asynchCall"]');
    const a1 = await viewAt(app, '클라이언트', 0.5, 190);
    const b1 = await viewAt(app, '서버', 0.5, 190);
    await app.main.drag({ x: a1.x, y: a1.y }, { x: b1.x, y: b1.y }, 12);
    await sleep(300);
    assert.equal(await W(app, `api.diagram().ownedViews.filter((v) => v._type === 'UMLMessageView').length`), count + 1, 'a new message');
    await noErrorPopup(app, 'message');
  } },

  // ───────────────────────── model tools
  { group: '모델 도구', name: '찾기 팝업: 이름을 찾아 결과를 누르면 그 요소로 감', async run(app) {
    await freshSample(app);
    await app.main.eval(`document.querySelector('.canvas-scroll').focus(); 1`);
    await app.main.key('f', 2);
    const page = await app.popup('find');
    await page.eval(`(() => { const i = document.querySelector('[data-draft="text"]'); i.value = 'Order'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
    await page.click('[data-action="find-run"]');
    await page.waitFor(`document.querySelectorAll('.result-row').length > 0`);
    const first = await page.eval(`[...document.querySelectorAll('.result-row')].find((r) => r.querySelector('b').textContent === 'Order').dataset.value`);
    await page.eval(`([...document.querySelectorAll('.result-row')].find((r) => r.querySelector('b').textContent === 'Order').click(), 1)`);
    await sleep(500);
    assert.deepEqual(await W(app, 'w.state.explorer'), [first], 'the found element is selected');
    assert.ok(await app.main.eval(`Boolean(document.querySelector('#explorer .tree-row.selected'))`), 'and shown in the explorer');
    page.close();
    await closePopups(app);
  } },
  { group: '모델 도구', name: '검증 (툴바 버튼): 문제를 팝업으로, 상태 표시줄에 개수, 누르면 그 요소', async run(app) {
    await freshProject(app, 'classModel');
    await W(app, `(a.change('op.edit', (p) => { M.elementsWhere(p, (e) => e.name === '과목')[0].name = ''; }), 1)`);
    await app.main.click('#toolbar [data-command="validate"]');
    const page = await app.popup('validation');
    await page.waitFor(`document.querySelectorAll('.result-row:not([disabled])').length > 0`);
    assert.match(await page.eval(`document.querySelector('.result-list').innerText`), /이름/);
    assert.ok(await W(app, 'w.state.validation.errors >= 1'));
    assert.ok(await app.main.eval(`Boolean(document.querySelector('#statusbar [data-command="validate"].error-count'))`), 'the status bar counts the errors');
    await page.click('.result-row:not([disabled])');
    await sleep(400);
    assert.equal(await W(app, 'w.state.explorer.length'), 1, 'the problem element is selected');
    page.close();
    await closePopups(app);
  } },
  { group: '모델 도구', name: '코드 생성 팝업: Java 미리 보기 → Python → ZIP 으로 생성', async run(app) {
    await freshProject(app, 'classModel');
    await W(app, '(a.select([]), w.state.explorer = [], 1)');
    await app.main.click('#toolbar [data-command="generateCode"]');
    const page = await app.popup('codegen');
    await page.waitFor(`document.querySelector('.code-preview')?.textContent.includes('class ')`);
    assert.match(await page.eval(`document.querySelector('.code-preview').textContent`), /public (abstract )?class \S+/);
    await page.eval(`(() => { const s = document.querySelector('[data-draft-select="language"]'); s.value = 'python'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await page.waitFor(`/^class \\S+/m.test(document.querySelector('.code-preview')?.textContent ?? '')`);
    await page.click('[data-draft-segment="target"][data-value="zip"]');
    const file = path.join(tempDir('codegen'), 'code.zip');
    await W(app, `(window.__myumlmakerSavePicks = [${JSON.stringify(file)}], 1)`);
    await page.click('[data-action="codegen-apply"]');
    page.close();
    const bytes = await waitFile(file);
    assert.equal(bytes.subarray(0, 2).toString('latin1'), 'PK', 'a ZIP');
    assert.ok(bytes.includes(Buffer.from('.py')), 'with Python files');
    assert.equal(await W(app, 'w.state.settings.codegenLanguage'), 'python', 'the language is remembered');
    await W(app, `(a.updateSettings({ codegenLanguage: 'java' }), 1)`);
  } },
  { group: '모델 도구', name: '역공학 (툴바 › Java 파일): 클래스·상속·연관과 다이어그램', async run(app) {
    await freshProject(app);
    const dir = tempDir('reverse');
    const sources = {
      'Order.java': 'package shop; public class Order extends Base { private Customer customer; private int total; public int total() { return total; } }',
      'Customer.java': 'package shop; public class Customer {}',
      'Base.java': 'package shop; public abstract class Base {}',
    };
    for (const [name, text] of Object.entries(sources)) fs.writeFileSync(path.join(dir, name), text);
    await W(app, `(window.__myumlmakerOpenPicks = [${JSON.stringify(Object.keys(sources).map((n) => path.join(dir, n)))}], 1)`);
    const since = await now(app);
    await app.main.click('#toolbar [data-command="reverse"]');
    const menu = await menuWindow(app, since);
    assert.ok(await menu.eval(`Boolean(document.querySelector('[data-id="custom:folder"]'))`), 'the desktop app can also read a folder');
    await menu.click('[data-id="custom:java"]');
    menu.close();
    await app.main.waitFor(`window.__myumlmaker.api.diagram()?.ownedViews.filter((v) => v._type === 'UMLClassView').length === 3`, { timeout: 10000 });
    assert.ok(await elementNamed(app, 'Order') && await elementNamed(app, 'Customer'));
    assert.equal(await countOf(app, 'UMLGeneralization'), 1);
    assert.ok(await countOf(app, 'UMLAssociation') >= 1, 'the field became an association');
    assert.ok(await W(app, `w.state.recentDirs.some((d) => d.path.toLowerCase() === ${JSON.stringify(dir.toLowerCase())})`), 'the folder is remembered');
    await noErrorPopup(app, 'reverse');
  } },
  { group: '모델 도구', name: 'Mermaid 가져오기 팝업: 예제 → 가져오기 → 클래스 다이어그램', async run(app) {
    await freshProject(app);
    await W(app, `(w.run('importText'), 1)`);
    const page = await app.popup('textimport');
    await page.click('[data-action="text-sample"][data-value="class"]');
    await page.waitFor(`!document.querySelector('[data-action="text-apply"]').disabled`);
    await page.click('[data-action="text-apply"]');
    page.close();
    await app.main.waitFor(`Boolean([...window.__myumlmaker.actions.activeDoc().index.byId.values()].find((e) => e.name === 'Dog'))`);
    assert.equal(await W(app, 'api.diagram()._type'), 'UMLClassDiagram');
    assert.ok(await W(app, `api.diagram().ownedViews.filter((v) => v._type === 'UMLClassView').length >= 3`));
    await noErrorPopup(app, 'text import');
  } },

  // ───────────────────────── files
  { group: '파일', name: '저장(.myuml) → 다시 열기: 같은 프로젝트, 최근 파일·폴더에 기록, 탭은 저장됨', async run(app) {
    await freshSample(app);
    const dir = tempDir('files');
    const file = path.join(dir, 'saved.myuml');
    const before = JSON.parse(await W(app, 'a.activeDoc().text()')).project;
    await W(app, `(window.__myumlmakerSavePicks = [${JSON.stringify(file)}], a.saveDoc(a.activeDoc(), { saveAs: true }))`);
    await sleep(300);
    assert.ok(fs.existsSync(file));
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).project, before, 'the file holds the project');
    assert.equal(await W(app, 'a.activeDoc().dirty'), false);
    assert.equal(await app.main.eval(`document.querySelector('#tabs .tab-project .tab-name').textContent`), 'saved.myuml', 'the project is named after the file');
    await W(app, closeAllDocs);
    await W(app, `a.openPath(${JSON.stringify(file)}).then(() => 1)`);
    await sleep(400);
    assert.deepEqual(JSON.parse(await W(app, 'a.activeDoc().text()')).project, before, 'same project after opening');
    assert.equal(await W(app, 'a.activeDoc().path.toLowerCase()'), file.toLowerCase());
    assert.ok(await W(app, `w.state.recent.some((r) => r.path.toLowerCase() === ${JSON.stringify(file.toLowerCase())})`), 'recent file');
    assert.ok(await W(app, `w.state.recentDirs.some((d) => d.path.toLowerCase() === ${JSON.stringify(dir.toLowerCase())})`), 'recent folder');
    // Ctrl+S on a known file: no dialog, written again.
    await W(app, `(a.change('op.edit', (p) => { p.name = '다시 저장'; }), document.querySelector('.canvas-scroll').focus(), 1)`);
    await app.main.key('s', 2);
    await sleep(600);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).project.name, '다시 저장', 'Ctrl+S saves to the same file');
    await noErrorPopup(app, 'save');
  } },
  { group: '파일', name: '열기 (Ctrl+O 대화 상자): 여러 개를 골라도 첫 파일만, 프로젝트는 하나', async run(app) {
    await W(app, closeAllDocs);
    const dir = tempDir('open');
    const files = ['one.myuml', 'two.myuml'].map((n) => path.join(dir, n));
    fs.writeFileSync(files[0], await templateText(app, 'classModel'));
    fs.writeFileSync(files[1], await templateText(app, 'useCase'));
    await W(app, `(window.__myumlmakerOpenPicks = [${JSON.stringify(files)}], 1)`);
    await app.main.key('o', 2);
    await app.main.waitFor(`window.__myumlmaker.actions.activeDoc()?.path?.endsWith('one.myuml')`, { timeout: 10000 });
    await sleep(400);
    assert.equal(await W(app, 'w.state.docs.length'), 1, 'one project');
    assert.equal(await app.main.eval(`document.querySelector('#tabs .tab-project .tab-name').textContent`), 'one.myuml', 'the first file is opened');
    assert.equal(await W(app, 'api.diagram()._type'), 'UMLClassDiagram', 'its diagram is shown');
    assert.ok(!(await W(app, 'w.state.recent.some((r) => r.path.endsWith("two.myuml"))')), 'the second file was not opened');
  } },
  { group: '파일', name: '최근 파일 창: 최대 10개, 하나씩·전체 지우기, 주 창도 따라감', async run(app) {
    const dir = tempDir('recent');
    const text = await templateText(app, 'blank');
    for (let i = 0; i < 12; i++) {
      const file = path.join(dir, `p${i}.myuml`);
      fs.writeFileSync(file, text);
      await W(app, `a.openPath(${JSON.stringify(file)}, { quiet: true }).then(() => 1)`);
    }
    assert.equal(await W(app, 'w.state.recent.length'), 10);
    await W(app, `(w.run('recent'), 1)`);
    const page = await app.popup('recent');
    await expectPopupWindow(app, page, 'recent');
    assert.equal(await page.eval(`document.querySelectorAll('.recent-row').length`), 10);
    assert.match(await page.eval(`document.querySelector('.recent-row').textContent`), /p11/, 'newest first');
    await page.click('[data-action="remove-recent"]');
    await sleep(300);
    assert.equal(await page.eval(`document.querySelectorAll('.recent-row').length`), 9);
    await page.click('[data-action="clear-recent"]');
    await sleep(300);
    assert.equal(await page.eval(`document.querySelectorAll('.recent-row').length`), 0);
    page.close();
    await closePopups(app);
    await sleep(300);
    assert.equal(await W(app, 'w.state.recent.length'), 0, 'the main window follows');
    await W(app, closeAllDocs);
  } },
  { group: '파일', name: 'DB를 설정하면 저장은 파일과 DB 둘 다 (SQLite)', async run(app) {
    await freshSample(app);
    const dir = tempDir('both');
    const dbFile = path.join(dir, '프로젝트 DB.sqlite');
    const file = path.join(dir, 'both.myuml');
    await W(app, `a.updateSettings({ dbKind: 'sqlite', dbFile: ${JSON.stringify(dbFile)} })`);
    try {
      await sleep(200);
      const title = await W(app, 'a.activeDoc().project.name');
      assert.equal(await W(app, `(window.__myumlmakerSavePicks = [${JSON.stringify(file)}], a.saveDoc(a.activeDoc()))`), true);
      assert.ok(fs.existsSync(file), 'the local file');
      assert.ok(fs.existsSync(dbFile), 'the database file');
      const stored = await app.main.eval(`(async () => { const n = await import('/src/platform/native.js'); const s = await import('/src/domain/settings.js'); return (await n.dbList(s.dbConfig(window.__myumlmaker.state.settings, ''))).map((p) => p.title); })()`);
      assert.ok(stored.includes(title), `the database lists the project ${JSON.stringify(stored)}`);
      assert.equal(await W(app, 'a.activeDoc().dirty'), false);
      assert.match(await app.main.eval(`document.querySelector('#statusbar .status-notice').textContent`), /SQLite|DB/i, 'the notice names both places');
    } finally {
      await W(app, `a.updateSettings({ dbKind: 'none', dbFile: '' })`);
    }
  } },
  { group: '파일', name: '끌어다 놓기: .myuml·StarUML .mdj 는 지금 프로젝트를 바꿈, Mermaid .mmd 는 가져오기 창, .java 는 역공학, 모르는 파일은 알림', async run(app) {
    await freshProject(app);
    const dir = tempDir('drop');
    const myuml = path.join(dir, 'dropped.myuml');
    fs.writeFileSync(myuml, await templateText(app, 'classModel'));
    const mdj = path.join(root, 'samples', 'staruml-sample.mdj');
    await W(app, `a.handleDroppedPaths([${JSON.stringify(myuml)}]).then(() => 1)`);
    await sleep(600);
    assert.equal(await W(app, 'w.state.docs.length'), 1, 'still one project');
    assert.ok(await W(app, `a.activeDoc().path?.toLowerCase() === ${JSON.stringify(myuml.toLowerCase())}`), 'the dropped .myuml replaced the project');
    await W(app, `a.handleDroppedPaths([${JSON.stringify(mdj)}]).then(() => 1)`);
    await sleep(600);
    assert.equal(await W(app, 'w.state.docs.length'), 1, 'still one project');
    assert.equal(await W(app, 'a.activeDoc().path'), null, 'the StarUML file replaced it (an import, no path)');
    assert.ok(await W(app, 'M.allDiagrams(a.activeDoc().project).length >= 2'), 'the StarUML project with its diagrams');
    await noErrorPopup(app, 'drop project');
    const mmd = path.join(dir, 'flow.mmd');
    fs.writeFileSync(mmd, 'classDiagram\n  class Engine\n  class Car\n  Car *-- Engine');
    W(app, `a.handleDroppedPaths([${JSON.stringify(mmd)}]).then(() => 1)`).catch(() => {});
    const page = await app.popup('textimport');
    assert.match(await page.eval(`document.querySelector('[data-draft="text"]').value`), /class Engine/, 'the text is in the import window');
    await page.click('[data-action="text-apply"]');
    page.close();
    await app.main.waitFor(`Boolean([...window.__myumlmaker.actions.activeDoc().index.byId.values()].find((e) => e.name === 'Engine'))`);
    const java = path.join(dir, 'Wheel.java');
    fs.writeFileSync(java, 'public class Wheel { private int size; }');
    await W(app, `a.handleDroppedPaths([${JSON.stringify(java)}]).then(() => 1)`);
    await sleep(400);
    assert.ok(await elementNamed(app, 'Wheel'), 'a dropped source file is reverse engineered');
    const other = path.join(dir, 'notes.xyz');
    fs.writeFileSync(other, 'x');
    await W(app, `a.handleDroppedPaths([${JSON.stringify(other)}]).then(() => 1)`);
    await sleep(300);
    assert.match(await app.main.eval(`document.querySelector('#statusbar .status-notice').textContent`), /notes\.xyz/, 'unknown files are reported in the status bar');
    await noErrorPopup(app, 'drop');
  } },
  { group: '파일', name: '그림 내보내기: PNG·JPEG·WebP·BMP·TIFF·SVG, 투명/흰 배경', async run(app) {
    await freshSample(app);
    const dir = tempDir('images');
    const magic = { png: [1, 4, 'PNG'], jpeg: [0, 3, '\xff\xd8\xff'], webp: [8, 12, 'WEBP'], bmp: [0, 2, 'BM'], tiff: [0, 4, 'II*\0'], svg: [0, 4, '<svg'] };
    const ext = { jpeg: 'jpg' };
    for (const format of Object.keys(magic)) {
      for (const transparent of format === 'jpeg' ? [false] : [true, false]) {
        const file = path.join(dir, `diagram-${transparent ? 'clear' : 'white'}.${ext[format] ?? format}`);
        await W(app, `(window.__myumlmakerSavePicks = [${JSON.stringify(file)}], a.exportImage({ format: '${format}', transparent: ${transparent}, area: 'content', scale: 1, quality: 90 }).then(() => 1))`);
        const bytes = await waitFile(file);
        const [from, to, text] = magic[format];
        assert.equal(bytes.subarray(from, to).toString('latin1'), text, `${format} signature`);
        if (['png', 'webp', 'jpeg'].includes(format)) {
          const mime = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' }[format];
          const corner = await app.main.eval(`(async () => { const img = new Image(); img.src = 'data:${mime};base64,${bytes.toString('base64')}'; await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return [...x.getImageData(1, 1, 1, 1).data]; })()`);
          if (transparent) assert.equal(corner[3], 0, `${format}: transparent corner ${corner}`);
          else assert.ok(corner[3] === 255 && corner[0] > 240, `${format}: white corner ${corner}`);
        }
      }
    }
    await noErrorPopup(app, 'images');
  } },
  { group: '파일', name: '그림 내보내기 팝업: 형식·배경·배율 → 선택이 내보내기에 쓰임', async run(app) {
    await freshSample(app);
    const file = path.join(tempDir('image-popup'), 'popup.webp');
    const done = W(app, `(window.__myumlmakerSavePicks = [${JSON.stringify(file)}], a.exportImage().then(() => 1))`);
    const page = await app.popup('image');
    assert.deepEqual(await page.eval(`[...document.querySelectorAll('[data-draft-segment="format"]')].map((b) => b.dataset.value)`), ['png', 'jpeg', 'webp', 'bmp', 'tiff', 'svg']);
    await page.click('[data-draft-segment="format"][data-value="jpeg"]');
    assert.ok(await page.eval(`document.querySelector('[data-draft-segment="transparent"]').closest('.row').classList.contains('disabled-row')`), 'JPEG cannot be transparent');
    await page.click('[data-draft-segment="format"][data-value="webp"]');
    await page.click('[data-draft-segment="transparent"][data-value="true"]');
    await page.click('[data-draft-segment="scale"][data-value="1"]');
    const size1 = await page.eval(`document.querySelector('[data-image-size]').textContent`);
    await page.click('[data-draft-segment="scale"][data-value="3"]');
    assert.notEqual(await page.eval(`document.querySelector('[data-image-size]').textContent`), size1, 'the size follows the scale');
    await page.click('[data-action="image-apply"]');
    page.close();
    await done;
    const bytes = await waitFile(file);
    assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
    assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
  } },
  { group: '파일', name: '내보내기: SVG·HTML 문서·Markdown(ZIP)·StarUML·Mermaid·PlantUML·템플릿·PDF·모든 그림(ZIP) (파일 머리 확인)', async run(app) {
    await freshSample(app);
    const dir = tempDir('export');
    const out = {};
    for (const [type, name] of [['svg', 'diagram.svg'], ['html', 'docs.html'], ['md', 'docs.zip'], ['mdj', 'project.mdj'], ['mmd', 'diagram.mmd'], ['puml', 'diagram.puml'], ['mumlt', 'project.mumlt']]) {
      const file = path.join(dir, name);
      await W(app, `(window.__myumlmakerSavePicks = [${JSON.stringify(file)}], a.exportAs('${type}').then(() => 1))`);
      out[type] = await waitFile(file);
    }
    assert.match(out.svg.toString('utf8'), /^(<\?xml[^>]*>\s*)?<svg[\s>]/);
    assert.match(out.html.toString('utf8'), /^<!doctype html>/i);
    assert.ok(out.html.toString('utf8').includes('<svg'), 'HTML has the diagrams');
    assert.equal(out.md.subarray(0, 2).toString('latin1'), 'PK', 'Markdown docs in a ZIP');
    assert.ok(out.md.includes(Buffer.from('images/')), 'with the pictures');
    assert.ok(JSON.parse(out.mdj.toString('utf8'))._type === 'Project', 'a StarUML project');
    assert.match(out.mmd.toString('utf8'), /^classDiagram/m);
    assert.match(out.puml.toString('utf8'), /@startuml[\s\S]*@enduml/);
    assert.equal(JSON.parse(out.mumlt.toString('utf8')).kind, 'template', 'a template file');
    const pdfFile = path.join(dir, 'project.pdf');
    await W(app, `(window.__myumlmakerSavePicks = [${JSON.stringify(pdfFile)}], a.exportPdf().then(() => 1))`);
    const pdf = await waitFile(pdfFile, 80);
    assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.match(pdf.subarray(-8).toString('latin1'), /%%EOF\s*$/);
    const count = Number(/\/Count (\d+)/.exec(pdf.toString('latin1'))?.[1] ?? 0);
    assert.ok(count >= 11, `a PDF page per diagram (${count})`);
    const zipFile = path.join(dir, 'all.zip');
    await W(app, `(window.__myumlmakerSavePicks = [${JSON.stringify(zipFile)}], a.exportAllImages().then(() => 1))`);
    const zip = await waitFile(zipFile, 80);
    assert.equal(zip.subarray(0, 2).toString('latin1'), 'PK');
    assert.equal(zip.toString('latin1').match(/\.png/g)?.length >= 11, true, 'a PNG per diagram');
    await noErrorPopup(app, 'export');
  } },
  { group: '파일', name: 'StarUML(.mdj)로 내보낸 파일을 다시 열면 같은 클래스·관계·다이어그램', async run(app) {
    await freshProject(app, 'classModel');
    const file = path.join(tempDir('mdj'), 'round.mdj');
    const summary = () => W(app, `({ classes: M.elementsWhere(a.activeDoc().project, (e) => e._type === 'UMLClass').map((e) => e.name).sort(), generalizations: M.elementsWhere(a.activeDoc().project, (e) => e._type === 'UMLGeneralization').length, diagrams: M.allDiagrams(a.activeDoc().project).map((d) => [d._type, d.ownedViews.length]) })`);
    const before = await summary();
    await W(app, `(window.__myumlmakerSavePicks = [${JSON.stringify(file)}], a.exportAs('mdj').then(() => 1))`);
    await waitFile(file);
    await W(app, closeAllDocs);
    await W(app, `a.openPath(${JSON.stringify(file)}).then(() => 1)`);
    await sleep(500);
    await noErrorPopup(app, 'open mdj');
    assert.equal(await W(app, 'w.state.docs.length'), 1, 'opened in a tab');
    assert.deepEqual(await summary(), before);
    assert.equal(await W(app, 'a.activeDoc().path'), null, 'an import: Save asks for a .myuml name');
  } },
  { group: '파일', name: '오래 걸리는 파일 작업은 진행 팝업 (진행률 막대)', async run(app) {
    const dir = tempDir('slow');
    const file = path.join(dir, 'big.myuml');
    const data = JSON.parse(await templateText(app, 'classModel'));
    data.project.documentation = 'x'.repeat(3_500_000);
    fs.writeFileSync(file, JSON.stringify(data));
    await app.restart([], { MYUMLMAKER_IO_DELAY_MS: '1200' });
    await afterStart(app);
    app.main.eval(`window.__myumlmaker.actions.openPath(${JSON.stringify(file)}).then(() => 1)`).catch(() => {});
    const page = await app.popup('progress', 20000);
    await expectPopupWindow(app, page, 'progress');
    await page.waitFor(`/\\d+%/.test(document.querySelector('#progress-percent')?.textContent ?? '')`, { timeout: 20000 });
    assert.ok(await page.eval(`Boolean(document.querySelector('.progress-bar i'))`), 'a progress bar');
    page.close();
    await app.main.waitFor(`window.__myumlmaker.state.docs.some((d) => d.path?.endsWith('big.myuml'))`, { timeout: 30000 });
    await app.restart();
    await afterStart(app);
  } },
  { group: '파일', name: '저장 안 한 변경이 있으면 끝낼 때 저장 여부를 물음 (취소하면 그대로)', async run(app) {
    await freshSample(app);
    await W(app, `(a.change('op.edit', (p) => { p.name = '바뀜'; }), 1)`);
    assert.equal(await W(app, 'a.activeDoc().dirty'), true);
    assert.ok(await app.main.eval(`(() => { const p = document.querySelector('#tabs .tab-project'); return p.classList.contains('dirty') && getComputedStyle(p.querySelector('.tab-dirty')).display !== 'none'; })()`), 'the project name shows ● for the change');
    const answer = W(app, 'a.confirmExit()');
    const page = await app.popup('confirm');
    await expectPopupWindow(app, page, 'confirm');
    const buttons = await page.eval(`[...document.querySelectorAll('[data-action="choice"]')].map((b) => b.dataset.value)`);
    assert.deepEqual(buttons.sort(), ['cancel', 'discard', 'save']);
    await page.click('[data-value="cancel"]');
    page.close();
    assert.equal(await answer, false, 'cancel keeps the app open');
    assert.equal(await W(app, 'w.state.docs.length'), 1, 'the project is still open');
    await W(app, closeAllDocs);
  } },

  // ───────────────────────── printing
  { group: '인쇄', name: '인쇄 미리 보기 (Ctrl+P): 전체/현재 다이어그램, 용지 방향, 바로 인쇄', async run(app) {
    await freshSample(app);
    await app.main.eval(`document.querySelector('.canvas-scroll').focus(); 1`);
    await app.main.key('p', 2);
    const page = await app.popup('print');
    await sleep(500);
    const sheets = () => page.eval('window.__myumlmakerPopup.printLayout().count');
    const all = await sheets();
    assert.ok(all >= 11, `a sheet per diagram at least (${all})`);
    assert.ok(await page.eval(`Boolean(document.querySelector('#print-preview svg'))`), 'the preview shows the diagram');
    await page.eval(`(() => { const r = document.querySelector('[data-print-range="current"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(150);
    assert.ok(await sheets() < all, 'the current diagram only');
    await page.eval(`(() => { const r = document.querySelector('[data-print-range="all"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    assert.equal(await sheets(), all);
    await page.click('.tabs [data-value="page"]');
    const orientation = await page.eval(`document.querySelector('[data-print-segment="orientation"].active').dataset.value`);
    const svgBox = () => page.eval(`(() => { const s = document.querySelector('#print-preview svg'); const r = s.getBoundingClientRect(); return r.width > r.height ? 'wide' : 'tall'; })()`);
    const shapeBefore = await svgBox();
    await page.click(`[data-print-segment="orientation"][data-value="${orientation === 'portrait' ? 'landscape' : 'portrait'}"]`);
    await sleep(200);
    assert.notEqual(await svgBox(), shapeBefore, 'the orientation turns the sheet');
    await page.click(`[data-print-segment="orientation"][data-value="${orientation}"]`);
    await page.eval(`window.__myumlmakerPrintHook = (layout) => { window.__printed = layout.count; }; 1`);
    await page.click('[data-action="print"]');
    await sleep(300);
    assert.ok(await page.eval('window.__printed') >= 1, 'printed');
    page.close();
    await closePopups(app);
  } },

  // ───────────────────────── settings
  { group: '설정', name: '설정 창: 9개 탭, 테마(다크 20/라이트 20/사용자 정의), 글꼴(시스템 글꼴·굵기·기울임)이 주 창에 적용', async run(app) {
    await closePopups(app);
    await W(app, `(w.popups.open('settings', { tab: 'appearance' }), 1)`);
    const page = await app.popup('settings');
    const tabs = await page.eval(`[...document.querySelectorAll('.tabs [data-action="tab"]')].map((t) => t.dataset.value)`);
    assert.deepEqual(tabs, ['general', 'start', 'appearance', 'font', 'background', 'diagram', 'database', 'recent', 'shortcuts']);
    assert.equal(await page.eval(`document.querySelectorAll('.theme-list .theme-row').length`), 20);
    await page.click('[data-theme-group="dark"]');
    assert.equal(await page.eval(`document.querySelectorAll('.theme-list .theme-row').length`), 20);
    await page.click('[data-theme-group="custom"]');
    assert.ok(await page.eval(`document.querySelectorAll('[data-custom-color]').length >= 10`), 'custom colours');
    await page.click('.tabs [data-value="font"]');
    await page.waitFor(`document.querySelectorAll('#font-family option').length > 20`, { timeout: 20000 });
    const family = await page.eval(`[...document.querySelectorAll('#font-family option')].map((o) => o.value).find((f) => /Arial|Malgun|맑은|Segoe/.test(f))`);
    await page.eval(`(() => { const s = document.querySelector('#font-family'); s.value = ${JSON.stringify(family)}; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await page.click('[data-setting="fontStyle"][data-value="italic"]');
    await sleep(500);
    page.close();
    const applied = await app.main.eval(`getComputedStyle(document.documentElement).getPropertyValue('--font-family') + '|' + getComputedStyle(document.documentElement).getPropertyValue('--font-style')`);
    assert.ok(applied.includes(family) && applied.includes('italic'), applied);
    await W(app, `a.updateSettings({ fontFamily: '', fontStyle: 'normal' })`);
    await closePopups(app);
  } },
  { group: '설정', name: '설정 창 › 다이어그램: 격자를 끄면 캔버스에서 격자가 사라짐, 색 구성 적용', async run(app) {
    await freshProject(app, 'classModel');
    await W(app, `a.updateSettings({ showGrid: true, diagramTheme: 'classic' })`);
    await sleep(200);
    const grid = `Boolean(document.querySelector('#view-host pattern#grid-pattern'))`;
    assert.equal(await app.main.eval(grid), true, 'the grid is drawn');
    await W(app, `(w.popups.open('settings', { tab: 'diagram' }), 1)`);
    const page = await app.popup('settings');
    await page.waitFor(`document.querySelector('[data-toggle="showGrid"]')`);
    assert.equal(await page.eval(`document.querySelector('[data-toggle="showGrid"]').checked`), true);
    await page.eval(`(() => { const c = document.querySelector('[data-toggle="showGrid"]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await page.click('[data-setting="diagramTheme"][data-value="dark"]');
    await sleep(500);
    page.close();
    await closePopups(app);
    assert.equal(await W(app, 'w.state.settings.showGrid'), false);
    assert.equal(await app.main.eval(grid), false, 'the grid is gone from the canvas');
    assert.equal(await W(app, 'w.state.settings.diagramTheme'), 'dark', 'the colour scheme reached the main window');
    await W(app, `a.updateSettings({ showGrid: true, diagramTheme: 'classic' })`);
  } },
  { group: '설정', name: '설정은 다음 실행 때 다시 읽힘', async run(app) {
    await W(app, `a.updateSettings({ theme: 'dracula', gridSize: 20, language: 'en', showRightPanel: false })`);
    const animationBefore = await W(app, 'w.state.settings.animation');
    await sleep(300);
    await app.quit();
    await app.launch();
    const s = await W(app, `({ theme: w.state.settings.theme, gridSize: w.state.settings.gridSize, language: w.state.settings.language, right: w.state.settings.showRightPanel, offered: w.state.settings.tutorialOffered })`);
    assert.deepEqual(s, { theme: 'dracula', gridSize: 20, language: 'en', right: false, offered: true });
    assert.match(await app.main.eval(`document.querySelector('[data-menu="file"]').textContent`), /File/);
    await sleep(1500);
    assert.equal(await app.hasPopup('welcome'), false, 'the welcome popup only comes once');
    assert.notEqual(await W(app, 'w.state.settings.animation'), animationBefore, 'every start picks another moving background');
    await W(app, `a.updateSettings({ theme: 'light', gridSize: 10, language: 'ko', showRightPanel: true })`);
  } },
  { group: '설정', name: '새로 설치한 뒤 첫 실행: 설정은 기본값으로, 최근 파일·DB 연결·배경 이미지는 그대로 (한 번만)', async run(app) {
    const marker = path.join(app.config, 'install-reset');
    const recent = JSON.stringify([{ path: 'D:\\projects\\kept.myuml', title: 'kept' }]);
    await W(app, closeAllDocs);
    await app.main.eval(`(localStorage.setItem('myumlmaker.recent.v1', ${JSON.stringify(recent)}), 1)`);
    await W(app, `(a.updateSettings({ theme: 'monokai', zoom: 140, showLeftPanel: false, dbKind: 'postgres', dbHost: 'db.example', backgroundName: 'kept.png' }), 1)`);
    const settings = async () => JSON.parse(await W(app, 'JSON.stringify(w.state.settings)'));
    // Quit the way a user does (File › Exit): taskkill would lose localStorage that has not reached the disk yet.
    const quitAndStart = async () => {
      await W(app, `(() => { for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true }); w.run('exit'); return 1; })()`).catch(() => {});
      await Promise.race([app.exited, sleep(15000)]);
      app.main?.close();
      await app.kill();
      await app.launch();
    };
    await quitAndStart();
    const kept = await settings();
    assert.deepEqual([kept.theme, kept.zoom], ['monokai', 140], 'a normal restart keeps the settings');
    fs.writeFileSync(marker, '4242');
    await quitAndStart();
    const after = await settings();
    assert.deepEqual([after.theme, after.zoom, after.showLeftPanel], ['light', 100, true], 'preferences are back to the defaults');
    assert.deepEqual([after.dbKind, after.dbHost, after.backgroundName], ['postgres', 'db.example', 'kept.png'], 'database connection and background image stay');
    assert.equal(await app.main.eval(`localStorage.getItem('myumlmaker.recent.v1')`), recent, 'recent files stay');
    assert.equal(fs.existsSync(marker), false, 'the marker is used up');
    await W(app, `(a.updateSettings({ zoom: 120 }), 1)`);
    await quitAndStart();
    assert.equal((await settings()).zoom, 120, 'once only: later starts keep what the user sets');
    await W(app, `(a.updateSettings({ zoom: 100, dbKind: 'none', dbHost: 'localhost', backgroundName: '' }), 1)`);
    await app.main.eval(`(localStorage.removeItem('myumlmaker.recent.v1'), 1)`);
  } },

  // ───────────────────────── errors
  { group: '오류', name: '오류는 팝업으로 자세히, 내용 복사 가능 (깨진 파일 열기)', async run(app) {
    await closePopups(app);
    const file = path.join(tempDir('bad'), 'broken.myuml');
    fs.writeFileSync(file, '{ not json');
    await W(app, `a.openPath(${JSON.stringify(file)}).then(() => 1)`);
    const page = await app.popup('error');
    await expectPopupWindow(app, page, 'error');
    const report = await page.eval(`document.querySelector('#error-detail').value`);
    assert.match(report, /broken\.myuml/);
    await page.click('[data-action="copy-error"]');
    await sleep(400);
    assert.ok(getClipboard().includes('broken.myuml'), 'copied to the clipboard');
    assert.ok(await page.eval(`document.querySelector('#copy-state').textContent.trim().length > 0`), 'says it was copied');
    page.close();
    await closePopups(app);
  } },
  { group: '오류', name: '백엔드 심각한 오류(패닉)도 위치·백트레이스와 함께 팝업', async run(app) {
    await closePopups(app);
    await app.main.eval(`window.__TAURI_INTERNALS__.invoke('raise_test_panic').then(() => 1)`);
    const page = await app.popup('error');
    const report = await page.eval(`document.querySelector('#error-detail').value`);
    assert.match(report, /test panic/);
    assert.match(report, /lib\.rs/);
    page.close();
    await closePopups(app);
  } },

  // ───────────────────────── view & help
  { group: '보기', name: '프레젠테이션: F5 로 시작, 다이어그램 넘김, Esc 로 끝', async run(app) {
    await freshSample(app);
    await app.main.eval(`document.querySelector('.canvas-scroll').focus(); 1`);
    await app.main.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'F5', code: 'F5', windowsVirtualKeyCode: 116, nativeVirtualKeyCode: 116 });
    await app.main.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F5', code: 'F5', windowsVirtualKeyCode: 116, nativeVirtualKeyCode: 116 });
    await app.main.waitFor(`!document.querySelector('#presentation').hidden`, { message: 'F5 starts the presentation' });
    const first = await app.main.eval(`document.querySelector('#presentation .present-bar span').textContent`);
    assert.ok(await app.main.eval(`Boolean(document.querySelector('#presentation svg'))`), 'the diagram is drawn');
    await app.main.key('ArrowRight');
    await sleep(300);
    assert.notEqual(await app.main.eval(`document.querySelector('#presentation .present-bar span').textContent`), first, 'the next diagram shows');
    await app.main.key('Escape');
    await app.main.waitFor(`document.querySelector('#presentation').hidden`, { message: 'Esc ends the presentation' });
    await sleep(400);
    assert.equal(await W(app, 'w.state.presenting ?? null'), null);
  } },
  { group: '도움말', name: '튜토리얼 문서를 프로그램 안에서 읽기 (홈 화면 항목, 장 선택, 언어)', async run(app) {
    await W(app, '(a.showStartPage(true), 1)');
    await sleep(300);
    await app.main.click('#start-page [data-start="tutorial-doc"]');
    await app.main.waitFor(`document.querySelectorAll('[data-reader-chapter] option').length > 5`, { timeout: 15000 });
    const doc = await app.main.eval(`(() => { const d = document.querySelector('.reader-frame').contentDocument; return { shown: !document.querySelector('#reader-page').hidden, h1: d.querySelector('h1').textContent, steps: d.querySelectorAll('h3').length, images: d.images.length, raw: d.body.innerText.includes('<a id='), chapters: [...document.querySelectorAll('[data-reader-chapter] option')].slice(1).map((o) => o.textContent) }; })()`);
    assert.ok(doc.shown);
    assert.match(doc.h1, /MyUMLMaker/);
    const steps = await app.main.eval(`window.__myumlmaker.domain.tutorialSteps()`);
    assert.equal(doc.steps, steps, 'every tutorial step is in the document');
    assert.equal(doc.images, steps, 'with a picture each');
    assert.equal(doc.raw, false, 'no raw HTML shows as text');
    assert.ok(doc.chapters.every((c) => !c.endsWith('#')), JSON.stringify(doc.chapters));
    await app.main.eval(`(() => { const s = document.querySelector('[data-reader-chapter]'); s.value = s.options[4].value; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(300);
    assert.ok(await app.main.eval(`document.querySelector('.reader-frame').contentWindow.scrollY > 200`), 'a chapter can be picked');
    await app.main.click('[data-reader="lang"][data-value="en"]');
    await app.main.waitFor(`/tutorial/i.test(document.querySelector('.reader-frame').contentDocument?.querySelector('h1')?.textContent ?? '')`, { timeout: 10000 });
    await app.main.click('[data-reader="home"]');
    await sleep(300);
    assert.deepEqual(await app.main.eval(`[!document.querySelector('#reader-page').hidden, !document.querySelector('#start-page').hidden]`), [false, true], 'Home goes back to the start page');
  } },
  { group: '도움말', name: '사용 설명서 열기 (설치된 문서를 시스템 프로그램으로)', async run(app) {
    const log = path.join(tempDir('open'), 'open.log');
    await app.restart([], { MYUMLMAKER_OPEN_LOG: log });
    await afterStart(app);
    await W(app, `(w.run('userGuide'), 1)`);
    for (let i = 0; i < 20 && !fs.existsSync(log); i++) await sleep(150);
    assert.match(fs.readFileSync(log, 'utf8'), /UsersGuide(\.en)?\.html/);
    await app.restart();
    await afterStart(app);
  } },
  { group: '도움말', name: '튜토리얼: 시작·다음·Esc 로 끝내면 원래대로 (자기 탭은 닫힘)', async run(app) {
    await freshSample(app);
    const docs = await W(app, 'w.state.docs.length');
    await W(app, '(a.startTutorial(), 1)');
    await app.main.waitFor(`window.__myumlmaker.tutorial().state().active && !window.__myumlmaker.tutorial().state().busy`, { timeout: 30000 });
    await app.main.waitFor(`Boolean(document.querySelector('.tour-card') && document.querySelector('.tour-outline'))`, { timeout: 15000 });
    for (let i = 0; i < 6; i++) {
      await app.main.click('[data-tour="next"]');
      await app.main.waitFor(`window.__myumlmaker.tutorial().state().index === ${i + 1} && !window.__myumlmaker.tutorial().state().busy`, { timeout: 30000 });
    }
    assert.equal(await W(app, 'w.state.docs.length'), docs + 1, 'the tutorial works on its own tab');
    await app.main.key('Escape');
    await sleep(1000);
    assert.equal(await W(app, 'w.state.docs.length'), docs, 'its tab closed');
    assert.equal(await app.main.eval(`Boolean(document.querySelector('#tutorial-layer.active'))`), false);
    assert.equal(await W(app, 'w.popups.inline'), false, 'popups are OS windows again');
    await noErrorPopup(app, 'tutorial');
  } },
];
