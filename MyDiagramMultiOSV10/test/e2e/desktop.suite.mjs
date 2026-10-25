// Desktop end-to-end cases against the real app (see harness.mjs). Each case
// gets the started App and throws on failure. Cases run in order and share
// the app; each leaves it in a usable state.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sleep } from './cdp.mjs';
import { root } from './harness.mjs';
import { ALIGN_CHECK } from './align-check.mjs';
import { CLIP_CHECK } from './clip-check.mjs';

const VERSION = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const TITLE = `MyDiagram v${VERSION}`;
const WS_THICKFRAME = 0x40000;
const POPUP_SCROLL_CHECK = `(() => [...document.querySelectorAll('*')].filter((e) => {
  const style = getComputedStyle(e);
  return ['auto', 'scroll'].includes(style.overflowY) && e.scrollHeight > e.clientHeight + 1 && e.tagName !== 'SELECT' && e.tagName !== 'TEXTAREA';
}).map((e) => e.className || e.tagName))()`;
const VIEWS = ['drawing', 'pages', 'shapeSheet', 'shapeData', 'reports'];

// windowsHide: a console window would take the focus away (and close an open menu).
const ps = (script) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }).toString().trim();
const getClipboard = () => ps('[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Clipboard -Raw');
const setClipboard = (text) => ps(`Set-Clipboard -Value @'\n${text}\n'@`);

const W = (app, expression) => app.main.eval(`(() => { const w = window.__mydiagram; const a = w.actions; const api = w.api; return ${expression}; })()`);
const resize = (app, width, height) => app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: ${width}, height: ${height} } } }).then(() => 1)`);
const mainWindow = (app) => app.windowInfo().find((w) => w.owner === 0 && w.visible && w.title.startsWith('MyDiagram'));
const closeAllDocs = `(() => { for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true }); return 1; })()`;

async function closePopups(app) {
  await app.main.eval(`window.__mydiagram.popups.closeAll().then(() => 1)`).catch(() => {});
  await sleep(200);
}

/** The built-in sample drawing (several pages, shapes and connectors) in the drawing view. */
async function freshSample(app) {
  await closePopups(app);
  await W(app, `(() => { for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true }); a.openSampleBuiltin(); a.switchView('drawing'); return 1; })()`);
  await sleep(500);
}

/** A new empty drawing with two shapes (ids a, b) far enough apart to connect, at 100 %. */
async function freshDrawing(app) {
  await closePopups(app);
  const ids = await W(app, `(() => {
    for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true });
    a.newDrawing();
    a.switchView('drawing');
    const s1 = a.addShapeAt('rect', { x: 120, y: 140, w: 140, h: 70 });
    const s2 = a.addShapeAt('ellipse', { x: 460, y: 140, w: 140, h: 70 });
    a.setCanvasZoom(100);
    a.select([]);
    return { a: s1.id, b: s2.id };
  })()`);
  await sleep(300);
  return ids;
}

/** Client point (CSS px of the main page) of a point of a shape; the shape is scrolled into view first. */
const clientOf = (app, id, fx = 0.5, fy = 0.5) => W(app, `(() => {
  const v = w.state.view; v.scrollToShape(${JSON.stringify(id)});
  const s = api.page().shapes.find((x) => x.id === ${JSON.stringify(id)});
  const r = v.stage.getBoundingClientRect();
  return { x: r.left - v.world.x * v.z + (s.x + s.w * ${fx}) * v.z, y: r.top - v.world.y * v.z + (s.y + s.h * ${fy}) * v.z };
})()`);
const shape = (app, id) => W(app, `JSON.parse(JSON.stringify(api.page().shapes.find((x) => x.id === ${JSON.stringify(id)}) ?? null))`);
const counts = (app) => W(app, `({ shapes: api.page().shapes.filter((s) => s.type === 'shape').length, connectors: api.page().shapes.filter((s) => s.type === 'connector').length, pages: api.doc().doc.pages.length })`);
const noErrorPopup = async (app, where) => assert.equal(await app.hasPopup('error'), false, `${where}: no error popup`);

/** OS window checks for a popup: its own window titled "<title> — MyDiagram vX", owned by the main window, fixed size, no scroll bars, icon + title. */
async function expectPopupWindow(app, page, kind, { resizable = false } = {}) {
  assert.equal(await page.eval('document.title'), `popup-${kind}`);
  const head = await page.eval(`(() => { if (${kind === 'menu'}) { const m = document.querySelector('.popup-menu'); return m ? { icon: true, text: m.getAttribute('aria-label') || '', drag: true, noHeader: !document.querySelector('.menu-head') } : null; } const h = document.querySelector('.popup-head h2'); return h ? { icon: Boolean(h.querySelector('svg')), text: h.textContent.trim(), drag: Boolean(document.querySelector('[data-tauri-drag-region]')) } : null; })()`);
  assert.ok(head?.icon && head.text, `${kind}: header has an icon and a title (${JSON.stringify(head)})`);
  assert.ok(head.drag, `${kind}: can be moved by its title bar`);
  assert.deepEqual(await page.eval(POPUP_SCROLL_CHECK), [], `${kind}: no scroll bars inside the popup`);
  let windows = [];
  let popup;
  for (let i = 0; i < 12 && !popup; i++) {
    if (i) await sleep(150);
    windows = app.windowInfo().filter((w) => w.visible && w.title.endsWith(TITLE));
    popup = windows.find((w) => w.owner !== 0 && w.title.includes(head.text.slice(0, 4)));
  }
  const main = windows.find((w) => w.owner === 0);
  assert.ok(main, 'main window found');
  assert.ok(popup, `${kind}: its own OS window "<title> — ${TITLE}" (${JSON.stringify(windows.map((w) => w.title))})`);
  assert.equal(popup.owner, main.handle, `${kind}: owned by the main window (closes with it)`);
  if (!resizable) assert.equal(popup.style & WS_THICKFRAME, 0, `${kind}: fixed size`);
  return { main, popup };
}

/** Right-clicks a point and returns the context menu's header and item ids (the menu is closed again). */
async function contextMenuAt(app, point, where) {
  await app.main.realClick(point.x, point.y, { button: 'right' });
  const menu = await app.popup('menu');
  await menu.waitFor(`document.querySelector('.menu-item')`);
  await sleep(200);
  const info = await menu.eval(`({ head: document.querySelector('.popup-menu').getAttribute('aria-label'), ids: [...document.querySelectorAll('.menu-item')].map((i) => i.dataset.id), noIcon: [...document.querySelectorAll('.menu-item')].filter((i) => !i.querySelector('.menu-icon svg')).length })`);
  await menu.key('Escape');
  menu.close();
  await sleep(250);
  assert.equal(info.noIcon, 0, `${where}: every item has an icon`);
  return { head: info.head, ids: info.ids.join(',') };
}

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `mdg-${name}-`));
}

/** A small drawing file: one page with the given shape texts. */
const drawingFile = (title, texts) => JSON.stringify({ format: 'mydiagram', version: 1, kind: 'drawing', document: { title, pages: [{ name: 'P1', shapes: texts.map((text, i) => ({ id: `w${i}`, master: 'rect', x: 100 + i * 180, y: 100, w: 120, h: 60, text })) }] } });

const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

export const cases = [
  // ───────────────────────── first start
  { group: '처음 실행', name: '튜토리얼 안내 팝업 (독립 OS 창) → 나중에', async run(app) {
    const page = await app.popup('welcome');
    await expectPopupWindow(app, page, 'welcome');
    const text = await page.eval(`document.querySelector('.popup').innerText`);
    assert.match(text, /튜토리얼|tutorial/i);
    await page.click('[data-value="later"]');
    page.close();
    await sleep(300);
    assert.equal(await W(app, 'w.state.settings.tutorialOffered'), true, 'offered once');
  } },
  { group: '처음 실행', name: '시작 페이지: 템플릿 전부, 최근 파일·폴더, 예제, 튜토리얼 시작 버튼', async run(app) {
    await W(app, '(a.showStartPage(true), 1)');
    await sleep(300);
    const templates = await W(app, 'w.domain.TEMPLATES.length');
    const info = await app.main.eval(`({ shown: !document.querySelector('#start-page').hidden, templates: document.querySelectorAll('.template-tile').length, tutorial: Boolean(document.querySelector('[data-start="tutorial"]')), banner: Boolean(document.querySelector('.start-banner')), recent: Boolean(document.querySelector('.start-card.recent')), samples: document.querySelectorAll('[data-start="open-sample"], [data-start="builtin-sample"]').length })`);
    assert.ok(info.shown, 'start page shown');
    assert.equal(templates, 13, 'MyDiagram has 13 templates');
    assert.equal(info.templates, templates, 'a tile per template');
    assert.ok(info.tutorial && info.banner && info.recent, JSON.stringify(info));
    assert.ok(info.samples >= 1, 'sample drawings listed');
  } },
  { group: '처음 실행', name: '시작 페이지 배경이 움직이고 바꿀 수 있음', async run(app) {
    const frames = async () => app.main.eval(`(() => { const c = document.querySelector('.start-bg'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let y = 0; y < c.height; y += 7) for (let x = 0; x < c.width; x += 7) { const i = (y * c.width + x) * 4; h = (h * 31 + d[i] * 3 + d[i + 1] * 5 + d[i + 2]) >>> 0; } return h; })()`);
    const a = await frames();
    await sleep(900);
    const b = await frames();
    assert.notEqual(a, b, 'the background pixels change over time (animated)');
    const before = await W(app, 'w.state.settings.animation');
    await app.main.click('[data-start="shuffle"]');
    await sleep(300);
    const after = await W(app, 'w.state.settings.animation');
    assert.notEqual(after, before, 'shuffle picks another animation');
    await app.main.click('[data-start="animation"][data-value="flowchart"]');
    await sleep(200);
    assert.equal(await W(app, 'w.state.settings.animation'), 'flowchart');
  } },
  { group: '처음 실행', name: '템플릿 타일을 누르면 새 드로잉 (그리기 보기)', async run(app) {
    await W(app, closeAllDocs);
    await W(app, '(a.showStartPage(true), 1)');
    await sleep(200);
    await app.main.click('[data-start="template"][data-value="flowchart"]');
    await sleep(500);
    assert.equal(await W(app, 'w.state.docs.length'), 1);
    assert.equal(await W(app, 'api.doc().view.id'), 'drawing');
    assert.ok(await W(app, 'api.page().shapes.length > 3'), 'the template has shapes');
    assert.equal(await app.main.eval(`document.querySelector('#start-page').hidden`), true, 'the start page is gone');
  } },

  // ───────────────────────── window
  { group: '창', name: '메뉴바: 아이콘·이름·버전, 드로잉 이름, 홈, 창 버튼; 좌우 패널은 툴바 바로 아래·페이지 탭은 두 패널 사이 위쪽', async run(app) {
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
    // Window buttons at the right end of the menu bar (no OS title bar).
    const chrome = await app.main.eval(`(() => { const bar = document.querySelector('#menubar').getBoundingClientRect(); const c = document.querySelector('.win-controls'); const r = c.getBoundingClientRect(); return { buttons: [...c.querySelectorAll('[data-window]')].map((b) => b.dataset.window), right: Math.round(innerWidth - r.right), top: Math.round(r.top), barTop: Math.round(bar.top), titled: [...c.querySelectorAll('button')].every((b) => b.title) }; })()`);
    assert.deepEqual({ ...chrome, right: chrome.right <= 1, top: chrome.top <= 1 }, { buttons: ['minimize', 'maximize', 'close'], right: true, top: true, barTop: 0, titled: true });
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
  { group: '창', name: '타이틀 바: 프로그램 이름과 버전', async run(app) {
    assert.equal(mainWindow(app)?.title, TITLE);
  } },
  { group: '창', name: '이미 실행 중이면 오류 팝업 후 종료 (두 번째 실행)', async run(app) {
    const lockDir = tempDir('lock');
    const report = path.join(lockDir, 'already.txt');
    const profile = tempDir('profile2');
    const exe = path.join(root, 'src-tauri', 'target', 'debug', 'mydiagram.exe');
    const env = { ...process.env, MYDIAGRAM_LOCK_DIR: lockDir, MYDIAGRAM_CONFIG_DIR: profile, MYDIAGRAM_DATA_DIR: profile, WEBVIEW2_USER_DATA_FOLDER: profile };
    delete env.MYDIAGRAM_MULTI;
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
      assert.match(box.title, /MyDiagram/);
      // Topmost keeps it above every window. Keyboard focus also needs Windows' consent: a copy started from Explorer gets it,
      // one started by this background test process may not, so focus is not required here.
      assert.ok(box.topmost, `the message box is in front of every window ${JSON.stringify(box)}`);
      assert.equal(first.exitCode, null, 'the first copy keeps running');
      probe(true); // OK
      const code = await Promise.race([exited, sleep(10000).then(() => 'running')]);
      assert.equal(code, 3, 'the second copy quits after the message');
      // The wording (Korean/English) is checked by instance.rs unit tests and through the text hook:
      const third = spawn(exe, [], { env: { ...env, MYDIAGRAM_ALREADY_RUNNING_FILE: report }, stdio: 'ignore' });
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
    await sleep(600);
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
    assert.ok(result.height < 44, `${result.height}px high`);
    assert.deepEqual(result.hidden, []);
  } },
  { group: '창', name: '오른쪽 아래 모서리의 크기 조절 표시로 창 크기 바꾸기 (실제 마우스)', async run(app) {
    await resize(app, 1300, 820);
    await sleep(400);
    // Measured after the resize: the grip moves with the window corner.
    const grip = await app.main.eval(`(() => { const g = document.querySelector('[data-resize-grip]'); const r = g.getBoundingClientRect(); return { right: innerWidth - r.right, bottom: innerHeight - r.bottom, cursor: getComputedStyle(g).cursor, title: g.title, x: r.left + r.width / 2, y: r.top + r.height / 2, dpr: devicePixelRatio }; })()`);
    assert.ok(grip.right < 1 && grip.bottom < 1, `in the corner ${JSON.stringify(grip)}`);
    assert.equal(grip.cursor, 'nwse-resize');
    assert.ok(grip.title);
    const before = await app.main.eval('({ w: innerWidth, h: innerHeight })');
    const main = mainWindow(app);
    const script = `Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class M{[DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);[DllImport("user32.dll")]public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern void keybd_event(byte k,byte s,uint f,UIntPtr e);[DllImport("user32.dll")]public static extern bool ClientToScreen(IntPtr h,ref P p);public struct P{public int X,Y;}}';
$h=[IntPtr]${main.handle};[M]::keybd_event(0x12,0,0,[UIntPtr]::Zero);[M]::keybd_event(0x12,0,2,[UIntPtr]::Zero);[void][M]::SetForegroundWindow($h);Start-Sleep -Milliseconds 200;$p=New-Object M+P;$p.X=${Math.round(grip.x * grip.dpr)};$p.Y=${Math.round(grip.y * grip.dpr)};[void][M]::ClientToScreen($h,[ref]$p);
[void][M]::SetCursorPos($p.X,$p.Y);Start-Sleep -Milliseconds 150;[M]::mouse_event(2,0,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 450;
for($i=1;$i -le 10;$i++){[void][M]::SetCursorPos($p.X+12*$i,$p.Y+8*$i);Start-Sleep -Milliseconds 40};Start-Sleep -Milliseconds 150;[M]::mouse_event(4,0,0,0,[UIntPtr]::Zero)`;
    ps(script);
    await sleep(600);
    const after = await app.main.eval('({ w: innerWidth, h: innerHeight })');
    await resize(app, 1480, 900);
    await sleep(300);
    assert.ok(after.w > before.w + 40 && after.h > before.h + 25, `window grew ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  } },
  { group: '창', name: '상태 표시줄: 페이지·저장 상태·도형 수·확대 비율과 명령 결과', async run(app) {
    await freshSample(app);
    await W(app, `(a.addShapeAt('rect', { x: 40, y: 40, w: 80, h: 50 }), a.select([]), 1)`);
    await W(app, `(w.run('selectAll'), w.run('copy'), 1)`);
    await app.main.waitFor(`document.querySelector('#statusbar .status-notice')?.textContent.trim().length > 3`, { timeout: 3000 });
    await W(app, `(a.select([]), 1)`);
    await sleep(200);
    const items = await app.main.eval(`[...document.querySelectorAll('#statusbar .status-item, #statusbar .status-notice')].map((e) => e.textContent.trim())`);
    assert.ok(items.length >= 6, JSON.stringify(items));
    assert.ok(items[0].length > 3, 'the last command result is shown');
    assert.ok(items.some((text) => /페이지 \d+\/\d+/.test(text)), `page n/total ${JSON.stringify(items)}`);
    assert.ok(items.some((text) => /도형 \d+개/.test(text)), 'shape count');
    assert.ok(items.some((text) => /수정됨|저장됨|modified|saved/i.test(text)), 'saved state');
    assert.ok(items.some((text) => /\d+%/.test(text)), 'zoom percent');
    await W(app, 'a.undo()');
  } },

  // ───────────────────────── toolbar
  { group: '툴바', name: '모든 버튼에 툴팁 · 한 줄 · 아이콘은 서로 다름', async run(app) {
    await freshSample(app);
    const missing = await app.main.eval(`[...document.querySelectorAll('#toolbar button, #toolbar input, #menubar button, #left-panel button, #right-panel button, #statusbar button, .page-tabs button')].filter((b) => !(b.title || '').trim()).map((b) => b.outerHTML.slice(0, 90))`);
    assert.deepEqual(missing, []);
    const rows = await app.main.eval(`new Set([...document.querySelectorAll('#toolbar .tool-button')].map((b) => { const r = b.getBoundingClientRect(); return Math.round(r.top + r.height / 2); })).size`);
    assert.equal(rows, 1, 'one row');
    const icons = await app.main.eval(`[...document.querySelectorAll('#toolbar [data-command]')].filter((b) => b.dataset.command !== 'language' && !b.matches('.split-arrow, [data-command="themeMenu"]')).map((b) => b.dataset.command + '|' + (b.querySelector('svg')?.innerHTML ?? ''))`);
    const seen = new Map();
    const dupes = [];
    for (const entry of icons) {
      const [command, svg] = [entry.slice(0, entry.indexOf('|')), entry.slice(entry.indexOf('|') + 1)];
      if (seen.has(svg)) dupes.push(`${seen.get(svg)} = ${command}`);
      else seen.set(svg, command);
    }
    assert.deepEqual(dupes, [], 'no two toolbar buttons share an icon');
  } },
  { group: '툴바', name: '프로그램 정보 버튼: 빌드 정보와 제작자', async run(app) {
    await app.main.click('[data-command="about"]');
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
      await app.main.click('[data-command="theme"]');
      await sleep(150);
      const theme = await W(app, 'w.state.settings.theme');
      assert.notEqual(theme, previous);
      seen.add(theme);
      previous = theme;
    }
    assert.ok(seen.size >= 4, `${seen.size} different themes`);
  } },
  { group: '툴바', name: '테마 드롭다운: 다크 | 라이트 두 줄, 사용자 정의', async run(app) {
    await app.main.click('[data-command="themeMenu"]');
    const page = await app.popup('theme');
    await expectPopupWindow(app, page, 'theme');
    const info = await page.eval(`(() => { const cols = [...document.querySelectorAll('.picker-column')]; return { cols: cols.length, counts: cols.map((c) => c.querySelectorAll('[data-pick-theme]').length), lefts: cols.map((c) => Math.round(c.getBoundingClientRect().left)), custom: Boolean(document.querySelector('[data-pick-theme="custom"]')) }; })()`);
    assert.equal(info.cols, 2);
    assert.deepEqual(info.counts, [20, 20]);
    assert.ok(info.lefts[0] < info.lefts[1], 'side by side');
    assert.ok(info.custom);
    // Narrow, just under the dropdown button: left edges lined up, or right edges when the screen ends first.
    const button = await app.main.eval(`(() => { const r = document.querySelector('#toolbar [data-command="themeMenu"]').closest('.split-button').getBoundingClientRect(); const dx = window.screenX + (window.outerWidth - window.innerWidth) / 2; const dy = window.screenY + window.outerHeight - window.innerHeight - (window.outerWidth - window.innerWidth) / 2; return { left: dx + r.left, right: dx + r.right, bottom: dy + r.bottom }; })()`);
    const box = await page.eval(`({ left: window.screenX, right: window.screenX + window.innerWidth, top: window.screenY, width: window.innerWidth, screenRight: screen.availLeft + screen.availWidth })`);
    assert.ok(box.width < 560, `narrow ${JSON.stringify(box)}`);
    const roomRight = button.left + box.width <= box.screenRight;
    assert.ok(roomRight ? Math.abs(box.left - button.left) < 6 : Math.abs(box.right - button.right) < 6, `lined up with the button ${JSON.stringify({ button, box })}`);
    assert.ok(Math.abs(box.top - button.bottom) < 10, `just under the button ${JSON.stringify({ button, box })}`);
    await page.click('[data-pick-theme="nord"]');
    page.close();
    await sleep(400);
    assert.equal(await W(app, 'w.state.settings.theme'), 'nord');
  } },
  { group: '툴바', name: '모든 테마에서 글자가 잘 보임 (실제 화면 색 대비)', async run(app) {
    await freshSample(app);
    await W(app, `(a.select([api.page().shapes.find((s) => s.type === 'shape').id]), 1)`);
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
        for (const el of document.querySelectorAll('.menubar-item span, .panel-header span, .stencil-tile span, .stencil-toggle span, .page-tab span, .status-item span, .tab-name, .prop-label span, .prop-value, .row-label span')) {
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
  { group: '툴바', name: '언어 버튼: 한국어일 때 영국 국기, 영어일 때 태극기', async run(app) {
    await W(app, `a.updateSettings({ language: 'ko' })`);
    await sleep(200);
    const flag = () => app.main.eval(`document.querySelector('[data-command="language"] svg').innerHTML.includes('012169') ? 'uk' : document.querySelector('[data-command="language"] svg').innerHTML.includes('cd2e3a') ? 'kr' : '?'`);
    assert.equal(await flag(), 'uk');
    // The drawn flag fills its whole box (a 2:1 UK flag letterboxed into the 3:2 box looked long and thin).
    const flagSize = () => app.main.eval(`(() => { const f = document.querySelector('[data-command="language"] .flag'); const box = f.getBoundingClientRect(); const art = f.querySelector('g, rect').getBoundingClientRect(); return { box: [Math.round(box.width), Math.round(box.height)], fills: art.width >= box.width - 0.5 && art.height >= box.height - 0.5 }; })()`);
    const ukSize = await flagSize();
    assert.ok(ukSize.fills, 'the UK flag fills its box');
    await app.main.click('[data-command="language"]');
    await sleep(300);
    assert.equal(await W(app, 'w.state.settings.language'), 'en');
    assert.equal(await flag(), 'kr');
    assert.deepEqual(await flagSize(), ukSize, 'both flags are the same size');
    assert.match(await app.main.eval(`document.querySelector('[data-menu="file"]').textContent`), /File/);
    await app.main.click('[data-command="language"]');
    await sleep(300);
    assert.match(await app.main.eval(`document.querySelector('[data-menu="file"]').textContent`), /파일/);
  } },
  { group: '툴바', name: '창 투명도 설정은 없음', async run(app) {
    assert.equal(await app.main.eval(`Boolean(document.querySelector('.opacity-control, #opacity-slider'))`), false);
  } },
  { group: '툴바', name: '보기 드롭다운: 보기를 바꿔도 툴바 버튼이 움직이지 않음, 메뉴바에 드로잉 이름 없음', async run(app) {
    await freshSample(app);
    assert.equal(await app.main.eval(`document.querySelector('#menubar .menubar-title')`), null, 'the menubar shows no drawing title');
    const layout = () => app.main.eval(`JSON.stringify([...document.querySelectorAll('#toolbar .tool-button')].map((b) => Math.round(b.getBoundingClientRect().left)))`);
    const first = await layout();
    for (const view of VIEWS) {
      await W(app, `(a.switchView('${view}'), 1)`);
      await sleep(150);
      assert.equal(await app.main.eval(`document.querySelector('.view-split [data-view-name]:not(.off)').dataset.viewName`), view, 'the current view is named');
      assert.equal(await layout(), first, `${view}: toolbar buttons stay in place`);
    }
    await W(app, `(a.switchView('drawing'), 1)`);
  } },
  { group: '툴바', name: '그리기 도구 버튼: 누르면 도구가 바뀌고 눌림 표시', async run(app) {
    await freshDrawing(app);
    for (const tool of ['connector', 'text', 'rect', 'ellipse', 'line', 'pointer']) {
      await app.main.click(`#toolbar [data-command="tool:${tool}"]`);
      await sleep(120);
      assert.equal(await W(app, 'api.tool()'), tool);
      assert.equal(await app.main.eval(`document.querySelector('#toolbar [data-command="tool:${tool}"]').getAttribute('aria-pressed')`), 'true', `${tool}: pressed`);
    }
  } },

  // ───────────────────────── menus
  ...[['file', '파일'], ['edit', '편집'], ['view', '보기'], ['insert', '삽입'], ['format', '서식'], ['arrange', '정렬'], ['design', '디자인'], ['data', '데이터'], ['page', '페이지'], ['help', '도움말']].map(([name, title]) => ({ group: '메뉴', name: `메뉴 "${title}": 독립 창, 한 줄, 아이콘+이름`, async run(app) {
    if (!(await W(app, 'Boolean(api.doc())'))) await freshSample(app);
    await app.main.click(`[data-menu="${name}"]`);
    const menu = await app.popup('menu');
    await menu.waitFor(`document.querySelector('.menu-item') && document.querySelector('.popup-menu')?.getAttribute('aria-label') === '${title}' && !document.querySelector('.menu-head')`);
    await sleep(250);
    const info = await menu.eval(`(() => { const items = [...document.querySelectorAll('.menu-item')]; return { count: items.length, lefts: [...new Set(items.map((i) => Math.round(i.getBoundingClientRect().left)))], noIcon: items.filter((i) => !i.querySelector('.menu-icon svg')).length, noLabel: items.filter((i) => !i.querySelector('.menu-label').textContent.trim()).length, fits: document.documentElement.scrollHeight <= innerHeight + 2 && document.documentElement.scrollWidth <= innerWidth + 2 }; })()`);
    assert.ok(info.count >= 5, `${info.count} items`);
    assert.equal(info.lefts.length, 1, 'single column');
    assert.equal(info.noIcon, 0, 'every item has an icon');
    assert.equal(info.noLabel, 0, 'every item has a label');
    assert.ok(info.fits, 'menu window shows every item');
    // A menu closes when it loses focus (as menus do): if something took the focus meanwhile, open it once more.
    await expectPopupWindow(app, menu, 'menu').catch(async () => {
      await app.main.click(`[data-menu="${name}"]`);
      await sleep(500);
      await expectPopupWindow(app, menu, 'menu');
    });
    await menu.key('Escape');
    await sleep(250);
    menu.close();
  } })),
  { group: '메뉴', name: '메뉴는 작은 주 창 밖으로 펼쳐짐', async run(app) {
    const min = await W(app, 'w.state.minWidth');
    await resize(app, min, 600);
    await sleep(500);
    await app.main.click('[data-menu="file"]');
    const menu = await app.popup('menu');
    await menu.waitFor(`document.querySelectorAll('.menu-item').length > 15`);
    await sleep(400);
    const windows = app.windowInfo().filter((w) => w.visible);
    const main = windows.find((w) => w.owner === 0 && w.title === TITLE);
    const popup = windows.find((w) => w.owner === main.handle && w.title.includes('파일'));
    await menu.key('Escape');
    menu.close();
    await resize(app, 1480, 900);
    await sleep(300);
    assert.ok(popup, 'menu window');
    assert.ok(popup.bottom > main.bottom || popup.top < main.top, `menu ${popup.top}..${popup.bottom} goes beyond the window ${main.top}..${main.bottom}`);
  } },
  { group: '메뉴', name: '긴 메뉴는 분류된 하위 메뉴 (보기 › 보기 전환 › ShapeSheet)', async run(app) {
    await freshSample(app);
    await app.main.click('[data-menu="view"]');
    const menu = await app.popup('menu');
    await menu.waitFor(`document.querySelector('[data-id="submenu:views"]')`);
    await sleep(250);
    const groups = await menu.eval(`[...document.querySelectorAll('.menu-item.has-sub')].map((i) => ({ id: i.dataset.id, arrow: Boolean(i.querySelector('.menu-check svg')) }))`);
    assert.ok(groups.length >= 4 && groups.every((g) => g.arrow), JSON.stringify(groups));
    const rowAt = `(() => { const m = document.querySelector('.popup-menu.main').getBoundingClientRect(); const r = document.querySelector('[data-id="submenu:views"]').getBoundingClientRect(); return { left: window.screenX + m.left, right: window.screenX + m.right, top: window.screenY + r.top, x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`;
    const parent = await menu.eval(rowAt);
    // Hovering the group opens it beside the menu, which stays where it was.
    await menu.mouse('mouseMoved', parent.x - 20, parent.y, { button: 'none' });
    await menu.mouse('mouseMoved', parent.x, parent.y, { button: 'none' });
    await menu.waitFor(`document.querySelector('.popup-menu.sub [data-id="view:shapeSheet"]')`, { timeout: 3000 });
    await sleep(300);
    const place = await menu.eval(`(() => { const s = document.querySelector('.popup-menu.sub'); const r = s.getBoundingClientRect(); return { x: window.screenX + r.left, right: window.screenX + r.right, y: window.screenY + r.top, head: s.getAttribute('aria-label'), count: s.querySelectorAll('.menu-item').length, inside: r.right <= innerWidth && r.bottom <= innerHeight }; })()`);
    const after = await menu.eval(rowAt);
    assert.equal(place.head, '보기 전환');
    assert.equal(place.count, VIEWS.length);
    assert.ok(place.inside, `the window holds the submenu ${JSON.stringify(place)}`);
    assert.ok(Math.abs(after.left - parent.left) < 3 && Math.abs(after.top - parent.top) < 3, `the menu does not move ${JSON.stringify({ parent, after })}`);
    assert.ok((Math.abs(place.x - parent.right) < 8 || Math.abs(place.right - parent.left) < 8) && Math.abs(place.y - parent.top) < 20, `submenu opens beside its row ${JSON.stringify({ parent, place })}`);
    await menu.click('.popup-menu.sub [data-id="view:shapeSheet"]');
    menu.close();
    await sleep(500);
    assert.equal(await W(app, 'api.doc().view.id'), 'shapeSheet');
    assert.ok(await app.main.eval(`document.querySelector('#view-host').querySelectorAll('*').length > 30`), 'the ShapeSheet view is drawn');
    await W(app, `a.switchView('drawing')`);
  } },
  { group: '메뉴', name: '메뉴 항목 실행: 페이지 › 새 페이지 (실제 클릭)', async run(app) {
    await freshDrawing(app);
    const pages = await W(app, 'api.doc().doc.pages.length');
    await app.main.click('[data-menu="page"]');
    const menu = await app.popup('menu');
    await menu.waitFor(`document.querySelector('[data-id="pageNew"]')`);
    await sleep(200);
    await menu.click('[data-id="pageNew"]');
    menu.close();
    await sleep(400);
    assert.equal(await W(app, 'api.doc().doc.pages.length'), pages + 1);
  } },

  // ───────────────────────── context menus
  { group: '컨텍스트 메뉴', name: '대상마다 다른 메뉴 (도형·연결선·여러 도형·빈 캔버스·페이지 탭·문서 탭·스텐실), 모든 항목에 아이콘', async run(app) {
    const ids = await freshDrawing(app);
    await W(app, `(a.connectShapes({ id: ${JSON.stringify(ids.a)}, pt: 'auto' }, { id: ${JSON.stringify(ids.b)}, pt: 'auto' }), a.select([]), 1)`);
    await sleep(300);
    const onShape = await clientOf(app, ids.a);
    const shapeMenu = await contextMenuAt(app, onShape, 'shape');
    const between = await W(app, `(() => { const v = w.state.view; const r = v.stage.getBoundingClientRect(); const route = api.doc().routes().values().next().value; const p = route.points[Math.floor(route.points.length / 2) - 1]; const q = route.points[Math.floor(route.points.length / 2)]; return { x: r.left - v.world.x * v.z + ((p.x + q.x) / 2) * v.z, y: r.top - v.world.y * v.z + ((p.y + q.y) / 2) * v.z }; })()`);
    const connectorMenu = await contextMenuAt(app, between, 'connector');
    await W(app, `(a.select([${JSON.stringify(ids.a)}, ${JSON.stringify(ids.b)}]), 1)`);
    await sleep(150);
    const multiMenu = await contextMenuAt(app, await clientOf(app, ids.b), 'multi');
    await W(app, `(a.select([]), 1)`);
    const canvasMenu = await contextMenuAt(app, { x: onShape.x, y: onShape.y + 220 }, 'canvas');
    const pageMenu = await contextMenuAt(app, await app.main.center('.page-tab'), 'page tab');
    const tabMenu = await contextMenuAt(app, await app.main.center('#doc-title'), 'drawing name');
    const stencilMenu = await contextMenuAt(app, await app.main.center('.stencil-tile'), 'stencil');
    const all = [shapeMenu, connectorMenu, multiMenu, canvasMenu, pageMenu, tabMenu, stencilMenu].map((m) => m.ids);
    assert.equal(new Set(all).size, all.length, `every target has its own menu:\n${all.join('\n')}`);
    assert.match(shapeMenu.ids, /custom:editText.*formatShape/, 'shape: edit text, format');
    assert.match(connectorMenu.ids, /routeOrtho/, 'connector: routing');
    assert.match(multiMenu.ids, /group/, 'several shapes: group');
    assert.match(canvasMenu.ids, /paste/, 'canvas: paste');
    assert.match(pageMenu.ids, /pageRename.*pageDelete/, 'page tab: rename, delete');
    assert.match(stencilMenu.ids, /custom:add/, 'stencil: add to page');
  } },

  // ───────────────────────── popups
  ...[
    ['settings', `w.run('settings')`],
    ['shape', `w.run('formatShape')`],
    ['data', `w.run('shapeData')`],
    ['page', `w.run('pageSetup')`],
    ['layers', `w.run('layers')`],
    ['find', `w.run('find')`],
    ['document', `w.run('docProps')`],
    ['layout', `w.run('layout')`],
    ['hyperlink', `w.run('insertHyperlink')`],
    ['design', `w.run('design')`],
    ['import', `w.run('linkData')`],
    ['stencil', `w.run('myShapes')`],
    ['print', `w.run('print')`],
    ['recent', `w.run('recent')`],
    ['prompt', `w.run('pageRename')`],
  ].map(([kind, js]) => ({ group: '팝업', name: `"${kind}": 독립 OS 창 · 크기 고정 · 스크롤 없음 · 아이콘+제목 · 정렬 · 이동 가능`, async run(app) {
    await closePopups(app);
    if (!(await W(app, 'Boolean(api.doc())'))) await freshSample(app);
    await W(app, `(a.switchView('drawing'), a.select([api.page().shapes.find((s) => s.type === 'shape').id]), 1)`);
    await W(app, `(${js}, 1)`);
    const page = await app.popup(kind);
    await sleep(350);
    const { popup } = await expectPopupWindow(app, page, kind);
    assert.deepEqual(await page.eval(ALIGN_CHECK), [], `${kind}: controls and buttons line up`);
    assert.deepEqual(await page.eval(CLIP_CHECK), [], `${kind}: nothing cut off`);
    // Tabs: every tab also has no scroll bars.
    const tabs = await page.eval(`[...document.querySelectorAll('.tabs [data-value]')].filter((t) => t.closest('.tabs-strip, .tabs') && t.classList.contains('tab')).map((t) => t.dataset.value)`);
    if (tabs.length) {
      const nav = await page.eval(`(() => { const n = document.querySelector('.tabs .tabs-nav'); if (!n) return null; const r = n.getBoundingClientRect(); return { right: document.querySelector('.tabs').getBoundingClientRect().right - r.right, buttons: n.querySelectorAll('.tabs-scroll').length, scrollbar: document.querySelector('.tabs-strip').offsetHeight - document.querySelector('.tabs-strip').clientHeight }; })()`);
      assert.ok(nav && nav.buttons === 2 && nav.right < 16 && nav.scrollbar === 0, `${kind}: < > at the right end of the tabs ${JSON.stringify(nav)}`);
    }
    for (const tab of tabs) {
      await page.eval(`document.querySelector('.tabs .tab[data-value="${tab}"]').click(); 1`);
      await sleep(150);
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
  } })),

  // ───────────────────────── shapes
  { group: '도형', name: '스텐실 도형 클릭 → 캔버스에 추가, Ctrl+Z / Ctrl+Y', async run(app) {
    await freshDrawing(app);
    const count = await W(app, 'api.page().shapes.length');
    await app.main.click('.stencil-tile[data-master="diamond"], .stencil-tile[data-master="decision"]');
    await sleep(300);
    assert.equal(await W(app, 'api.page().shapes.length'), count + 1);
    assert.equal(await W(app, 'api.selection().ids.length'), 1, 'the new shape is selected');
    assert.ok(await app.main.eval(`document.querySelector('.canvas-svg [data-id="' + window.__mydiagram.api.selection().ids[0] + '"]') !== null`), 'drawn on the canvas');
    await app.main.eval(`document.querySelector('.canvas-scroll').focus(); 1`);
    await app.main.key('z', 2);
    await sleep(200);
    assert.equal(await W(app, 'api.page().shapes.length'), count, 'Ctrl+Z');
    await app.main.key('y', 2);
    await sleep(200);
    assert.equal(await W(app, 'api.page().shapes.length'), count + 1, 'Ctrl+Y');
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
  { group: '도형', name: '사각형 도구로 끌어 그리기, 도형 끌어 이동 (실행 취소 한 번), 화살표 키로 미세 이동 (실제 마우스)', async run(app) {
    const ids = await freshDrawing(app);
    const start = await clientOf(app, ids.a, 0, 3);
    await W(app, `(a.setTool('rect'), 1)`);
    await app.main.drag(start, { x: start.x + 160, y: start.y + 90 });
    await sleep(250);
    // On screen: page units × zoom (the zoom of a new drawing depends on the window size).
    const made = await W(app, `(() => { const s = api.page().shapes.at(-1); const z = w.state.view.z; return { master: s.master, w: Math.round(s.w * z), h: Math.round(s.h * z), tool: api.tool(), raw: [Math.round(s.w), Math.round(s.h), z] }; })()`);
    assert.equal(made.master, 'rect');
    assert.ok(Math.abs(made.w - 160) <= 20 && Math.abs(made.h - 90) <= 20, JSON.stringify(made));
    delete made.raw;
    await W(app, `(a.setTool('pointer'), 1)`);
    const before = await shape(app, ids.b);
    const from = await clientOf(app, ids.b);
    await app.main.drag(from, { x: from.x + 100, y: from.y + 60 });
    await sleep(250);
    const after = await shape(app, ids.b);
    assert.ok(Math.abs(after.x - before.x - 100) <= 12 && Math.abs(after.y - before.y - 60) <= 12, `moved by the mouse ${before.x},${before.y} → ${after.x},${after.y}`);
    await noErrorPopup(app, 'move');
    await app.main.eval(`document.querySelector('.canvas-scroll').focus(); 1`);
    await app.main.key('z', 2);
    await sleep(200);
    const undone = await shape(app, ids.b);
    assert.deepEqual([undone.x, undone.y], [before.x, before.y], 'the mouse move is one undo step');
    await app.main.key('y', 2);
    await sleep(200);
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
    await noErrorPopup(app, 'resize');
    const center = await clientOf(app, ids.a);
    const handle = await app.main.eval(`(() => { const h = document.querySelector('.canvas-overlay [data-handle="rotate"]'); if (!h) return null; const r = h.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    assert.ok(handle, 'a rotation handle is shown');
    await app.main.drag(handle, { x: center.x + 200, y: center.y });
    await sleep(250);
    const turned = await shape(app, ids.a);
    assert.ok(Math.abs(turned.angle - 90) < 3, `rotated to ${turned.angle}`);
    await noErrorPopup(app, 'rotate');
    assert.match(await app.main.eval(`document.querySelector('#statusbar').textContent`), /90°/, 'the status bar shows the angle');
  } },
  { group: '도형', name: '두 번 클릭해 텍스트 입력, Ctrl+Enter 로 끝냄', async run(app) {
    const ids = await freshDrawing(app);
    const p = await clientOf(app, ids.a);
    await app.main.realClick(p.x, p.y);
    await app.main.realClick(p.x, p.y, { clickCount: 2 });
    await app.main.waitFor(`Boolean(document.querySelector('.text-editor'))`, { message: 'a text editor opens' });
    await app.main.type('주문 접수');
    await app.main.key('Enter', 2);
    await sleep(200);
    assert.equal((await shape(app, ids.a)).text, '주문 접수');
    assert.match(await app.main.eval(`document.querySelector('.canvas-svg').textContent`), /주문 접수/);
    await noErrorPopup(app, 'text edit');
  } },
  { group: '도형', name: '도형 서식 팝업: 채우기 색을 바꾸면 도형에 반영', async run(app) {
    const ids = await freshDrawing(app);
    await W(app, `(a.select([${JSON.stringify(ids.a)}]), 1)`);
    await app.main.click('#right-panel .rail-button[data-command="formatShape"], #right-panel [data-command="formatShape"]').catch(() => W(app, `(w.run('formatShape'), 1)`));
    const page = await app.popup('shape');
    await page.waitFor(`document.querySelector('[data-draft-swatch="fill"][data-value="#c00000"]')`);
    await page.click('[data-draft-swatch="fill"][data-value="#c00000"]');
    await sleep(150);
    await page.click('[data-action="format-apply"]');
    page.close();
    await sleep(400);
    assert.equal((await shape(app, ids.a)).style.fill, '#c00000');
    const drawn = await app.main.eval(`[...document.querySelectorAll('.canvas-svg [data-id="${ids.a}"] [fill]')].map((e) => e.getAttribute('fill').toLowerCase())`);
    assert.ok(drawn.includes('#c00000'), `the new fill is drawn ${JSON.stringify(drawn)}`);
    await W(app, 'a.undo()');
    assert.notEqual((await shape(app, ids.a)).style?.fill, '#c00000', 'one undo step');
  } },
  { group: '도형', name: '정렬·그룹·회전·대칭·순서', async run(app) {
    const ids = await freshDrawing(app);
    await W(app, `(a.select([${JSON.stringify(ids.a)}, ${JSON.stringify(ids.b)}]), 1)`);
    await W(app, `(w.run('alignTop'), 1)`);
    assert.equal((await shape(app, ids.a)).y, (await shape(app, ids.b)).y, 'aligned at the top');
    await app.main.click('#toolbar [data-command="group"]');
    await sleep(200);
    assert.equal(await W(app, `api.page().shapes.filter((s) => s.type === 'group').length`), 1, 'grouped with the toolbar button');
    await W(app, `(w.run('ungroup'), 1)`);
    assert.equal(await W(app, `api.page().shapes.filter((s) => s.type === 'group').length`), 0);
    await W(app, `(a.select([${JSON.stringify(ids.a)}]), w.run('rotateRight'), 1)`);
    assert.equal(Math.round((await shape(app, ids.a)).angle), 90, 'rotated right');
    await W(app, `(w.run('flipV'), 1)`);
    assert.ok((await shape(app, ids.a)).flipV, 'flipped');
    await app.main.click('#toolbar [data-command="sendBack"]');
    await sleep(150);
    assert.equal(await W(app, `api.page().shapes[0].id`), ids.a, 'sent to the back');
  } },

  // ───────────────────────── connectors
  { group: '연결선', name: '연결선 도구: 도형에서 도형으로 끌면 양쪽에 붙은 연결선 (실제 마우스)', async run(app) {
    const ids = await freshDrawing(app);
    await app.main.click('#toolbar [data-command="tool:connector"]');
    const from = await clientOf(app, ids.a);
    const to = await clientOf(app, ids.b);
    await app.main.drag(from, to, 20);
    await sleep(300);
    const con = await W(app, `(() => { const c = api.page().shapes.find((s) => s.type === 'connector'); return c ? { from: c.from.id, to: c.to.id } : null; })()`);
    await W(app, `(a.setTool('pointer'), 1)`);
    assert.deepEqual(con, { from: ids.a, to: ids.b });
    assert.ok(await app.main.eval(`Boolean(document.querySelector('.canvas-svg [data-id="' + window.__mydiagram.api.page().shapes.find((s) => s.type === 'connector').id + '"] path'))`), 'the connector is drawn');
  } },
  { group: '연결선', name: '도형을 마우스로 옮기면 연결선이 따라감 (직각 경로)', async run(app) {
    const ids = await freshDrawing(app);
    await W(app, `(a.connectShapes({ id: ${JSON.stringify(ids.a)}, pt: 'auto' }, { id: ${JSON.stringify(ids.b)}, pt: 'auto' }), a.select([]), 1)`);
    await sleep(250);
    const pathOf = () => W(app, `(() => { const c = api.page().shapes.find((s) => s.type === 'connector'); return { d: document.querySelector('.canvas-svg [data-id="' + c.id + '"] path')?.getAttribute('d') ?? null, points: api.doc().routes().get(c.id).points.length, end: api.doc().routes().get(c.id).points.at(-1) }; })()`);
    const first = await pathOf();
    assert.ok(first.d, 'the connector is drawn');
    const from = await clientOf(app, ids.b);
    await app.main.drag(from, { x: from.x, y: from.y + 160 });
    await sleep(300);
    const second = await pathOf();
    const moved = await shape(app, ids.b);
    assert.ok(moved.y > 250, `the shape moved (${moved.y})`);
    assert.notEqual(second.d, first.d, 'the connector follows the moved shape');
    assert.ok(second.points >= 3, 'an orthogonal route bends');
    const end = second.end;
    assert.ok(end.x >= moved.x - 2 && end.x <= moved.x + moved.w + 2 && end.y >= moved.y - 2 && end.y <= moved.y + moved.h + 2, `still glued to the shape ${JSON.stringify({ end, moved })}`);
  } },

  // ───────────────────────── editing
  { group: '편집', name: '클립보드: Ctrl+C 로 글자가 OS 클립보드에, Ctrl+V 로 도형 붙여넣기, 외부 텍스트 붙여넣기', async run(app) {
    const ids = await freshDrawing(app);
    await W(app, `(a.setShapeText(${JSON.stringify(ids.a)}, '복사할 도형'), a.select([${JSON.stringify(ids.a)}]), document.querySelector('.canvas-scroll').focus(), 1)`);
    await app.main.key('c', 2);
    await sleep(500);
    assert.match(getClipboard(), /복사할 도형/, 'the shape text is on the OS clipboard');
    const count = await W(app, 'api.page().shapes.length');
    await app.main.key('v', 2);
    await sleep(500);
    assert.equal(await W(app, 'api.page().shapes.length'), count + 1, 'Ctrl+V pastes a copy');
    assert.equal(await W(app, `api.page().shapes.at(-1).text`), '복사할 도형');
    setClipboard('외부 텍스트 한 줄\n둘째 줄');
    await app.main.key('v', 2);
    await sleep(600);
    assert.ok(await W(app, `api.page().shapes.some((s) => (s.text ?? '').includes('외부 텍스트 한 줄') && s.text.includes('둘째 줄'))`), 'text from another program becomes a text shape');
  } },
  { group: '편집', name: 'Ctrl+마우스 휠: 캔버스 확대/축소', async run(app) {
    await freshDrawing(app);
    const z = () => W(app, 'Math.round(w.state.view.z * 100)');
    const before = await z();
    const p = await app.main.center('.canvas-scroll');
    await app.main.wheel(p.x, p.y, -200, 2);
    await sleep(250);
    const bigger = await z();
    assert.ok(bigger > before, `zoomed in ${before} → ${bigger}`);
    assert.match(await app.main.eval(`document.querySelector('#status-zoom').textContent`), new RegExp(`^${bigger}%`), 'the status bar follows');
    await app.main.wheel(p.x, p.y, 400, 2);
    await sleep(250);
    assert.ok(await z() < bigger, 'zoomed out');
    await W(app, `(a.setCanvasZoom(100), 1)`);
  } },
  { group: '편집', name: '페이지 탭: + 로 추가, 두 번 클릭해 이름 바꾸기, 메뉴로 삭제 (다른 보기를 다녀온 뒤, 실제 마우스)', async run(app) {
    await freshDrawing(app);
    // The other views listened on the shared view host: after a visit, a click in the drawing ran their handlers.
    await W(app, `(a.switchView('pages'), a.switchView('reports'), a.switchView('shapeSheet'), a.switchView('drawing'), 1)`);
    await sleep(300);
    await app.main.click('.page-tabs [data-page-add]');
    await sleep(300);
    assert.equal(await app.main.eval(`document.querySelectorAll('.page-tab').length`), 2, 'a second page tab');
    const tab = await app.main.center('.page-tab.active');
    await app.main.realClick(tab.x, tab.y);
    await app.main.realClick(tab.x, tab.y, { clickCount: 2 });
    await app.main.waitFor(`document.activeElement?.classList.contains('page-rename')`, { message: 'an inline name box' });
    assert.deepEqual(await app.main.eval(`[document.querySelector('#view-host').className, document.querySelectorAll('#view-host .page-card, #view-host .report-tabs, #view-host .table-bar').length]`), ['view-host canvas-host', 0], 'only the drawing view is in the view host');
    await app.main.key('a', 2);
    await app.main.type('상세 흐름');
    await app.main.key('Enter');
    await sleep(300);
    assert.equal(await W(app, 'api.page().name'), '상세 흐름');
    assert.match(await app.main.eval(`document.querySelector('.page-tab.active').textContent`), /상세 흐름/);
    await W(app, `(a.addShapeAt('rect', { x: 50, y: 50, w: 80, h: 40 }), 1)`);
    const point = await app.main.center('.page-tab.active');
    await app.main.realClick(point.x, point.y, { button: 'right' });
    const menu = await app.popup('menu');
    await menu.waitFor(`document.querySelector('[data-id="pageDelete"]')`);
    await sleep(200);
    await menu.click('[data-id="pageDelete"]');
    menu.close();
    // The page has a shape: deleting asks first.
    const confirm = await app.popup('confirm');
    const choices = await confirm.eval(`[...document.querySelectorAll('[data-action="choice"]')].map((b) => b.dataset.value)`);
    const yes = choices.find((c) => c !== 'cancel');
    await confirm.click(`[data-action="choice"][data-value="${yes}"]`);
    confirm.close();
    await sleep(400);
    assert.equal(await W(app, 'api.doc().doc.pages.length'), 1, 'deleted');
    assert.equal(await app.main.eval(`document.querySelectorAll('.page-tab').length`), 1);
  } },
  { group: '편집', name: '찾기·바꾸기 팝업: 모두 바꾸기', async run(app) {
    const ids = await freshDrawing(app);
    await W(app, `(a.setShapeText(${JSON.stringify(ids.a)}, '주문 확인'), a.setShapeText(${JSON.stringify(ids.b)}, '주문 발송'), 1)`);
    await W(app, `(w.run('replace'), 1)`);
    const page = await app.popup('find');
    await page.waitFor(`document.querySelector('[data-draft="replacement"]')`);
    await page.eval(`(() => { for (const [key, value] of [['text', '주문'], ['replacement', '배송']]) { const e = document.querySelector('[data-draft="' + key + '"]'); e.value = value; e.dispatchEvent(new Event('input', { bubbles: true })); } return 1; })()`);
    await page.click('[data-action="replace-all"]');
    await page.waitFor(`/2/.test(document.querySelector('#find-message')?.textContent ?? '')`, { message: 'the popup reports two replacements' });
    page.close();
    await closePopups(app);
    assert.deepEqual([(await shape(app, ids.a)).text, (await shape(app, ids.b)).text], ['배송 확인', '배송 발송']);
    const found = await W(app, `a.findNext({ text: '발송' })`);
    assert.ok(found.found, 'find next');
    assert.deepEqual(await W(app, 'api.selection().ids'), [ids.b], 'the match is selected');
  } },
  { group: '편집', name: '자동 레이아웃 팝업: 도형을 다시 배치', async run(app) {
    await freshDrawing(app);
    const ids = await W(app, `(() => { const out = []; for (let i = 0; i < 4; i++) out.push(a.addShapeAt('process', { x: 60 + (i % 2) * 30, y: 60 + i * 12, w: 100, h: 50 }).id); for (let i = 1; i < 4; i++) a.connectShapes({ id: out[0], pt: 'auto' }, { id: out[i], pt: 'auto' }); a.select([]); return out; })()`);
    const before = JSON.stringify(await W(app, `api.page().shapes.filter((s) => s.type === 'shape').map((s) => [Math.round(s.x), Math.round(s.y)])`));
    await W(app, `(w.run('layout'), 1)`);
    const page = await app.popup('layout');
    await page.waitFor(`document.querySelector('.layout-card')`);
    const kind = await page.eval(`(document.querySelector('.layout-card[data-value="tree"], .layout-card[data-value="flowTB"]') ?? document.querySelector('.layout-card')).dataset.value`);
    await page.click(`.layout-card[data-value="${kind}"]`);
    await page.click('[data-action="layout-apply"]');
    page.close();
    await sleep(500);
    const after = await W(app, `api.page().shapes.filter((s) => s.type === 'shape').map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h }))`);
    assert.notEqual(JSON.stringify(after.map((s) => [Math.round(s.x), Math.round(s.y)])), before, `${kind}: shapes moved`);
    const overlaps = after.flatMap((s, i) => after.slice(i + 1).filter((o) => s.x < o.x + o.w && o.x < s.x + s.w && s.y < o.y + o.h && o.y < s.y + s.h)).length;
    assert.equal(overlaps, 0, 'no two shapes overlap after the layout');
    assert.equal(ids.length, 4);
  } },

  // ───────────────────────── panels and tabs
  { group: '패널', name: '좌우 패널: 접으면 아이콘+제목 레일 (펼치기 버튼이 위), 구분자로 너비 조절, 최소 너비', async run(app) {
    await freshSample(app);
    await app.main.click('#left-panel .panel-header [data-command="leftPanel"]');
    await sleep(300);
    const rail = await app.main.eval(`(() => { const p = document.querySelector('#left-panel'); const expand = p.querySelector('.rail-button.expand'); const title = p.querySelector('.rail-title'); const buttons = [...p.querySelectorAll('.rail-button')]; return { width: p.offsetWidth, expandFirst: buttons[0] === expand, title: title?.textContent.trim(), icons: buttons.every((b) => b.querySelector('svg')) }; })()`);
    assert.ok(rail.width < 80 && rail.expandFirst && rail.title && rail.icons, JSON.stringify(rail));
    await app.main.click('#left-panel .rail-button.expand');
    await app.main.click('#right-panel .panel-header [data-command="rightPanel"]');
    await sleep(300);
    assert.ok(await app.main.eval(`document.querySelector('#right-panel .rail-title') && document.querySelector('#right-panel .rail-button.expand') === document.querySelector('#right-panel .rail-button')`));
    await app.main.click('#right-panel .rail-button.expand');
    await sleep(300);
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
    const clipped = await app.main.eval(`[...document.querySelectorAll('#left-panel .stencil-toggle span, #left-panel .panel-header span, #left-panel .small-button span')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent)`);
    assert.deepEqual(clipped, [], 'all labels fit at the minimum width');
  } },
  { group: '탭', name: '드로잉은 탭 대신 메뉴바의 이름: 여러 개면 개수, 눌러서 바꾸기 (실제 클릭)', async run(app) {
    await freshSample(app);
    await W(app, `(() => { a.newDrawing(); a.newDrawing(); return 1; })()`);
    await sleep(400);
    const before = await app.main.eval(`({ count: document.querySelector('#doc-title .doc-title-count').textContent, name: document.querySelector('#doc-title .doc-title-name').textContent, tabs: document.querySelectorAll('.tab[data-doc]').length })`);
    assert.equal(before.count, '3');
    assert.equal(before.tabs, 0);
    const first = await W(app, 'w.state.docs[0].id');
    await app.main.click('#doc-title');
    const menu = await app.popup('menu');
    await menu.waitFor(`document.querySelectorAll('.menu-item[data-id^="custom:doc:"]').length === 3`);
    await sleep(200);
    await menu.click(`[data-id="custom:doc:${first}"]`);
    menu.close();
    await sleep(400);
    assert.equal(await W(app, 'w.state.active'), first);
    assert.notEqual(await app.main.eval(`document.querySelector('#doc-title .doc-title-name').textContent`), before.name);
    await W(app, closeAllDocs);
  } },
  { group: '창', name: '홈 화면은 좌우 패널을 모두 숨겨도 창 전체 폭을 씀', async run(app) {
    await closePopups(app);
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

  // ───────────────────────── views
  ...VIEWS.map((view) => ({ group: '보기', name: `${view} 보기가 그려짐`, async run(app) {
    await freshSample(app);
    app.main.errors.length = 0;
    await W(app, `a.switchView('${view}')`);
    await sleep(600);
    const filled = await app.main.eval(`(() => { const host = document.querySelector('#view-host'); return host.innerText.trim().length > 30 && host.querySelectorAll('*').length > 30; })()`);
    assert.ok(filled, 'the view has content');
    assert.deepEqual(await app.main.eval(CLIP_CHECK), [], 'nothing in the window is cut off');
    assert.deepEqual(app.main.errors, []);
    await noErrorPopup(app, view);
  } })),
  { group: '보기', name: '보고서: 모든 보고서가 그려짐', async run(app) {
    await freshSample(app);
    await W(app, `a.switchView('reports')`);
    await sleep(300);
    const reports = await app.main.eval(`[...new Set([...document.querySelectorAll('[data-report]')].map((b) => b.dataset.report))]`);
    assert.ok(reports.length >= 5, JSON.stringify(reports));
    for (const id of reports) {
      await app.main.click(`[data-report="${id}"]`);
      await sleep(150);
      assert.ok(await app.main.eval(`document.querySelector('#view-host').innerText.trim().length > 20`), id);
    }
    await noErrorPopup(app, 'reports');
  } },
  { group: '보기', name: '페이지 보기: 페이지 카드를 두 번 누르면 그 페이지의 그리기 보기', async run(app) {
    await freshSample(app);
    await W(app, `a.switchView('pages')`);
    await sleep(400);
    const pages = await W(app, 'api.doc().doc.pages.filter((p) => !p.background).length');
    assert.ok(pages >= 2, `${pages} pages in the sample`);
    const cards = await app.main.eval(`document.querySelectorAll('#view-host .page-card').length`);
    assert.ok(cards >= pages, `a card per page (${cards})`);
    const target = await app.main.eval(`(() => { const cards = [...document.querySelectorAll('#view-host .page-card:not(.background)')]; const c = cards[1]; const r = c.getBoundingClientRect(); return { id: c.dataset.page, x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await app.main.realClick(target.x, target.y);
    await app.main.realClick(target.x, target.y, { clickCount: 2 });
    await sleep(400);
    assert.equal(await W(app, 'api.doc().view.id'), 'drawing');
    assert.equal(await W(app, 'api.page().id'), target.id);
  } },
  { group: '보기', name: '프레젠테이션: F5 로 시작, 페이지 넘김, Esc 로 끝', async run(app) {
    await freshSample(app);
    await app.main.eval(`document.querySelector('.canvas-scroll').focus(); 1`);
    await app.main.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'F5', code: 'F5', windowsVirtualKeyCode: 116, nativeVirtualKeyCode: 116 });
    await app.main.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F5', code: 'F5', windowsVirtualKeyCode: 116, nativeVirtualKeyCode: 116 });
    await app.main.waitFor(`!document.querySelector('#presentation').hidden`, { message: 'F5 starts the presentation' });
    const first = await app.main.eval(`document.querySelector('#presentation .present-bar span').textContent`);
    await W(app, `(a.presentStep(1), 1)`);
    await sleep(300);
    assert.notEqual(await app.main.eval(`document.querySelector('#presentation .present-bar span').textContent`), first, 'the next page shows');
    await app.main.key('Escape');
    await app.main.waitFor(`document.querySelector('#presentation').hidden`, { message: 'Esc ends the presentation' });
    await sleep(400);
    assert.equal(await W(app, 'w.state.presenting ?? false'), false);
  } },

  // ───────────────────────── install
  { group: '설치', name: '새로 설치한 뒤 첫 실행: 설정은 기본값으로, 최근 파일·DB 연결·배경 이미지는 그대로 (한 번만)', async run(app) {
    const marker = path.join(app.config, 'install-reset');
    const recent = JSON.stringify([{ path: 'D:\\drawings\\kept.mdg', title: 'kept' }]);
    await W(app, closeAllDocs);
    await app.main.eval(`(localStorage.setItem('mydiagram.recent.v1', ${JSON.stringify(recent)}), 1)`);
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
    assert.equal(await app.main.eval(`localStorage.getItem('mydiagram.recent.v1')`), recent, 'recent files stay');
    assert.equal(fs.existsSync(marker), false, 'the marker is used up');
    await W(app, `(a.updateSettings({ zoom: 120 }), 1)`);
    await quitAndStart();
    assert.equal((await settings()).zoom, 120, 'once only: later starts keep what the user sets');
    await W(app, `(a.updateSettings({ zoom: 100, dbKind: 'none', dbHost: 'localhost', backgroundName: '' }), 1)`);
    await app.main.eval(`(localStorage.removeItem('mydiagram.recent.v1'), 1)`);
  } },

  // ───────────────────────── files
  { group: '파일', name: 'DB를 설정하면 저장은 파일과 DB 둘 다 (SQLite)', async run(app) {
    await freshSample(app);
    const dir = tempDir('both');
    const dbFile = path.join(dir, '드로잉 DB.sqlite');
    const file = path.join(dir, 'both.mdg');
    await W(app, `a.updateSettings({ dbKind: 'sqlite', dbFile: ${JSON.stringify(dbFile)} })`);
    try {
      await sleep(200);
      assert.match(await app.main.eval(`document.querySelector('[data-command="save"]').title`), /SQLite/, 'the Save tooltip names the database');
      await W(app, `(a.setShapeText(api.page().shapes.find((s) => s.type === 'shape').id, 'DB와 파일'), 1)`);
      const title = await W(app, 'api.doc().doc.title');
      assert.equal(await W(app, `(window.__mydiagramSavePicks = [${JSON.stringify(file)}], a.saveDoc(a.activeDoc()))`), true);
      assert.ok(fs.existsSync(file), 'the local file');
      assert.ok(fs.readFileSync(file, 'utf8').includes('DB와 파일'));
      assert.ok(fs.existsSync(dbFile), 'the database file');
      const stored = await app.main.eval(`(async () => { const n = await import('/src/platform/native.js'); const s = await import('/src/domain/settings.js'); return (await n.dbList(s.dbConfig(window.__mydiagram.state.settings, ''))).map((p) => p.title); })()`);
      assert.ok(stored.includes(title), `the database lists the drawing ${JSON.stringify(stored)}`);
      assert.equal(await W(app, 'a.activeDoc().dirty'), false);
      // Saved again (no dialog: the file is known) — still both.
      await W(app, `(a.setShapeText(api.page().shapes.find((s) => s.type === 'shape').id, '두 번째'), 1)`);
      assert.equal(await W(app, `a.saveDoc(a.activeDoc())`), true);
      assert.ok(fs.readFileSync(file, 'utf8').includes('두 번째'));
    } finally {
      await W(app, `a.updateSettings({ dbKind: 'none', dbFile: '' })`);
    }
  } },
  { group: '파일', name: '저장(.mdg) → 열기: 같은 내용, 최근 파일·폴더에 기록', async run(app) {
    await freshSample(app);
    const dir = tempDir('files');
    const file = path.join(dir, 'saved.mdg');
    const before = await W(app, `JSON.stringify({ pages: api.doc().doc.pages.map((p) => ({ name: p.name, shapes: p.shapes.map((s) => [s.type, s.master ?? null, s.text ?? '', Math.round(s.x ?? 0), Math.round(s.y ?? 0)]) })) })`);
    await W(app, `(window.__mydiagramSavePicks = [${JSON.stringify(file)}], a.saveDoc(a.activeDoc(), { saveAs: true }))`);
    await sleep(500);
    assert.ok(fs.existsSync(file));
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(saved.format, 'mydiagram');
    assert.equal(await W(app, 'a.activeDoc().dirty'), false);
    await W(app, closeAllDocs);
    await W(app, `a.openPath(${JSON.stringify(file)})`);
    await sleep(500);
    const after = await W(app, `JSON.stringify({ pages: api.doc().doc.pages.map((p) => ({ name: p.name, shapes: p.shapes.map((s) => [s.type, s.master ?? null, s.text ?? '', Math.round(s.x ?? 0), Math.round(s.y ?? 0)]) })) })`);
    assert.equal(after, before, 'same pages, shapes, texts and places');
    const recent = await W(app, 'w.state.recent.map((r) => r.path)');
    assert.ok(recent.some((p) => p.toLowerCase() === file.toLowerCase()), 'recent file');
    assert.ok(await W(app, `w.state.recentDirs.some((d) => d.path.toLowerCase() === ${JSON.stringify(dir.toLowerCase())})`), 'recent folder');
  } },
  { group: '파일', name: '최근 파일 최대 10개, 하나씩·전체 지우기 (파일 메뉴의 최근 파일 창)', async run(app) {
    const dir = tempDir('recent');
    for (let i = 0; i < 12; i++) {
      const file = path.join(dir, `d${i}.mdg`);
      fs.writeFileSync(file, drawingFile(`D${i}`, [`도형 ${i}`]));
      await W(app, `a.openPath(${JSON.stringify(file)}, { quiet: true })`);
    }
    assert.equal(await W(app, 'w.state.recent.length'), 10);
    await W(app, `(w.run('recent'), 1)`);
    const page = await app.popup('recent');
    await expectPopupWindow(app, page, 'recent');
    const rows = await page.eval(`document.querySelectorAll('.recent-row').length`);
    assert.equal(rows, 10);
    const lines = await page.eval(`[...document.querySelectorAll('.recent-row')].map((r) => new Set([...r.querySelectorAll('.recent-name, .recent-path, button')].filter((e) => e.getClientRects().length).map((e) => { const q = e.getBoundingClientRect(); return Math.round((q.top + q.height / 2) / 8); })).size)`);
    assert.deepEqual([...new Set(lines)], [1], 'each recent file is one line: name, path, open and delete side by side');
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
  { group: '파일', name: '이미지로 내보내기 팝업: 형식·배경·영역·배율 → 선택이 내보내기에 쓰임', async run(app) {
    await freshSample(app);
    const file = path.join(tempDir('image-popup'), 'popup.webp');
    const done = W(app, `(window.__mydiagramSavePicks = [${JSON.stringify(file)}], a.exportImage())`);
    const page = await app.popup('image');
    await expectPopupWindow(app, page, 'image');
    assert.deepEqual(await page.eval(`[...document.querySelectorAll('[data-draft-segment="format"]')].map((b) => b.dataset.value)`), ['png', 'jpeg', 'webp', 'bmp', 'tiff', 'svg']);
    await page.click('[data-draft-segment="format"][data-value="jpeg"]');
    assert.ok(await page.eval(`document.querySelector('[data-draft-segment="transparent"]').closest('.row').classList.contains('disabled-row')`), 'JPEG cannot be transparent');
    await page.click('[data-draft-segment="format"][data-value="webp"]');
    await page.click('[data-draft-segment="transparent"][data-value="true"]');
    await page.click('[data-draft-segment="area"][data-value="content"]');
    await page.click('[data-draft-segment="scale"][data-value="1"]');
    const size1 = await page.eval(`document.querySelector('[data-image-size]').textContent`);
    await page.click('[data-draft-segment="scale"][data-value="3"]');
    assert.notEqual(await page.eval(`document.querySelector('[data-image-size]').textContent`), size1, 'size follows the scale');
    assert.deepEqual(await page.eval(ALIGN_CHECK), []);
    await page.click('[data-action="image-apply"]');
    page.close();
    await done;
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
    assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
  } },
  { group: '파일', name: '그림 내보내기: PNG·JPEG·WebP·BMP·TIFF·SVG, 투명 배경', async run(app) {
    await freshSample(app);
    const dir = tempDir('images');
    const magic = { png: [1, 4, 'PNG'], jpeg: [0, 3, '\xff\xd8\xff'], webp: [8, 12, 'WEBP'], bmp: [0, 2, 'BM'], tiff: [0, 4, 'II*\0'], svg: [0, 4, '<svg'] };
    const ext = { jpeg: 'jpg' };
    for (const format of Object.keys(magic)) {
      for (const transparent of format === 'jpeg' ? [false] : [true, false]) {
        const file = path.join(dir, `page-${transparent ? 'clear' : 'white'}.${ext[format] ?? format}`);
        await W(app, `(window.__mydiagramSavePicks = [${JSON.stringify(file)}], a.exportImage({ format: '${format}', transparent: ${transparent}, area: 'page', scale: 1, quality: 90 }))`);
        assert.ok(fs.existsSync(file), file);
        const bytes = fs.readFileSync(file);
        const [from, to, text] = magic[format];
        assert.equal(bytes.subarray(from, to).toString('latin1'), text, `${format} signature`);
        // Corner pixel: alpha 0 when transparent, white otherwise (checked in the page by decoding the file).
        if (format !== 'tiff') {
          const mime = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml' }[format];
          const corner = await app.main.eval(`(async () => { const img = new Image(); img.src = 'data:${mime};base64,${bytes.toString('base64')}'; await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth || 400; c.height = img.naturalHeight || 300; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return [...x.getImageData(2, 2, 1, 1).data]; })()`);
          if (transparent) assert.equal(corner[3], 0, `${format}: transparent corner ${corner}`);
          else assert.ok(corner[3] === 255 && corner[0] > 245, `${format}: white corner ${corner}`);
        } else {
          const strip = bytes.readUInt32LE(bytes.readUInt32LE(4) + 2 + 5 * 12 + 8);
          assert.equal(bytes[strip + 3], transparent ? 0 : 255, 'tiff corner alpha');
        }
      }
    }
  } },
  { group: '파일', name: 'Visio(.vsdx)·SVG·HTML·CSV·템플릿·PDF 내보내기 (파일 머리 확인)', async run(app) {
    await freshSample(app);
    const dir = tempDir('export');
    for (const [type, name] of [['vsdx', 'drawing.vsdx'], ['svg', 'page.svg'], ['html', 'drawing.html'], ['csv', 'data.csv'], ['mdgt', 'drawing.mdgt']]) {
      const file = path.join(dir, name);
      await W(app, `(window.__mydiagramSavePicks = [${JSON.stringify(file)}], a.exportAs('${type}'))`);
      for (let i = 0; i < 20 && !fs.existsSync(file); i++) await sleep(150);
      assert.ok(fs.existsSync(file), name);
    }
    const vsdx = fs.readFileSync(path.join(dir, 'drawing.vsdx'));
    assert.equal(vsdx.subarray(0, 2).toString('latin1'), 'PK', 'vsdx is a zip');
    assert.ok(vsdx.includes(Buffer.from('visio/pages/page1.xml')), 'vsdx has visio/pages/page1.xml');
    assert.ok(vsdx.includes(Buffer.from('[Content_Types].xml')), 'vsdx has [Content_Types].xml');
    assert.match(fs.readFileSync(path.join(dir, 'page.svg'), 'utf8'), /^(<\?xml[^>]*>\s*)?<svg[\s>]/);
    assert.match(fs.readFileSync(path.join(dir, 'drawing.html'), 'utf8'), /^<!doctype html>/i);
    assert.ok(fs.readFileSync(path.join(dir, 'drawing.html'), 'utf8').includes('<svg'), 'HTML has the drawings');
    assert.ok(fs.readFileSync(path.join(dir, 'data.csv'), 'utf8').split('\n').length > 2, 'CSV has rows');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'drawing.mdgt'), 'utf8')).format, 'mydiagram', 'a template is a MyDiagram file');
    const pdfFile = path.join(dir, 'drawing.pdf');
    await W(app, `(window.__mydiagramSavePicks = [${JSON.stringify(pdfFile)}], a.exportPdf())`);
    for (let i = 0; i < 40 && !fs.existsSync(pdfFile); i++) await sleep(150);
    const pdf = fs.readFileSync(pdfFile);
    assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.match(pdf.subarray(-8).toString('latin1'), /%%EOF\s*$/);
    const pages = await W(app, 'api.doc().doc.pages.filter((p) => !p.background).length');
    const count = Number(/\/Count (\d+)/.exec(pdf.toString('latin1'))?.[1] ?? 0);
    assert.ok(count >= pages, `PDF has a page per drawing page (${count} ≥ ${pages})`);
    const png = path.join(dir, 'page.png');
    await W(app, `(window.__mydiagramSavePicks = [${JSON.stringify(png)}], a.exportImage({ format: 'png', transparent: false, area: 'page', scale: 2 }))`);
    assert.deepEqual([...fs.readFileSync(png).subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'PNG signature');
  } },
  { group: '파일', name: 'Visio(.vsdx)로 내보낸 파일을 다시 열면 같은 페이지·도형·연결선', async run(app) {
    await freshSample(app);
    const file = path.join(tempDir('vsdx'), 'round.vsdx');
    const pageCounts = async () => W(app, `api.doc().doc.pages.map((p) => [p.shapes.filter((s) => s.type === 'shape').length, p.shapes.filter((s) => s.type === 'connector').length])`);
    const before = await pageCounts();
    const texts = await W(app, `api.page().shapes.map((s) => s.text).filter(Boolean).sort()`);
    await W(app, `(window.__mydiagramSavePicks = [${JSON.stringify(file)}], a.exportAs('vsdx'))`);
    for (let i = 0; i < 20 && !fs.existsSync(file); i++) await sleep(150);
    await W(app, closeAllDocs);
    await W(app, `a.openPath(${JSON.stringify(file)})`);
    await sleep(600);
    await noErrorPopup(app, 'open vsdx');
    assert.equal(await W(app, 'w.state.docs.length'), 1, 'opened in a tab');
    assert.deepEqual(await pageCounts(), before, 'same shapes and connectors on every page');
    assert.deepEqual(await W(app, `api.page().shapes.map((s) => s.text).filter(Boolean).sort()`), texts, 'same texts');
  } },
  { group: '파일', name: '오래 걸리는 파일 작업은 진행 팝업 (진행률 막대)', async run(app) {
    await app.restart([], { MYDIAGRAM_IO_DELAY_MS: '1200' });
    await app.popup('welcome', 3000).then((p) => p.close()).catch(() => {});
    await closePopups(app);
    const dir = tempDir('slow');
    const file = path.join(dir, 'big.mdg');
    fs.writeFileSync(file, drawingFile('Big', Array.from({ length: 3000 }, (_, i) => `Shape ${i} ${'x'.repeat(200)}`)));
    app.main.eval(`window.__mydiagram.actions.openPath(${JSON.stringify(file)}).then(() => 1)`).catch(() => {});
    const page = await app.popup('progress', 20000);
    await expectPopupWindow(app, page, 'progress');
    await page.waitFor(`document.querySelector('#progress-percent')?.textContent.includes('%')`, { timeout: 20000 });
    page.close();
    await app.restart();
    await app.popup('welcome', 3000).then((p) => p.close()).catch(() => {});
    await closePopups(app);
  } },
  { group: '파일', name: '끌어다 놓기: 드로잉 파일은 새 탭, 이미지는 그림 도형, 텍스트는 도형', async run(app) {
    await freshSample(app);
    const dir = tempDir('drop');
    const file = path.join(dir, 'dropped.mdg');
    fs.writeFileSync(file, drawingFile('끌어 놓은 드로잉', ['하나', '둘']));
    const image = path.join(dir, 'pic.png');
    fs.writeFileSync(image, PNG_1x1);
    const tabs = await W(app, 'w.state.docs.length');
    await W(app, `a.handleDroppedPaths([${JSON.stringify(file)}, ${JSON.stringify(image)}])`);
    await sleep(800);
    assert.equal(await W(app, 'w.state.docs.length'), tabs + 1, 'the drawing opens in a new tab');
    assert.equal(await W(app, 'api.doc().doc.title'), '끌어 놓은 드로잉');
    assert.equal(await W(app, 'api.page().shapes.length'), 3, 'two shapes and the dropped picture');
    assert.equal(await W(app, 'api.page().shapes.at(-1).master'), 'image', 'the image becomes a picture shape');
    await W(app, `a.handleDroppedFiles([], '끌어온 단계 1\\n끌어온 단계 2')`);
    assert.ok(await W(app, `api.page().shapes.some((s) => s.text === '끌어온 단계 2')`), 'dropped text lines become shapes');
    assert.ok(await W(app, `api.page().shapes.some((s) => s.type === 'connector')`), 'linked in order');
    await noErrorPopup(app, 'drop');
  } },
  { group: '파일', name: '저장 안 한 변경이 있으면 끝낼 때 저장 여부를 물음 (취소하면 그대로)', async run(app) {
    await freshSample(app);
    await W(app, `(a.addShapeAt('rect', { x: 10, y: 10, w: 50, h: 40 }), 1)`);
    assert.equal(await W(app, 'a.activeDoc().dirty'), true);
    const answer = W(app, 'a.confirmExit()');
    const page = await app.popup('confirm');
    await expectPopupWindow(app, page, 'confirm');
    const buttons = await page.eval(`[...document.querySelectorAll('[data-action="choice"]')].map((b) => b.dataset.value)`);
    assert.deepEqual(buttons.sort(), ['cancel', 'discard', 'save']);
    await page.click('[data-value="cancel"]');
    page.close();
    assert.equal(await answer, false, 'cancel keeps the app open');
    assert.equal(await W(app, 'w.state.docs.length'), 1, 'the drawing is still open');
  } },

  // ───────────────────────── printing
  { group: '인쇄', name: '인쇄 미리 보기: 전체/현재 페이지, 용지 방향, 바로 인쇄', async run(app) {
    await freshSample(app);
    await app.main.click('[data-command="print"]').catch(() => W(app, `(w.run('print'), 1)`));
    if (!(await app.hasPopup('print'))) await W(app, `(w.run('print'), 1)`);
    const page = await app.popup('print');
    await expectPopupWindow(app, page, 'print');
    const sheets = () => page.eval('window.__mydiagramPopup.printLayout().count');
    const all = await sheets();
    const pages = await W(app, 'api.doc().doc.pages.filter((p) => !p.background).length');
    assert.ok(all >= pages, `a sheet per page at least (${all} ≥ ${pages})`);
    assert.ok(await page.eval(`Boolean(document.querySelector('#print-preview svg'))`), 'the preview shows the page');
    await page.eval(`(() => { const r = document.querySelector('[data-print-range="current"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(150);
    assert.ok(await sheets() < all, 'the current page only');
    await page.eval(`(() => { const r = document.querySelector('[data-print-range="all"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    assert.equal(await sheets(), all);
    assert.equal(await page.eval(`document.querySelectorAll('.tabs').length`), 0, 'one column: no tabs');
    const orientation = await page.eval(`document.querySelector('[data-print-segment="orientation"].active').dataset.value`);
    const svgBox = () => page.eval(`(() => { const s = document.querySelector('#print-preview svg'); const r = s.getBoundingClientRect(); return r.width > r.height ? 'wide' : 'tall'; })()`);
    const shapeBefore = await svgBox();
    await page.click(`[data-print-segment="orientation"][data-value="${orientation === 'portrait' ? 'landscape' : 'portrait'}"]`);
    await sleep(200);
    assert.notEqual(await svgBox(), shapeBefore, 'the orientation turns the sheet');
    await page.eval(`window.__mydiagramPrintHook = (layout) => { window.__printed = layout.count; }; 1`);
    await page.click('[data-action="print"]');
    await sleep(300);
    assert.ok(await page.eval('window.__printed') >= 1, 'printed');
    page.close();
    await closePopups(app);
  } },

  // ───────────────────────── settings
  { group: '설정', name: '설정 창: 테마 탭(다크/라이트/사용자 정의), 글꼴(시스템의 모든 글꼴·크기·굵기·기울임)', async run(app) {
    await W(app, `(w.popups.open('settings', { tab: 'appearance' }), 1)`);
    const page = await app.popup('settings');
    await expectPopupWindow(app, page, 'settings');
    const tabs = await page.eval(`[...document.querySelectorAll('.tabs [data-action="tab"]')].map((t) => t.dataset.value)`);
    for (const tab of ['general', 'appearance', 'font', 'background', 'drawing', 'defaults', 'database', 'recent', 'shortcuts']) assert.ok(tabs.includes(tab), tab);
    assert.equal(await page.eval(`document.querySelectorAll('.theme-list .theme-row').length`), 20);
    await page.click('[data-theme-group="custom"]');
    assert.ok(await page.eval(`document.querySelectorAll('[data-custom-color]').length >= 10`), 'custom colours');
    await page.click('.tabs [data-value="font"]');
    await page.waitFor(`document.querySelectorAll('#font-family option').length > 20`, { timeout: 20000 });
    const family = await page.eval(`[...document.querySelectorAll('#font-family option')].map((o) => o.value).find((f) => /Arial|Malgun|맑은|Segoe/.test(f))`);
    await page.eval(`(() => { const s = document.querySelector('#font-family'); s.value = ${JSON.stringify(family)}; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await page.click('[data-setting="fontStyle"][data-value="italic"]');
    await sleep(400);
    page.close();
    const applied = await app.main.eval(`getComputedStyle(document.documentElement).getPropertyValue('--font-family') + '|' + getComputedStyle(document.documentElement).getPropertyValue('--font-style')`);
    assert.ok(applied.includes(family) && applied.includes('italic'), applied);
    await W(app, `a.updateSettings({ fontFamily: '', fontStyle: 'normal' })`);
    await closePopups(app);
  } },
  { group: '설정', name: '설정 창 › 그리기: 격자 표시를 끄면 캔버스에서 격자가 사라짐', async run(app) {
    await freshDrawing(app);
    await W(app, `a.updateSettings({ showGrid: true })`);
    await sleep(200);
    const grid = `Boolean(document.querySelector('#view-host pattern#grid-major'))`;
    assert.equal(await app.main.eval(grid), true, 'the grid is drawn');
    await W(app, `(w.popups.open('settings', { tab: 'drawing' }), 1)`);
    const page = await app.popup('settings');
    await page.waitFor(`document.querySelector('[data-toggle="showGrid"]')`);
    assert.equal(await page.eval(`document.querySelector('[data-toggle="showGrid"]').checked`), true);
    await page.eval(`(() => { const c = document.querySelector('[data-toggle="showGrid"]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(400);
    page.close();
    await closePopups(app);
    assert.equal(await W(app, 'w.state.settings.showGrid'), false);
    assert.equal(await app.main.eval(grid), false, 'the grid is gone from the canvas');
    await W(app, `a.updateSettings({ showGrid: true })`);
  } },
  { group: '설정', name: '설정은 다음 실행 때 다시 읽힘', async run(app) {
    await W(app, `a.updateSettings({ theme: 'dracula', gridSize: 'fine', language: 'en', showRightPanel: false })`);
    const animationBefore = await W(app, 'w.state.settings.animation');
    await sleep(300);
    await app.quit();
    await app.launch();
    await app.popup('welcome', 3000).then((p) => p.close()).catch(() => {});
    const s = await W(app, `({ theme: w.state.settings.theme, gridSize: w.state.settings.gridSize, language: w.state.settings.language, right: w.state.settings.showRightPanel, offered: w.state.settings.tutorialOffered })`);
    assert.deepEqual(s, { theme: 'dracula', gridSize: 'fine', language: 'en', right: false, offered: true });
    assert.match(await app.main.eval(`document.querySelector('[data-menu="file"]').textContent`), /File/);
    assert.notEqual(await W(app, 'w.state.settings.animation'), animationBefore, 'every start picks another moving background');
    await W(app, `a.updateSettings({ theme: 'light', gridSize: 'normal', language: 'ko', showRightPanel: true })`);
  } },

  // ───────────────────────── errors
  { group: '오류', name: '오류는 팝업으로 자세히, 내용 복사 가능', async run(app) {
    const dir = tempDir('bad');
    const file = path.join(dir, 'broken.mdg');
    fs.writeFileSync(file, '{ not json');
    await W(app, `a.openPath(${JSON.stringify(file)})`);
    const page = await app.popup('error');
    await expectPopupWindow(app, page, 'error');
    const report = await page.eval(`document.querySelector('#error-detail').value`);
    assert.match(report, /broken\.mdg/);
    assert.match(report, /JSON|MyDiagram/);
    await page.click('[data-action="copy-error"]');
    await sleep(400);
    assert.ok(getClipboard().includes('broken.mdg'), 'copied to the clipboard');
    page.close();
    await closePopups(app);
  } },
  { group: '오류', name: '백엔드 심각한 오류(패닉)도 위치·스레드·백트레이스와 함께 팝업', async run(app) {
    await app.main.eval(`window.__TAURI_INTERNALS__.invoke('raise_test_panic').then(() => 1)`);
    const page = await app.popup('error');
    const report = await page.eval(`document.querySelector('#error-detail').value`);
    assert.match(report, /test panic/);
    assert.match(report, /lib\.rs/);
    page.close();
    await closePopups(app);
  } },

  // ───────────────────────── help
  { group: '도움말', name: '튜토리얼 문서를 프로그램 안에서 읽기 (홈 화면 항목)', async run(app) {
    await W(app, '(a.showStartPage(true), 1)');
    await sleep(300);
    assert.ok(await app.main.eval(`Boolean(document.querySelector('#start-page [data-start="tutorial-doc"]'))`), 'the start page lists the tutorial document');
    await app.main.click('#start-page [data-start="tutorial-doc"]');
    await app.main.waitFor(`document.querySelectorAll('[data-reader-chapter] option').length > 5`, { timeout: 15000 });
    const doc = await app.main.eval(`(() => { const d = document.querySelector('.reader-frame').contentDocument; return { shown: !document.querySelector('#reader-page').hidden, h1: d.querySelector('h1').textContent, steps: d.querySelectorAll('h3').length, images: d.images.length, raw: d.body.innerText.includes('<a id='), chapters: [...document.querySelectorAll('[data-reader-chapter] option')].slice(1).map((o) => o.textContent) }; })()`);
    assert.ok(doc.shown);
    assert.match(doc.h1, /MyDiagram/);
    const steps = await app.main.eval(`window.__mydiagram.domain.tutorialSteps()`);
    assert.equal(doc.steps, steps, 'every tutorial step is in the document');
    assert.equal(doc.images, steps, 'with a picture each');
    assert.equal(doc.raw, false, 'no raw HTML shows as text');
    assert.ok(doc.chapters.every((c) => !c.endsWith('#')), JSON.stringify(doc.chapters));
    await app.main.eval(`(() => { const s = document.querySelector('[data-reader-chapter]'); s.value = s.options[4].value; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await sleep(300);
    assert.ok(await app.main.eval(`document.querySelector('.reader-frame').contentWindow.scrollY > 200`), 'a chapter can be picked');
    await app.main.click('[data-reader="lang"][data-value="en"]');
    await app.main.waitFor(`/tutorial/i.test(document.querySelector('.reader-frame').contentDocument?.querySelector('h1')?.textContent ?? '')`, { timeout: 10000 });
    assert.deepEqual(await app.main.eval(CLIP_CHECK), []);
    await app.main.click('[data-reader="home"]');
    await sleep(300);
    assert.deepEqual(await app.main.eval(`[!document.querySelector('#reader-page').hidden, !document.querySelector('#start-page').hidden]`), [false, true], 'Home goes back to the start page');
  } },
  { group: '도움말', name: '사용 설명서 열기 (설치된 문서)', async run(app) {
    const log = path.join(tempDir('open'), 'open.log');
    await app.restart([], { MYDIAGRAM_OPEN_LOG: log });
    await app.popup('welcome', 3000).then((p) => p.close()).catch(() => {});
    await W(app, `(w.run('userGuide'), 1)`);
    await sleep(800);
    assert.match(fs.readFileSync(log, 'utf8'), /UsersGuide(\.en)?\.html/);
    await app.restart();
    await app.popup('welcome', 3000).then((p) => p.close()).catch(() => {});
  } },
  { group: '도움말', name: '튜토리얼: 시작·다음·끝내면 원래대로', async run(app) {
    await freshSample(app);
    const docs = await W(app, 'w.state.docs.length');
    await W(app, 'a.startTutorial()');
    await app.main.waitFor(`window.__mydiagram.tutorial().state().active && !window.__mydiagram.tutorial().state().busy`);
    assert.ok(await app.main.eval(`Boolean(document.querySelector('.tour-card') && document.querySelector('.tour-outline'))`));
    for (let i = 0; i < 6; i++) {
      await app.main.click('[data-tour="next"]');
      await app.main.waitFor(`window.__mydiagram.tutorial().state().index === ${i + 1} && !window.__mydiagram.tutorial().state().busy`, { timeout: 30000 });
    }
    assert.equal(await W(app, 'w.state.docs.length'), docs + 1, 'the tutorial works on its own sample tab');
    await app.main.key('Escape');
    await sleep(800);
    assert.equal(await W(app, 'w.state.docs.length'), docs, 'its tab closed');
    assert.equal(await app.main.eval(`Boolean(document.querySelector('#tutorial-layer.active'))`), false);
    await noErrorPopup(app, 'tutorial');
  } },
];
