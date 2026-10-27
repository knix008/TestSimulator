// GUI operation tests. A real core serves the API and the real App is mounted
// in a browser-like window. Each case drives the screen the way a person does:
// clicks, double-clicks, keys, menus and dialogs.
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN = `gui-${process.pid}`;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-gui-'));
const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-gui-cfg-'));

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function httpCall(origin, name, args = {}) {
  const body = JSON.stringify(args);
  const url = new URL(`/api/${encodeURIComponent(name)}`, origin);
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, 'content-length': Buffer.byteLength(body) },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        let json;
        try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (err) { reject(err); return; }
        if (!json.ok) reject(new Error(json.error && json.error.message ? json.error.message : `API ${name} failed`));
        else resolve(json.data);
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [
  path.join(root, 'server', 'server.js'),
  '--port', String(port), '--host', '127.0.0.1', '--token', TOKEN, '--no-open',
], {
  cwd: root,
  env: { ...process.env, CC_HOST_NAME: 'web', CC_CONFIG_DIR: configDir, CC_NO_OPEN: '1', CC_SMOKE: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
child.stdout.on('data', (c) => { serverLog += c.toString(); });
child.stderr.on('data', (c) => { serverLog += c.toString(); });
{
  const t0 = Date.now();
  for (;;) {
    if (child.exitCode != null) throw new Error(`core exited\n${serverLog}`);
    try { await httpCall(origin, 'app.info'); break; } catch { /* not up yet */ }
    if (Date.now() - t0 > 15000) throw new Error(`core did not start\n${serverLog}`);
    await new Promise((r) => setTimeout(r, 80));
  }
}

const win = new Window({ url: `${origin}/?token=${encodeURIComponent(TOKEN)}`, width: 1400, height: 900 });
if (!win.Element.prototype.scrollIntoView) win.Element.prototype.scrollIntoView = function scrollIntoView() {};
const nodeFetch = globalThis.fetch;
const fetchForPage = (input, init) => {
  const url = typeof input === 'string' ? new URL(input, `${origin}/`).href : input;
  return nodeFetch(url, init);
};
win.fetch = fetchForPage;
win.open = () => null;
const clipboard = { text: '' };
Object.defineProperty(win.navigator, 'clipboard', {
  configurable: true,
  value: { writeText: async (t) => { clipboard.text = String(t); }, readText: async () => clipboard.text },
});
for (const [name, value] of Object.entries({
  window: win,
  document: win.document,
  navigator: win.navigator,
  sessionStorage: win.sessionStorage,
  localStorage: win.localStorage,
  HTMLElement: win.HTMLElement,
  HTMLInputElement: win.HTMLInputElement,
  HTMLTextAreaElement: win.HTMLTextAreaElement,
  Element: win.Element,
  Node: win.Node,
  DocumentFragment: win.DocumentFragment,
  MutationObserver: win.MutationObserver,
  Event: win.Event,
  MouseEvent: win.MouseEvent,
  KeyboardEvent: win.KeyboardEvent,
  getComputedStyle: win.getComputedStyle.bind(win),
  requestAnimationFrame: win.requestAnimationFrame.bind(win),
  cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
  fetch: fetchForPage,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  try { globalThis[name] = value; }
  catch { Object.defineProperty(globalThis, name, { value, configurable: true, writable: true }); }
}

globalThis.BroadcastChannel = class {
  addEventListener() {}
  removeEventListener() {}
  postMessage() {}
  close() {}
};

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const { setLanguage } = await import('../src/lib/i18n.js');
const App = (await import('../src/App.jsx')).default;

let view = null;
let seq = 0;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function settle(ms = 30) {
  let timer;
  const guard = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('act stalled')), 4000); });
  try {
    await Promise.race([act(async () => { await sleep(ms); }), guard]);
  } finally { clearTimeout(timer); }
}

function bodyText() {
  return (document.body && document.body.textContent || '').replace(/\s+/g, ' ').slice(0, 600);
}

async function waitFor(fn, ms = 8000) {
  const t0 = Date.now();
  let detail = '';
  for (;;) {
    await settle(25);
    try {
      const v = fn();
      if (v) return v;
    } catch (err) { detail = err.message; }
    if (Date.now() - t0 > ms) throw new Error(`timed out${detail ? ` (${detail})` : ''}\n${bodyText()}`);
  }
}

function buttonNamed(scope, name) {
  return [...scope.querySelectorAll('button')].find((b) => b.textContent.replace(/\s+/g, ' ').includes(name));
}

async function click(el) {
  await act(async () => { el.click(); });
}

async function mouse(el, type, init = {}) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init }));
  });
}

async function press(el, init) {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
  });
}

async function typeInto(input, value) {
  await act(async () => {
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function panels() { return [...document.querySelectorAll('.file-panel')]; }
function leftPanel() { return panels()[0]; }
function rightPanel() { return panels()[1]; }
function activePanel() { return document.querySelector('.file-panel.active') || leftPanel(); }
function names(panel) { return [...panel.querySelectorAll('tbody tr .c-name .ellipsis')].map((e) => e.textContent); }
function selectedNames(panel) { return [...panel.querySelectorAll('tbody tr.selected .c-name .ellipsis')].map((e) => e.textContent); }
function row(panel, name) { return [...panel.querySelectorAll('tbody tr')].find((tr) => tr.querySelector('.c-name .ellipsis') && tr.querySelector('.c-name .ellipsis').textContent === name); }
function tool(title) { return [...document.querySelectorAll('.toolbar button')].find((b) => (b.getAttribute('title') || '').includes(title)); }
function topDialog() {
  const all = [...document.querySelectorAll('.dlg[role="dialog"], .search-window[role="dialog"]')];
  return all[all.length - 1] || null;
}
function menuTitles() { return [...document.querySelectorAll('.menu-title')].map((b) => b.textContent.replace(/\s+/g, '')); }

async function pressPanel(init) {
  const el = activePanel().querySelector('.table-wrap');
  el.focus();
  await press(el, init);
}

async function selectRow(panel, name, init = {}) {
  const tr = await waitFor(() => row(panel, name));
  await mouse(tr, 'mousedown', init);
  return tr;
}

async function openMenu(title) {
  const btn = [...document.querySelectorAll('.menu-title')].find((b) => b.textContent.includes(title));
  assert.ok(btn, title);
  await mouse(btn, 'mousedown');
  return waitFor(() => document.querySelector('.ctx-menu'));
}

async function pickItem(label) {
  const item = await waitFor(() => [...document.querySelectorAll('.ctx-item')].find((b) => !b.disabled && b.textContent.includes(label)));
  await click(item);
}

async function fillDialog(value) {
  const input = await waitFor(() => { const d = topDialog(); return d && d.querySelector('input, textarea'); });
  await typeInto(input, value);
  await click(topDialog().querySelector('.dlg-footer .btn.primary'));
}

async function pinSession(patch) {
  const full = {
    left: patch.left, right: patch.right,
    leftTabs: [{ path: patch.left }], rightTabs: [{ path: patch.right }],
    leftTab: 0, rightTab: 0, activeSide: 'left',
    startAtLaunch: false, textOpen: 'viewer', autoRefresh: false, language: 'ko',
    showHidden: false, confirmDelete: true, showToolbar: true, fnBar: true,
    dockVisible: false, logOpen: true, imagePreview: true, layout: 'horizontal',
    theme: 'midnight', showPerm: true, showDate: true, showType: true, showSize: true,
    hotlist: [], recentDirs: [],
    ...patch,
  };
  for (let i = 0; i < 4; i++) {
    await httpCall(origin, 'session.save', { patch: full });
    await sleep(30);
    const cur = await httpCall(origin, 'session.load');
    if (cur.left === full.left && cur.right === full.right && cur.language === 'ko') return;
  }
  throw new Error('session did not stick');
}

function makePair(leftFiles = {}, rightFiles = {}) {
  seq += 1;
  const L = path.join(scratch, `L${seq}`);
  const R = path.join(scratch, `R${seq}`);
  fs.mkdirSync(L);
  fs.mkdirSync(R);
  for (const [name, body] of Object.entries(leftFiles)) {
    const dest = path.join(L, name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (body !== null) fs.writeFileSync(dest, body);
    else fs.mkdirSync(dest, { recursive: true });
  }
  for (const [name, body] of Object.entries(rightFiles)) fs.writeFileSync(path.join(R, name), body);
  return { L, R };
}

async function boot(leftFiles = {}, rightFiles = {}, patch = {}) {
  if (view) {
    await view.unmount();
    view = null;
    await sleep(80);
  }
  const dirs = makePair(leftFiles, rightFiles);
  await pinSession({ left: dirs.L, right: dirs.R, ...patch });
  setLanguage('ko');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const reactRoot = createRoot(host);
  {
    let timer;
    const guard = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('render stalled')), 8000); });
    try {
      await Promise.race([act(async () => { reactRoot.render(React.createElement(App)); }), guard]);
    } finally { clearTimeout(timer); }
  }
  view = {
    host,
    dirs,
    unmount() {
      act(() => { reactRoot.unmount(); });
      host.remove();
    },
  };
  await waitFor(() => row(leftPanel(), '..') && menuTitles().some((t) => t.includes('파일')));
  if (Object.keys(leftFiles).length) {
    const visible = Object.keys(leftFiles).filter((n) => !n.startsWith('.') && !n.includes('/') && !n.includes('\\'));
    if (visible.length) await waitFor(() => visible.every((n) => names(leftPanel()).includes(n)));
  }
  return view;
}

after(async () => {
  try { if (view) view.unmount(); } catch { /* already gone */ }
  try { child.stdout.destroy(); child.stderr.destroy(); } catch { /* closed */ }
  if (child.exitCode == null) {
    const killer = process.platform === 'win32'
      ? spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', detached: true })
      : null;
    if (killer) killer.unref();
    else child.kill();
    child.unref();
  }
  fs.rmSync(scratch, { recursive: true, force: true });
  fs.rmSync(configDir, { recursive: true, force: true });
  try { win.happyDOM.abort(); } catch { /* already stopped */ }
  try {
    const { getGlobalDispatcher } = await import('undici');
    await getGlobalDispatcher().close();
  } catch { /* no dispatcher */ }
});

describe('GUI operations', { concurrency: false }, () => {
  test('the window opens on two panels, the menu, the toolbar and the function keys', async () => {
    const ui = await boot({ 'readme.txt': 'hello', pics: null });
    assert.deepEqual(menuTitles(), ['파일(F)', '편집(E)', '선택(M)', '보기(V)', '압축(C)', '정보(I)']);
    const info = await openMenu('정보');
    assert.deepEqual([...info.querySelectorAll('.ctx-item')].map((b) => b.textContent.replace(/\s+/g, '')), ['사용설명F1', '프로그램정보', '설정']);
    assert.equal(document.querySelectorAll('.toolbar button').length > 10, true);
    assert.deepEqual([...document.querySelectorAll('.fn-key')].map((e) => e.textContent), ['F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'Alt+F4']);
    assert.equal(document.querySelector('.fn-btn').disabled, true);
    assert.ok(names(leftPanel()).includes('readme.txt'));
    assert.ok(names(leftPanel()).includes('pics'));
    assert.ok(names(rightPanel()).includes('..'));
    assert.equal(ui.host.querySelectorAll('.file-panel').length, 2);
    assert.equal(document.querySelector('.start-page'), null);
  });

  test('a single click only selects; Ctrl, Shift, Ctrl+A, arrows, Insert and a typed letter pick rows', async () => {
    await boot({ 'apple.txt': 'a', 'banana.txt': 'b', 'cherry.txt': 'c', 'notes.md': '# n' });
    const panel = leftPanel();
    await selectRow(panel, 'banana.txt');
    assert.deepEqual(selectedNames(panel), ['banana.txt']);
    assert.equal(topDialog(), null);
    assert.equal(names(panel).includes('..'), true);
    const status = panel.querySelector('.panel-status').textContent;
    assert.match(status, /선택됨/);

    await selectRow(panel, 'cherry.txt', { ctrlKey: true });
    assert.deepEqual(selectedNames(panel).sort(), ['banana.txt', 'cherry.txt']);

    await selectRow(panel, 'apple.txt');
    await selectRow(panel, 'cherry.txt', { shiftKey: true });
    assert.deepEqual(selectedNames(panel).sort(), ['apple.txt', 'banana.txt', 'cherry.txt']);

    await mouse(panel.querySelector('tbody'), 'mousedown');
    assert.deepEqual(selectedNames(panel), []);

    await selectRow(panel, 'apple.txt');
    await pressPanel({ key: 'a', ctrlKey: true });
    const all = selectedNames(panel);
    assert.equal(all.includes('..'), false);
    assert.equal(all.length, 4);

    await mouse(panel.querySelector('tbody'), 'mousedown');
    await pressPanel({ key: 'Home' });
    await pressPanel({ key: 'ArrowDown' });
    assert.deepEqual(selectedNames(panel), ['apple.txt']);
    await pressPanel({ key: 'Insert' });
    assert.deepEqual(selectedNames(panel), ['banana.txt']);

    await pressPanel({ key: 'b' });
    await waitFor(() => panel.querySelector('.quick-search'));
    assert.match(panel.querySelector('.quick-search').textContent, /b/);
    assert.equal(panel.querySelector('tr.cursor .c-name .ellipsis').textContent, 'banana.txt');
    await pressPanel({ key: 'Escape' });
    await waitFor(() => !panel.querySelector('.quick-search'));
    await pressPanel({ key: '-', code: 'NumpadSubtract', ctrlKey: true });
    assert.deepEqual(selectedNames(panel), []);

    await pressPanel({ key: '+', code: 'NumpadAdd' });
    await fillDialog('*.md');
    await waitFor(() => selectedNames(leftPanel()).join(',') === 'notes.md');
    assert.deepEqual(selectedNames(leftPanel()), ['notes.md']);
  });

  test('double-click and Enter open a folder; a breadcrumb, Backspace and the history menu go back', async () => {
    const ui = await boot({ room: null });
    fs.writeFileSync(path.join(ui.dirs.L, 'room', 'inside.txt'), 'in');
    const panel = leftPanel();
    await mouse(await waitFor(() => row(panel, 'room')), 'dblclick');
    await waitFor(() => names(leftPanel()).includes('inside.txt'));
    assert.equal(names(leftPanel()).includes('room'), false);
    assert.equal(leftPanel().querySelector('.crumb.current').textContent, 'room');

    await click([...leftPanel().querySelectorAll('.crumb')].find((b) => b.textContent === path.basename(ui.dirs.L)));
    await waitFor(() => names(leftPanel()).includes('room'));

    await selectRow(leftPanel(), 'room');
    await pressPanel({ key: 'Enter' });
    await waitFor(() => names(leftPanel()).includes('inside.txt'));
    await pressPanel({ key: 'Backspace' });
    await waitFor(() => names(leftPanel()).includes('room'));

    await mouse(leftPanel().querySelector('.hist-btn'), 'click');
    const menu = await waitFor(() => document.querySelector('.ctx-menu'));
    assert.match(menu.textContent, /room/);
    await pickItem('room');
    await waitFor(() => names(leftPanel()).includes('inside.txt'));
  });

  test('double-clicking a text file opens the built-in viewer on its contents', async () => {
    await boot({ 'readme.txt': '가로로 적힌 본문' });
    await mouse(row(leftPanel(), 'readme.txt'), 'dblclick');
    const dlg = await waitFor(() => topDialog());
    assert.match(dlg.getAttribute('aria-label'), /보기/);
    assert.match(dlg.textContent, /가로로 적힌 본문/);
    await click(dlg.querySelector('.dlg-footer .btn.primary'));
    await waitFor(() => !topDialog());
    assert.ok(names(leftPanel()).includes('readme.txt'));
  });

  test('F4 opens the editor and Save writes the file back', async () => {
    const ui = await boot({ 'note.txt': 'old line' });
    await selectRow(leftPanel(), 'note.txt');
    await press(window, { key: 'F4' });
    const dlg = await waitFor(() => topDialog());
    assert.match(dlg.getAttribute('aria-label'), /편집/);
    const area = dlg.querySelector('textarea');
    await typeInto(area, 'new line');
    const save = await waitFor(() => { const b = topDialog().querySelector('.dlg-footer .btn.primary'); return b && !b.disabled ? b : null; });
    await click(save);
    await waitFor(() => fs.readFileSync(path.join(ui.dirs.L, 'note.txt'), 'utf8') === 'new line');
    await click(buttonNamed(topDialog(), '닫기'));
    await waitFor(() => !topDialog());
  });

  test('F7 creates a folder, rename changes it, and Ctrl+Z removes it again', async () => {
    await boot({ 'keep.txt': 'k' });
    await press(window, { key: 'F7' });
    await fillDialog('Notes');
    await waitFor(() => names(leftPanel()).includes('Notes'));
    assert.deepEqual(selectedNames(leftPanel()), ['Notes']);

    await mouse(row(leftPanel(), 'Notes'), 'contextmenu', { button: 2, clientX: 12, clientY: 12 });
    await pickItem('이름 바꾸기');
    await fillDialog('Renamed');
    await waitFor(() => names(leftPanel()).includes('Renamed'));
    assert.equal(names(leftPanel()).includes('Notes'), false);

    await press(window, { key: 'z', ctrlKey: true });
    await waitFor(() => names(leftPanel()).includes('Notes'));
    await press(window, { key: 'z', ctrlKey: true });
    await waitFor(() => !names(leftPanel()).includes('Notes'));
    assert.ok(names(leftPanel()).includes('keep.txt'));
  });

  test('delete asks first; No keeps the file and Yes removes it', async () => {
    await boot({ 'gone.txt': 'x', 'stay.txt': 'y' });
    await selectRow(leftPanel(), 'gone.txt');
    await click(tool('삭제 (F8)'));
    const ask = await waitFor(() => topDialog());
    assert.match(ask.textContent, /gone\.txt/);
    await click(buttonNamed(ask, '아니요'));
    await waitFor(() => !topDialog());
    assert.ok(names(leftPanel()).includes('gone.txt'));

    await selectRow(leftPanel(), 'gone.txt');
    await press(window, { key: 'F8' });
    await click(buttonNamed(await waitFor(() => topDialog()), '예'));
    await waitFor(() => !names(leftPanel()).includes('gone.txt') && !topDialog());
    assert.ok(names(leftPanel()).includes('stay.txt'));
  });

  test('copy and move send the selection to the other panel', async () => {
    await boot({ 'alpha.txt': 'A', 'beta.txt': 'B' }, {});
    await selectRow(leftPanel(), 'alpha.txt');
    await click(tool('반대 패널로 복사'));
    await waitFor(() => names(rightPanel()).includes('alpha.txt') && !topDialog());
    assert.ok(names(leftPanel()).includes('alpha.txt'));

    await selectRow(leftPanel(), 'beta.txt');
    await press(window, { key: 'F6' });
    await waitFor(() => names(rightPanel()).includes('beta.txt') && !names(leftPanel()).includes('beta.txt') && !topDialog());
  });

  test('compress builds an archive and extract unpacks it into a new folder', async () => {
    await boot({ 'page.txt': '본문' });
    await selectRow(leftPanel(), 'page.txt');
    await click(tool('선택 항목 압축'));
    const dlg = await waitFor(() => topDialog());
    assert.match(dlg.getAttribute('aria-label'), /압축/);
    await click(dlg.querySelector('.dlg-footer .btn.primary'));
    await waitFor(() => names(leftPanel()).includes('page.txt.tar.gz') && !topDialog());

    await selectRow(leftPanel(), 'page.txt.tar.gz');
    const extract = await waitFor(() => { const b = tool('선택한 압축 파일 해제'); return b && !b.disabled ? b : null; });
    await click(extract);
    await fillDialog('unpacked');
    await waitFor(() => names(leftPanel()).includes('unpacked') && !topDialog());
    await mouse(row(leftPanel(), 'unpacked'), 'dblclick');
    await waitFor(() => names(leftPanel()).includes('page.txt'));
  });

  test('the header sorts, hidden files appear, tabs switch, and the panels stack, swap and compare', async () => {
    const ui = await boot(
      { 'a.txt': 'a', 'z.txt': 'zzzzzzzzzz', '.secret.txt': 'hide', 'only-left.txt': 'L' },
      { 'a.txt': 'a', 'only-right.txt': 'R' },
    );
    assert.equal(names(leftPanel()).includes('.secret.txt'), false);
    const sizeHeader = [...leftPanel().querySelectorAll('th')].find((th) => th.textContent.includes('크기'));
    await click(sizeHeader);
    await click(sizeHeader);
    const listed = names(leftPanel());
    assert.ok(listed.indexOf('z.txt') < listed.indexOf('a.txt'));

    await openMenu('보기');
    await pickItem('숨김 파일 표시');
    await waitFor(() => names(leftPanel()).includes('.secret.txt'));

    await click(leftPanel().querySelector('.tab-add'));
    await waitFor(() => leftPanel().querySelectorAll('.tab').length === 2);
    fs.mkdirSync(path.join(ui.dirs.L, 'extra'));
    await press(window, { key: 'r', ctrlKey: true });
    await mouse(await waitFor(() => row(leftPanel(), 'extra')), 'dblclick');
    await waitFor(() => leftPanel().querySelector('.tab.active').textContent.includes('extra'));
    await click(leftPanel().querySelectorAll('.tab')[0]);
    await waitFor(() => names(leftPanel()).includes('a.txt'));
    await click(leftPanel().querySelectorAll('.tab')[1].querySelector('.tab-close'));
    await waitFor(() => leftPanel().querySelectorAll('.tab').length === 1);

    await openMenu('보기');
    await pickItem('상하 분할');
    await waitFor(() => document.querySelector('.panels.vertical'));

    await press(window, { key: 'u', ctrlKey: true });
    await waitFor(() => names(leftPanel()).includes('only-right.txt') && names(rightPanel()).includes('only-left.txt'));

    await press(window, { key: 'F2', shiftKey: true });
    await waitFor(() => selectedNames(leftPanel()).includes('only-right.txt'));
    assert.equal(selectedNames(leftPanel()).includes('a.txt'), false);
    assert.ok(selectedNames(rightPanel()).includes('only-left.txt'));
    assert.equal(selectedNames(rightPanel()).includes('a.txt'), false);
  });

  test('search finds a file by name and opens it in the viewer', async () => {
    await boot({ 'needle.txt': '찾았다', 'other.txt': 'no' });
    await press(window, { key: 'F9' });
    const search = await waitFor(() => document.querySelector('.search-window'));
    await typeInto(search.querySelector('input'), 'needle.txt');
    await click(buttonNamed(search, '검색 시작'));
    const hit = await waitFor(() => search.querySelector('.sr-name'));
    assert.equal(hit.textContent, 'needle.txt');
    await mouse(hit.closest('.sr-row'), 'dblclick');
    const viewDlg = await waitFor(() => [...document.querySelectorAll('.dlg')].find((d) => (d.getAttribute('aria-label') || '').includes('보기')));
    assert.match(viewDlg.textContent, /찾았다/);
    await click(viewDlg.querySelector('.dlg-footer .btn.primary'));
    await waitFor(() => !document.querySelector('.dlg'));
    await click(search.querySelector('.close-btn'));
    await waitFor(() => !document.querySelector('.search-window'));
  });

  test('settings apply the language and the start-screen choice, and Cancel puts the language back', async () => {
    await boot({ 'a.txt': 'a' });
    const themeBefore = document.documentElement.dataset.theme;
    await click(tool('다음 테마'));
    await waitFor(() => document.documentElement.dataset.theme && document.documentElement.dataset.theme !== themeBefore);

    await click(document.querySelector('[data-tut="settings"]'));
    let dlg = await waitFor(() => topDialog());
    await click(buttonNamed(dlg, 'English'));
    await waitFor(() => menuTitles().some((t) => t === 'File'));
    const footer = () => [...topDialog().querySelectorAll('.dlg-footer .btn')];
    await click(footer()[1]);
    await waitFor(() => !topDialog() && menuTitles().some((t) => t.includes('파일')));

    await click(document.querySelector('[data-tut="settings"]'));
    dlg = await waitFor(() => topDialog());
    await click([...dlg.querySelectorAll('[role="tab"]')].find((b) => b.textContent.includes('시작 화면')));
    const box = await waitFor(() => topDialog().querySelector('.start-launch input'));
    assert.equal(box.checked, false);
    await click(box);
    await click(topDialog().querySelector('.dlg-footer .btn.primary'));
    await waitFor(() => !topDialog());
    await click(document.querySelector('[data-tut="settings"]'));
    dlg = await waitFor(() => topDialog());
    await click([...dlg.querySelectorAll('[role="tab"]')].find((b) => b.textContent.includes('시작 화면')));
    assert.equal((await waitFor(() => topDialog().querySelector('.start-launch input'))).checked, true);
    await click(topDialog().querySelector('.dlg-footer .btn.primary'));
    await waitFor(() => !topDialog());

    await click(document.querySelector('[data-tut="settings"]'));
    dlg = await waitFor(() => topDialog());
    await click(buttonNamed(dlg, 'English'));
    await click(topDialog().querySelector('.dlg-footer .btn.primary'));
    await waitFor(() => menuTitles().some((t) => t === 'File') && !topDialog());
    await click(document.querySelector('[data-tut="settings"]'));
    dlg = await waitFor(() => topDialog());
    await click([...dlg.querySelectorAll('[role="tab"]')].find((b) => b.textContent.includes('Start screen')));
    const again = await waitFor(() => topDialog().querySelector('.start-launch input'));
    assert.equal(again.checked, true);
    await click(topDialog().querySelector('.dlg-footer .btn.primary'));
    await waitFor(() => !topDialog());
  });

  test('Home opens the start screen, the tutorial steps through, and a recent folder returns to the panels', async () => {
    const ui = await boot({ 'a.txt': 'a' });
    await click(document.querySelector('.menu-home'));
    const page = await waitFor(() => document.querySelector('.start-page'));
    assert.ok(buttonNamed(page, '튜토리얼'));
    assert.ok(buttonNamed(page, '파일 관리'));
    await click(buttonNamed(page, '튜토리얼'));
    const card = await waitFor(() => document.querySelector('.tutorial-card'));
    assert.match(card.textContent, /1 \/ /);
    await click(buttonNamed(card, '다음'));
    await waitFor(() => /2 \/ /.test(document.querySelector('.tutorial-card').textContent));
    await press(window, { key: 'Escape' });
    await waitFor(() => document.querySelector('.start-page') && !document.querySelector('.tutorial-card'));

    const recent = await waitFor(() => [...document.querySelectorAll('.recent-item')].find((b) => b.textContent.includes(path.basename(ui.dirs.L))));
    await click(recent);
    await waitFor(() => !document.querySelector('.start-page'));
    assert.equal(leftPanel().querySelector('.crumb.current').textContent, path.basename(ui.dirs.L));

    await click(document.querySelector('.menu-home'));
    await waitFor(() => document.querySelector('.start-page'));
    await click(buttonNamed(document.querySelector('.start-page'), '파일 관리'));
    await waitFor(() => !document.querySelector('.start-page'));
  });

  test('the hotlist, folder tree, drive menu, file info and the log dock all open from the panel', async () => {
    const ui = await boot({ 'info.txt': 'details' });
    await click(leftPanel().querySelector('.hot-btn'));
    await pickItem('현재 폴더를 즐겨찾기에 추가');
    await waitFor(() => leftPanel().querySelector('.hot-btn.on'));
    await click(leftPanel().querySelector('.hot-btn'));
    const hot = await waitFor(() => document.querySelector('.ctx-menu'));
    assert.match(hot.textContent, new RegExp(path.basename(ui.dirs.L)));
    await press(document, { key: 'Escape' });
    await waitFor(() => !document.querySelector('.ctx-menu'));

    await click(leftPanel().querySelector('.tree-btn'));
    await waitFor(() => leftPanel().querySelector('.folder-tree'));
    await click(leftPanel().querySelector('.tree-btn'));
    await waitFor(() => !leftPanel().querySelector('.folder-tree'));

    await click(leftPanel().querySelector('.drive-btn'));
    const drives = await waitFor(() => document.querySelector('.ctx-menu'));
    assert.match(drives.textContent, /[A-Z]:\\|[A-Za-z]:\\|\//);
    await press(document, { key: 'Escape' });

    await selectRow(leftPanel(), 'info.txt');
    await pressPanel({ key: 'Enter', altKey: true });
    const info = await waitFor(() => topDialog());
    assert.match(info.getAttribute('aria-label'), /파일 정보/);
    assert.match(info.textContent, /info\.txt/);
    await click(info.querySelector('.dlg-footer .btn.primary'));
    await waitFor(() => !topDialog());

    await press(window, { key: '`', ctrlKey: true });
    const dock = await waitFor(() => { const d = document.querySelector('.dock'); return d && d.style.display !== 'none' ? d : null; });
    assert.match(dock.textContent, /준비 완료/);
  });

  test('multi-rename renames every selected file from the mask', async () => {
    await boot({ 'one.txt': '1', 'two.txt': '2' });
    await selectRow(leftPanel(), 'one.txt');
    await selectRow(leftPanel(), 'two.txt', { ctrlKey: true });
    await press(window, { key: 'm', ctrlKey: true });
    const dlg = await waitFor(() => topDialog());
    assert.match(dlg.getAttribute('aria-label'), /다중 이름 바꾸기/);
    assert.match(dlg.textContent, /one\.txt/);
    assert.match(dlg.textContent, /two\.txt/);
    const mask = dlg.querySelector('input');
    await typeInto(mask, 'item-[C]');
    const start = await waitFor(() => { const b = topDialog().querySelector('.dlg-footer .btn.primary'); return b && !b.disabled ? b : null; });
    await click(start);
    await waitFor(() => names(leftPanel()).includes('item-1.txt') && names(leftPanel()).includes('item-2.txt') && !topDialog());
    assert.equal(names(leftPanel()).includes('one.txt'), false);
  });

  test('the File menu creates a file, then copy and paste put it in the other panel', async () => {
    await boot({}, {});
    await openMenu('파일');
    await pickItem('새 파일');
    await fillDialog('pasted.txt');
    await waitFor(() => names(leftPanel()).includes('pasted.txt'));
    await pressPanel({ key: 'c', ctrlKey: true });
    await waitFor(() => clipboard.text.includes('pasted.txt'));
    await mouse(rightPanel().querySelector('.table-wrap'), 'mousedown');
    await pressPanel({ key: 'v', ctrlKey: true });
    await waitFor(() => names(rightPanel()).includes('pasted.txt') && !topDialog());
    assert.ok(names(leftPanel()).includes('pasted.txt'));
  });

  test('Ctrl+X cuts a file and Ctrl+V moves it to the other panel', async () => {
    await boot({ 'moved.txt': 'm' }, {});
    await selectRow(leftPanel(), 'moved.txt');
    await pressPanel({ key: 'x', ctrlKey: true });
    await waitFor(() => clipboard.text.includes('moved.txt') && row(leftPanel(), 'moved.txt').classList.contains('cut'));
    await mouse(rightPanel().querySelector('.table-wrap'), 'mousedown');
    await pressPanel({ key: 'v', ctrlKey: true });
    await waitFor(() => names(rightPanel()).includes('moved.txt') && !names(leftPanel()).includes('moved.txt') && !topDialog());
  });

  test('the context menu lists cut, copy and paste', async () => {
    await boot({ 'a.txt': 'a' });
    await selectRow(leftPanel(), 'a.txt');
    await mouse(row(leftPanel(), 'a.txt'), 'contextmenu', { button: 2, clientX: 20, clientY: 20 });
    const menu = await waitFor(() => document.querySelector('.ctx-menu'));
    assert.match(menu.textContent, /잘라내기/);
    assert.match(menu.textContent, /Ctrl\+X/);
    assert.match(menu.textContent, /붙여넣기/);
    assert.match(menu.textContent, /Ctrl\+V/);
    await press(document, { key: 'Escape' });
    await waitFor(() => !document.querySelector('.ctx-menu'));
  });

  // A single click shows an image in the preview window; a double-click opens it with its
  // program and does not show it first. window.open and fs.open are caught here, so nothing
  // is really opened on the machine running the tests.
  async function withOpenSpies(run) {
    const popups = [];
    const launched = [];
    const realOpen = win.open;
    const realFetch = globalThis.fetch;
    win.open = (url) => { popups.push(String(url)); return { closed: false, focus() {}, close() {} }; };
    globalThis.fetch = (input, init) => {
      if (String(input).includes('/api/fs.open')) {
        launched.push(JSON.parse(init.body).path);
        return Promise.resolve(new Response(JSON.stringify({ ok: true, data: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return realFetch(input, init);
    };
    try { await run({ popups, launched }); }
    finally { win.open = realOpen; globalThis.fetch = realFetch; }
  }
  const previews = (popups) => popups.filter((u) => /[?&]win=preview/.test(u));
  // The preview waits out the double-click time on a timer; let it run inside act().
  const pass = (ms) => act(async () => { await sleep(ms); });

  test('a single click on an image shows it in the preview window; Ctrl+click only selects', async () => {
    await boot({ 'pic.png': 'not really a png', 'other.png': 'x' });
    await withOpenSpies(async ({ popups, launched }) => {
      await mouse(row(leftPanel(), 'pic.png'), 'mousedown');
      await mouse(row(leftPanel(), 'pic.png'), 'click', { detail: 1 });
      assert.deepEqual(selectedNames(leftPanel()), ['pic.png']);
      await pass(450);
      assert.equal(previews(popups).length, 1);
      await mouse(row(leftPanel(), 'other.png'), 'click', { detail: 1, ctrlKey: true });
      await pass(450);
      assert.equal(previews(popups).length, 1);
      assert.deepEqual(launched, []);
    });
  });

  test('a double-click opens the file with its program and does not preview it first', async () => {
    const ui = await boot({ 'pic.png': 'not really a png' });
    await withOpenSpies(async ({ popups, launched }) => {
      const r = row(leftPanel(), 'pic.png');
      await mouse(r, 'mousedown');
      await mouse(r, 'click', { detail: 1 });
      await mouse(r, 'click', { detail: 2 });
      await mouse(r, 'dblclick', { detail: 2 });
      await pass(450);
      assert.equal(launched.length, 1);
      assert.equal(launched[0], path.join(ui.dirs.L, 'pic.png'));
      await pass(450);
      assert.deepEqual(previews(popups), []);
    });
  });
});
