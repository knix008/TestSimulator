#!/usr/bin/env node
// npm run smoke                     Drives the debug program (npm run build:debug) through CDP
// npm run smoke -- --release        ... the release program, with its bundled Node and files
// npm run smoke -- --real-mouse     ... and also drags a card and the size marker with the real mouse
//
// Data stays in .smoke/profile and only the process started here is ever closed. Windows only
// (WebView2 CDP, user32 for the window checks). --real-mouse moves your pointer for a few seconds;
// scripts/os-drag.ps1 presses only if the program's own window is under the pointer.
const { spawn, execFileSync } = require('child_process');
const assert = require('assert/strict');
const fs = require('fs');
const net = require('net');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RELEASE = process.argv.includes('--release');
const REAL_MOUSE = process.argv.includes('--real-mouse');
const EXE = path.join(ROOT, 'src-tauri', 'target', RELEASE ? 'release' : 'debug', process.platform === 'win32' ? 'MyKanban.exe' : 'MyKanban');
const OS_DRAG = path.join(__dirname, 'os-drag.ps1');
const MIN_WIDTH = 720;
const MIN_HEIGHT = 400;
const WORK = path.join(ROOT, '.smoke');
const PROFILE = path.join(WORK, 'profile');
const KPRJ = path.join(WORK, 'launch-file.kprj');
const CDP_PORT = 9481;
const APP_PORT = 3911;
const pkg = require('../package.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let child;
let ws;
let nextId = 1;
const waiting = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function page(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

async function until(expression, what, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if (await page(expression)) return; } catch {}
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${what}: ${expression}`);
}

async function connect() {
  const end = Date.now() + 40000;
  while (Date.now() < end) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
      const target = targets.find((t) => t.type === 'page' && t.url.startsWith(`http://127.0.0.1:${APP_PORT}`));
      if (target) {
        ws = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
        ws.onmessage = ({ data }) => {
          const msg = JSON.parse(data);
          if (msg.id && waiting.has(msg.id)) {
            const { resolve, reject } = waiting.get(msg.id);
            waiting.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
          }
        };
        return;
      }
    } catch {}
    if (child.exitCode !== null) throw new Error(`The program ended with code ${child.exitCode}`);
    await sleep(200);
  }
  throw new Error('The window never appeared');
}

function user32(call) {
  const script = `
$sig = '[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int w, int h2, uint f); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);'
$t = Add-Type -MemberDefinition $sig -Name W${Date.now()} -PassThru
$h = (Get-Process -Id ${child.pid}).MainWindowHandle
[void]$t::${call}`;
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
}

const setWindowSize = (width, height) => user32(`SetWindowPos($h, [IntPtr]::Zero, 0, 0, ${width}, ${height}, 0x16)`);
const placeWindow = (x, y, width, height) => user32(`SetWindowPos($h, [IntPtr]::Zero, ${x}, ${y}, ${width}, ${height}, 0x14)`);
const showWindow = (command) => user32(`ShowWindow($h, ${command})`);

function realDrag(x, y, dx, dy) {
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', OS_DRAG,
    `-X:${Math.round(x)}`, `-Y:${Math.round(y)}`, `-DX:${Math.round(dx)}`, `-DY:${Math.round(dy)}`, `-ProcessId:${child.pid}`, '-Title:MyKanban'],
    { windowsHide: true, encoding: 'utf8' }).trim();
  if (!out.startsWith('dragged')) throw new Error(out);
}

const CARD_COUNTS = `[...document.querySelectorAll('.column')].map((c) => c.querySelectorAll('.card').length)`;

function portIsOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

async function key(k, code, modifiers = 2) {
  const vk = code.charCodeAt(3);
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, modifiers, windowsVirtualKeyCode: vk });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers, windowsVirtualKeyCode: vk });
}

async function screenshot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(WORK, name), Buffer.from(data, 'base64'));
}

const GRIP = `(() => {
  const g = document.getElementById('win-resize-grip');
  const r = g.getBoundingClientRect();
  const dots = [...g.querySelectorAll('circle')].map((c) => [+c.getAttribute('cx'), +c.getAttribute('cy')]);
  const hit = document.elementFromPoint(innerWidth - 2, innerHeight - 2);
  return {
    display: getComputedStyle(g).display, cursor: getComputedStyle(g).cursor,
    right: r.right, bottom: r.bottom, innerWidth, innerHeight, dots,
    hitsGrip: !!hit && !!hit.closest('#win-resize-grip'),
    verRight: document.getElementById('status-ver').getBoundingClientRect().right, gripLeft: r.left,
  };
})()`;

const WIDTHS = `(() => {
  const over = (sel) => { const e = document.querySelector(sel); return e ? e.scrollWidth - e.clientWidth : 0; };
  const right = (sel) => { const e = document.querySelector(sel); return e ? Math.ceil(e.getBoundingClientRect().right) : 0; };
  const bar = document.querySelector('.board-toolbar');
  const buttons = bar ? [...bar.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().width > 0) : [];
  return {
    innerWidth, pageOverflow: document.documentElement.scrollWidth - innerWidth,
    header: over('#app-header'), headerRight: right('.header-right'),
    menubar: over('#app-menubar'), statusRight: right('.status-right'),
    toolbar: over('.board-toolbar'),
    buttonsRight: Math.ceil(Math.max(0, ...buttons.map((b) => b.getBoundingClientRect().right))),
    toolbarButtons: buttons.length,
  };
})()`;

function assertNothingCut(w, where) {
  assert.equal(w.pageOverflow, 0, `${where}: page scrolls sideways`);
  assert.equal(w.header, 0, `${where}: header overflows`);
  assert.ok(w.headerRight <= w.innerWidth, `${where}: header ends at ${w.headerRight} of ${w.innerWidth}`);
  assert.equal(w.menubar, 0, `${where}: menu bar overflows`);
  assert.equal(w.toolbar, 0, `${where}: board toolbar overflows`);
  assert.ok(w.toolbarButtons > 0, `${where}: no toolbar buttons`);
  assert.ok(w.buttonsRight <= w.innerWidth, `${where}: a toolbar button ends at ${w.buttonsRight} of ${w.innerWidth}`);
  assert.ok(w.statusRight <= w.innerWidth, `${where}: status bar ends at ${w.statusRight} of ${w.innerWidth}`);
}

const results = [];
async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push(true);
    console.log(`  PASS  ${name.padEnd(62)} ${String(Date.now() - started).padStart(6)} ms`);
  } catch (err) {
    results.push(false);
    console.log(`  FAIL  ${name.padEnd(62)} ${String(Date.now() - started).padStart(6)} ms\n        ${err.message}`);
  }
}

async function main() {
  if (!fs.existsSync(EXE)) throw new Error('Run "npm run build:debug" first.');
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(PROFILE, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'sample', 'sample.kprj'), KPRJ);
  if (await portIsOpen(APP_PORT)) throw new Error(`Port ${APP_PORT} is in use.`);

  child = spawn(EXE, [KPRJ], {
    stdio: 'ignore',
    env: {
      ...process.env,
      MYKANBAN_CONFIG_DIR: PROFILE,
      MYKANBAN_PORT: String(APP_PORT),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${CDP_PORT}`,
      WEBVIEW2_USER_DATA_FOLDER: path.join(WORK, 'webview'),
    },
  });

  await step('the window opens on the page of the app\'s own server', async () => {
    await connect();
    await send('Page.enable');
    await until(`document.readyState === 'complete' && !!document.getElementById('login-username')`, 'login screen');
  });

  await step('the page is told it runs in the desktop app', async () => {
    assert.equal(await page(`typeof window.desktop.saveKprj`), 'function');
    assert.equal(await page(`document.documentElement.classList.contains('is-desktop')`), true);
  });

  await step('the size marker shows on the login screen too', async () => {
    const g = await page(GRIP);
    assert.equal(g.display, 'flex');
    assert.equal(g.hitsGrip, true);
    await screenshot('login.png');
  });

  await step('data goes to the chosen folder, not the real one', async () => {
    assert.ok(fs.existsSync(path.join(PROFILE, 'kanban.db')));
    assert.ok(fs.existsSync(path.join(PROFILE, 'uploads')));
  });

  await step('logging in opens the .kprj file the app was launched with', async () => {
    await page(`document.getElementById('login-username').value = 'admin'; document.getElementById('login-password').value = 'admin'; App.doLogin()`);
    await until(`!!document.getElementById('board-view') && document.querySelectorAll('.column').length > 1`, 'imported board');
    assert.equal(await page(`window.desktop.getOpenFile()`), null);
  });

  await step(`the status bar shows version ${pkg.version}`, async () => {
    await until(`document.getElementById('status-ver').textContent === 'v${pkg.version}'`, 'version');
  });

  await step('About reports the version and the Tauri description', async () => {
    await page(`AppMenu.showAbout()`);
    await until(`!!document.querySelector('.about-dialog')`, 'about dialog');
    const text = await page(`document.querySelector('.about-dialog').textContent`);
    assert.match(text, new RegExp(pkg.version.replace(/\./g, '\\.')));
    assert.match(text, /Tauri/);
    assert.doesNotMatch(text, /Electron/);
    await page(`Modal.close()`);
  });

  await step('the size marker is a triangle of six dots in the corner', async () => {
    const g = await page(GRIP);
    assert.deepEqual(g.dots, [[10, 2], [6, 6], [10, 6], [2, 10], [6, 10], [10, 10]]);
    assert.equal(g.cursor, 'nwse-resize');
    assert.equal(g.right, g.innerWidth);
    assert.equal(g.bottom, g.innerHeight);
    assert.equal(g.hitsGrip, true);
    assert.ok(g.verRight <= g.gripLeft, `version text ends at ${g.verRight}, marker starts at ${g.gripLeft}`);
    await screenshot('board.png');
  });

  await step('a card moves to another column (drag events in the page)', async () => {
    const before = await page(CARD_COUNTS);
    const from = before.findIndex((n) => n > 0);
    const to = from === 0 ? 1 : 0;
    await page(`(() => {
      const cols = document.querySelectorAll('.column');
      const card = cols[${from}].querySelector('.card');
      const list = cols[${to}].querySelector('.cards-list');
      const dataTransfer = new DataTransfer();
      const fire = (el, type) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }));
      fire(card, 'dragstart');
      fire(list, 'dragover');
      fire(list, 'drop');
      fire(card, 'dragend');
    })()`);
    await until(`${CARD_COUNTS}[${to}] === ${before[to] + 1}`, 'moved card');
  });

  await step('Ctrl+S and Ctrl+Z reach the app\'s own shortcuts', async () => {
    const moved = await page(`${CARD_COUNTS}.join()`);
    await key('z', 'KeyZ');
    await until(`${CARD_COUNTS}.join() !== '${moved}'`, 'undo');
    await key('s', 'KeyS');
    await until(`!!document.querySelector('.toast')`, 'save toast');
  });

  await step('browser shortcuts do nothing (Ctrl+R keeps the page)', async () => {
    await page(`window.__kept = 1`);
    await key('r', 'KeyR');
    await sleep(600);
    assert.equal(await page(`window.__kept`), 1);
  });

  await step('an attachment name cannot leave the uploads folder', async () => {
    const r = await page(`window.desktop.openAttachment('../kanban.db')`);
    assert.equal(r.ok, false);
    const missing = await page(`window.desktop.openAttachment('nothing-here.pdf')`);
    assert.equal(missing.ok, false);
  });

  await step('the marker hides while the window is maximized', async () => {
    showWindow(3);
    await until(`getComputedStyle(document.getElementById('win-resize-grip')).display === 'none'`, 'hidden marker');
    showWindow(9);
    await until(`getComputedStyle(document.getElementById('win-resize-grip')).display === 'flex'`, 'marker back');
  });

  await step('the OS cannot shrink the window below its minimum', async () => {
    setWindowSize(200, 200);
    await sleep(800);
    await until(`innerWidth >= ${MIN_WIDTH} && innerHeight >= ${MIN_HEIGHT}`, 'minimum size', 5000);
    const size = await page(`[innerWidth, innerHeight]`);
    assert.deepEqual(size, [MIN_WIDTH, MIN_HEIGHT]);
  });

  await step('at minimum width no toolbar is cut, in both languages', async () => {
    await page(`API.put('/auth/profile', { displayName: 'A very long user name that goes on and on and on', email: 'admin@test.local' })`);
    await page(`document.getElementById('header-username').textContent = 'A very long user name that goes on and on and on'`);
    const board = `!!document.getElementById('board-view') && document.querySelectorAll('.column').length > 1`;
    for (const lang of ['ko', 'en']) {
      await page(`I18n.getLang() === '${lang}' || App.toggleLang()`);
      await sleep(500);
      await until(board, 'board');
      assertNothingCut(await page(WIDTHS), `${lang} board`);
      await page(`BoardView.showSummary()`);
      await until(`!!document.querySelector('.summary-wrap')`, 'summary');
      assertNothingCut(await page(WIDTHS), `${lang} summary`);
      await page(`BoardView.openBoard(BoardView.currentBoardId)`);
      await until(board, 'board');
    }
    await screenshot('minimum.png');
  });

  if (REAL_MOUSE) {
    const toScreen = (expression) => page(`(() => { const d = devicePixelRatio; const p = ${expression}; return { x: (screenX + p.x) * d, y: (screenY + p.y) * d, d }; })()`);
    const GRIP_POINT = `({ x: innerWidth - 6, y: innerHeight - 6 })`;

    await step('real mouse: dragging the marker resizes the window', async () => {
      placeWindow(20, 20, 1000, 640);
      await sleep(500);
      const size = await page(`[innerWidth, innerHeight]`);
      const p = await toScreen(GRIP_POINT);
      realDrag(p.x, p.y, -120 * p.d, -70 * p.d);
      await sleep(400);
      // The system snaps the window's corner to the pointer when sizing starts, a few pixels.
      const near = (actual, expected) => assert.ok(actual.every((v, i) => Math.abs(v - expected[i]) <= 10), `${actual} is not near ${expected}`);
      const smaller = await page(`[innerWidth, innerHeight]`);
      near(smaller, [size[0] - 120, size[1] - 70]);
      const q = await toScreen(GRIP_POINT);
      realDrag(q.x, q.y, 60 * q.d, 40 * q.d);
      await sleep(400);
      near(await page(`[innerWidth, innerHeight]`), [smaller[0] + 60, smaller[1] + 40]);
    });

    await step('real mouse: the marker stops at the minimum size', async () => {
      const p = await toScreen(GRIP_POINT);
      realDrag(p.x, p.y, -600 * p.d, -500 * p.d);
      await sleep(400);
      assert.deepEqual(await page(`[innerWidth, innerHeight]`), [MIN_WIDTH, MIN_HEIGHT]);
    });

    await step('real mouse: a card moves to another column', async () => {
      placeWindow(20, 20, 1000, 640);
      await sleep(500);
      const before = await page(CARD_COUNTS);
      const from = before.findIndex((n) => n > 0);
      const to = from === 0 ? 1 : 0;
      const p = await page(`(() => {
        const d = devicePixelRatio;
        const cols = document.querySelectorAll('.column');
        const a = cols[${from}].querySelector('.card').getBoundingClientRect();
        const b = cols[${to}].querySelector('.cards-list').getBoundingClientRect();
        return { x: (screenX + a.left + a.width / 2) * d, y: (screenY + a.top + 12) * d, dx: (b.left + 60 - a.left - a.width / 2) * d, dy: (b.top + b.height / 2 - a.top - 12) * d };
      })()`);
      realDrag(p.x, p.y, p.dx, p.dy);
      await until(`${CARD_COUNTS}[${to}] === ${before[to] + 1}`, 'moved card');
    });
  }

  if (RELEASE) {
    await step('the release program runs its bundled Node', async () => {
      const running = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        `(Get-CimInstance Win32_Process -Filter "ParentProcessId=${child.pid} AND Name='node.exe'").ExecutablePath`],
        { windowsHide: true, encoding: 'utf8' }).trim();
      assert.equal(running.toLowerCase(), path.join(ROOT, 'src-tauri', 'target', 'release', 'sidecar', 'node.exe').toLowerCase());
    });
  }

  await step('closing the window ends the program and its server', async () => {
    assert.equal(await portIsOpen(APP_PORT), true);
    const exited = new Promise((resolve) => child.once('exit', resolve));
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `[void](Get-Process -Id ${child.pid}).CloseMainWindow()`], { windowsHide: true });
    await Promise.race([exited, sleep(8000).then(() => { throw new Error('The program is still running'); })]);
    const end = Date.now() + 5000;
    while (Date.now() < end && await portIsOpen(APP_PORT)) await sleep(100);
    assert.equal(await portIsOpen(APP_PORT), false);
  });

  const failed = results.filter((ok) => !ok).length;
  console.log(`\n  ${results.length - failed} of ${results.length} passed (screenshots in .smoke/)`);
  return failed;
}

main()
  .catch((err) => { console.error(err.message); return 1; })
  .then((failed) => {
    if (child && child.exitCode === null) { try { child.kill(); } catch {} }
    process.exit(failed ? 1 : 0);
  });
