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
const TITLE = `MyWorkPlan v${VERSION}`;
const WS_THICKFRAME = 0x40000;
const POPUP_SCROLL_CHECK = `(() => [...document.querySelectorAll('*')].filter((e) => {
  const style = getComputedStyle(e);
  return ['auto', 'scroll'].includes(style.overflowY) && e.scrollHeight > e.clientHeight + 1 && e.tagName !== 'SELECT' && e.tagName !== 'TEXTAREA';
}).map((e) => e.className || e.tagName))()`;

// windowsHide: a console window would take the focus away (and close an open menu).
const ps = (script) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }).toString().trim();
const getClipboard = () => ps('[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Clipboard -Raw');
const setClipboard = (text) => ps(`Set-Clipboard -Value @'\n${text}\n'@`);

const W = (app, expression) => app.main.eval(`(() => { const w = window.__myworkplan; const a = w.actions; const api = w.api; return ${expression}; })()`);
const resize = (app, width, height) => app.main.eval(`window.__TAURI_INTERNALS__.invoke('plugin:window|set_size', { label: 'main', value: { Logical: { width: ${width}, height: ${height} } } }).then(() => 1)`);
const mainWindow = (app) => app.windowInfo().find((w) => w.owner === 0 && w.visible && w.title.startsWith('MyWorkPlan'));

async function closePopups(app) {
  await app.main.eval(`window.__myworkplan.popups.closeAll().then(() => 1)`).catch(() => {});
  await sleep(200);
}

async function freshSample(app) {
  await closePopups(app);
  await W(app, `(() => { for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true }); a.openSampleBuiltin(); a.switchView('gantt'); return 1; })()`);
  await sleep(500);
}

/** OS window checks for a popup: its own window titled "<title> — MyWorkPlan vX", owned by the main window, fixed size, no scroll bars, icon + title. */
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

function tempDir(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mwp-${name}-`));
  return dir;
}

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
  { group: '처음 실행', name: '시작 페이지: 템플릿 8개, 최근 파일·폴더, 예제, 튜토리얼 시작 버튼', async run(app) {
    const info = await app.main.eval(`({ shown: !document.querySelector('#start-page').hidden, templates: document.querySelectorAll('.template-tile').length, tutorial: Boolean(document.querySelector('[data-start="tutorial"]')), banner: Boolean(document.querySelector('.start-banner')), recent: Boolean(document.querySelector('.start-card.recent')), samples: document.querySelectorAll('[data-start="open-sample"], [data-start="builtin-sample"]').length })`);
    assert.ok(info.shown, 'start page shown');
    assert.equal(info.templates, 8);
    assert.ok(info.tutorial && info.banner && info.recent, JSON.stringify(info));
    assert.ok(info.samples >= 1, 'sample projects listed');
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
    await app.main.click('[data-start="animation"][data-value="gantt"]');
    await sleep(200);
    assert.equal(await W(app, 'w.state.settings.animation'), 'gantt');
  } },

  // ───────────────────────── window
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
  { group: '창', name: '타이틀 바: 프로그램 이름과 버전', async run(app) {
    assert.equal(mainWindow(app)?.title, TITLE);
  } },
  { group: '창', name: '이미 실행 중이면 오류 팝업 후 종료 (두 번째 실행)', async run(app) {
    const lockDir = tempDir('lock');
    const report = path.join(lockDir, 'already.txt');
    const profile = tempDir('profile2');
    const exe = path.join(root, 'src-tauri', 'target', 'debug', 'myworkplan.exe');
    const env = { ...process.env, MYWORKPLAN_LOCK_DIR: lockDir, MYWORKPLAN_CONFIG_DIR: profile, MYWORKPLAN_DATA_DIR: profile, WEBVIEW2_USER_DATA_FOLDER: profile };
    delete env.MYWORKPLAN_MULTI;
    delete env.ELECTRON_RUN_AS_NODE;
    const first = spawn(exe, [], { env, stdio: 'ignore' });
    try {
      await sleep(2500);
      // The real message box (no test hook): it must open in front of everything.
      const second = spawn(exe, [], { env, stdio: 'ignore' });
      const exited = new Promise((resolve) => second.once('exit', resolve));
      const probe = (close = false) => JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'test', 'e2e', 'dialogs.ps1'), '-ProcessId', String(second.pid), ...(close ? ['-Close'] : [])], { windowsHide: true }).toString() || '[]');
      let box;
      for (let i = 0; i < 40 && !box; i++) { await sleep(250); box = probe().find((w) => w.class === '#32770'); }
      assert.ok(box, 'the second copy shows a message box');
      assert.match(box.title, /MyWorkPlan/);
      // Topmost keeps it above every window. Keyboard focus also needs Windows' consent: a copy started from Explorer gets it,
      // one started by this background test process may not, so focus is not required here.
      assert.ok(box.topmost, `the message box is in front of every window ${JSON.stringify(box)}`);
      assert.equal(first.exitCode, null, 'the first copy keeps running');
      probe(true); // OK
      const code = await Promise.race([exited, sleep(10000).then(() => 'running')]);
      assert.equal(code, 3, 'the second copy quits after the message');
      // The wording (Korean/English) is checked by instance.rs unit tests and through the text hook:
      const third = spawn(exe, [], { env: { ...env, MYWORKPLAN_ALREADY_RUNNING_FILE: report }, stdio: 'ignore' });
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
  { group: '창', name: '상태 표시줄: 상태 정보와 명령 결과', async run(app) {
    await freshSample(app);
    await W(app, `a.insertTask({ name: 'status check' }, { edit: false })`);
    await W(app, `(w.run('calculate'), 1)`);
    await app.main.waitFor(`document.querySelector('#statusbar .status-notice')?.textContent.trim().length > 3`, { timeout: 3000 });
    const items = await app.main.eval(`[...document.querySelectorAll('#statusbar .status-item, #statusbar .status-notice')].map((e) => e.textContent.trim())`);
    assert.ok(items.length >= 8, JSON.stringify(items));
    assert.ok(items[0].length > 3, 'the last command result is shown');
    assert.ok(items.some((text) => /작업 \d+|\d+ tasks/.test(text)), 'task count');
    await W(app, 'a.undo()');
  } },

  // ───────────────────────── toolbar
  { group: '툴바', name: '모든 버튼에 툴팁 · 한 줄 · 아이콘은 서로 다름', async run(app) {
    const missing = await app.main.eval(`[...document.querySelectorAll('#toolbar button, #toolbar input, #tabs button, #left-panel button, #right-panel button, #statusbar button')].filter((b) => !(b.title || '').trim()).map((b) => b.outerHTML.slice(0, 90))`);
    assert.deepEqual(missing, []);
    const icons = await app.main.eval(`[...document.querySelectorAll('#toolbar [data-command]')].filter((b) => b.dataset.command !== 'language').map((b) => b.querySelector('svg')?.innerHTML)`);
    assert.equal(new Set(icons).size, icons.length, 'no two toolbar buttons share an icon');
  } },
  { group: '툴바', name: '프로그램 정보 버튼: 빌드 정보와 제작자', async run(app) {
    await app.main.click('[data-command="about"]');
    const page = await app.popup('about');
    await expectPopupWindow(app, page, 'about');
    const text = await page.eval(`document.querySelector('.popup').innerText`);
    assert.match(text, /SHKWON\(knix008@naver\.com\)/);
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
    await page.click('[data-pick-theme="nord"]');
    page.close();
    await sleep(400);
    assert.equal(await W(app, 'w.state.settings.theme'), 'nord');
  } },
  { group: '툴바', name: '모든 테마에서 글자가 잘 보임 (실제 화면 색 대비)', async run(app) {
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
        for (const el of document.querySelectorAll('.menubar-item span, .grid-cell, .grid-hcell span, .panel-header span, .view-button span, .status-item span, .tab-name, .prop-label span, .prop-value')) {
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

  // ───────────────────────── menus
  ...[['file', '파일'], ['edit', '편집'], ['view', '보기'], ['task', '작업'], ['resource', '자원'], ['project', '프로젝트'], ['report', '보고서'], ['help', '도움말']].map(([name, title]) => ({ group: '메뉴', name: `메뉴 "${title}": 독립 창, 한 줄, 아이콘+이름`, async run(app) {
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
    await expectPopupWindow(app, menu, 'menu');
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
  { group: '메뉴', name: '긴 메뉴는 분류된 하위 메뉴 (보기 › 보기 전환 › 네트워크 다이어그램)', async run(app) {
    await freshSample(app);
    await app.main.click('[data-menu="view"]');
    let menu = await app.popup('menu');
    await menu.waitFor(`document.querySelector('[data-id="submenu:views"]')`);
    await sleep(250);
    const groups = await menu.eval(`[...document.querySelectorAll('.menu-item.has-sub')].map((i) => ({ id: i.dataset.id, arrow: Boolean(i.querySelector('.menu-check svg')) }))`);
    assert.ok(groups.length >= 4 && groups.every((g) => g.arrow), JSON.stringify(groups));
    const parent = await menu.eval(`(() => { const r = document.querySelector('[data-id="submenu:views"]').getBoundingClientRect(); return { right: window.screenX + r.right, top: window.screenY + r.top }; })()`);
    await menu.click('[data-id="submenu:views"]');
    menu.close();
    await sleep(300);
    menu = await app.popup('menu');
    await menu.waitFor(`document.querySelector('[data-id="view:network"]') && document.hasFocus()`);
    await sleep(250);
    const place = await menu.eval(`({ x: window.screenX, y: window.screenY, head: document.querySelector('.popup-menu').getAttribute('aria-label'), count: document.querySelectorAll('.menu-item').length })`);
    assert.equal(place.head, '보기 전환');
    assert.equal(place.count, 12);
    assert.ok(Math.abs(place.x - parent.right) < 12 && Math.abs(place.y - parent.top) < 20, `submenu opens beside its row ${JSON.stringify({ parent, place })}`);
    await menu.click('[data-id="view:network"]');
    menu.close();
    await sleep(500);
    assert.equal(await W(app, 'w.state.viewId'), 'network');
    assert.ok(await app.main.eval(`document.querySelectorAll('.net-box').length > 10`));
    await W(app, `a.switchView('gantt')`);
  } },

  // ───────────────────────── context menus
  { group: '컨텍스트 메뉴', name: '대상마다 다른 메뉴 (작업 행·막대·연결선·열 머리글·차트·자원·탭·입력 칸), 모든 항목에 아이콘', async run(app) {
    await freshSample(app);
    const open = async (selector, expectHeader) => {
      const point = await app.main.center(selector);
      await app.main.realClick(point.x, point.y, { button: 'right' });
      const menu = await app.popup('menu');
      await menu.waitFor(`document.querySelector('.menu-item')`);
      await sleep(200);
      const info = await menu.eval(`({ head: document.querySelector('.popup-menu').getAttribute('aria-label'), ids: [...document.querySelectorAll('.menu-item')].map((i) => i.dataset.id), noIcon: [...document.querySelectorAll('.menu-item')].filter((i) => !i.querySelector('.menu-icon svg')).length })`);
      await menu.key('Escape');
      menu.close();
      await sleep(250);
      assert.equal(info.noIcon, 0, `${selector}: icons`);
      if (expectHeader) assert.match(info.head, expectHeader, selector);
      return info.ids.join(',');
    };
    const row = await open('.grid-row[data-index="2"] .grid-cell[data-field="name"]', /^\d+\./);
    const bar = await open('.bar.task');
    const header = await open('.grid-hcell[data-field="duration"]');
    const chart = await open('.chart-body');
    const link = await app.main.eval(`(() => { for (const p of document.querySelectorAll('.link-hit')) { const m = p.getScreenCTM(); for (const f of [0.15, 0.5, 0.85]) { const q = p.getPointAtLength(p.getTotalLength() * f); const x = m.a * q.x + m.c * q.y + m.e; const y = m.b * q.x + m.d * q.y + m.f; if (document.elementFromPoint(x, y) === p) return { x, y }; } } return null; })()`);
    assert.ok(link, 'a link line on screen');
    await app.main.realClick(link.x, link.y, { button: 'right' });
    const linkMenu = await app.popup('menu');
    await linkMenu.waitFor(`document.querySelector('.menu-item')`);
    const linkIds = await linkMenu.eval(`[...document.querySelectorAll('.menu-item')].map((i) => i.dataset.id).join(',')`);
    await linkMenu.key('Escape');
    linkMenu.close();
    await sleep(250);
    const tab = await open('.tab[data-doc]');
    const input = await open('#right-panel input');
    await W(app, `a.switchView('resourceSheet')`);
    await sleep(300);
    const resource = await open('.grid-row[data-index="0"] .grid-cell[data-field="name"]');
    await W(app, `a.switchView('gantt')`);
    const all = [row, bar, header, chart, linkIds, tab, input, resource];
    assert.equal(new Set(all).size, all.length, `every target has its own menu:\n${all.join('\n')}`);
    assert.match(linkIds, /custom:type:SS/);
    assert.match(header, /custom:hide/);
  } },

  // ───────────────────────── popups
  ...[
    ['settings', `window.__myworkplan.run('settings')`],
    ['task', `window.__myworkplan.run('taskInfo')`],
    ['resource', `window.__myworkplan.api.openResourceInfo(window.__myworkplan.api.project().resources[0].id)`],
    ['project', `window.__myworkplan.run('projectInfo')`],
    ['calendar', `window.__myworkplan.run('calendar')`],
    ['baseline', `window.__myworkplan.run('setBaseline')`],
    ['update', `window.__myworkplan.run('updateProject')`],
    ['leveling', `window.__myworkplan.run('levelingOptions')`],
    ['recurring', `window.__myworkplan.run('insertRecurring')`],
    ['find', `window.__myworkplan.run('find')`],
    ['columns', `window.__myworkplan.run('columns')`],
    ['assign', `window.__myworkplan.run('assign')`],
    ['print', `window.__myworkplan.run('print')`],
    ['recent', `window.__myworkplan.run('recent')`],
    ['link', `(() => { const p = window.__myworkplan.api.project(); const t = p.tasks.find((x) => x.predecessors.length); return window.__myworkplan.api.openLinkInfo(t.predecessors[0].taskId, t.id); })()`],
  ].map(([kind, js]) => ({ group: '팝업', name: `"${kind}": 독립 OS 창 · 크기 고정 · 스크롤 없음 · 아이콘+제목 · 정렬 · 이동 가능`, async run(app) {
    await closePopups(app);
    if (!(await W(app, 'Boolean(api.project())'))) await freshSample(app);
    await W(app, `api.select('task', [api.project().tasks[3].id])`);
    await app.main.eval(`${js}; 1`);
    const page = await app.popup(kind);
    await sleep(350);
    const { popup } = await expectPopupWindow(app, page, kind);
    // Tabs: every tab also has no scroll bars.
    assert.deepEqual(await page.eval(ALIGN_CHECK), [], `${kind}: controls and buttons line up`);
    assert.deepEqual(await page.eval(CLIP_CHECK), [], `${kind}: nothing cut off`);
    const tabs = await page.eval(`[...document.querySelectorAll('.tabs [data-action="tab"]')].map((t) => t.dataset.value)`);
    if (tabs.length) {
      const nav = await page.eval(`(() => { const n = document.querySelector('.tabs .tabs-nav'); if (!n) return null; const r = n.getBoundingClientRect(); return { right: document.querySelector('.tabs').getBoundingClientRect().right - r.right, buttons: n.querySelectorAll('.tabs-scroll').length, scrollbar: document.querySelector('.tabs-strip').offsetHeight - document.querySelector('.tabs-strip').clientHeight }; })()`);
      assert.ok(nav && nav.buttons === 2 && nav.right < 16 && nav.scrollbar === 0, `${kind}: < > at the right end of the tabs ${JSON.stringify(nav)}`);
    }
    for (const tab of tabs) {
      await page.eval(`document.querySelector('.tabs [data-value="${tab}"]').click(); 1`);
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

  // ───────────────────────── editing
  { group: '편집', name: '표에서 기간 입력 → 일정 다시 계산, 실행 취소/다시 실행', async run(app) {
    await freshSample(app);
    // A task that has not started (a finished task keeps its actual finish).
    const index = await W(app, `api.taskRows().findIndex((r) => r.task && !api.sched().info(r.task.id).summary && !r.task.milestone && !r.task.actualStart && !(r.task.percentComplete > 0))`);
    const id = await W(app, `api.taskRows()[${index}].task.id`);
    const before = await W(app, `api.sched().info('${id}').finish`);
    await app.main.eval(`(() => { const cell = document.querySelector('.grid-row[data-index="${index}"] .grid-cell[data-field="duration"]'); cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return 1; })()`);
    await sleep(150);
    await app.main.eval(`(() => { const e = document.querySelector('.grid-editor'); e.value = '9d'; e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return 1; })()`);
    await sleep(300);
    const after = await W(app, `api.sched().info('${id}').finish`);
    assert.ok(after > before, 'finish moved later');
    await app.main.key('z', 2);
    await sleep(200);
    assert.equal(await W(app, `api.sched().info('${id}').finish`), before, 'Ctrl+Z');
    await app.main.key('y', 2);
    await sleep(200);
    assert.equal(await W(app, `api.sched().info('${id}').finish`), after, 'Ctrl+Y');
  } },
  { group: '편집', name: '작업 삽입·마일스톤·들여쓰기·연결 (툴바)', async run(app) {
    await freshSample(app);
    const count = await W(app, 'api.project().tasks.length');
    await W(app, `api.select('task', [api.project().tasks[6].id])`);
    await app.main.click('[data-command="insertTask"]');
    await sleep(200);
    await app.main.key('Escape');
    await app.main.click('[data-command="insertMilestone"]');
    await sleep(200);
    await app.main.key('Escape');
    assert.equal(await W(app, 'api.project().tasks.length'), count + 2);
    const ms = await W(app, `api.project().tasks.find((t) => t.milestone && t.name === w.t('task.newMilestone'))?.id`);
    assert.ok(ms);
    // Indent a task whose previous row is on the same level (otherwise indent rightly does nothing).
    const target = await W(app, `(() => { const list = api.project().tasks; const i = list.findIndex((t, k) => k > 0 && list[k - 1].outlineLevel === t.outlineLevel && !api.sched().info(t.id).summary); return list[i].id; })()`);
    const level = await W(app, `api.project().tasks.find((t) => t.id === '${target}').outlineLevel`);
    await W(app, `api.select('task', ['${target}'])`);
    await app.main.click('[data-command="indent"]');
    await sleep(200);
    assert.equal(await W(app, `api.project().tasks.find((t) => t.id === '${target}').outlineLevel`), level + 1);
    const ids = await W(app, `api.project().tasks.filter((t) => !api.sched().info(t.id).summary && !t.milestone).slice(-2).map((t) => t.id)`);
    await W(app, `api.select('task', ${JSON.stringify(ids)})`);
    await W(app, `a.change('op.unlink', (p) => { for (const t of p.tasks) if (t.id === '${ids[0]}' || t.id === '${ids[1]}') t.predecessors = []; })`);
    await app.main.click('[data-command="link"]');
    await sleep(200);
    assert.ok(await W(app, `api.project().tasks.find((t) => t.id === '${ids[1]}').predecessors.some((l) => l.taskId === '${ids[0]}')`));
  } },
  { group: '편집', name: '간트 막대 끌기: 이동·기간·연결 (실제 마우스)', async run(app) {
    await freshSample(app);
    await W(app, `a.setTimescale(40)`);
    await sleep(500);
    const id = await W(app, `api.project().tasks.find((t) => !api.sched().info(t.id).summary && !t.milestone && !t.actualStart && api.sched().info(t.id).row > 10).id`);
    await W(app, `(a.switchView('gantt'), api.select('task', ['${id}']), w.run('scrollToTask'), 1)`);
    await sleep(400);
    const startBefore = await W(app, `api.sched().info('${id}').start`);
    const box = await app.main.eval(`(() => { const r = document.querySelector('.bar[data-task="${id}"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, right: r.right - 2 }; })()`);
    await app.main.drag({ x: box.x, y: box.y }, { x: box.x + 120, y: box.y });
    await sleep(400);
    const task = await W(app, `JSON.parse(JSON.stringify(api.project().tasks.find((t) => t.id === '${id}')))`);
    assert.equal(task.constraint.type, 'SNET', 'moving sets "start no earlier than"');
    assert.ok(await W(app, `api.sched().info('${id}').start`) > startBefore, 'moved later');
    const durationBefore = task.duration;
    const bar = await app.main.eval(`(() => { const r = document.querySelector('.bar[data-task="${id}"]').getBoundingClientRect(); return { x: r.right - 2, y: r.top + r.height / 2 }; })()`);
    await app.main.drag(bar, { x: bar.x + 80, y: bar.y });
    await sleep(400);
    assert.ok(await W(app, `api.project().tasks.find((t) => t.id === '${id}').duration`) > durationBefore, 'resizing lengthens the task');
  } },
  { group: '편집', name: '클립보드: Ctrl+C 로 작업 복사 (OS 클립보드), Ctrl+V 로 붙여넣기, 외부 텍스트 붙여넣기', async run(app) {
    await freshSample(app);
    await W(app, `api.select('task', [api.project().tasks[2].id]); document.querySelector('.grid-body').focus()`);
    await app.main.key('c', 2);
    await sleep(500);
    const name = await W(app, 'api.project().tasks[2].name');
    assert.ok(getClipboard().includes(name), 'the task is on the OS clipboard');
    const count = await W(app, 'api.project().tasks.length');
    await app.main.key('v', 2);
    await sleep(500);
    assert.equal(await W(app, 'api.project().tasks.length'), count + 1);
    setClipboard('외부 작업 하나\t2d\n외부 작업 둘');
    await app.main.key('v', 2);
    await sleep(600);
    assert.ok(await W(app, `api.project().tasks.some((t) => t.name === '외부 작업 하나' && t.duration === 960)`), 'text from another program becomes tasks');
  } },
  { group: '편집', name: 'Ctrl+마우스 휠: 확대/축소, 차트 위에서는 시간 눈금', async run(app) {
    await freshSample(app);
    await W(app, `a.updateSettings({ zoom: 100, timescale: 16 })`);
    const grid = await app.main.center('.grid-body');
    await app.main.wheel(grid.x, grid.y, -100, 2);
    await sleep(300);
    assert.equal(await W(app, 'w.state.settings.zoom'), 110);
    const chart = await app.main.center('.chart-body');
    await app.main.wheel(chart.x, chart.y, -100, 2);
    await sleep(400);
    assert.ok(await W(app, 'w.state.settings.timescale') > 16, 'timescale zoomed in');
    await W(app, `a.updateSettings({ zoom: 100, timescale: 16 })`);
  } },
  { group: '편집', name: 'Ctrl+끌기로 차트 이동', async run(app) {
    await freshSample(app);
    await sleep(300);
    const before = await app.main.eval(`document.querySelector('.chart-body').scrollLeft`);
    const point = await app.main.center('.chart-body');
    await app.main.mouse('mouseMoved', point.x, point.y, { button: 'none' });
    await app.main.mouse('mousePressed', point.x, point.y, { modifiers: 2 });
    for (let i = 1; i <= 8; i++) await app.main.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x - i * 20, y: point.y, button: 'left', buttons: 1, modifiers: 2, pointerType: 'mouse' });
    await app.main.mouse('mouseReleased', point.x - 160, point.y, { modifiers: 2 });
    await sleep(200);
    assert.ok(await app.main.eval(`document.querySelector('.chart-body').scrollLeft`) > before + 100);
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
    assert.ok(min >= 236, `never narrower than its content (${min})`);
    const clipped = await app.main.eval(`[...document.querySelectorAll('#left-panel .tool-tile span, #left-panel .view-button span')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent)`);
    assert.deepEqual(clipped, [], 'all labels fit at the minimum width');
  } },
  { group: '탭', name: '탭이 많으면 스크롤바 대신 오른쪽 끝에 < > 버튼', async run(app) {
    await freshSample(app);
    const idle = await app.main.eval(`(() => { const n = document.querySelector('#tabs .tab-nav'); return { shown: getComputedStyle(n).display !== 'none', disabled: [...n.querySelectorAll('.tab-scroll')].map((x) => x.disabled) }; })()`);
    assert.deepEqual(idle, { shown: true, disabled: [true, true] }, 'always there, disabled while the tabs fit');
    await W(app, `(() => { for (let i = 0; i < 14; i++) a.newPlan(); return 1; })()`);
    await sleep(400);
    const info = await app.main.eval(`(() => { const tabs = document.querySelector('#tabs'); const nav = tabs.querySelector('.tab-nav'); const strip = tabs.querySelector('.tab-strip'); return { overflow: tabs.classList.contains('overflow'), navRight: tabs.getBoundingClientRect().right - nav.getBoundingClientRect().right, scrollbar: strip.offsetHeight - strip.clientHeight }; })()`);
    assert.ok(info.overflow && info.navRight < 12 && info.scrollbar === 0, JSON.stringify(info));
    await app.main.eval(`document.querySelector('.tab-strip').scrollLeft = 0; window.__myworkplan.actions.scrollTabs(1); 1`);
    await sleep(200);
    assert.ok(await app.main.eval(`document.querySelector('.tab-strip').scrollLeft > 0`), '> scrolls the tabs');
    await W(app, `(() => { for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true }); return 1; })()`);
  } },

  // ───────────────────────── views
  ...['gantt', 'tracking', 'taskSheet', 'taskUsage', 'network', 'calendar', 'timeline', 'resourceSheet', 'resourceUsage', 'resourceGraph', 'teamPlanner', 'reports'].map((view) => ({ group: '보기', name: `${view} 보기가 그려짐`, async run(app) {
    await freshSample(app);
    app.main.errors.length = 0;
    await W(app, `a.switchView('${view}')`);
    await sleep(600);
    const filled = await app.main.eval(`(() => { const host = document.querySelector('#view-host'); return host.innerText.trim().length > 30 && host.querySelectorAll('*').length > 30; })()`);
    assert.ok(filled, 'the view has content');
    assert.deepEqual(await app.main.eval(CLIP_CHECK), [], 'nothing in the window is cut off');
    assert.deepEqual(app.main.errors, []);
    assert.equal(await app.hasPopup('error'), false, 'no error popup');
  } })),

  // ───────────────────────── scheduling features
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
    const expected = await app.main.eval(`(async () => { const { criticalPath } = await import('/src/domain/critical.js'); const api = window.__myworkplan.api; return criticalPath(api.project(), api.sched()).ids.size; })()`);
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
  { group: '일정', name: '자원 평준화로 초과 할당 해소 (진행 팝업)', async run(app) {
    await freshSample(app);
    assert.ok(await W(app, `[...api.sched().resources.values()].some((r) => r.overallocated)`), 'the sample starts overallocated');
    await W(app, `a.levelNow()`);
    await sleep(800);
    assert.equal(await W(app, `[...api.sched().resources.values()].some((r) => r.overallocated)`), false);
    await W(app, `a.clearLeveling()`);
    await sleep(300);
    assert.ok(await W(app, `[...api.sched().resources.values()].some((r) => r.overallocated)`), 'clear leveling restores');
  } },
  { group: '일정', name: '작업 정보 팝업에서 이름·기간·선행 작업 바꾸기', async run(app) {
    await freshSample(app);
    const id = await W(app, `api.project().tasks[13].id`);
    await W(app, `api.select('task', ['${id}'])`);
    await W(app, `(w.run('taskInfo'), 1)`);
    const page = await app.popup('task');
    await page.eval(`(() => { const name = document.querySelector('[data-draft="name"]'); name.value = '바뀐 이름'; name.dispatchEvent(new Event('input', { bubbles: true })); const d = document.querySelector('[data-draft="duration"]'); d.value = '7d'; d.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
    await page.click('[data-action="task-apply"]');
    page.close();
    await sleep(500);
    const task = await W(app, `JSON.parse(JSON.stringify(api.project().tasks.find((t) => t.id === '${id}')))`);
    assert.equal(task.name, '바뀐 이름');
    assert.equal(task.duration, 7 * 480);
  } },
  { group: '일정', name: '작업 시간 변경: 휴일 추가 → 일정이 밀림', async run(app) {
    await freshSample(app);
    const finish = await W(app, 'api.sched().finish');
    await W(app, `a.change('op.calendar', (p) => { const cal = p.calendars.find((c) => c.id === p.calendarId); cal.exceptions.push({ id: 'x', name: 'test', start: new Date((api.sched().finish - 1440 * 20) * 60000).toISOString().slice(0, 10), finish: new Date((api.sched().finish - 1440 * 16) * 60000).toISOString().slice(0, 10), working: false, periods: [] }); })`);
    assert.ok(await W(app, 'api.sched().finish') > finish);
  } },
  { group: '일정', name: '기준 계획 → 추적 간트에 기준 막대', async run(app) {
    await freshSample(app);
    await W(app, `a.change('op.baseline', (p) => { for (const t of p.tasks) t.baselines = {}; })`);
    await W(app, `(w.run('setBaseline'), 1)`);
    const page = await app.popup('baseline');
    await page.click('[data-action="baseline-apply"]');
    page.close();
    await sleep(400);
    await W(app, `a.switchView('tracking')`);
    await sleep(500);
    assert.ok(await app.main.eval(`document.querySelectorAll('.baseline').length > 5`));
  } },
  { group: '일정', name: '반복 작업 만들기', async run(app) {
    await freshSample(app);
    const count = await W(app, 'api.project().tasks.length');
    await W(app, `(w.run('insertRecurring'), 1)`);
    const page = await app.popup('recurring');
    await page.click('[data-action="recurring-apply"]');
    page.close();
    await sleep(500);
    assert.equal(await W(app, 'api.project().tasks.length'), count + 9, 'a summary and 8 weekly occurrences');
  } },
  { group: '일정', name: '찾기·바꾸기·이동', async run(app) {
    await freshSample(app);
    const name = await W(app, 'api.project().tasks[20].name');
    const result = await W(app, `a.findNext({ text: ${JSON.stringify(name.slice(0, 3))}, field: 'name', direction: 1 })`);
    assert.ok(result.found);
    const replaced = await W(app, `a.replaceAll({ text: ${JSON.stringify(name)}, replacement: 'REPLACED', field: 'name' })`);
    assert.ok(replaced.count >= 1);
    await W(app, `a.goToTask({ row: 25 })`);
    assert.equal(await W(app, `api.sched().info(w.state.selection.ids[0]).row`), 25);
  } },

  // ───────────────────────── files
  { group: '파일', name: 'DB를 설정하면 저장은 파일과 DB 둘 다 (SQLite)', async run(app) {
    await freshSample(app);
    const dir = tempDir('both');
    const dbFile = path.join(dir, '계획 DB.sqlite');
    const file = path.join(dir, 'both.mwp');
    await W(app, `a.updateSettings({ dbKind: 'sqlite', dbFile: ${JSON.stringify(dbFile)} })`);
    try {
      await sleep(200);
      assert.match(await app.main.eval(`document.querySelector('[data-command="save"]').title`), /SQLite/, 'the Save tooltip names the database');
      await W(app, `a.insertTask({ name: 'DB와 파일' }, { edit: false })`);
      const title = await W(app, 'api.project().title');
      assert.equal(await W(app, `(window.__myworkplanSavePicks = [${JSON.stringify(file)}], a.saveDoc(a.activeDoc()))`), true);
      assert.ok(fs.existsSync(file), 'the local file');
      assert.ok(fs.readFileSync(file, 'utf8').includes('DB와 파일'));
      assert.ok(fs.existsSync(dbFile), 'the database file');
      const stored = await app.main.eval(`(async () => { const n = await import('/src/platform/native.js'); const s = await import('/src/domain/settings.js'); return (await n.dbList(s.dbConfig(window.__myworkplan.state.settings, ''))).map((p) => p.title); })()`);
      assert.ok(stored.includes(title), `the database lists the plan ${JSON.stringify(stored)}`);
      assert.equal(await W(app, 'a.activeDoc().dirty'), false);
      // Saved again (no dialog: the file is known) — still both.
      await W(app, `a.insertTask({ name: '두 번째' }, { edit: false })`);
      assert.equal(await W(app, `a.saveDoc(a.activeDoc())`), true);
      assert.ok(fs.readFileSync(file, 'utf8').includes('두 번째'));
    } finally {
      await W(app, `a.updateSettings({ dbKind: 'none', dbFile: '' })`);
    }
  } },
  { group: '파일', name: '저장(.mwp) → 열기: 같은 내용, 최근 파일·폴더에 기록, 진행 팝업', async run(app) {
    await freshSample(app);
    const dir = tempDir('files');
    const file = path.join(dir, 'saved.mwp');
    await W(app, `(window.__myworkplanSavePicks = [${JSON.stringify(file)}], a.saveDoc(a.activeDoc(), { saveAs: true }))`);
    await sleep(500);
    assert.ok(fs.existsSync(file));
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(saved.format, 'myworkplan');
    assert.equal(await W(app, 'a.activeDoc().dirty'), false);
    await W(app, `(() => { for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true }); return 1; })()`);
    await W(app, `a.openPath(${JSON.stringify(file)})`);
    await sleep(500);
    assert.equal(await W(app, 'api.project().tasks.length'), saved.project.tasks.length);
    const recent = await W(app, 'w.state.recent.map((r) => r.path)');
    assert.ok(recent.some((p) => p.toLowerCase() === file.toLowerCase()), 'recent file');
    assert.ok(await W(app, `w.state.recentDirs.some((d) => d.path.toLowerCase() === ${JSON.stringify(dir.toLowerCase())})`), 'recent folder');
  } },
  { group: '파일', name: '최근 파일 최대 10개, 하나씩·전체 지우기 (파일 메뉴의 최근 파일 창)', async run(app) {
    const dir = tempDir('recent');
    for (let i = 0; i < 12; i++) {
      const file = path.join(dir, `p${i}.mwp`);
      fs.writeFileSync(file, JSON.stringify({ format: 'myworkplan', version: 1, project: { title: `P${i}`, tasks: [] } }));
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
    await W(app, `(() => { for (const doc of [...w.state.docs]) a.closeDoc(doc, { force: true }); return 1; })()`);
  } },
  { group: '파일', name: '이미지로 내보내기 팝업: 형식·배경·내용·배율 → 선택이 내보내기에 쓰임', async run(app) {
    await freshSample(app);
    const file = path.join(tempDir('image-popup'), 'popup.webp');
    const done = W(app, `(window.__myworkplanSavePicks = [${JSON.stringify(file)}], a.exportImage())`);
    const page = await app.popup('image');
    await expectPopupWindow(app, page, 'image');
    assert.deepEqual(await page.eval(`[...document.querySelectorAll('[data-draft-segment="format"]')].map((b) => b.dataset.value)`), ['png', 'jpeg', 'webp', 'bmp', 'tiff', 'svg']);
    await page.click('[data-draft-segment="format"][data-value="jpeg"]');
    assert.ok(await page.eval(`document.querySelector('[data-draft-segment="transparent"]').closest('.row').classList.contains('disabled-row')`), 'JPEG cannot be transparent');
    await page.click('[data-draft-segment="format"][data-value="webp"]');
    await page.click('[data-draft-segment="transparent"][data-value="true"]');
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
  { group: '파일', name: '간트 차트 이미지: PNG·JPEG·WebP·BMP·TIFF·SVG, 투명 배경', async run(app) {
    await freshSample(app);
    const dir = tempDir('images');
    const magic = { png: [1, 4, 'PNG'], jpeg: [0, 3, '\xff\xd8\xff'], webp: [8, 12, 'WEBP'], bmp: [0, 2, 'BM'], tiff: [0, 4, 'II*\0'], svg: [0, 4, '<svg'] };
    const ext = { jpeg: 'jpg' };
    for (const format of Object.keys(magic)) {
      for (const transparent of format === 'jpeg' ? [false] : [true, false]) {
        const file = path.join(dir, `gantt-${transparent ? 'clear' : 'white'}.${ext[format] ?? format}`);
        await W(app, `(window.__myworkplanSavePicks = [${JSON.stringify(file)}], a.exportImage({ format: '${format}', transparent: ${transparent}, content: 'both', scale: 1, quality: 90 }))`);
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
  { group: '파일', name: 'MS Project XML·CSV·템플릿·PNG 내보내기, XML 가져오기', async run(app) {
    await freshSample(app);
    const dir = tempDir('export');
    for (const [type, name] of [['xml', 'plan.xml'], ['csv', 'plan.csv'], ['mwpt', 'plan.mwpt']]) {
      const file = path.join(dir, name);
      await W(app, `(window.__myworkplanSavePicks = [${JSON.stringify(file)}], a.exportAs('${type}'))`);
      assert.ok(fs.existsSync(file), name);
    }
    assert.match(fs.readFileSync(path.join(dir, 'plan.xml'), 'utf8'), /<Project xmlns="http:\/\/schemas\.microsoft\.com\/project"/);
    assert.match(fs.readFileSync(path.join(dir, 'plan.csv'), 'utf8'), /Name/);
    const png = path.join(dir, 'gantt.png');
    await W(app, `(window.__myworkplanSavePicks = [${JSON.stringify(png)}], a.exportImage({ format: 'png', transparent: false, content: 'both', scale: 2 }))`);
    assert.equal(fs.readFileSync(png).subarray(1, 4).toString(), 'PNG');
    await W(app, `a.openPath(${JSON.stringify(path.join(dir, 'plan.xml'))})`);
    await sleep(400);
    assert.ok(await W(app, 'api.project().tasks.length > 20'), 'imported');
  } },
  { group: '파일', name: '보고서 내보내기: HTML·Markdown·Word(.docx)·PDF (보고서 메뉴의 하위 메뉴)', async run(app) {
    await freshSample(app);
    await W(app, `(a.activeDoc().view.report = 'cost', a.switchView('reports'), 1)`);
    await sleep(400);
    const title = await W(app, `w.t('report.cost')`);
    assert.ok(await W(app, `Boolean(document.querySelector('[data-report-action="export"]'))`), 'export button in the report header');
    const dir = tempDir('report');
    for (const ext of ['html', 'md', 'docx', 'pdf']) {
      const file = path.join(dir, `report.${ext}`);
      await W(app, `(window.__myworkplanSavePicks = [${JSON.stringify(file)}], a.exportReport('${ext}'))`);
      for (let i = 0; i < 20 && !fs.existsSync(file); i++) await sleep(150);
      assert.ok(fs.existsSync(file), `report.${ext} written`);
    }
    const html = fs.readFileSync(path.join(dir, 'report.html'), 'utf8');
    assert.match(html, /^<!doctype html>/);
    assert.ok(html.includes(`<h1>${title}</h1>`), 'HTML has the report title');
    assert.ok(html.includes('<svg '), 'HTML has the charts');
    const md = fs.readFileSync(path.join(dir, 'report.md'), 'utf8');
    assert.ok(md.startsWith(`# ${title}`));
    assert.match(md, /^\| .+ \|\n\| (?:---:?|:---:)(?: \| (?:---:?|:---:))* \|$/m, 'Markdown has a table');
    const docx = fs.readFileSync(path.join(dir, 'report.docx'));
    assert.equal(docx.subarray(0, 2).toString('latin1'), 'PK');
    assert.ok(docx.includes(Buffer.from('word/document.xml')), 'docx has word/document.xml');
    assert.ok(docx.includes(Buffer.from(title, 'utf8')), 'docx has the Korean title');
    assert.ok(docx.includes(Buffer.from('word/media/chart1.png')), 'docx has the chart pictures');
    const pdf = fs.readFileSync(path.join(dir, 'report.pdf'));
    assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.equal(pdf.subarray(-6).toString('latin1'), '%%EOF\n');
    assert.ok(/\/Count [1-9]/.test(pdf.toString('latin1')), 'PDF has pages');
    // The Report menu has the export submenu with the four formats.
    const items = await W(app, `w.commands.exportReportHtml && w.commands.exportReportMd && w.commands.exportReportDocx && w.commands.exportReportPdf ? 4 : 0`);
    assert.equal(items, 4);
  } },
  { group: '파일', name: '오래 걸리는 파일 작업은 진행 팝업 (진행률 막대)', async run(app) {
    await app.restart([], { MYWORKPLAN_IO_DELAY_MS: '1200' });
    await app.popup('welcome').then((p) => p.close()).catch(() => {});
    await closePopups(app);
    const dir = tempDir('slow');
    const file = path.join(dir, 'big.mwp');
    const tasks = Array.from({ length: 6000 }, (_, i) => ({ id: `t${i}`, name: `Task ${i} ${'x'.repeat(400)}`, duration: 480 }));
    fs.writeFileSync(file, JSON.stringify({ format: 'myworkplan', version: 1, project: { title: 'Big', tasks } }));
    app.main.eval(`window.__myworkplan.actions.openPath(${JSON.stringify(file)}).then(() => 1)`).catch(() => {});
    const page = await app.popup('progress', 20000);
    await expectPopupWindow(app, page, 'progress');
    await page.waitFor(`document.querySelector('#progress-percent')?.textContent.includes('%')`, { timeout: 20000 });
    page.close();
    await app.restart();
    await app.popup('welcome').then((p) => p.close()).catch(() => {});
    await closePopups(app);
  } },
  { group: '파일', name: '끌어다 놓기: 계획 파일은 열리고 이미지는 배경, 텍스트는 작업', async run(app) {
    await freshSample(app);
    const dir = tempDir('drop');
    const plan = path.join(dir, 'dropped.mwp');
    fs.writeFileSync(plan, JSON.stringify({ format: 'myworkplan', version: 1, project: { title: 'Dropped', tasks: [{ id: 'a', name: 'A', duration: 480 }] } }));
    const image = path.join(dir, 'bg.png');
    fs.writeFileSync(image, PNG_1x1);
    await W(app, `a.handleDroppedPaths([${JSON.stringify(plan)}, ${JSON.stringify(image)}])`);
    await sleep(800);
    assert.equal(await W(app, 'api.project().title'), 'Dropped');
    assert.equal(await W(app, 'w.state.settings.backgroundKind'), 'image');
    assert.ok(await W(app, 'Boolean(w.state.settings.backgroundImage)'));
    await W(app, `a.handleDroppedFiles([], '끌어온 작업 1\\n끌어온 작업 2')`);
    assert.ok(await W(app, `api.project().tasks.some((t) => t.name === '끌어온 작업 2')`));
    await W(app, 'a.removeBackground()');
    await W(app, `a.updateSettings({ backgroundKind: 'animated' })`);
  } },
  { group: '파일', name: '저장 안 한 변경이 있으면 끝낼 때 저장 여부를 물음 (취소하면 그대로)', async run(app) {
    await freshSample(app);
    await W(app, `a.insertTask({ name: 'unsaved' }, { edit: false })`);
    const answer = W(app, 'a.confirmExit()');
    const page = await app.popup('confirm');
    await expectPopupWindow(app, page, 'confirm');
    const buttons = await page.eval(`[...document.querySelectorAll('[data-action="choice"]')].map((b) => b.dataset.value)`);
    assert.deepEqual(buttons.sort(), ['cancel', 'discard', 'save']);
    await page.click('[data-value="cancel"]');
    page.close();
    assert.equal(await answer, false, 'cancel keeps the app open');
  } },

  // ───────────────────────── printing
  { group: '인쇄', name: '인쇄 미리 보기: 전체/현재 보기/사용자 지정, 페이지 설정, 바로 인쇄', async run(app) {
    await freshSample(app);
    await W(app, `api.select('task', [api.project().tasks[3].id, api.project().tasks[4].id])`);
    await app.main.click('[data-command="print"]');
    const page = await app.popup('print');
    await expectPopupWindow(app, page, 'print');
    const pages = () => page.eval('window.__myworkplanPopup.printLayout().count');
    const rows = () => page.eval('window.__myworkplanPopup.printLayout().rows');
    const all = await rows();
    await page.eval(`(() => { const r = document.querySelector('[data-print-range="custom"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    await page.eval(`(() => { const c = document.querySelector('[data-print-toggle="selectedOnly"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    assert.equal(await rows(), 2, 'selected tasks only');
    await page.eval(`(() => { const r = document.querySelector('[data-print-range="all"]'); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
    assert.equal(await rows(), all);
    await page.click('.tabs [data-value="page"]');
    const landscape = await pages();
    await page.click('[data-print-segment="orientation"][data-value="portrait"]');
    const portrait = await pages();
    assert.notEqual(portrait, landscape, 'the page orientation changes the page count');
    await page.eval(`window.__myworkplanPrintHook = (layout) => { window.__printed = layout.count; }; 1`);
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
    for (const tab of ['general', 'appearance', 'font', 'background', 'schedule', 'gantt', 'database', 'recent', 'shortcuts']) assert.ok(tabs.includes(tab), tab);
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
  { group: '설정', name: '설정은 다음 실행 때 다시 읽힘', async run(app) {
    await W(app, `a.updateSettings({ theme: 'dracula', zoom: 120, language: 'en', showRightPanel: false })`);
    const animationBefore = await W(app, 'w.state.settings.animation');
    await sleep(300);
    await app.quit();
    await app.launch();
    await app.popup('welcome').then((p) => p.close()).catch(() => {});
    const s = await W(app, `({ theme: w.state.settings.theme, zoom: w.state.settings.zoom, language: w.state.settings.language, right: w.state.settings.showRightPanel, offered: w.state.settings.tutorialOffered })`);
    assert.deepEqual(s, { theme: 'dracula', zoom: 120, language: 'en', right: false, offered: true });
    assert.notEqual(await W(app, 'w.state.settings.animation'), animationBefore, 'every start picks another moving background');
    await W(app, `a.updateSettings({ theme: 'light', zoom: 100, language: 'ko', showRightPanel: true })`);
  } },

  // ───────────────────────── errors
  { group: '오류', name: '오류는 팝업으로 자세히, 내용 복사 가능', async run(app) {
    const dir = tempDir('bad');
    const file = path.join(dir, 'broken.mwp');
    fs.writeFileSync(file, '{ not json');
    await W(app, `a.openPath(${JSON.stringify(file)})`);
    const page = await app.popup('error');
    await expectPopupWindow(app, page, 'error');
    const report = await page.eval(`document.querySelector('#error-detail').value`);
    assert.match(report, /broken\.mwp/);
    assert.match(report, /JSON|MyWorkPlan/);
    await page.click('[data-action="copy-error"]');
    await sleep(400);
    assert.ok(getClipboard().includes('broken.mwp'), 'copied to the clipboard');
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
    await W(app, '(a.showStartPage(), 1)');
    await sleep(300);
    assert.ok(await app.main.eval(`Boolean(document.querySelector('#start-page [data-start="tutorial-doc"]'))`), 'the start page lists the tutorial document');
    await app.main.click('#start-page [data-start="tutorial-doc"]');
    await app.main.waitFor(`document.querySelectorAll('[data-reader-chapter] option').length > 5`, { timeout: 15000 });
    const doc = await app.main.eval(`(() => { const d = document.querySelector('.reader-frame').contentDocument; return { shown: !document.querySelector('#reader-page').hidden, h1: d.querySelector('h1').textContent, steps: d.querySelectorAll('h3').length, images: d.images.length, raw: d.body.innerText.includes('<a id='), chapters: [...document.querySelectorAll('[data-reader-chapter] option')].slice(1).map((o) => o.textContent) }; })()`);
    assert.ok(doc.shown);
    assert.match(doc.h1, /MyWorkPlan/);
    const steps = await app.main.eval(`(async () => (await import('/src/ui/tutorial.js')).STEPS.length)()`);
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
  { group: '도움말', name: '사용 설명서 열기 (설치된 문서)', async run(app) {
    const log = path.join(tempDir('open'), 'open.log');
    await app.restart([], { MYWORKPLAN_OPEN_LOG: log });
    await app.popup('welcome').then((p) => p.close()).catch(() => {});
    await W(app, `(w.run('userGuide'), 1)`);
    await sleep(800);
    assert.match(fs.readFileSync(log, 'utf8'), /UsersGuide(\.en)?\.html/);
    await app.restart();
    await app.popup('welcome').then((p) => p.close()).catch(() => {});
  } },
  { group: '도움말', name: '튜토리얼: 시작·다음·자동 재생·끝내면 원래대로', async run(app) {
    await freshSample(app);
    const docs = await W(app, 'w.state.docs.length');
    await W(app, 'a.startTutorial()');
    await app.main.waitFor(`window.__myworkplan.tutorial().state().active && !window.__myworkplan.tutorial().state().busy`);
    assert.ok(await app.main.eval(`Boolean(document.querySelector('.tour-card') && document.querySelector('.tour-outline'))`));
    for (let i = 0; i < 6; i++) {
      await app.main.click('[data-tour="next"]');
      await app.main.waitFor(`window.__myworkplan.tutorial().state().index === ${i + 1} && !window.__myworkplan.tutorial().state().busy`, { timeout: 30000 });
    }
    assert.equal(await W(app, 'w.state.docs.length'), docs + 1, 'the tutorial works on its own sample tab');
    await app.main.key('Escape');
    await sleep(800);
    assert.equal(await W(app, 'w.state.docs.length'), docs, 'its tab closed');
    assert.equal(await app.main.eval(`Boolean(document.querySelector('#tutorial-layer.active'))`), false);
  } },
];
