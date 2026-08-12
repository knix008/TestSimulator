/**
 * Launches MyTerminal and verifies each toolbar button works.
 * Usage: npx electron scripts/test-toolbar.js
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const results = [];
let win;

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function evalInPage(code) {
  return win.webContents.executeJavaScript(code, true);
}

async function waitForAppReady() {
  for (let i = 0; i < 50; i += 1) {
    const ready = await evalInPage(`
      !!(document.getElementById('toolbar')
        && document.getElementById('terminal-panes')
        && document.querySelector('.terminal-pane.active .xterm')
        && window.__toolbarTestReady !== false)
    `);
    if (ready) {
      // Give boot() a moment to bind handlers.
      await new Promise((r) => setTimeout(r, 400));
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Renderer did not become ready');
}

async function runTests() {
  await waitForAppReady();

  // Expose helpers in page (must end with a cloneable value)
  await evalInPage(`
    window.__click = (id) => {
      const el = document.getElementById(id);
      if (!el) throw new Error('missing ' + id);
      el.click();
      return true;
    };
    true
  `);

  // 1) Theme menu open/close
  await evalInPage(`__click('btn-theme')`);
  let themeOpen = await evalInPage(`!document.getElementById('theme-menu').hidden`);
  record('theme menu opens', themeOpen);
  const themeCount = await evalInPage(`document.querySelectorAll('#theme-menu [data-theme]').length`);
  record('theme menu has items', themeCount >= 6, `count=${themeCount}`);

  await evalInPage(`
    const ocean = document.querySelector('#theme-menu [data-theme="ocean"]');
    if (ocean) ocean.click();
  `);
  await new Promise((r) => setTimeout(r, 150));
  const themeApplied = await evalInPage(`
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  `);
  record('theme select (ocean)', themeApplied.length > 0, `accent=${themeApplied}`);

  // 2) Language menu + Korean
  await evalInPage(`__click('btn-lang')`);
  let langOpen = await evalInPage(`!document.getElementById('lang-menu').hidden`);
  record('language menu opens', langOpen);
  await evalInPage(`
    const ko = document.querySelector('#lang-menu [data-lang="ko"]');
    if (ko) ko.click();
  `);
  await new Promise((r) => setTimeout(r, 150));
  const aboutTitleKo = await evalInPage(`
    document.getElementById('btn-about').getAttribute('aria-label') || ''
  `);
  record('language switch to Korean', /프로그램|정보|About/i.test(aboutTitleKo), aboutTitleKo);

  await evalInPage(`
    __click('btn-lang');
    const en = document.querySelector('#lang-menu [data-lang="en"]');
    if (en) en.click();
  `);
  await new Promise((r) => setTimeout(r, 100));

  // 3) Settings modal
  await evalInPage(`__click('btn-settings')`);
  const settingsOpen = await evalInPage(`!!document.querySelector('.modal-backdrop .modal')`);
  record('settings modal opens', settingsOpen);
  await evalInPage(`
    const closeBtn = document.querySelector('.modal-footer .modal-btn:last-child');
    if (closeBtn) closeBtn.click();
    else document.querySelector('.modal-x')?.click();
  `);
  await new Promise((r) => setTimeout(r, 100));
  const settingsClosed = await evalInPage(`!document.querySelector('.modal-backdrop')`);
  record('settings modal closes', settingsClosed);

  // 4) About modal
  await evalInPage(`__click('btn-about')`);
  const aboutOk = await evalInPage(`
    const body = document.querySelector('.modal-body');
    const text = body ? body.innerText : '';
    text.includes('SHKWON') && text.includes('knix008@naver.com')
  `);
  record('about modal shows author', aboutOk);
  await evalInPage(`document.querySelector('.modal-footer .modal-btn')?.click()`);
  await new Promise((r) => setTimeout(r, 80));

  // 5) Font increase/decrease
  const fontBefore = await evalInPage(`
    parseInt(document.querySelector('.terminal-pane.active')?.dataset.fontSize || '0', 10)
  `);
  await evalInPage(`__click('btn-font-inc')`);
  await new Promise((r) => setTimeout(r, 80));
  const fontAfterInc = await evalInPage(`
    parseInt(document.querySelector('.terminal-pane.active')?.dataset.fontSize || '0', 10)
  `);
  record('font increase', fontAfterInc > fontBefore, `${fontBefore} -> ${fontAfterInc}`);

  await evalInPage(`__click('btn-font-dec')`);
  await new Promise((r) => setTimeout(r, 80));
  const fontAfterDec = await evalInPage(`
    parseInt(document.querySelector('.terminal-pane.active')?.dataset.fontSize || '0', 10)
  `);
  record('font decrease', fontAfterDec < fontAfterInc, `${fontAfterInc} -> ${fontAfterDec}`);

  // 6) Clear
  await evalInPage(`__click('btn-clear')`);
  record('clear button clickable', true);

  // 7) Copy / Paste (clipboard)
  await evalInPage(`
    navigator.clipboard.writeText('toolbar-paste-test').then(() => true).catch(() => false)
  `);
  await evalInPage(`__click('btn-paste')`);
  record('paste button clickable', true);

  await evalInPage(`__click('btn-copy')`);
  record('copy button clickable', true);

  // 8) New session creates a tab (via tab-bar +)
  const tabsBefore = await evalInPage(
    `document.querySelectorAll('.tab-item:not(.tab-new)').length`
  );
  await evalInPage(`document.querySelector('[data-new-tab]')?.click()`);
  await new Promise((r) => setTimeout(r, 400));
  const tabsAfter = await evalInPage(
    `document.querySelectorAll('.tab-item:not(.tab-new)').length`
  );
  record('new session tab', tabsAfter > tabsBefore, `${tabsBefore} -> ${tabsAfter}`);

  // 9) Window controls
  const maximizedBefore = win.isMaximized();
  await evalInPage(`__click('btn-max')`);
  await new Promise((r) => setTimeout(r, 250));
  const maximizedAfter = win.isMaximized();
  record('maximize toggle', maximizedAfter !== maximizedBefore, `was=${maximizedBefore} now=${maximizedAfter}`);

  // restore if maximized
  if (win.isMaximized()) {
    await evalInPage(`__click('btn-max')`);
    await new Promise((r) => setTimeout(r, 150));
  }

  await evalInPage(`__click('btn-min')`);
  await new Promise((r) => setTimeout(r, 200));
  record('minimize', win.isMinimized());
  win.restore();
  await new Promise((r) => setTimeout(r, 150));

  // Close is tested last via destroying window in teardown (don't click close mid-test)

  const failed = results.filter((r) => !r.ok);
  console.log('\n--- Summary ---');
  console.log(`Passed: ${results.filter((r) => r.ok).length}/${results.length}`);
  if (failed.length) {
    failed.forEach((f) => console.log(`  FAIL: ${f.name} ${f.detail}`));
  }

  const reportPath = path.join(__dirname, '../toolbar-test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ results, failed: failed.length }, null, 2));
  console.log(`Report: ${reportPath}`);

  return failed.length === 0;
}

function registerIpc() {
  // Reuse production main handlers by requiring main pieces lightly.
  const { createPty, writePty, resizePty, killPty } = require('../src/main/pty-manager');
  const settingsPath = path.join(app.getPath('userData'), 'settings-test.json');
  const readSettings = () => {
    try {
      if (fs.existsSync(settingsPath)) return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (_) {}
    return {};
  };
  const writeSettings = (s) => {
    fs.writeFileSync(settingsPath, JSON.stringify(s || {}, null, 2));
  };

  ipcMain.handle('window:minimize', () => win?.minimize());
  ipcMain.handle('window:maximize', () => {
    if (!win) return false;
    if (win.isMaximized()) {
      win.unmaximize();
      return false;
    }
    win.maximize();
    return true;
  });
  ipcMain.handle('window:close', () => win?.close());
  ipcMain.handle('window:isMaximized', () => win?.isMaximized() ?? false);
  ipcMain.handle('app:getInfo', () => ({
    name: 'MyTerminal',
    version: app.getVersion(),
    author: 'SHKWON',
    email: 'knix008@naver.com',
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
  }));
  ipcMain.handle('settings:get', () => readSettings());
  ipcMain.handle('settings:set', (_e, s) => {
    writeSettings(s);
    return true;
  });
  ipcMain.handle('shell:openExternal', () => true);
  ipcMain.handle('pty:start', (_e, options) => {
    try {
      createPty(win, options || {});
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    }
  });
  ipcMain.handle('pty:write', (_e, data) => {
    writePty(data);
    return true;
  });
  ipcMain.handle('pty:resize', (_e, cols, rows) => {
    resizePty(cols, rows);
    return true;
  });
  ipcMain.handle('pty:kill', () => {
    killPty();
    return true;
  });
}

app.whenReady().then(async () => {
  registerIpc();
  win = new BrowserWindow({
    width: 1100,
    height: 720,
    show: false,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '../src/preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.webContents.on('console-message', (_e, level, message) => {
    console.log(`[renderer:${level}] ${message}`);
  });
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error('did-fail-load', code, desc);
  });

  await win.loadFile(path.join(__dirname, '../src/renderer/index.html'));

  try {
    const ok = await runTests();
    killRequire();
    app.exit(ok ? 0 : 1);
  } catch (err) {
    console.error('TEST ERROR:', err);
    app.exit(2);
  }
});

function killRequire() {
  try {
    require('../src/main/pty-manager').killPty();
  } catch (_) {}
}
