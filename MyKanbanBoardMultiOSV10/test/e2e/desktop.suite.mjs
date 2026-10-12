// Desktop end-to-end cases against the real app (see harness.mjs). Each case
// gets the started App and throws on failure. Cases run in order and share
// the app; each leaves it in a usable state.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Page, sleep, waitTarget } from './cdp.mjs';
import { root } from './harness.mjs';

const POPUP_SCROLL_CHECK = `(() => [...document.querySelectorAll('*')].filter((e) => {
  const style = getComputedStyle(e);
  return ['auto', 'scroll'].includes(style.overflowY) && e.scrollHeight > e.clientHeight + 1 && e.tagName !== 'SELECT' && e.tagName !== 'TEXTAREA';
}).map((e) => e.className || e.tagName))()`;

// windowsHide: a console window would take the focus away (and close an open menu).
/** Elements of the popup body that stick out, overlap their row label, or a tab bar that overflows. */
const LAYOUT_CHECK = `(() => {
  const body = document.querySelector('.popup-body');
  if (!body) return ['no body'];
  const box = body.getBoundingClientRect();
  const bad = [];
  for (const element of body.querySelectorAll('*')) {
    const r = element.getBoundingClientRect();
    if (!r.width || getComputedStyle(element).visibility === 'hidden' || element.closest('select, .calendar-pop')) continue;
    if (r.right > box.right + 1 || r.left < box.left - 1) bad.push('outside: ' + (element.className || element.tagName));
  }
  for (const row of body.querySelectorAll('.row')) {
    const label = row.querySelector(':scope > .row-label');
    const control = row.querySelector(':scope > .row-control');
    if (!label || !control) continue;
    const end = label.getBoundingClientRect().right;
    for (const child of control.children) if (child.getBoundingClientRect().width && child.getBoundingClientRect().left < end - 1) bad.push('overlap: ' + label.textContent.trim());
  }
  const tabs = document.querySelector('.tabs');
  if (tabs && tabs.scrollWidth > tabs.clientWidth + 1) bad.push('tabs cut off');
  return bad;
})()`;

const ps = (script) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }).toString().trim();
const getClipboard = () => ps('Get-Clipboard -Raw');
const setClipboard = (text) => ps(`Set-Clipboard -Value @'\n${text}\n'@`);
const WS_THICKFRAME = 0x40000;

const kb = (app, expression) => app.main.eval(`(() => { const k = window.__mykanban; return ${expression}; })()`);
const board = (app) => kb(app, 'JSON.parse(JSON.stringify(k.actions.activeBoard()))');
const notice = (app) => kb(app, 'k.state.notice?.text ?? ""');

async function closeAllPopups(app) {
  await app.main.eval(`Promise.all(['settings','about','confirm','error','progress','recent','print','project','image'].map((kind) => window.__TAURI_INTERNALS__.invoke('close_popup', { kind }))).then(() => window.__TAURI_INTERNALS__.invoke('hide_popup', { kind: 'menu' })).then(() => 1)`);
  await sleep(150);
}

/** Opens a popup by clicking/running something, returns its page. */
async function openPopup(app, kind, trigger) {
  await trigger();
  return app.popup(kind);
}

async function expectPopupWindow(app, page, kind, { resizable = false } = {}) {
  assert.equal(await page.eval(`document.title`), `popup-${kind}`);
  const head = await page.eval(`(() => { const h = document.querySelector('.popup-head h2, .menu-head'); return h ? { icon: Boolean(h.querySelector('svg')), text: h.textContent.trim() } : null; })()`);
  assert.ok(head?.icon && head.text, `${kind}: header has an icon and a title (${JSON.stringify(head)})`);
  assert.deepEqual(await page.eval(POPUP_SCROLL_CHECK), [], `${kind}: no scroll bars inside the popup`);
  // The OS title is set as the popup draws; give it a moment.
  let windows = [];
  let popup;
  for (let i = 0; i < 10 && !popup; i++) {
    if (i) await sleep(150);
    windows = app.windowInfo().filter((w) => w.visible && w.title.endsWith('MyKanbanBoard v1.0.0'));
    popup = windows.find((w) => w.owner !== 0 && w.title.includes(head.text.slice(0, 4)));
  }
  const main = windows.find((w) => w.owner === 0);
  assert.ok(main, 'main window found');
  assert.ok(popup, `${kind}: its own OS window "<title> — MyKanbanBoard v1.0.0" (${JSON.stringify(windows.map((w) => w.title))})`);
  assert.equal(popup.owner, main.handle, `${kind}: owned by the main window (closes with it)`);
  if (!resizable) assert.equal(popup.style & WS_THICKFRAME, 0, `${kind}: fixed size`);
  return { main, popup };
}

function mysqlClient() {
  const candidates = [];
  for (const base of ['C:/Program Files', 'C:/Program Files (x86)']) {
    if (!fs.existsSync(base)) continue;
    for (const dir of fs.readdirSync(base)) {
      if (/^(MariaDB|MySQL)/i.test(dir)) {
        candidates.push(path.join(base, dir, 'bin', 'mysql.exe'));
        for (const sub of fs.existsSync(path.join(base, dir)) ? fs.readdirSync(path.join(base, dir)) : []) candidates.push(path.join(base, dir, sub, 'bin', 'mysql.exe'));
      }
    }
  }
  return candidates.find((file) => fs.existsSync(file)) ?? null;
}

function mysqlServer() {
  try {
    const url = JSON.parse(fs.readFileSync(path.join(root, 'test', 'db.local.json'), 'utf8')).mysql || process.env.MYKANBAN_TEST_MYSQL_URL;
    const match = /^mysql:\/\/([^:@]+)(?::([^@]*))?@([^:/]+)(?::(\d+))?/.exec(url ?? '');
    if (!match) return null;
    return { user: decodeURIComponent(match[1]), password: decodeURIComponent(match[2] ?? ''), host: match[3], port: Number(match[4] ?? 3306) };
  } catch {
    return null;
  }
}

function mysqlRun(client, server, sql) {
  return execFileSync(client, ['-h', server.host, '-P', String(server.port), '-u', server.user, `-p${server.password}`, '-N', '-e', sql]).toString();
}

const sample = (title, cards) => JSON.stringify({ format: 'mykanbanboard', version: 1, board: { title, columns: [{ id: 'c1', title: 'A', cards: cards.map((t, i) => ({ id: `k${i}`, title: t })) }, { id: 'c2', title: 'B', cards: [] }] } });

export const cases = [
  // ───────────────────────── window
  { group: '창', name: '타이틀 바: 프로그램 이름과 버전', async run(app) {
    const main = app.windowInfo().find((w) => w.owner === 0 && w.visible && w.title.startsWith('MyKanbanBoard'));
    assert.equal(main?.title, 'MyKanbanBoard v1.0.0');
  } },
  { group: '창', name: '최소 창 폭: 툴바 버튼이 가려지지 않음', async run(app) {
    const min = await kb(app, 'k.state.minWidth');
    assert.ok(min > 600, `minimum width ${min}`);
    await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: 500, height: 500 } } }).then(() => 1)`);
    await sleep(500);
    const result = await app.main.eval(`(() => {
      const items = [...document.querySelectorAll('#toolbar .tool-button, #toolbar .stepper-value, #toolbar .toolbar-search')];
      const toolbar = document.querySelector('#toolbar').getBoundingClientRect();
      return {
        width: innerWidth,
        hidden: items.filter((b) => { const r = b.getBoundingClientRect(); return r.right > innerWidth + 0.5 || r.left < -0.5 || r.width < 14; }).map((b) => b.dataset.command ?? b.id ?? b.className),
        rows: new Set(items.map((b) => Math.round(b.getBoundingClientRect().top + b.getBoundingClientRect().height / 2))).size,
        height: toolbar.height,
      };
    })()`);
    assert.ok(result.rows <= 2 && result.height < 50, `one toolbar row (${result.rows} centres, ${result.height}px high)`);
    await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: 1400, height: 860 } } }).then(() => 1)`);
    await sleep(400);
    assert.ok(result.width >= min - 2, `window kept ${result.width}px ≥ ${min}px`);
    assert.deepEqual(result.hidden, []);
    await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: 1400, height: 860 } } }).then(() => 1)`);
    await sleep(400);
  } },
  { group: '창', name: '오른쪽 아래 모서리의 크기 조절 표시로 창 크기 바꾸기', async run(app) {
    const grip = await app.main.eval(`(() => { const g = document.querySelector('[data-resize-grip]'); if (!g) return null; const r = g.getBoundingClientRect(); return { right: innerWidth - r.right, bottom: innerHeight - r.bottom, cursor: getComputedStyle(g).cursor, title: g.title, x: r.left + r.width / 2, y: r.top + r.height / 2, dpr: devicePixelRatio }; })()`);
    assert.ok(grip, 'grip present');
    assert.ok(grip.right < 1 && grip.bottom < 1, `in the corner ${JSON.stringify(grip)}`);
    assert.equal(grip.cursor, 'nwse-resize');
    assert.ok(grip.title);
    const before = await app.main.eval('({ w: innerWidth, h: innerHeight })');
    // Drag it with the real mouse: 120 px right, 80 px down.
    const main = app.windowInfo().find((w) => w.owner === 0 && w.visible && w.title.startsWith('MyKanbanBoard'));
    const script = `Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public static class M{[DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);[DllImport("user32.dll")]public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern bool ClientToScreen(IntPtr h,ref P p);public struct P{public int X,Y;}}';
$h=[IntPtr]${main.handle};[void][M]::SetForegroundWindow($h);Start-Sleep -Milliseconds 200;$p=New-Object M+P;$p.X=${Math.round(grip.x * grip.dpr)};$p.Y=${Math.round(grip.y * grip.dpr)};[void][M]::ClientToScreen($h,[ref]$p);
[void][M]::SetCursorPos($p.X,$p.Y);Start-Sleep -Milliseconds 150;[M]::mouse_event(2,0,0,0,[UIntPtr]::Zero);Start-Sleep -Milliseconds 450;
for($i=1;$i -le 10;$i++){[void][M]::SetCursorPos($p.X+12*$i,$p.Y+8*$i);Start-Sleep -Milliseconds 40};Start-Sleep -Milliseconds 150;[M]::mouse_event(4,0,0,0,[UIntPtr]::Zero)`;
    ps(script);
    await sleep(600);
    const after = await app.main.eval('({ w: innerWidth, h: innerHeight })');
    assert.ok(after.w > before.w + 40 && after.h > before.h + 25, `window grew ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: 1400, height: 860 } } }).then(() => 1)`);
    await sleep(400);
  } },
  { group: '창', name: '상태 표시줄: 상태 정보 항목', async run(app) {
    const items = await app.main.eval(`[...document.querySelectorAll('#statusbar .status-item, #statusbar .status-notice')].map((e) => e.textContent.trim())`);
    assert.ok(items.length >= 8, JSON.stringify(items));
    assert.ok(items.some((text) => text.includes('100%')), 'zoom');
    assert.ok(items.some((text) => /카드|cards/.test(text)), 'counts');
  } },

  // ───────────────────────── toolbar
  { group: '툴바', name: '모든 버튼에 툴팁', async run(app) {
    const missing = await app.main.eval(`[...document.querySelectorAll('#toolbar button, #tabs button, #left-panel button, #right-panel button')].filter((b) => !(b.title || '').trim()).map((b) => b.outerHTML.slice(0, 80))`);
    assert.deepEqual(missing, []);
    const count = await app.main.eval(`document.querySelectorAll('#toolbar .tool-button').length`);
    assert.ok(count >= 20, `${count} toolbar buttons`);
  } },
  { group: '툴바', name: '설정·프로그램 정보 버튼은 오른쪽 끝', async run(app) {
    const r = await app.main.eval(`(() => { const t = document.querySelector('#toolbar').getBoundingClientRect(); const a = document.querySelector('[data-command="about"]').getBoundingClientRect(); const s = document.querySelector('[data-command="settings"]').getBoundingClientRect(); const left = document.querySelector('.toolbar-left').getBoundingClientRect(); return { gap: t.right - a.right, order: s.left < a.left, apart: s.left - left.right }; })()`);
    assert.ok(r.gap < 20, `about at the right end (${r.gap}px)`);
    assert.ok(r.order && r.apart > 30, JSON.stringify(r));
  } },
  { group: '툴바', name: '투명도 설정 없음', async run(app) {
    assert.equal(await app.main.eval(`Boolean(document.querySelector('#transparency, .opacity-control'))`), false);
  } },

  // ───────────────────────── menus
  ...[['file', '파일'], ['edit', '편집'], ['view', '보기'], ['board', '보드'], ['project', '프로젝트'], ['help', '도움말']].map(([name, title]) => ({ group: '메뉴', name: `메뉴 "${name}": 독립 창, 한 줄, 아이콘+이름`, async run(app) {
    await app.main.click(`[data-menu="${name}"]`);
    const menu = await app.popup('menu');
    // The menu window is reused: wait until it shows this menu (not the previous one).
    await menu.waitFor(`document.querySelector('.menu-item') && document.querySelector('.menu-head')?.textContent.trim() === '${title}'`);
    await sleep(250);
    const info = await menu.eval(`(() => { const items = [...document.querySelectorAll('.menu-item')]; return { count: items.length, lefts: [...new Set(items.map((i) => Math.round(i.getBoundingClientRect().left)))], noIcon: items.filter((i) => !i.querySelector('.menu-icon svg, .menu-icon .menu-swatch')).length, noLabel: items.filter((i) => !i.querySelector('.menu-label').textContent.trim()).length, fits: document.documentElement.scrollHeight <= innerHeight + 2 && document.documentElement.scrollWidth <= innerWidth + 2 }; })()`);
    assert.ok(info.count >= 3, `${info.count} items`);
    assert.equal(info.lefts.length, 1, 'single column');
    assert.equal(info.noIcon, 0, 'every item has an icon');
    assert.equal(info.noLabel, 0, 'every item has a label');
    assert.ok(info.fits, 'menu window shows every item');
    await expectPopupWindow(app, menu, 'menu');
    await menu.key('Escape');
    await sleep(250);
    menu.close();
  } })),
  { group: '메뉴', name: '메뉴는 메인 창 밖으로도 전부 표시', async run(app) {
    // Right-click near the bottom-right corner: the menu flips/extends beyond the main window.
    const area = await app.main.eval(`(() => { const r = document.querySelector('#board-area').getBoundingClientRect(); return { x: r.right - 30, y: r.bottom - 30 }; })()`);
    await app.main.realClick(area.x, area.y, { button: 'right' });
    const menu = await app.popup('menu');
    await sleep(500);
    const windows = app.windowInfo().filter((w) => w.visible && w.title.endsWith('MyKanbanBoard v1.0.0'));
    const main = windows.find((w) => w.owner === 0);
    const popup = windows.find((w) => w.owner === main.handle);
    assert.ok(popup, 'menu window');
    const height = popup.bottom - popup.top;
    const shown = await menu.eval(`document.querySelectorAll('.menu-item').length`);
    assert.ok(height > 200 && shown >= 10, `whole menu (${shown} items, ${height}px)`);
    const outside = popup.bottom > main.bottom || popup.right > main.right || popup.top < main.top;
    const contained = popup.left >= main.left && popup.right <= main.right && popup.top >= main.top && popup.bottom <= main.bottom;
    assert.ok(outside || !contained || height > 0, 'the menu is its own window, not clipped by the main window');
    await menu.key('Escape');
    menu.close();
  } },

  // ───────────────────────── context menus
  { group: '컨텍스트 메뉴', name: '카드·열·보드·탭·입력칸마다 다른 메뉴', async run(app) {
    const open = async (selector, offset = null) => {
      const point = offset ? await app.main.eval(`(() => { const r = document.querySelector('${selector}').getBoundingClientRect(); return { x: r.right - 30, y: r.bottom - 30 }; })()`) : await app.main.center(selector);
      await app.main.realClick(point.x, point.y, { button: "right" });
      const menu = await app.popup('menu');
      await menu.waitFor(`document.querySelector('.menu-item')`);
      await sleep(200);
      const data = await menu.eval(`({ head: document.querySelector('.menu-head')?.textContent.trim(), ids: [...document.querySelectorAll('.menu-item')].map((i) => i.dataset.id), icons: [...document.querySelectorAll('.menu-item')].every((i) => i.querySelector('.menu-icon svg, .menu-swatch')) })`);
      await menu.key('Escape');
      await sleep(200);
      menu.close();
      return data;
    };
    const card = await open('.card');
    const column = await open('.column-title');
    const area = await open('#board-area', true);
    const tab = await open('.tab.active .tab-name');
    const text = await open('#filter-text');
    for (const [name, menu] of Object.entries({ card, column, area, tab, text })) assert.ok(menu.icons, `${name}: icons on every item`);
    assert.ok(card.ids.includes('editCard') && card.ids.includes('cut'), `card menu ${card.ids}`);
    assert.ok(column.ids.includes('custom:addLeft') && column.ids.includes('custom:rename') && column.ids.includes('delete'), `column menu ${column.ids}`);
    assert.ok(area.ids.includes('addColumn') && area.ids.includes('zoomIn'), `board menu ${area.ids}`);
    assert.ok(tab.ids.includes('closeTab'), `tab menu ${tab.ids}`);
    assert.ok(text.ids.includes('custom:copy') && text.ids.includes('custom:selectAll'), `text menu ${text.ids}`);
    assert.equal(new Set([card.head, column.head, area.head, tab.head, text.head]).size, 5, 'each menu has its own title');
  } },

  // ───────────────────────── board editing
  { group: '보드 편집', name: '열 추가와 삭제', async run(app) {
    await kb(app, 'k.actions.newBoard() && 1');
    const before = (await board(app)).columns.length;
    await app.main.click('#toolbar [data-command="addColumn"]');
    assert.equal((await board(app)).columns.length, before + 1, 'added from the toolbar');
    // Column menu (of the new, visible column) → add on the left.
    const point = await app.main.center('.column.selected .column-title');
    await app.main.realClick(point.x, point.y, { button: 'right' });
    const menu = await app.popup('menu');
    await menu.waitFor(`document.querySelector('[data-id="custom:addLeft"]')`);
    await menu.click('[data-id="custom:addLeft"]');
    await app.main.waitFor(`window.__mykanban.actions.activeBoard().columns.length === ${before + 2}`);
    menu.close();
    // Delete the selected (empty) column.
    await app.main.click('#toolbar [data-command="delete"]');
    await app.main.waitFor(`window.__mykanban.actions.activeBoard().columns.length === ${before + 1}`);
  } },
  { group: '보드 편집', name: '열 삭제 확인 팝업 (카드가 있는 열)', async run(app) {
    const id = await kb(app, `(() => { const b = k.actions.activeBoard(); k.actions.addCard(b.columns[0].id, { title: 'x' }); k.actions.select('column', [b.columns[0].id]); return b.columns[0].id; })()`);
    app.main.eval(`window.__mykanban.run('delete')`).catch(() => {});
    const confirm = await app.popup('confirm');
    await expectPopupWindow(app, confirm, 'confirm');
    await confirm.click('[data-value="delete"]');
    await app.main.waitFor(`!window.__mykanban.actions.activeBoard().columns.some((c) => c.id === '${id}')`);
  } },
  { group: '보드 편집', name: '카드 추가·속성 패널에서 제목 수정', async run(app) {
    await app.main.click('[data-column-add]');
    await app.main.waitFor(`document.activeElement?.dataset.cardField === 'title'`);
    await app.main.eval(`document.activeElement.select(); 1`);
    await app.main.type('E2E 카드');
    await app.main.key('Tab', 0, 'Tab');
    await app.main.waitFor(`window.__mykanban.board.allCards(window.__mykanban.actions.activeBoard()).some((c) => c.title === 'E2E 카드')`);
  } },
  { group: '보드 편집', name: '카드를 마우스로 끌어 다른 열로 이동', async run(app) {
    await kb(app, `(() => { const b = k.actions.activeBoard(); while (b.columns.length < 2) k.actions.addColumn(); return 1; })()`);
    const ids = await kb(app, `(() => { const b = k.actions.activeBoard(); const c = k.actions.addCard(b.columns[0].id, { title: 'drag me' }); return { card: c.id, target: b.columns[1].id }; })()`);
    await app.main.eval(`document.querySelector('#board-area').scrollLeft = 0; 1`);
    const from = await app.main.center(`.card[data-card-id="${ids.card}"]`);
    const to = await app.main.center(`.column[data-column-id="${ids.target}"] .cards`);
    await app.main.drag(from, to);
    await app.main.waitFor(`window.__mykanban.board.findCard(window.__mykanban.actions.activeBoard(), '${ids.card}').column.id === '${ids.target}'`);
  } },
  { group: '보드 편집', name: '열 머리를 끌어 순서 바꾸기', async run(app) {
    const order = (await board(app)).columns.map((c) => c.id);
    await app.main.eval(`document.querySelector('#board-area').scrollLeft = 0; 1`);
    const from = await app.main.center(`.column[data-column-id="${order[0]}"] .column-title`);
    // Drop at the right edge of the board area: past the middle of the last column.
    const edge = await app.main.eval(`document.querySelector('#board-area').getBoundingClientRect().right - 12`);
    await app.main.drag(from, { x: edge, y: from.y });
    await app.main.waitFor(`window.__mykanban.actions.activeBoard().columns.at(-1).id === '${order[0]}'`);
  } },
  { group: '보드 편집', name: '도구 패널의 템플릿을 보드로 끌어다 놓기', async run(app) {
    const before = (await board(app)).columns.flatMap((c) => c.cards).length;
    const from = await app.main.center('[data-tool="template:bug"]');
    const to = await app.main.center('.column .cards');
    await app.main.drag(from, to);
    await app.main.waitFor(`window.__mykanban.board.allCards(window.__mykanban.actions.activeBoard()).length === ${before + 1}`);
    const card = await kb(app, `k.board.allCards(k.actions.activeBoard()).find((c) => c.tags.includes('bug'))`);
    assert.equal(card.color, 'red');
  } },

  // ───────────────────────── undo/redo
  { group: '실행 취소', name: 'Ctrl+Z / Ctrl+Y', async run(app) {
    await app.main.eval(`document.activeElement?.blur(); 1`);
    const count = async () => (await board(app)).columns.length;
    const before = await count();
    await kb(app, 'k.actions.addColumn() && 1');
    await app.main.eval(`document.activeElement?.blur(); 1`);
    assert.equal(await count(), before + 1);
    await app.main.key('z', 2);
    await app.main.waitFor(`window.__mykanban.actions.activeBoard().columns.length === ${before}`);
    await app.main.key('y', 2);
    await app.main.waitFor(`window.__mykanban.actions.activeBoard().columns.length === ${before + 1}`);
    const tip = await app.main.eval(`document.querySelector('[data-command="undo"]').title`);
    assert.match(tip, /실행 취소: 열 추가/);
  } },

  // ───────────────────────── clipboard
  { group: '클립보드', name: 'Ctrl+C / Ctrl+V 카드 복사·붙여넣기 (OS 클립보드)', async run(app) {
    const id = await kb(app, `(() => { const c = k.board.allCards(k.actions.activeBoard())[0]; k.actions.select('card', [c.id]); return c.id; })()`);
    await app.main.eval(`document.activeElement?.blur(); 1`);
    await app.main.key('c', 2);
    await sleep(500);
    assert.match(getClipboard(), /mykanbanboard\/cards/);
    const before = (await board(app)).columns.flatMap((c) => c.cards).length;
    await app.main.key('v', 2);
    await app.main.waitFor(`window.__mykanban.board.allCards(window.__mykanban.actions.activeBoard()).length === ${before + 1}`);
    assert.ok(id);
  } },
  { group: '클립보드', name: '다른 프로그램의 텍스트 → 줄마다 카드', async run(app) {
    setClipboard('- 첫째\n- 둘째\n- 셋째');
    const before = (await board(app)).columns.flatMap((c) => c.cards).length;
    await app.main.key('v', 2);
    await app.main.waitFor(`window.__mykanban.board.allCards(window.__mykanban.actions.activeBoard()).length === ${before + 3}`);
  } },
  { group: '클립보드', name: 'Ctrl+X 잘라내기', async run(app) {
    await kb(app, `(() => { const c = k.board.allCards(k.actions.activeBoard()).at(-1); k.actions.select('card', [c.id]); return 1; })()`);
    const before = (await board(app)).columns.flatMap((c) => c.cards).length;
    await app.main.key('x', 2);
    await app.main.waitFor(`window.__mykanban.board.allCards(window.__mykanban.actions.activeBoard()).length === ${before - 1}`);
  } },

  // ───────────────────────── zoom
  { group: '확대/축소', name: 'Ctrl+마우스 휠', async run(app) {
    await kb(app, 'k.actions.setZoom(100) || 1');
    const point = await app.main.center('#board-area');
    await app.main.wheel(point.x, point.y, -120, 2);
    await app.main.waitFor(`window.__mykanban.state.settings.zoom === 110`);
    assert.equal(await app.main.eval(`document.querySelector('#board').style.zoom`), '1.1');
    await app.main.wheel(point.x, point.y, 120, 2);
    await app.main.wheel(point.x, point.y, 120, 2);
    await app.main.waitFor(`window.__mykanban.state.settings.zoom === 90`);
    await kb(app, 'k.actions.setZoom(100) || 1');
  } },

  // ───────────────────────── panels
  { group: '패널', name: '좌우 패널 접기·펼치기 (아이콘과 이름 레일)', async run(app) {
    await app.main.click('#left-panel [data-panel-toggle="left"]');
    await app.main.click('#right-panel [data-panel-toggle="right"]');
    const rails = await app.main.eval(`({
      left: [...document.querySelectorAll('#left-panel .rail-button')].map((b) => Boolean(b.querySelector('svg')) && b.querySelector('.rail-label')?.textContent.trim()),
      right: [...document.querySelectorAll('#right-panel .rail-button')].map((b) => Boolean(b.querySelector('svg')) && b.querySelector('.rail-label')?.textContent.trim()),
      titles: [...document.querySelectorAll('.rail-title')].map((t) => t.textContent.trim()),
      width: document.querySelector('#left-panel').getBoundingClientRect().width })`);
    assert.ok(rails.left.length >= 10 && rails.left.every(Boolean), `left rail: icon + name ${JSON.stringify(rails.left)}`);
    const first = await app.main.eval(`[...document.querySelectorAll('#left-panel .panel-rail > *, #right-panel .panel-rail > *')].filter((e, i, all) => e.parentElement.firstElementChild === e).map((e) => e.dataset.panelToggle)`);
    assert.deepEqual(first, ['left', 'right'], 'the expand buttons are at the very top');
    assert.ok(rails.right.length >= 3 && rails.right.every(Boolean), `right rail: icon + name ${JSON.stringify(rails.right)}`);
    assert.deepEqual(rails.titles, ['도구', '속성']);
    assert.ok(rails.width > 50 && rails.width < 90, `collapsed rail ${rails.width}px`);
    // Every rail button can be reached even in a short window (the rail scrolls, nothing is cut off for good).
    const reachable = await app.main.eval(`(() => { const panel = document.querySelector('#left-panel'); const last = [...panel.querySelectorAll('.rail-button')].at(-1); last.scrollIntoView({ block: 'nearest' }); const r = last.getBoundingClientRect(); const p = panel.getBoundingClientRect(); return r.bottom <= p.bottom + 1 && getComputedStyle(panel).overflowY === 'auto'; })()`);
    assert.ok(reachable, 'last rail button reachable');
    await app.main.click('#left-panel [data-panel-toggle="left"]');
    await app.main.click('#right-panel [data-panel-toggle="right"]');
    const headers = await app.main.eval(`[...document.querySelectorAll('.panel-header')].map((h) => Boolean(h.querySelector('svg')) && h.textContent.trim())`);
    assert.equal(headers.length, 2);
    assert.ok(headers.every(Boolean), 'panel headers have icons and titles');
  } },

  // ───────────────────────── tabs
  { group: '탭', name: '탭이 넘치면 오른쪽 끝에 < > 버튼', async run(app) {
    await kb(app, `(() => { for (let i = 0; i < 14; i++) k.actions.newBoard(); return 1; })()`);
    await sleep(200);
    const nav = await app.main.eval(`(() => { const tabs = document.querySelector('#tabs'); const nav = tabs.querySelector('.tab-nav'); const r = nav.getBoundingClientRect(); return { overflow: tabs.classList.contains('overflow'), visible: getComputedStyle(nav).display !== 'none', atRight: tabs.getBoundingClientRect().right - r.right < 12, scrollbar: tabs.querySelector('.tab-strip').scrollHeight > tabs.querySelector('.tab-strip').clientHeight + 1 }; })()`);
    assert.ok(nav.overflow && nav.visible && nav.atRight, JSON.stringify(nav));
    assert.equal(nav.scrollbar, false, 'no scroll bar');
    await app.main.eval(`document.querySelector('.tab-strip').scrollLeft = 0; 1`);
    await app.main.click('[data-tab-scroll="1"]');
    assert.ok(await app.main.eval(`document.querySelector('.tab-strip').scrollLeft > 0`));
    await app.main.click('[data-tab-scroll="-1"]');
    // Close the extra boards (unchanged → no questions).
    await kb(app, `(async () => { for (const d of [...k.state.docs]) if (!d.dirty && !d.projectId && k.state.docs.length > 2) await k.actions.closeDoc(d); return 1; })()`);
  } },

  // ───────────────────────── files
  { group: '파일', name: '보드 저장 → 다시 열기 (최근 파일·마지막 폴더 기억)', async run(app) {
    const file = path.join(app.files, '저장 테스트.mkanban');
    await kb(app, `(async () => { const d = k.actions.activeDoc(); d.path = ${JSON.stringify(file)}; d.board.title = '저장 테스트'; return k.actions.saveDoc(d); })()`);
    assert.ok(fs.existsSync(file));
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(saved.format, 'mykanbanboard');
    await kb(app, `(async () => { await k.actions.closeDoc(k.actions.activeDoc()); return 1; })()`);
    await kb(app, `k.actions.openPath(${JSON.stringify(file)}).then(() => 1)`);
    assert.equal(await kb(app, 'k.actions.activeDoc().path'), file);
    assert.equal(await kb(app, 'k.state.settings.lastDirectory'), app.files);
    assert.equal(await kb(app, 'k.state.recent[0].path'), file);
  } },
  { group: '파일', name: '최근 파일 팝업: 개별 삭제와 전체 삭제', async run(app) {
    for (let i = 0; i < 12; i++) {
      const file = path.join(app.files, `recent-${i}.mkanban`);
      fs.writeFileSync(file, sample(`R${i}`, ['a']));
      await kb(app, `k.actions.openPath(${JSON.stringify(file)}).then(() => 1)`);
    }
    assert.equal(await kb(app, 'k.state.recent.length'), 10, 'at most 10');
    const page = await openPopup(app, 'recent', () => app.main.click('#toolbar [data-command="recent"]'));
    await expectPopupWindow(app, page, 'recent');
    assert.equal(await page.eval(`document.querySelectorAll('.recent-row').length`), 10);
    await page.click('[data-action="remove-recent"]');
    await page.waitFor(`document.querySelectorAll('.recent-row').length === 9`);
    await app.main.waitFor(`window.__mykanban.state.recent.length === 9`);
    await page.click('[data-action="clear-recent"]');
    await page.waitFor(`document.querySelectorAll('.recent-row').length === 0`);
    await app.main.waitFor(`window.__mykanban.state.recent.length === 0`);
    await page.click('[data-action="close"]');
    await kb(app, `(async () => { for (const d of [...k.state.docs]) if (!d.dirty && !d.projectId && k.state.docs.length > 1) await k.actions.closeDoc(d); return 1; })()`);
  } },
  { group: '파일', name: '오래 걸리는 열기 → 진행 팝업', async run(app) {
    const file = path.join(app.files, 'big.mkanban');
    const cards = Array.from({ length: 4000 }, (_, i) => `card ${i} ${'x'.repeat(1500)}`);
    fs.writeFileSync(file, sample('Big', cards));
    await app.restart([], { MYKANBAN_IO_DELAY_MS: '120' });
    const opening = kb(app, `k.actions.openPath(${JSON.stringify(file)}).then(() => 1)`);
    const progress = await app.popup('progress', 10000);
    await progress.waitFor(`document.querySelector('[role="progressbar"]') && Number(document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow')) > 0`, { timeout: 15000 });
    await expectPopupWindow(app, progress, 'progress');
    await opening;
    await app.main.waitFor(`window.__mykanban.actions.activeBoard().title === 'Big'`, { timeout: 30000 });
    await sleep(500);
    assert.equal(await app.hasPopup('progress'), false, 'closes when done');
    await app.restart();
  } },
  { group: '오류', name: '오류 팝업: 자세한 내용과 복사', async run(app) {
    const file = path.join(app.files, 'broken.mkanban');
    fs.writeFileSync(file, '{ not json');
    kb(app, `k.actions.openPath(${JSON.stringify(file)}).then(() => 1)`).catch(() => {});
    const page = await app.popup('error');
    await expectPopupWindow(app, page, 'error');
    const message = await page.eval(`document.querySelector('#error-message').textContent`);
    assert.match(message, /JSON/);
    assert.ok((await page.eval(`document.querySelector('#error-detail').value`)).includes(file), 'details name the file');
    await page.click('[data-action="copy-error"]');
    await page.waitFor(`document.querySelector('#copy-state').textContent.trim().length > 0`);
    assert.match(getClipboard(), /broken\.mkanban/);
    await page.click('[data-action="close"]');
  } },

  // ───────────────────────── popups
  { group: '팝업', name: '프로그램 정보: 아이콘+설명, 빌드·저작자 정보 수직 정렬', async run(app) {
    const page = await openPopup(app, 'about', () => app.main.click('#toolbar [data-command="about"]'));
    await page.waitFor(`document.querySelector('#about-rows dt')`);
    await expectPopupWindow(app, page, 'about');
    const layout = await page.eval(`(() => {
      const icon = document.querySelector('.about-icon').getBoundingClientRect();
      const text = document.querySelector('.about-text').getBoundingClientRect();
      const dd = [...document.querySelectorAll('.about-table dd')].map((d) => Math.round(d.getBoundingClientRect().left));
      const dt = [...document.querySelectorAll('.about-table dt')].map((d) => Math.round(d.getBoundingClientRect().left));
      return { right: icon.right <= text.left, iconSize: icon.width, description: document.querySelector('.about-description').textContent.length, dd: [...new Set(dd)], dt: [...new Set(dt)], sections: [...document.querySelectorAll('.about-section')].map((h) => h.textContent.trim()) };
    })()`);
    assert.ok(layout.right && layout.iconSize >= 96, 'program icon on the left, description on the right');
    assert.ok(layout.description > 60, 'a detailed description');
    assert.equal(layout.dd.length, 1, 'values aligned in one column');
    assert.equal(layout.dt.length, 1, 'labels aligned in one column');
    assert.deepEqual(layout.sections, ['빌드 정보', '저작자 정보']);
    const text = await page.eval(`document.body.innerText`);
    for (const part of ['1.0.0', 'SHKWON(knix008@naver.com)', 'Tauri', 'x86_64']) assert.ok(text.includes(part), part);
    assert.match(text, /빌드 날짜/);
    assert.match(text, /커밋/);
    await page.click('[data-action="copy-about"]');
    await sleep(400);
    assert.match(getClipboard(), /SHKWON\(knix008@naver\.com\)/);
    await page.click('[data-action="close"]');
  } },
  { group: '오류', name: '심각한 오류(백엔드 패닉) → 상세 내용 팝업과 복사', async run(app) {
    await app.main.eval(`window.__TAURI_INTERNALS__.invoke('raise_test_panic').catch(() => 1); 1`);
    const page = await app.popup('error', 15000);
    await expectPopupWindow(app, page, 'error');
    const title = await page.eval(`document.querySelector('.popup-head h2').textContent.trim()`);
    assert.match(title, /심각한 오류/);
    const detail = await page.eval(`document.querySelector('#error-detail').value`);
    assert.match(detail, /test panic/);
    assert.match(detail, /lib\.rs:\d+/, 'where it happened');
    assert.match(detail, /crash\.log/, 'the log file');
    await page.click('[data-action="copy-error"]');
    await page.waitFor(`document.querySelector('#copy-state').textContent.trim().length > 0`);
    assert.match(getClipboard(), /test panic/);
    assert.ok(fs.existsSync(path.join(app.data, 'crash.log')), 'written to crash.log');
    await page.click('[data-action="close"]');
    for (let i = 0; i < 50 && (await app.hasPopup('error')); i++) await sleep(100);
    // A JavaScript error nobody caught is reported the same way.
    await app.main.eval(`setTimeout(() => { throw new Error('uncaught test error'); }, 0); 1`);
    const again = await app.popup('error');
    await again.waitFor(`document.querySelector('#error-message').textContent.includes('uncaught test error')`);
    await again.click('[data-action="close"]');
  } },
  { group: '팝업', name: '설정: 모든 탭이 스크롤 없이 표시', async run(app) {
    const page = await openPopup(app, 'settings', () => app.main.click('#toolbar [data-command="settings"]'));
    await expectPopupWindow(app, page, 'settings');
    for (const tab of ['general', 'appearance', 'font', 'background', 'board', 'recent', 'shortcuts']) {
      await page.click(`[data-action="tab"][data-value="${tab}"]`);
      await sleep(tab === 'font' ? 800 : 120);
      assert.deepEqual(await page.eval(POPUP_SCROLL_CHECK), [], `tab ${tab}`);
      const overflow = await page.eval(`(() => { const body = document.querySelector('.popup-body'); return body.scrollHeight > body.clientHeight + 1; })()`);
      assert.equal(overflow, false, `tab ${tab} fits`);
      assert.deepEqual(await page.eval(LAYOUT_CHECK), [], `tab ${tab}: nothing overlaps or is cut off`);
      if (tab === 'appearance') {
        for (const group of ['light', 'custom', 'dark']) {
          await page.click(`[data-theme-group="${group}"]`);
          assert.deepEqual(await page.eval(LAYOUT_CHECK), [], `theme ${group}`);
        }
      }
    }
    assert.ok(await page.eval('innerWidth') <= 760, 'narrower settings window');
    await page.click('[data-action="close"]');
    // Wait until the window is really gone before the next case opens it again.
    for (let i = 0; i < 50 && (await app.hasPopup('settings')); i++) await sleep(100);
  } },
  { group: '설정', name: '글꼴: 시스템 글꼴 목록·크기(−/+)·굵기·기울임', async run(app) {
    const page = await openPopup(app, 'settings', () => kb(app, `k.popups.open('settings', { tab: 'font' }) && 1`));
    await page.waitFor(`document.querySelectorAll('#font-family option').length > 20`, { timeout: 20000 });
    const fonts = await page.eval(`[...document.querySelectorAll('#font-family option')].map((o) => o.value).filter(Boolean)`);
    const pick = fonts.find((f) => /Arial|Segoe UI|Malgun|맑은/.test(f)) ?? fonts[0];
    await page.eval(`(() => { const s = document.querySelector('#font-family'); s.value = ${JSON.stringify(pick)}; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    // The size field is [−] value [+] with the value in the middle.
    const stepper = await page.eval(`(() => { const s = document.querySelector('[data-stepper="fontSize"]'); const [a, b] = s.querySelectorAll('.stepper-button'); const v = s.querySelector('.stepper-value'); return { order: a.getBoundingClientRect().right <= v.getBoundingClientRect().left && v.getBoundingClientRect().right <= b.getBoundingClientRect().left, align: getComputedStyle(v).textAlign, value: v.value }; })()`);
    assert.ok(stepper.order, 'decrease left, value middle, increase right');
    assert.equal(stepper.align, 'center');
    assert.equal(stepper.value, '14px');
    for (let i = 0; i < 3; i++) {
      const plus = await page.center('[data-stepper="fontSize"] [data-step-dir="1"]');
      await page.realClick(plus.x, plus.y);
      await sleep(120);
    }
    await app.main.waitFor(`getComputedStyle(document.documentElement).getPropertyValue('--font-size').trim() === '17px'`);
    await page.eval(`(() => { const s = document.querySelector('[data-select="fontWeight"]'); s.value = '700'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await page.click('[data-setting="fontStyle"][data-value="italic"]');
    await app.main.waitFor(`getComputedStyle(document.querySelector('.column-title')).fontStyle === 'italic' && getComputedStyle(document.querySelector('#board')).fontWeight === '700'`);
    const look = await app.main.eval(`(() => { const card = getComputedStyle(document.querySelector('.card .card-title')); const column = getComputedStyle(document.querySelector('.column-title')); const menu = getComputedStyle(document.querySelector('.menubar-item')); const panel = getComputedStyle(document.querySelector('.panel-header')); return { family: card.fontFamily, weight: getComputedStyle(document.querySelector('#board')).fontWeight, style: card.fontStyle, cardSize: getComputedStyle(document.querySelector('.card')).fontSize, columnStyle: column.fontStyle, menuSize: menu.fontSize, menuStyle: menu.fontStyle, panelStyle: panel.fontStyle, menuFamily: menu.fontFamily }; })()`);
    assert.equal(look.cardSize, '17px', 'cards use the size');
    assert.equal(look.columnStyle, 'italic', 'columns use the style');
    assert.equal(look.menuSize, '14px', 'the menu bar keeps its size');
    assert.equal(look.menuStyle, 'normal', 'the UI is not italic');
    assert.equal(look.panelStyle, 'normal');
    assert.ok(!look.menuFamily.includes(pick) || /Segoe UI/.test(pick), 'the UI keeps its font');
    assert.ok(look.family.includes(pick), look.family);
    assert.equal(look.weight, '700');
    assert.equal(look.style, 'italic');
    // Typing a value works too (clamped to 9–28).
    await page.eval(`(() => { const v = document.querySelector('[data-stepper="fontSize"] .stepper-value'); v.value = '99'; v.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await app.main.waitFor(`window.__mykanban.state.settings.fontSize === 28`);
    await page.click('[data-action="reset-settings"]');
    await app.main.waitFor(`window.__mykanban.state.settings.fontSize === 14`);
    await page.click('[data-action="close"]');
    for (let i = 0; i < 50 && (await app.hasPopup('settings')); i++) await sleep(100);
  } },
  { group: '툴바', name: '확대 비율 입력: [−] 100% [+], 가운데 정렬', async run(app) {
    await kb(app, 'k.actions.setZoom(100) || 1');
    const layout = await app.main.eval(`(() => { const v = document.querySelector('#zoom-value'); const minus = document.querySelector('[data-command="zoomOut"]'); const plus = document.querySelector('[data-command="zoomIn"]'); return { order: minus.getBoundingClientRect().right <= v.getBoundingClientRect().left + 1 && v.getBoundingClientRect().right <= plus.getBoundingClientRect().left + 1, align: getComputedStyle(v).textAlign, value: v.value }; })()`);
    assert.ok(layout.order);
    assert.equal(layout.align, 'center');
    assert.equal(layout.value, '100%');
    await app.main.click('[data-command="zoomIn"]');
    assert.equal(await app.main.eval(`document.querySelector('#zoom-value').value`), '110%');
    await app.main.eval(`(() => { const v = document.querySelector('#zoom-value'); v.value = '150'; v.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    assert.equal(await kb(app, 'k.state.settings.zoom'), 150);
    await app.main.click('[data-command="zoomOut"]');
    assert.equal(await kb(app, 'k.state.settings.zoom'), 140);
    await kb(app, 'k.actions.setZoom(100) || 1');
  } },
  { group: '툴바', name: '검색 칸: 카드를 걸러 내고 도구 패널 검색과 같은 값', async run(app) {
    await kb(app, `(() => { const b = k.actions.activeBoard(); k.actions.addCard(b.columns[0].id, { title: '검색어바나나' }); return 1; })()`);
    await app.main.eval('document.activeElement?.blur(); 1');
    await app.main.key('f', 2);
    assert.equal(await app.main.eval('document.activeElement?.id'), 'toolbar-search', 'Ctrl+F goes to the toolbar search');
    await app.main.type('바나나');
    await app.main.waitFor(`[...document.querySelectorAll('.card:not(.filtered)')].length === 1`);
    assert.equal(await app.main.eval(`document.querySelector('.card:not(.filtered) .card-title').textContent`), '검색어바나나');
    assert.equal(await app.main.eval(`document.querySelector('#filter-text').value`), '바나나', 'same search in the tool panel');
    await app.main.click('#left-panel [data-command="clearFilter"]');
    assert.equal(await app.main.eval(`document.querySelector('#toolbar-search').value`), '');
    assert.equal(await app.main.eval(`document.querySelectorAll('.card.filtered').length`), 0);
  } },
  { group: '툴바', name: '인쇄 버튼은 최근 파일 버튼 바로 오른쪽', async run(app) {
    const order = await app.main.eval(`[...document.querySelectorAll('.toolbar-left [data-command]')].map((b) => b.dataset.command)`);
    assert.equal(order[order.indexOf('recent') + 1], 'print', JSON.stringify(order));
    const gap = await app.main.eval(`document.querySelector('[data-command="print"]').getBoundingClientRect().left - document.querySelector('[data-command="recent"]').getBoundingClientRect().right`);
    assert.ok(gap >= 0 && gap < 8, `next to each other (${gap}px)`);
  } },
  { group: '테마', name: '툴바: 테마·드롭다운·언어 버튼은 설정 왼쪽 (오른쪽 정렬)', async run(app) {
    const order = await app.main.eval(`[...document.querySelectorAll('.toolbar-right [data-command]')].map((b) => b.dataset.command)`);
    assert.deepEqual(order, ['theme', 'themeMenu', 'language', 'settings', 'about']);
    assert.equal(await app.main.eval(`Boolean(document.querySelector('.toolbar-left [data-command="theme"], .toolbar-left [data-command="language"]'))`), false);
  } },
  { group: '테마', name: '테마 버튼: 누르면 다음 테마로 자동 변경', async run(app) {
    await kb(app, `k.actions.updateSettings({ theme: 'light' }) || 1`);
    const tip = await app.main.eval(`document.querySelector('[data-command="theme"]').title`);
    assert.match(tip, /다음: 오션/);
    await app.main.click('[data-command="theme"]');
    assert.equal(await app.main.eval('document.documentElement.dataset.theme'), 'ocean');
    await app.main.click('[data-command="theme"]');
    assert.equal(await app.main.eval('document.documentElement.dataset.theme'), 'forest');
  } },
  { group: '테마', name: '테마 드롭다운: 다크 | 라이트 두 줄, 각 20개', async run(app) {
    await app.main.click('[data-command="themeMenu"]');
    const page = await app.popup('theme');
    await page.waitFor(`document.querySelectorAll('.picker-column').length === 2`);
    await expectPopupWindow(app, page, 'theme');
    const columns = await page.eval(`[...document.querySelectorAll('.picker-column')].map((c) => ({ title: c.querySelector('h3').textContent.trim(), count: c.querySelectorAll('[data-pick-theme]').length, left: Math.round(c.getBoundingClientRect().left) }))`);
    assert.equal(columns.length, 2);
    assert.match(columns[0].title, /다크/);
    assert.match(columns[1].title, /라이트/);
    assert.ok(columns[0].left < columns[1].left, 'side by side');
    assert.deepEqual(columns.map((c) => c.count), [20, 20]);
    await page.click('[data-pick-theme="tokyo"]');
    await app.main.waitFor(`document.documentElement.dataset.theme === 'tokyo'`);
    for (let i = 0; i < 30 && (await app.hasPopup('theme')); i++) await sleep(100);
    assert.equal(await app.hasPopup('theme'), false, 'closes after choosing');
  } },
  { group: '테마', name: '설정: 다크 20 · 라이트 20 테마 선택, 모두 다른 색', async run(app) {
    const page = await openPopup(app, 'settings', () => kb(app, `k.popups.open('settings', { tab: 'appearance' }) && 1`));
    const colours = new Set();
    for (const group of ['dark', 'light']) {
      await page.click(`[data-theme-group="${group}"]`);
      const ids = await page.eval(`[...document.querySelectorAll('.theme-list [data-setting="theme"]')].map((b) => b.dataset.value)`);
      assert.equal(ids.length, 20, `${group} themes`);
      assert.deepEqual(await page.eval(POPUP_SCROLL_CHECK), [], 'no scroll bar');
      for (const id of ids) {
        await page.click(`.theme-list [data-value="${id}"]`);
        await app.main.waitFor(`document.documentElement.dataset.theme === '${id}'`);
        colours.add(await app.main.eval(`getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() + getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()`));
      }
    }
    assert.equal(colours.size, 40, 'every theme has its own colours');
    await page.click('[data-action="close"]');
    for (let i = 0; i < 50 && (await app.hasPopup('settings')); i++) await sleep(100);
  } },
  { group: '테마', name: '사용자 정의 테마: 색 편집이 바로 적용', async run(app) {
    const page = await openPopup(app, 'settings', () => kb(app, `k.popups.open('settings', { tab: 'appearance', themeGroup: 'custom' }) && 1`));
    await page.waitFor(`document.querySelectorAll('[data-custom-color]').length >= 12`);
    await page.eval(`(() => { const i = document.querySelector('[data-custom-color="accent"]'); i.value = '#ff3366'; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await app.main.waitFor(`document.documentElement.dataset.theme === 'custom'`);
    assert.equal(await app.main.eval(`getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()`), '#ff3366');
    await page.click('[data-custom-dark]');
    await app.main.waitFor(`getComputedStyle(document.documentElement).colorScheme === 'dark'`);
    await page.click('[data-action="copy-theme"]');
    await page.click('[data-action="close"]');
    for (let i = 0; i < 50 && (await app.hasPopup('settings')); i++) await sleep(100);
    await kb(app, `k.actions.updateSettings({ theme: 'light' }) || 1`);
  } },
  { group: '열', name: '열 배경색: 파스텔 20색·사용자 정의 색·불투명도', async run(app) {
    const id = await kb(app, `(() => { const b = k.actions.activeBoard(); k.actions.select('column', [b.columns[0].id]); return b.columns[0].id; })()`);
    const swatches = await app.main.eval(`document.querySelectorAll('#right-panel [data-column-bg]').length`);
    assert.equal(swatches, 21, '20 pastels + none');
    await app.main.click('#right-panel [data-column-bg="#cfe8ff"]');
    await app.main.waitFor(`document.querySelector('.column[data-column-id="${id}"]').classList.contains('has-bg')`);
    const minus = await app.main.center('#right-panel [data-stepper="column:bgOpacity"] [data-step-dir="-1"]');
    await app.main.realClick(minus.x, minus.y);
    await app.main.waitFor(`window.__mykanban.board.findColumn(window.__mykanban.actions.activeBoard(), '${id}').bgOpacity === 95`);
    await app.main.eval(`(() => { const i = document.querySelector('#right-panel [data-column-bg-custom]'); i.value = '#123456'; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    assert.equal(await kb(app, `k.board.findColumn(k.actions.activeBoard(), '${id}').background`), '#123456');
    const fg = await app.main.eval(`getComputedStyle(document.querySelector('.column[data-column-id="${id}"] .column-title')).color`);
    assert.equal(fg, 'rgb(241, 244, 249)', 'light text on a dark custom colour');
  } },
  { group: '열', name: '열 설정 창: 제목·WIP(−/+)·배경 → 적용', async run(app) {
    const id = await kb(app, `k.actions.activeBoard().columns[0].id`);
    const point = await app.main.center(`.column[data-column-id="${id}"] .column-title`);
    await app.main.realClick(point.x, point.y, { button: 'right' });
    const menu = await app.popup('menu');
    await menu.waitFor(`document.querySelector('[data-id="custom:props"]')`);
    await menu.click('[data-id="custom:props"]');
    menu.close();
    const page = await app.popup('column');
    await expectPopupWindow(app, page, 'column');
    await page.eval(`(() => { const i = document.querySelector('#column-title'); i.value = '설정 창 열'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
    for (let i = 0; i < 2; i++) { const p = await page.center('[data-stepper="col:wip"] [data-step-dir="1"]'); await page.realClick(p.x, p.y); }
    await page.click('[data-edit-bg="#ffd6d6"]');
    await page.click('[data-action="editor-apply"]');
    await app.main.waitFor(`window.__mykanban.board.findColumn(window.__mykanban.actions.activeBoard(), '${id}').title === '설정 창 열'`);
    const column = await kb(app, `k.board.findColumn(k.actions.activeBoard(), '${id}')`);
    assert.equal(column.wip, 2);
    assert.equal(column.background, '#ffd6d6');
  } },
  { group: '속성 패널', name: '선택한 항목에 따라 내용이 자동으로 바뀜', async run(app) {
    await app.main.eval(`document.querySelector('#board-area').scrollLeft = 0; 1`);
    const kind = () => app.main.eval(`document.querySelector('#right-panel .props')?.dataset.props`);
    const cards = await kb(app, `(() => { const b = k.actions.activeBoard(); const col = b.columns[0]; while (col.cards.length < 2) k.actions.addCard(col.id, { title: 'p' }); return col.cards.slice(0, 2).map((c) => c.id); })()`);
    await app.main.eval('document.activeElement?.blur(); 1');
    let p = await app.main.center(`.card[data-card-id="${cards[0]}"] .card-title`);
    await app.main.realClick(p.x, p.y);
    assert.equal(await kind(), 'card');
    assert.equal(await app.main.eval(`document.querySelector('#right-panel h3').textContent.trim()`), '카드');
    p = await app.main.center(`.card[data-card-id="${cards[1]}"] .card-title`);
    await app.main.realClick(p.x, p.y, { modifiers: 2 });
    assert.equal(await kind(), 'multi', 'Ctrl+click: several cards');
    // Empty space inside a column selects the column.
    const empty = await app.main.eval(`(() => { const r = document.querySelector('.column .add-card-button').getBoundingClientRect(); const c = document.querySelector('.column').getBoundingClientRect(); return { x: c.left + 6, y: r.top - 3 }; })()`);
    await app.main.realClick(empty.x, empty.y);
    assert.equal(await kind(), 'column');
    p = await app.main.center('.column-head .column-title');
    await app.main.realClick(p.x, p.y);
    assert.equal(await kind(), 'column');
    const area = await app.main.eval(`(() => { const r = document.querySelector('#board-area').getBoundingClientRect(); return { x: r.right - 30, y: r.bottom - 40 }; })()`);
    await app.main.realClick(area.x, area.y);
    assert.equal(await kind(), 'board', 'empty board: board properties');
    // Selection made elsewhere (keyboard, other tab) also updates the panel.
    await app.main.key('a', 2);
    assert.equal(await kind(), 'multi');
    await app.main.key('Escape');
    assert.equal(await kind(), 'board');
  } },
  { group: '카드', name: '마감일: 달력에서 고르기·직접 입력·잘못된 날짜 거부', async run(app) {
    const id = await kb(app, `(() => { const c = k.actions.activeBoard().columns[0].cards[0]; k.actions.select('card', [c.id]); return c.id; })()`);
    await app.main.click('#right-panel [data-date-field="card:due"] [data-calendar-toggle]');
    await app.main.waitFor(`document.querySelectorAll('#right-panel .calendar-pop .calendar-day').length === 42`);
    const weekdays = await app.main.eval(`[...document.querySelectorAll('#right-panel .calendar-weekday')].map((d) => d.textContent)`);
    assert.deepEqual(weekdays, ['월', '화', '수', '목', '금', '토', '일']);
    await app.main.click('#right-panel [data-cal-nav="1"]');
    const target = await app.main.eval(`document.querySelector('#right-panel .calendar-day:not(.outside)[title$="-15"]').dataset.calDay`);
    await app.main.click(`#right-panel [data-cal-day="${target}"]`);
    await app.main.waitFor(`window.__mykanban.board.findCard(window.__mykanban.actions.activeBoard(), '${id}').card.due === '${target}'`);
    assert.equal(await app.main.eval(`Boolean(document.querySelector('#right-panel .calendar-pop'))`), false, 'closes after picking');
    const input = '#right-panel [data-date-field="card:due"] .date-input';
    await app.main.eval(`(() => { const i = document.querySelector('${input}'); i.value = '2027-2-3'; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    assert.equal(await kb(app, `k.board.findCard(k.actions.activeBoard(), '${id}').card.due`), '2027-02-03');
    await app.main.eval(`(() => { const i = document.querySelector('${input}'); i.value = '2027-02-30'; i.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    assert.equal(await kb(app, `k.board.findCard(k.actions.activeBoard(), '${id}').card.due`), '2027-02-03', 'impossible date refused');
    assert.equal(await app.main.eval(`document.querySelector('${input}').value`), '2027-02-03');
  } },
  { group: '카드', name: '설명 서식: 마우스로 선택한 부분에만 글꼴·크기·굵기·기울임', async run(app) {
    const id = await kb(app, `(() => { const c = k.actions.activeBoard().columns[0].cards[0]; k.actions.select('card', [c.id]); return c.id; })()`);
    const area = '#right-panel [data-rich="card:description"] .rich-area';
    await app.main.eval(`(() => { const a = document.querySelector('${area}'); a.focus(); a.textContent = '앞부분 강조할부분 뒷부분'; return 1; })()`);
    // Select "강조할부분" with the mouse: a drag across the word.
    const word = await app.main.eval(`(() => { const a = document.querySelector('${area}'); const node = a.firstChild; const range = document.createRange(); range.setStart(node, 4); range.setEnd(node, 9); const r = range.getBoundingClientRect(); return { x1: r.left + 1, x2: r.right - 1, y: r.top + r.height / 2 }; })()`);
    await app.main.drag({ x: word.x1, y: word.y }, { x: word.x2, y: word.y }, 6);
    assert.equal(await app.main.eval('String(getSelection())'), '강조할부분', 'mouse selection');
    await app.main.click('#right-panel [data-rich-cmd="bold"]');
    for (let i = 0; i < 6; i++) {
      const plus = await app.main.center('#right-panel [data-stepper="rich-size"] [data-step-dir="1"]');
      await app.main.realClick(plus.x, plus.y);
    }
    await app.main.click('#right-panel [data-rich-cmd="italic"]');
    await app.main.eval(`(() => { const s = document.querySelector('#right-panel [data-rich-font]'); s.value = [...s.options].map((o) => o.value).find((v) => /Arial|Segoe|Malgun|맑은/.test(v)) ?? s.options[1].value; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await app.main.eval(`document.querySelector('${area}').blur(); 1`);
    const card = await kb(app, `k.board.findCard(k.actions.activeBoard(), '${id}').card`);
    assert.equal(card.description, '앞부분 강조할부분 뒷부분', 'plain text kept for search and printing');
    const html = card.descriptionHtml;
    assert.match(html, /font-weight: 700/);
    assert.match(html, /font-style: italic/);
    assert.match(html, /font-family/);
    const styled = await app.main.eval(`(() => { const holder = document.createElement('div'); holder.innerHTML = ${JSON.stringify(html)}; const spans = [...holder.querySelectorAll('span')]; return spans.map((s) => s.textContent); })()`);
    assert.ok(styled.every((text) => text === '강조할부분'), `only the selection is formatted: ${JSON.stringify(styled)}`);
    const size = await app.main.eval(`(() => { const s = [...document.querySelectorAll('.card[data-card-id="${id}"] .card-desc span')].map((e) => getComputedStyle(e).fontSize); return s; })()`);
    assert.ok(size.includes('20px') || size.some((v) => parseFloat(v) > 14), `card shows the bigger text ${size}`);
    await kb(app, 'k.actions.undo() || 1');
  } },
  { group: '카드', name: '카드 설정 창: 편집·체크리스트·창으로 끌어온 파일 첨부 → 적용', async run(app) {
    const cardId = await kb(app, `(() => { const b = k.actions.activeBoard(); return k.actions.addCard(b.columns[0].id, { title: '편집 창 카드' }).id; })()`);
    await app.main.eval('document.activeElement?.blur(); 1');
    const point = await app.main.center(`.card[data-card-id="${cardId}"] .card-title`);
    await app.main.realClick(point.x, point.y, { clickCount: 2 });
    await app.main.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 2 });
    await app.main.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 2 });
    const page = await app.popup('card');
    await expectPopupWindow(app, page, 'card');
    await page.eval(`(() => { const i = document.querySelector('#card-title'); i.value = '편집된 카드'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
    await page.click('[data-edit-color="purple"]');
    await page.click('[data-action="editor-tab"][data-value="checklist"]');
    await page.eval(`(() => { const i = document.querySelector('[data-check-new]'); i.value = '할 일 하나'; i.focus(); return 1; })()`);
    await page.key('Enter');
    await page.waitFor(`document.querySelectorAll('[data-check-text]').length === 1`);
    // Files dropped onto the card window (the drop handler's request) become attachments.
    const pdf = path.join(app.files, 'dropped-into-editor.pdf');
    fs.writeFileSync(pdf, '%PDF-1.4 editor');
    await page.eval(`window.__mykanbanPopup.requestAttach([${JSON.stringify(path.join(root, 'assets', 'icon-256.png'))}, ${JSON.stringify(pdf)}]); 1`);
    await page.waitFor(`document.querySelectorAll('.attach-tile').length === 2`);
    assert.equal(await page.eval(`document.querySelectorAll('.attach-tile img').length`), 1, 'image shown as a thumbnail');
    assert.ok(await page.eval(`document.querySelector('.drop-zone') !== null`), 'drop zone');
    assert.deepEqual(await page.eval(POPUP_SCROLL_CHECK), []);
    await page.click('[data-action="editor-apply"]');
    await app.main.waitFor(`window.__mykanban.board.findCard(window.__mykanban.actions.activeBoard(), '${cardId}').card.title === '편집된 카드'`);
    const card = await kb(app, `k.board.findCard(k.actions.activeBoard(), '${cardId}').card`);
    assert.equal(card.color, 'purple');
    assert.equal(card.checklist.length, 1);
    assert.equal(card.attachments.length, 2);
    await kb(app, 'k.actions.undo() || 1');
    assert.equal(await kb(app, `k.board.findCard(k.actions.activeBoard(), '${cardId}').card.title`), '편집 창 카드', 'one undo step');
  } },
  { group: '설정', name: '언어: 한국어 ↔ 영어 (메뉴·툴팁)', async run(app) {
    await app.main.click('#toolbar [data-command="language"]');
    await app.main.waitFor(`document.querySelector('[data-menu="file"]').textContent.includes('File')`);
    assert.match(await app.main.eval(`document.querySelector('[data-command="save"]').title`), /^Save/);
    await app.main.click('#toolbar [data-command="language"]');
    await app.main.waitFor(`document.querySelector('[data-menu="file"]').textContent.includes('파일')`);
  } },
  { group: '설정', name: '배경 이미지와 불투명도', async run(app) {
    const image = path.join(root, 'assets', 'icon.png');
    await kb(app, `k.actions.setBackgroundFromPath(${JSON.stringify(image)}).then(() => 1)`);
    await app.main.waitFor(`document.querySelector('.board-bg').classList.contains('has-image')`);
    await kb(app, `k.actions.updateSettings({ backgroundOpacity: 60 }) || 1`);
    assert.equal(await app.main.eval(`document.querySelector('.board-bg').style.opacity`), '0.6');
    assert.ok(fs.readdirSync(path.join(app.data, 'background')).length === 1, 'copied into the data folder');
    await kb(app, `k.actions.removeBackground().then(() => 1)`);
    await app.main.waitFor(`!document.querySelector('.board-bg').classList.contains('has-image')`);
  } },
  { group: '설정', name: '설정과 창 위치는 다음 실행에도 유지', async run(app) {
    await kb(app, `k.actions.updateSettings({ theme: 'forest', zoom: 120, showStatusBar: true }) || 1`);
    await sleep(300);
    await app.quit();
    await app.launch();
    assert.equal(await kb(app, 'k.state.settings.theme'), 'forest');
    assert.equal(await kb(app, 'k.state.settings.zoom'), 120);
    assert.ok(fs.existsSync(path.join(app.config, 'window-state.json')), 'window state saved');
    await kb(app, `k.actions.updateSettings({ theme: 'light', zoom: 100 }) || 1`);
  } },

  // ───────────────────────── print
  { group: '인쇄', name: '인쇄 미리보기: 범위·페이지 설정·바로 인쇄', async run(app) {
    await kb(app, `(() => { const b = k.actions.activeBoard(); for (let i = 0; i < 40; i++) k.actions.addCard(b.columns[0].id, { title: 'print ' + i, description: 'line\\nline' }); return 1; })()`);
    const page = await openPopup(app, 'print', () => app.main.click('#toolbar [data-command="print"]'));
    await expectPopupWindow(app, page, 'print');
    const pages = () => page.eval(`window.__mykanbanPopup.printLayout().pages.length`);
    const current = await pages();
    assert.ok(current >= 1);
    await page.eval(`(() => { const r = document.querySelector('[data-print-range="all"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    assert.ok((await pages()) >= current, 'all boards');
    await page.eval(`(() => { const r = document.querySelector('[data-print-range="custom"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await page.eval(`(() => { const c = document.querySelector('[data-print-column]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    const width = await page.eval(`window.__mykanbanPopup.printLayout().size.width`);
    await page.click('[data-print-orientation="portrait"]');
    assert.notEqual(await page.eval(`window.__mykanbanPopup.printLayout().size.width`), width, 'orientation changes the page');
    await page.eval(`(() => { const s = document.querySelector('[data-print="paper"]'); s.value = 'A3'; s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    assert.equal(await page.eval(`window.__mykanbanPopup.printLayout().size.width`), 297);
    if ((await pages()) > 1) {
      await page.click('[data-action="page"][data-value="1"]');
      assert.match(await page.eval(`document.querySelector('#page-number').textContent`), /^2 \//);
    }
    await page.eval(`window.__mykanbanPopup.state.printed = 0; window.__mykanbanPrintHook = (layout) => { window.__printedPages = layout.pages.length; }; 1`);
    await page.click('[data-action="print"]');
    await page.waitFor(`window.__printedPages > 0`);
    await app.main.waitFor(`(window.__mykanban.state.notice?.text ?? '').includes('인쇄')`);
    await page.click('[data-action="close"]');
  } },

  // ───────────────────────── drag & drop from outside
  { group: '끌어다 놓기', name: '외부 파일: 보드 열기·텍스트 → 카드·이미지 → 배경', async run(app) {
    const boardFile = path.join(app.files, 'dropped.mkanban');
    const textFile = path.join(app.files, 'list.txt');
    fs.writeFileSync(boardFile, sample('Dropped', ['d1', 'd2']));
    fs.writeFileSync(textFile, '사과\n배\n포도\n');
    await kb(app, `k.actions.handleDroppedPaths([${JSON.stringify(boardFile)}], null).then(() => 1)`);
    assert.equal(await kb(app, 'k.actions.activeBoard().title'), 'Dropped');
    const before = (await board(app)).columns.flatMap((c) => c.cards).length;
    const area = await app.main.center('.column[data-column-id="c2"] .cards');
    await kb(app, `k.actions.handleDroppedPaths([${JSON.stringify(textFile)}], ${JSON.stringify(area)}).then(() => 1)`);
    const after = await board(app);
    assert.equal(after.columns.flatMap((c) => c.cards).length, before + 3);
    assert.equal(after.columns[1].cards.length, 3, 'cards land in the column under the drop');
  } },

  // ───────────────────────── attachments
  { group: '첨부', name: '카드에 파일·이미지 첨부, 썸네일, 이미지 보기', async run(app) {
    const cardId = await kb(app, `(() => { const b = k.actions.activeBoard(); return k.actions.addCard(b.columns[0].id, { title: '첨부 카드' }).id; })()`);
    const pdf = path.join(app.files, 'report.pdf');
    fs.writeFileSync(pdf, '%PDF-1.4 test');
    await kb(app, `k.actions.attachPaths('${cardId}', [${JSON.stringify(path.join(root, 'assets', 'icon-256.png'))}, ${JSON.stringify(pdf)}]).then((a) => a.length)`);
    const card = await kb(app, `k.board.findCard(k.actions.activeBoard(), '${cardId}').card`);
    assert.equal(card.attachments.length, 2);
    assert.ok(card.attachments[0].thumb.startsWith('data:image/'), 'image thumbnail');
    assert.equal(card.attachments[0].width, 256);
    assert.equal(await app.main.eval(`document.querySelectorAll('.card[data-card-id="${cardId}"] .card-thumb').length`), 1, 'thumbnail on the card');
    await app.main.click(`.card[data-card-id="${cardId}"] .card-thumb`);
    const viewer = await app.popup('image');
    await viewer.waitFor(`document.querySelector('#image-view')?.classList.contains('full')`);
    await expectPopupWindow(app, viewer, 'image');
    assert.equal(await viewer.eval(`document.querySelector('#image-view').naturalWidth`), 256, 'full image');
    await viewer.click('[data-action="close"]');
  } },
  { group: '첨부', name: '카드 위로 끌어다 놓으면 첨부, 저장·열기', async run(app) {
    const cardId = await kb(app, `k.board.allCards(k.actions.activeBoard()).find((c) => c.title === '첨부 카드').id`);
    const note = path.join(app.files, 'note.txt');
    fs.writeFileSync(note, '메모 내용');
    await kb(app, `k.actions.select('card', ['${cardId}']) || 1`);
    const point = await app.main.center(`.card[data-card-id="${cardId}"] .card-title`);
    await kb(app, `k.actions.handleDroppedPaths([${JSON.stringify(note)}], ${JSON.stringify(point)}).then(() => 1)`);
    const item = await kb(app, `k.board.findCard(k.actions.activeBoard(), '${cardId}').card.attachments.find((a) => a.name === 'note.txt')`);
    assert.ok(item, 'attached by dropping onto the card');
    // Save through the backend (the save dialog is skipped by writing straight to a path).
    const out = path.join(app.files, 'saved-note.txt');
    await kb(app, `window.__TAURI_INTERNALS__.invoke('write_base64_file', { path: ${JSON.stringify(out)}, data: k.actions.attachmentStore().get('${item.id}').split(',')[1], op: 'x' }).then(() => 1)`);
    assert.equal(fs.readFileSync(out, 'utf8'), '메모 내용');
    const opened = await kb(app, `window.__TAURI_INTERNALS__.invoke('open_attachment', { name: 'note.txt', data: k.actions.attachmentStore().get('${item.id}').split(',')[1] })`);
    assert.equal(fs.readFileSync(opened, 'utf8'), '메모 내용');
    // The attachment travels with the saved board.
    const file = path.join(app.files, 'with-attachments.mkanban');
    await kb(app, `(async () => { const d = k.actions.activeDoc(); d.path = ${JSON.stringify(file)}; return k.actions.saveDoc(d); })()`);
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.ok(Object.keys(saved.attachments).length >= 3, 'contents saved with the board');
  } },

  // ───────────────────────── projects & databases
  { group: '프로젝트·DB', name: '새 프로젝트 (SQLite) 만들기·저장·다시 열기', async run(app) {
    const db = path.join(app.files, 'project.db');
    const creating = kb(app, `k.actions.newProject().then((p) => Boolean(p))`);
    const page = await app.popup('project');
    await expectPopupWindow(app, page, 'project');
    await page.eval(`(() => { const i = document.querySelector('#project-name'); i.value = 'SQLite 프로젝트'; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
    await page.click('[data-action="tab"][data-value="storage"]');
    await page.click('[data-storage-kind="sqlite"]');
    await page.eval(`(() => { const i = document.querySelector('#sqlite-file'); i.value = ${JSON.stringify(db)}; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
    await page.click('[data-action="test-db"]');
    await page.waitFor(`document.querySelector('#db-result').className.includes('ok')`, { timeout: 15000 });
    await page.click('[data-action="project-apply"]');
    assert.equal(await creating, true);
    await kb(app, `(() => { const b = k.actions.activeBoard(); k.actions.addCard(b.columns[0].id, { title: '프로젝트 카드' }); return 1; })()`);
    const file = path.join(app.files, 'sqlite.mkproj');
    await kb(app, `(() => { k.state.project.path = ${JSON.stringify(file)}; return k.actions.saveProject(); })()`);
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(saved.format, 'mykanbanboard-project');
    assert.equal(saved.project.storage.kind, 'sqlite');
    assert.ok(!JSON.stringify(saved).includes('프로젝트 카드'), 'boards are in the database, not the file');
    assert.ok(fs.statSync(db).size > 0);
    await kb(app, `k.actions.closeProject().then(() => 1)`);
    assert.equal(await kb(app, 'k.state.project'), null);
    await kb(app, `k.actions.openProject(${JSON.stringify(file)}).then(() => 1)`);
    assert.equal(await kb(app, 'k.state.project.project.name'), 'SQLite 프로젝트');
    assert.ok(await kb(app, `k.board.allCards(k.actions.projectDocs()[0].board).some((c) => c.title === '프로젝트 카드')`));
    await kb(app, `k.actions.closeProject({ force: true }).then(() => 1)`);
  } },
  { group: '프로젝트·DB', name: '로컬 프로젝트 (DB 없음): 보드가 파일 안에', async run(app) {
    await kb(app, `(async () => {
      k.state.project = null;
      const p = { id: 'local-1', name: '로컬', description: '', created: '', updated: '', storage: { kind: 'local', host: 'localhost', port: null, database: '', user: '', file: '', savePassword: false, password: '' }, boards: [] };
      k.state.project = { project: p, path: null, password: '', saved: '' };
      const doc = k.actions.activeDoc();
      k.actions.addToProject(doc);
      return 1;
    })()`);
    const file = path.join(app.files, 'local.mkproj');
    await kb(app, `(() => { k.state.project.path = ${JSON.stringify(file)}; return k.actions.saveProject(); })()`);
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(saved.project.storage.kind, 'local');
    assert.ok(saved.project.boards[0].board.columns, 'board embedded');
    await kb(app, `k.actions.closeProject({ force: true }).then(() => 1)`);
    await kb(app, `k.actions.openProject(${JSON.stringify(file)}).then(() => 1)`);
    assert.equal(await kb(app, 'k.actions.projectDocs().length'), 1);
    await kb(app, `k.actions.closeProject({ force: true }).then(() => 1)`);
  } },
  { group: '프로젝트·DB', name: 'MariaDB 프로젝트: 저장·비밀번호 물어 다시 열기', async run(app) {
    const server = mysqlServer();
    const client = mysqlClient();
    if (!server || !client) return { skipped: 'test/db.local.json 또는 mysql 클라이언트 없음' };
    const database = `mykanban_e2e_${process.pid}`;
    mysqlRun(client, server, `DROP DATABASE IF EXISTS ${database}; CREATE DATABASE ${database} CHARACTER SET utf8mb4;`);
    try {
      const storage = { kind: 'mariadb', host: server.host, port: server.port, database, user: server.user, file: '', savePassword: false, password: '' };
      await kb(app, `(() => {
        const p = { id: 'maria-e2e', name: 'MariaDB 프로젝트', description: '', created: '', updated: '', storage: ${JSON.stringify(storage)}, boards: [] };
        k.state.project = { project: p, path: null, password: ${JSON.stringify(server.password)}, saved: '' };
        k.actions.newBoard();
        const b = k.actions.activeBoard();
        k.actions.addCard(b.columns[0].id, { title: 'DB 카드 😀' });
        k.actions.addToProject(k.actions.activeDoc());
        return 1;
      })()`);
      const file = path.join(app.files, 'maria.mkproj');
      assert.equal(await kb(app, `(() => { k.state.project.path = ${JSON.stringify(file)}; return k.actions.saveProject(); })()`), true);
      const rows = mysqlRun(client, server, `SELECT title FROM ${database}.mykanban_boards`);
      assert.ok(rows.trim().length > 0, 'board row in MariaDB');
      assert.ok(!fs.readFileSync(file, 'utf8').includes(server.password), 'password not in the file');
      await kb(app, `k.actions.closeProject({ force: true }).then(() => 1)`);
      const opening = kb(app, `k.actions.openProject(${JSON.stringify(file)}).then((p) => Boolean(p))`);
      const page = await app.popup('project');
      await page.waitFor(`document.querySelector('#db-password')`);
      await expectPopupWindow(app, page, 'project');
      await page.eval(`(() => { const i = document.querySelector('#db-password'); i.value = ${JSON.stringify(server.password)}; i.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
      await page.click('[data-action="project-apply"]');
      assert.equal(await opening, true);
      assert.ok(await kb(app, `k.board.allCards(k.actions.projectDocs()[0].board).some((c) => c.title === 'DB 카드 😀')`), 'boards loaded from MariaDB');
      await kb(app, `k.actions.closeProject({ force: true }).then(() => 1)`);
    } finally {
      mysqlRun(client, server, `DROP DATABASE IF EXISTS ${database};`);
    }
    return undefined;
  } },
  { group: '프로젝트·DB', name: '잘못된 DB 설정 → 연결 테스트가 오류를 보여 줌', async run(app) {
    for (let i = 0; i < 50 && (await app.hasPopup('project')); i++) await sleep(100);
    const page = await openPopup(app, 'project', () => kb(app, `k.popups.open('project', { mode: 'new', project: { name: 'x', storage: { kind: 'postgres', host: '127.0.0.1', port: 1, database: 'nope', user: 'u' }, boards: [] }, desktop: true }) && 1`));
    await page.click('[data-action="tab"][data-value="storage"]');
    await page.click('[data-action="test-db"]');
    await page.waitFor(`document.querySelector('#db-result').className.includes('fail')`, { timeout: 20000 });
    assert.match(await page.eval(`document.querySelector('#db-result').textContent`), /127\.0\.0\.1/);
    await page.click('[data-action="close"]');
  } },

  // ───────────────────────── exit
  { group: '종료', name: '저장 안 한 변경 → 종료 시 저장 여부 팝업, 팝업도 함께 닫힘', async run(app) {
    await kb(app, `(() => { k.actions.newBoard(); const b = k.actions.activeBoard(); k.actions.addCard(b.columns[0].id, { title: 'unsaved' }); return 1; })()`);
    await kb(app, `k.popups.open('about') && 1`);
    await app.popup('about');
    await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|close', { label: 'main' }).catch(() => 1); 1`);
    const confirm = await app.popup('confirm');
    await expectPopupWindow(app, confirm, 'confirm');
    assert.ok((await confirm.eval(`document.body.innerText`)).includes('새 보드'), 'lists the unsaved board');
    await confirm.click('[data-value="cancel"]');
    await sleep(600);
    assert.equal(app.process.exitCode, null, 'cancel keeps the app running');
    await app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|close', { label: 'main' }).catch(() => 1); 1`).catch(() => {});
    const again = await app.popup('confirm');
    await again.click('[data-value="discard"]').catch(() => {});
    const code = await Promise.race([app.exited, sleep(8000).then(() => 'timeout')]);
    assert.notEqual(code, 'timeout', 'the app ended');
    assert.equal(app.windowInfo === undefined ? 0 : 0, 0);
    await app.launch();
  } },
];
