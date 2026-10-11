'use strict';

// When the app quits, the desktop must look exactly as it did before the app started.
//
// Holding an item means moving the file into the box folder, so on quit every one of
// those files must go back to the folder it came from. Quitting from the tray, interrupting
// with Ctrl+C, and stopping on a fatal error all go through the same path.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadMain, fence, baseState } = require('./helpers/fakes');

const WINDOWS = path.join(__dirname, '..', 'src', 'main', 'desktop', 'windows.js');

// Each test gets a fresh folder to act as the desktop. If tests shared one, we couldn't tell what came back.
function desktopWith(...names) {
  const desk = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-quit-'));
  const made = names.map((name) => {
    const at = path.join(desk, name);
    fs.writeFileSync(at, name);
    return { name, path: at };
  });
  return { desk, made };
}

const RECYCLE = { name: '휴지통', path: 'shell:RecycleBinFolder' };

function boxed() {
  const { desk, made } = desktopWith('MyClock.lnk', '노트.txt', 'Photos');
  const state = baseState({
    fences: [
      fence({ id: 'a', items: [made[0], made[1]] }),
      fence({ id: 'b', x: 600, items: [RECYCLE, made[2]] }),
    ],
  });
  return { state, desk, made };
}

// Used to check that files really moved into the box folders after startup.
function held(state) {
  return state.fences.flatMap((box) => box.items.map((item) => item.path));
}

test('on startup, held files move into the box folders', async () => {
  const { state, desk } = boxed();
  const { stop } = await loadMain(state);
  try {
    assert.deepEqual(fs.readdirSync(desk).sort(), [], 'files were left in the desktop folder');
    for (const at of held(state)) {
      if (at.startsWith('shell:')) continue;
      assert.equal(fs.existsSync(at), true, `${at} is not in the box folder`);
    }
  } finally {
    stop();
  }
});

test('quitting returns every held item without missing any', async () => {
  const { state, desk } = boxed();
  const { desktop, quit } = await loadMain(state);
  await quit();

  assert.deepEqual(
    fs.readdirSync(desk).sort(),
    ['MyClock.lnk', 'Photos', '노트.txt'].sort(),
    'some files did not return to the desktop'
  );
  // The desktop goes back to how it was, but which box held what is remembered.
  assert.deepEqual(state.fences[0].items.map((item) => item.name), ['MyClock.lnk', '노트.txt']);
  assert.deepEqual(state.fences[1].items.map((item) => item.name), ['휴지통', 'Photos']);
  for (const item of state.fences.flatMap((box) => box.items)) {
    if (String(item.path).startsWith('shell:')) continue;
    assert.equal(path.dirname(item.path), desk, 'the remembered location is not the desktop');
    assert.equal(fs.existsSync(item.path), true, 'the remembered file is not on the desktop');
  }
  // Restoring icon positions is handled by release and shutdown.
  assert.ok(desktop.calls.release.at(-1), 'icon positions were not restored');
});

test('restarting refills boxes from the remembered settings', async () => {
  const { state, desk } = boxed();
  const first = await loadMain(state);
  await first.quit();
  assert.equal(fs.readdirSync(desk).length, 3, 'the desktop was empty after quitting');

  const again = await loadMain(state);
  try {
    assert.deepEqual(fs.readdirSync(desk).sort(), [], 'files were left on the desktop after restarting');
    assert.deepEqual(state.fences[0].items.map((item) => item.name), ['MyClock.lnk', '노트.txt']);
    assert.deepEqual(state.fences[1].items.map((item) => item.name), ['휴지통', 'Photos']);
    for (const item of state.fences.flatMap((box) => box.items)) {
      if (String(item.path).startsWith('shell:')) continue;
      assert.equal(fs.existsSync(item.path), true, `${item.name} is not in the box`);
      assert.notEqual(path.dirname(item.path), desk, 'left on the desktop instead of being put in the box');
    }
    assert.equal(state.fences[0].x, 100, 'forgot the box position');
    assert.equal(state.fences[1].x, 600, 'forgot the second box position');
  } finally {
    again.stop();
  }
});

test('returned files keep their contents', async () => {
  const { state, desk } = boxed();
  const { quit } = await loadMain(state);
  await quit();
  assert.equal(fs.readFileSync(path.join(desk, '노트.txt'), 'utf8'), '노트.txt', 'the contents changed');
});

test('quitting also notifies the desktop module', async () => {
  const { state } = boxed();
  const { desktop, quit } = await loadMain(state);
  assert.equal(desktop.calls.shutdown, 0);
  await quit();
  // shutdown restores Explorer settings (auto-arrange, shell icons).
  assert.equal(desktop.calls.shutdown, 1, 'Explorer settings were not restored');
});

test('held files are returned even when quitting with boxes hidden', async () => {
  const { state, desk } = boxed();
  state.hidden = true;
  const { quit } = await loadMain(state);
  await quit();
  assert.equal(fs.readdirSync(desk).length, 3, 'files were not returned while hidden');
});

test('the quit sequence runs to completion even with no boxes', async () => {
  const { desktop, quit } = await loadMain(baseState({ fences: [] }));
  await quit();
  assert.deepEqual(desktop.calls.release.at(-1), []);
  assert.equal(desktop.calls.shutdown, 1);
});

// Interrupting npm start with Ctrl+C. Files must come back even with no chance to close windows.
test('held files return to the desktop even after Ctrl+C', async () => {
  const { state, desk } = boxed();
  const { signal } = await loadMain(state);
  signal('SIGINT');
  assert.deepEqual(
    fs.readdirSync(desk).sort(),
    ['MyClock.lnk', 'Photos', '노트.txt'].sort(),
    'after Ctrl+C, files were left in the box folders'
  );
});

test('files return even when exiting without closing windows', async () => {
  const { state, desk } = boxed();
  const { exit } = await loadMain(state);
  exit();
  assert.equal(fs.readdirSync(desk).length, 3, 'files were left behind on abrupt exit');
});

function fatalWindows(electron) {
  return electron.windows.filter((win) => win.loaded && /fatal\.html$/.test(win.loaded.file));
}

function fatalReport(win) {
  return JSON.parse(win.loaded.opts.query.report);
}

// Even when stopping on a fatal error, restore the desktop first, then report what happened.
test('on a fatal error, files are returned before the error is reported', async () => {
  const { state, desk } = boxed();
  const { electron, crash } = await loadMain(state);

  crash(new Error('일부러 낸 오류'));

  assert.equal(fs.readdirSync(desk).length, 3, 'files were left behind because of the error');
  const shown = fatalWindows(electron);
  assert.equal(shown.length, 1, 'the error was not reported');
  assert.equal(electron.errors.length, 0, 'both our window and the system dialog appeared');
  const report = fatalReport(shown[0]);
  assert.match(report.text, /일부러 낸 오류/, 'did not show what the error was');
  assert.match(report.text, /quit\.test\.js/, 'did not show where it happened');
  assert.equal(shown[0].options.alwaysOnTop, true, 'the error window can hide behind other windows');
  assert.equal(shown[0].options.skipTaskbar, true, 'the error window shows up separately on the taskbar');
});

test('choosing copy in the error window sends the contents to the clipboard', async () => {
  const { state } = boxed();
  const { electron, crash } = await loadMain(state);

  crash(new Error('베낄 오류'));
  electron.module.ipcMain.emit('fatal:copy');

  assert.equal(electron.copied.length, 1, 'copy was chosen but nothing went to the clipboard');
  assert.match(electron.copied[0], /베낄 오류/);
  assert.match(electron.copied[0], /MyDeskBox/, 'did not include which version it happened in');
  const shown = fatalWindows(electron);
  assert.equal(shown[0].isDestroyed(), false, 'copying closed the window so the text cannot be read again');
  assert.equal(shown[0].messages('fatal:copied').length, 1, 'did not tell the window that the copy succeeded');
});

test('the error text can be selected and copied in the window', () => {
  const dir = path.join(__dirname, '..', 'src', 'renderer');
  const html = fs.readFileSync(path.join(dir, 'fatal.html'), 'utf8');
  const css = fs.readFileSync(path.join(dir, 'fatal.css'), 'utf8');
  const js = fs.readFileSync(path.join(dir, 'fatal.js'), 'utf8');
  assert.match(html, /<textarea[^>]*id="report"/, 'no text box to hold the error text');
  assert.match(html, /readonly/, 'the text box became editable');
  assert.match(css, /user-select:\s*text/, 'text inside the text box cannot be selected');
  assert.match(js, /fatalCopy/, 'no button to copy everything');
  assert.match(js, /select\(/, 'the text is not pre-selected when the window opens');
});

test('if the error window cannot open, a system dialog reports it and allows copying', async () => {
  const { state, desk } = boxed();
  const { electron, crash } = await loadMain(state);
  electron.module.BrowserWindow = class {
    constructor() {
      throw new Error('창 없음');
    }
  };
  electron.copyOnFatal();

  crash(new Error('시스템 창 오류'));

  assert.equal(fs.readdirSync(desk).length, 3, 'files were left behind when reporting via the system dialog');
  assert.equal(fatalWindows(electron).length, 0, 'a window that failed to open is still around');
  const shown = electron.errors.at(-1);
  assert.ok(shown, 'not reported via the system dialog either');
  assert.match(shown.detail, /시스템 창 오류/);
  assert.deepEqual(shown.buttons, ['복사', '닫기']);
  assert.equal(electron.copied.length, 1, 'copying from the system dialog did not work');
  assert.match(electron.copied[0], /시스템 창 오류/);
});

test('two errors are reported only once', async () => {
  const { state } = boxed();
  const { electron, crash, hooks } = await loadMain(state);
  crash(new Error('처음'));
  for (const fn of hooks.get('uncaughtException')) fn(new Error('두 번째'));
  assert.equal(fatalWindows(electron).length, 1, 'the error window appeared twice');
});

// Collects the values passed when the app exits. main.js holds app directly, so swapping the method is visible.
function watchExit(electron) {
  const codes = [];
  electron.module.app.exit = (code) => codes.push(code);
  return codes;
}

test('the app does not exit while the error window is open', async () => {
  const { state } = boxed();
  const { electron, crash } = await loadMain(state);
  const codes = watchExit(electron);

  crash(new Error('기다리는 오류'));
  electron.module.ipcMain.emit('fatal:copy');

  assert.deepEqual(codes, [], 'the app exited before the text could be copied');
  assert.equal(fatalWindows(electron)[0].isDestroyed(), false, 'the error window closed by itself');
});

test('clicking Close in the error window closes it and exits the app', async () => {
  const { state } = boxed();
  const { electron, crash } = await loadMain(state);
  const codes = watchExit(electron);

  crash(new Error('닫을 오류'));
  electron.module.ipcMain.emit('fatal:close');

  assert.deepEqual(codes, [1], 'Close was clicked but the app did not exit with an error code');
  assert.equal(fatalWindows(electron)[0].isDestroyed(), true, 'Close was clicked but the window remained');

  // After closing, the handlers are removed too; otherwise copy would be attempted on a closed window.
  electron.module.ipcMain.emit('fatal:copy');
  electron.module.ipcMain.emit('fatal:close');
  assert.deepEqual(electron.copied, [], 'the closed window\'s copy button is still active');
  assert.deepEqual(codes, [1], 'the app exited twice');
});

test('closing the error window from its frame also exits the app', async () => {
  const { state } = boxed();
  const { electron, crash } = await loadMain(state);
  const codes = watchExit(electron);

  crash(new Error('틀로 닫을 오류'));
  fatalWindows(electron)[0].close();

  assert.deepEqual(codes, [1], 'the window was closed but the app kept running');
});

test('if the error window fails to load, a system dialog reports it and the app exits once', async () => {
  const { state, desk } = boxed();
  const { electron, crash } = await loadMain(state);
  const codes = watchExit(electron);
  const Base = electron.module.BrowserWindow;
  const made = [];
  electron.module.BrowserWindow = class extends Base {
    constructor(options) {
      super(options);
      made.push(this);
    }

    loadFile() {
      throw new Error('읽지 못함');
    }
  };

  crash(new Error('읽기 실패 오류'));

  assert.equal(fs.readdirSync(desk).length, 3, 'files were left behind');
  assert.equal(made.length, 1, 'never tried to create the error window');
  assert.equal(made[0].isDestroyed(), true, 'the window that failed to load was not closed');
  assert.match(electron.errors.at(-1).detail, /읽기 실패 오류/, 'did not fall back to the system dialog');
  assert.deepEqual(codes, [1], 'the app did not exit, or exited twice');
});

test('in English, the error window is shown in English too', async () => {
  const { desk, made } = desktopWith('노트.txt');
  const state = baseState({ settings: { lang: 'en' }, fences: [fence({ items: made })] });
  const { electron, crash } = await loadMain(state);

  crash(new Error('english error'));

  assert.equal(fs.readdirSync(desk).length, 1);
  const report = fatalReport(fatalWindows(electron)[0]);
  assert.equal(report.title, 'MyDeskBox cannot continue');
  assert.equal(report.copy, 'Copy');
  assert.equal(report.close, 'Close');
  assert.match(report.copied, /^Copied\./);
});

test('the error window text exists in both languages', () => {
  const i18n = require('../src/shared/i18n');
  for (const lang of Object.keys(i18n.TEXT)) {
    for (const key of ['fatal.title', 'fatal.detail', 'fatal.copied', 'fatal.copy', 'fatal.close']) {
      assert.ok(i18n.TEXT[lang][key], `${lang} is missing ${key}`);
    }
  }
});

test('unhandled promise rejections are also reported in the window and copied verbatim', async () => {
  const { state } = boxed();
  const { electron, hooks, stop } = await loadMain(state);
  try {
    for (const fn of hooks.get('unhandledRejection')) fn('깨진 약속');
    electron.module.ipcMain.emit('fatal:copy');
  } finally {
    stop();
  }
  const report = fatalReport(fatalWindows(electron)[0]);
  assert.match(report.text, /깨진 약속/, 'did not show the string error');
  assert.equal(electron.copied[0], report.text, 'the copied text differs from the displayed text');
});

test('throwing a non-Error value still shows its contents', async () => {
  const { state } = boxed();
  const { electron, crash } = await loadMain(state);

  crash({ code: 'E_BOX', where: '박스' });

  const report = fatalReport(fatalWindows(electron)[0]);
  assert.match(report.text, /"code": "E_BOX"/, 'did not serialize the thrown value');
  assert.match(report.text, /"where": "박스"/);
  assert.match(report.text, /^MyDeskBox 1\.0\.0/, 'did not prefix the version');
});

test('long error text is copied in full without truncation', async () => {
  const { state } = boxed();
  const { electron, crash } = await loadMain(state);
  const err = new Error('긴 오류');
  err.stack = ['Error: 긴 오류', ...Array.from({ length: 400 }, (_, i) => `    at 자리${i} (file${i}.js:${i}:1)`)].join('\n');

  crash(err);
  electron.module.ipcMain.emit('fatal:copy');

  const report = fatalReport(fatalWindows(electron)[0]);
  assert.match(report.text, /자리399 \(file399\.js:399:1\)/, 'the long stack trace was truncated in the window');
  assert.match(electron.copied[0], /자리0 \(file0\.js:0:1\)[\s\S]*자리399/, 'the copied text was truncated');
});

// The previous run ended without going through any exit path, e.g. a power loss.
// Files left in storage must go back to their places on the next startup.
test('files left by a previous run are restored on startup', async () => {
  const { desk } = desktopWith();
  const room = fs.mkdtempSync(path.join(os.tmpdir(), 'mydeskbox-left-'));
  const box = path.join(room, '지난 박스');
  fs.mkdirSync(box, { recursive: true });
  const stray = path.join(box, '남은.txt');
  fs.writeFileSync(stray, '남은 것');
  fs.writeFileSync(path.join(room, 'restore.json'), JSON.stringify({
    version: 1,
    items: [{ path: stray, home: desk }],
  }));

  const state = baseState({ settings: { root: room }, fences: [] });
  const { stop } = await loadMain(state);
  try {
    assert.equal(fs.existsSync(stray), false, 'the file was left in storage');
    assert.equal(fs.existsSync(path.join(desk, '남은.txt')), true, 'the file did not return to the desktop');
  } finally {
    stop();
  }
});

test('files still held by a box are not touched on startup', async () => {
  const { state } = boxed();
  const { stop } = await loadMain(state);
  const kept = held(state).filter((at) => !at.startsWith('shell:'));
  stop();

  const { stop: stopAgain } = await loadMain(state);
  try {
    for (const at of kept) assert.equal(fs.existsSync(at), true, `${at} was sent back without reason`);
  } finally {
    stopAgain();
  }
});

// From here on, check the source text to make sure no Windows restore step is missing.
// This code touches Explorer for real, so tests cannot call it.
test('all Windows restore steps are in place', () => {
  const source = fs.readFileSync(WINDOWS, 'utf8');

  assert.match(source, /function homeAll/, 'no path to send off-screen icons back home');
  assert.match(source, /function shutdown\(\)[\s\S]*?homeAll\(\)/, 'icons are not returned on quit');
  assert.match(source, /function shutdown\(\)[\s\S]*?restoreShellIcons\(\)/, 'shell icons are not restored on quit');
  assert.match(source, /function shutdown\(\)[\s\S]*?restoreArrange\(\)/, 'Explorer settings are not restored on quit');

  // Also covers exiting without closing windows.
  assert.match(source, /process\.once\('exit'[\s\S]*?homeAll\(\)/, 'icons are not returned on abrupt exit');
  assert.match(source, /process\.once\('exit'[\s\S]*?restoreArrange\(\)/, 'Explorer settings are not restored on abrupt exit');
  assert.match(source, /process\.once\('exit'[\s\S]*?restoreShellIcons\(\)/, 'shell icons are not restored on abrupt exit');

  // The hidden icon layer must always be shown again, or the desktop is left blank.
  assert.match(source, /function homeAll\(\)[\s\S]*?showLayer\(true\)/, 'the icon layer is not restored on quit');
  assert.match(source, /function release\(items\)[\s\S]*?showLayer\(true\)/, 'the icon layer is not restored when boxes are hidden');
  assert.match(source, /function restoreArrange\(\)[\s\S]*?normalizeList\(\)/, 'Explorer settings are not put back');
  assert.match(source, /function normalizeList\(\)[\s\S]*?showLayer\(true\)/, 'the layer hidden by a previous run is not restored');
  assert.match(source, /function normalizeList\(\)[\s\S]*?restoreShellIcons\(\)/, 'shell icons hidden by a previous run are not restored');

  // Icons pushed aside by boxes must also be restored for the desktop to look as it did before startup.
  // Pushed positions are on screen, so homeAll's off-screen check misses them; they are tracked separately.
  assert.match(source, /function nudge\(blocks, live\)[\s\S]*?homes\.set\(key/, 'positions before pushing are not recorded');
  assert.match(source, /function nudge\(blocks, live\)[\s\S]*?nudged\.add\(key\)/, 'which icons were pushed is not recorded');
  assert.match(source, /function homeAll\(\)[\s\S]*?nudged\.has\(key\)/, 'pushed icons are not returned home');

  // Calling SHCNE_ASSOCCHANGED when restoring shell icons rebuilds the entire icon image cache,
  // during which the desktop shows only names without images. Only a desktop view refresh should be sent.
  assert.doesNotMatch(source, /SHChangeNotify\(0x08000000/, 'forces a full rebuild of the icon image cache');
  assert.match(source, /function refreshShellIcons\(\)[\s\S]*?DESKTOP_REFRESH/, 'the desktop view is not refreshed');
});

// Every exit path must converge on one place (restoreDesktop). Missing any one leaves files behind.
test('no exit path is missing', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'main.js'), 'utf8');
  assert.match(source, /app\.on\('before-quit', restoreDesktop\)/, 'no tray quit path');
  assert.match(source, /process\.on\('exit', restoreDesktop\)/, 'no abrupt exit path');
  assert.match(source, /SIGINT/, 'no Ctrl+C interrupt path');
  assert.match(source, /process\.on\('uncaughtException', fatal\)/, 'no fatal error path');
  assert.match(source, /process\.on\('unhandledRejection', fatal\)/, 'no unhandled rejection path');
  // Restore before reporting: the desktop must be intact even while the user is stopped at the dialog.
  assert.match(source, /function fatal\([\s\S]*?restoreDesktop\(\)[\s\S]*?tell\(text\)/, 'reporting happens before restoring');
  assert.match(source, /putBack/, 'held files are not returned');
});

test('the quit routines are callable on this machine', { skip: process.platform !== 'win32' }, () => {
  const desktop = require('../src/main/desktop/windows');
  for (const name of ['release', 'shutdown', 'fileIcon', 'shellItems', 'nudge', 'gridInfo', 'hidePath']) {
    assert.equal(typeof desktop[name], 'function', `${name} is missing`);
  }
});

// Pushed-aside icons must return to spots that boxes have moved away from.
// Otherwise every place a box passes leaves a hole, and the desktop gets messier over time.
test('there is a path to bring pushed icons back home', () => {
  const source = fs.readFileSync(WINDOWS, 'utf8');
  assert.match(source, /function homecoming\(/, 'no path to bring icons back');
  assert.match(source, /function nudge\(blocks, live\)[\s\S]*?homecoming\(/, 'icons are not brought back when pushing');
  // If the home spot is still covered by a box, leave the icon where it is.
  assert.match(source, /function homecoming\([\s\S]*?deskgrid\.blocked\(/, 'sends icons back under a box');
  // Sending an icon to a spot someone else occupies makes icons overlap.
  assert.match(source, /function homecoming\([\s\S]*?taken\.has\(/, 'sends icons into an occupied spot');
  // Returned icons must be removed from the pushed list so they aren't moved again on quit.
  assert.match(source, /function homecoming\([\s\S]*?nudged\.delete\(key\)/, 'returned icons are still tracked as pushed');
});

// The name Explorer draws on the desktop and the name shown in the box must match.
test('box item names come from the shell', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'fences.js'), 'utf8');
  assert.match(source, /desktop\.displayName\(item\.path\)/, 'does not ask the shell for the name');
  const win = fs.readFileSync(WINDOWS, 'utf8');
  assert.match(win, /function displayName\(filePath\)[\s\S]*?SHGFI_DISPLAYNAME/, 'does not fetch the shell display name');
});

// The Recycle Bin has different images when empty and when full.
test('the Recycle Bin image is refetched based on whether it is full', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'fences.js'), 'utf8');
  // The bin state must be part of the image cache key so the image is refetched when the state changes.
  assert.match(source, /\$\{filePath\}:\$\{binState\(\)\}/, 'the bin state is not part of the cache key');
  assert.match(source, /function watchBin\(\)[\s\S]*?pushAll\(\)/, 'does not redraw when the state changes');
});
