// Command Center — Electron main process.
//
//   • main window lifecycle (single instance, persisted bounds)
//   • hands the renderer the core API over IPC (see ./ipc.js)
//   • native bits the core cannot do on its own: open with the default app,
//     move to the OS trash, the system clipboard, printing
//   • smoke-test hook: --smoke-shot=<png> screenshots the window and quits
const { app, BrowserWindow, Menu, shell, clipboard, nativeImage, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const { registerIpc } = require('./ipc');
const { createApi } = require('../core/api');
const fsops = require('../core/fsops');

const isDev = !app.isPackaged && process.env.ELECTRON_DEV === '1';
const DEV_URL = 'http://localhost:5185';
const PRODUCT = 'Command Center';

app.commandLine.appendSwitch('disable-features', 'Autofill');
// A separate profile for tests / parallel runs (settings + instance lock).
if (process.env.CC_USER_DATA && !app.isPackaged) app.setPath('userData', process.env.CC_USER_DATA);

function argValue(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : (process.env[`CC_${name.toUpperCase().replace(/-/g, '_')}`] || null);
}

function readBuildInfo() {
  const candidates = [
    path.join(process.resourcesPath || '', 'build-info.json'),
    path.join(__dirname, '..', 'src', 'build-info.json'),
  ];
  for (const p of candidates) {
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { /* next */ }
  }
  return null;
}

let mainWin = null;
let api = null;
// Tool windows (viewer, editor, multi-rename, search, settings): independent
// top-level windows that close together with the main window.
const toolWins = new Set();
const TOOL_SIZES = { viewer: [960, 720], editor: [960, 720], preview: [720, 560], info: [660, 720], multiRename: [920, 680], search: [760, 600], settings: [1040, 960], about: [560, 400] };   // fits the tallest tab (theme / prompt: ~760 px of content + 130 chrome) with no scrollbar and no waste; clamped to the screen below
// Every tool window exists at most once: a second request focuses the open one
// (and hands it the new arguments — see ipc.js). The settings window has a fixed size.
const SINGLETON = new Set(['viewer', 'editor', 'preview', 'info', 'multiRename', 'search', 'settings', 'about']);
// The image preview follows the mouse: it opens on a click in the file list and must not take the
// focus away from it, so it is shown inactive and never focused on a repeat request. As a child of
// the main window it stays above it all the same.
const QUIET = new Set(['preview']);
// The settings window has a fixed size: it is sized so that every tab fits whole, with no scrollbar and
// nothing cut off (see TOOL_SIZES), so there is nothing for the user to resize it for.
const FIXED_SIZE = new Set(['settings', 'about']);
// Bumped when a tool window's default size changes, so saved sizes from an older build are dropped once.
const TOOL_BOUNDS_VERSION = 3;
// Title-bar icon per tool (assets/tool-icons/<kind>.png, see scripts/generate-tool-icons.mjs).
function toolIcon(kind) {
  const p = path.join(__dirname, '..', 'assets', 'tool-icons', `${kind}.png`);
  return fs.existsSync(p) ? p : (fs.existsSync(iconPath()) ? iconPath() : undefined);
}

function loadApp(win, query) {
  if (argValue('smoke-url')) { const u = new URL(argValue('smoke-url')); for (const [k, v] of Object.entries(query || {})) u.searchParams.set(k, v); win.loadURL(u.toString()); }
  else if (isDev) { const u = new URL(DEV_URL); for (const [k, v] of Object.entries(query || {})) u.searchParams.set(k, v); win.loadURL(u.toString()); }
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { query: query || {} });
}

function openToolWindow({ kind, title, width, height }) {
  if (SINGLETON.has(kind)) {
    const open = Array.from(toolWins).find((w) => w.ccKind === kind && !w.isDestroyed());
    if (open) { if (open.isMinimized()) open.restore(); if (!QUIET.has(kind)) open.focus(); return open; }
  }
  const session = api.session.get();
  const fixed = FIXED_SIZE.has(kind);
  // A window whose default size grew in a new version would still open at the size an older build saved
  // for it. Bumping TOOL_BOUNDS_VERSION drops those saved *sizes* once (the position is kept); after that
  // the user's own resizing is remembered as usual.
  if ((Number(session.toolBoundsVersion) || 0) < TOOL_BOUNDS_VERSION) {
    const cleaned = Object.fromEntries(Object.entries(session.toolBounds || {}).map(([k, b]) => [k, { x: b.x, y: b.y }]));
    api.session.save({ toolBounds: cleaned, toolBoundsVersion: TOOL_BOUNDS_VERSION });
    session.toolBounds = cleaned;
  }
  const saved = fixed ? null : (session.toolBounds || {})[kind] || null;
  const pos = (session.toolBounds || {})[kind] || null;
  // The default size, never larger than the screen it opens on (the settings window is tall).
  const area = screen.getPrimaryDisplay().workArea;
  const [dw, dh] = (TOOL_SIZES[kind] || [800, 600]).map((n, i) => Math.min(n, i === 0 ? area.width : area.height));
  // A second window of the same kind opens slightly offset so it does not hide the first.
  const twins = Array.from(toolWins).filter((w) => w.ccKind === kind).length;
  const win = new BrowserWindow({
    width: saved && saved.width ? saved.width : width || dw,
    height: saved && saved.height ? saved.height : height || dh,
    x: pos && Number.isFinite(pos.x) ? pos.x + twins * 24 : undefined,
    y: pos && Number.isFinite(pos.y) ? pos.y + twins * 24 : undefined,
    minWidth: fixed ? undefined : 480,
    minHeight: fixed ? undefined : 360,
    resizable: !fixed,
    maximizable: !fixed,
    backgroundColor: session.themeBg || '#12161c',
    autoHideMenuBar: true,
    show: false,
    title: title || PRODUCT,
    icon: toolIcon(kind),
    parent: QUIET.has(kind) && mainWin && !mainWin.isDestroyed() ? mainWin : undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, spellcheck: false },
  });
  win.ccKind = kind;
  toolWins.add(win);
  win.once('ready-to-show', () => (QUIET.has(kind) ? win.showInactive() : win.show()));
  // The page sets document.title; keep it (Electron would otherwise reset it on navigation).
  win.on('page-title-updated', (e) => e.preventDefault());
  win.webContents.on('page-title-updated', (_e, t) => { if (!win.isDestroyed()) win.setTitle(t); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.on('close', () => {
    if (win.isDestroyed() || win.isMinimized()) return;
    const b = win.getBounds();
    const all = { ...(api.session.get().toolBounds || {}), [kind]: b };
    api.session.save({ toolBounds: all });
  });
  win.on('closed', () => toolWins.delete(win));
  loadApp(win, { win: kind, id: String(win.id) });
  return win;
}

// ── Menu popup window ──
// Menus are drawn in their own frameless, transparent window so they are never
// cut off by the app window: a long menu simply extends past its edge, as an
// OS menu does. One window serves every menu — it is created hidden at startup
// (so opening a menu is instant) and reused: the renderer sends the items, the
// popup page (?win=menu) draws them, reports the size it needs, and this puts
// the window there — clamped to the display's work area, not to the app.
let menuWin = null;
let menuOwner = null;   // the window whose menu is showing (it gets the pick)
let menuSeq = 0;

function menuPopupWindow() {
  if (menuWin && !menuWin.isDestroyed()) return menuWin;
  menuWin = new BrowserWindow({
    width: 260, height: 200, show: false, frame: false, transparent: true, hasShadow: false,
    resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, alwaysOnTop: true, acceptFirstMouse: true, backgroundColor: '#00000000',
    // A menu must not appear in the window list or steal the app's "active window" look.
    type: process.platform === 'linux' ? 'toolbar' : undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, spellcheck: false },
  });
  menuWin.setMenu(null);
  // The popup never takes the focus by itself (see placeMenuPopup): the app window keeps it and decides
  // when the menu closes. Only once the user has clicked *into* the menu does it hold the focus, and then
  // losing it again closes the menu, the way an OS menu behaves.
  menuWin.on('focus', () => { menuWin.ccHadFocus = true; });
  menuWin.on('blur', () => { if (menuWin && menuWin.ccHadFocus) hideMenuPopup('blur'); });
  menuWin.on('closed', () => { menuWin = null; });
  loadApp(menuWin, { win: 'menu' });
  return menuWin;
}

// The popup is hidden, never closed, so the next menu opens without a reload.
// `seq` (when the renderer sends one) says which menu it means: a close for a menu that has already been
// replaced by a newer one is ignored, so a late close cannot hide the menu that just opened.
function hideMenuPopup(reason, seq, notifyOwner = true) {
  if (typeof seq === 'number' && seq !== menuSeq) return;
  menuSeq++;
  const owner = menuOwner;
  menuOwner = null;
  if (menuWin && !menuWin.isDestroyed() && menuWin.isVisible()) menuWin.hide();
  // `notifyOwner` false when a pick is on its way: the owner treats "closed" as the end of the menu, so
  // announcing it first would make it ignore the pick that follows.
  if (notifyOwner && owner && !owner.isDestroyed()) owner.webContents.send('menu:closed', { reason: reason || 'close' });
}

// `anchor` is the rectangle the menu hangs off, in the owner window's page
// coordinates ({ x, y, w, h }); with w/h 0 it is a plain point (right-click).
function showMenuPopup({ items, anchor, theme, customThemes, fontSize }, owner) {
  if (!owner || owner.isDestroyed()) return { ok: false };
  const win = menuPopupWindow();
  const seq = ++menuSeq;
  menuOwner = owner;
  const ob = owner.getContentBounds();
  const at = { x: Math.round(ob.x + (anchor.x || 0)), y: Math.round(ob.y + (anchor.y || 0)), w: Math.round(anchor.w || 0), h: Math.round(anchor.h || 0) };
  win.ccPending = { seq, at };
  watchMenuOwner(owner);
  win.webContents.send('menu:show', { seq, items, theme, customThemes, fontSize });
  return { ok: true, seq };
}

// The popup measured itself: place it next to the anchor, inside the screen the anchor is on.
function placeMenuPopup(width, height, seq) {
  const win = menuWin;
  if (!win || win.isDestroyed() || !win.ccPending || win.ccPending.seq !== seq || seq !== menuSeq) return;
  const { at } = win.ccPending;
  const area = screen.getDisplayNearestPoint({ x: at.x, y: at.y }).workArea;
  const w = Math.min(Math.ceil(width), area.width);
  const h = Math.min(Math.ceil(height), area.height);
  // Below the anchor (a menu-bar button) or at the point; flipped above when there is no room below.
  let x = at.x;
  let y = at.h ? at.y + at.h + 2 : at.y;
  if (y + h > area.y + area.height) {
    const above = at.y - h - (at.h ? 2 : 0);
    y = above >= area.y ? above : Math.max(area.y, area.y + area.height - h);
  }
  if (x + w > area.x + area.width) x = Math.max(area.x, area.x + area.width - w);
  if (x < area.x) x = area.x;
  win.setBounds({ x: Math.round(x), y: Math.round(y), width: w, height: h });
  win.setAlwaysOnTop(true, 'pop-up-menu');
  // Shown *without* taking the focus: stealing it would blur the app window, and the click that opened the
  // menu hands the focus straight back — the popup would blur and hide again before it was ever seen.
  // Escape and clicking elsewhere are handled by the app window, which still has the focus (ContextMenu).
  win.ccHadFocus = false;
  if (!win.isVisible()) win.showInactive();
  // Tell the owner the menu really is on screen. Without this confirmation it gives up after a moment and
  // draws the menu in its own window instead, so a popup that cannot be shown never leaves the user
  // without a menu (see ContextMenu).
  if (menuOwner && !menuOwner.isDestroyed()) menuOwner.webContents.send('menu:shown', { seq });
}

// The app window losing the focus to anything but the menu closes it (alt-tab, another program).
function watchMenuOwner(owner) {
  if (!owner || owner.ccMenuWatched) return;
  owner.ccMenuWatched = true;
  const gone = () => {
    if (owner !== menuOwner) return;
    // Give the focus a moment to land: clicking the menu focuses the popup, which must not close it.
    setTimeout(() => { if (owner === menuOwner && menuWin && !menuWin.isDestroyed() && !menuWin.isFocused()) hideMenuPopup('owner-blur'); }, 120);
  };
  owner.on('blur', gone);
  owner.on('move', () => { if (owner === menuOwner) hideMenuPopup('owner-move'); });
  owner.on('resize', () => { if (owner === menuOwner) hideMenuPopup('owner-resize'); });
}

// `keep`: the menu stays on screen (the owner re-sends its items — a removable entry was dropped).
function menuPopupPick(id, seq, keep = false) {
  if (seq !== menuSeq) return;
  const owner = menuOwner;
  if (!keep) hideMenuPopup('pick', undefined, false);
  if (owner && !owner.isDestroyed()) owner.webContents.send('menu:picked', { id, keep });
}

// ── Printing ──
// The renderer builds a self-contained HTML document (src/lib/print.js: a text file as a <pre>, an
// image as an <img>; the page size, orientation, margins and scale are CSS in the document itself, so
// the preview and the paper agree) and hands it here. It is rendered in a hidden window of its own —
// the app's theme and chrome never reach the paper — and either
//   • printed: silently on the chosen printer with the chosen copies / page range (the print dialog
//     of the app, src/dialogs/PrintDialog.jsx, is the dialog), or through the system dialog when no
//     printer is named, or
//   • turned into a PDF (printToPDF) for the preview in that dialog.
// The document goes through a temporary file: a data: URL would hit Chromium's limit with a big image.
let printSeq = 0;
function withPrintWindow({ html, title }, owner, work) {
  return new Promise((resolve) => {
    const dir = path.join(app.getPath('temp'), 'command-center-print');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `print-${process.pid}-${++printSeq}.html`);
    fs.writeFileSync(file, String(html || ''), 'utf-8');
    const win = new BrowserWindow({
      width: 800, height: 600, show: false, parent: owner && !owner.isDestroyed() ? owner : undefined,
      title: title || PRODUCT, backgroundColor: '#ffffff',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
    });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (!win.isDestroyed()) win.destroy();
      try { fs.unlinkSync(file); } catch { /* already gone */ }
      resolve(result);
    };
    win.on('closed', () => finish({ ok: false, cancelled: true }));
    win.webContents.on('did-fail-load', (_e, code, desc) => finish({ ok: false, error: `${desc || 'load failed'} (${code})` }));
    win.webContents.once('did-finish-load', () => {
      // Give images a frame to decode before the page is snapshotted.
      setTimeout(() => {
        if (settled) return;
        work(win).then(finish, (err) => finish({ ok: false, error: err && err.message ? err.message : String(err) }));
      }, 150);
    });
    win.loadFile(file);
  });
}

// Paper names the print dialog offers → what webContents.print / printToPDF take (B5 is not a named size).
const PAPER_SIZES = { A3: 'A3', A4: 'A4', A5: 'A5', Letter: 'Letter', Legal: 'Legal', Tabloid: 'Tabloid', B5: { width: 176000, height: 250000 } };
const PAPER_INCHES = { A3: [11.69, 16.54], A4: [8.27, 11.69], A5: [5.83, 8.27], Letter: [8.5, 11], Legal: [8.5, 14], Tabloid: [11, 17], B5: [6.93, 9.84] };

// options: { deviceName, copies, pageRanges: [{from,to}] (0-based), landscape, paper, color }
function printHtml({ html, title, options }, owner) {
  const o = options || {};
  return withPrintWindow({ html, title }, owner, (win) => new Promise((resolve) => {
    const opts = { silent: !!o.deviceName, printBackground: true };   // default margins = the document's own @page rule (a 'none' / custom type would override it)
    if (o.deviceName) opts.deviceName = o.deviceName;
    if (o.copies > 1) opts.copies = Math.min(99, Math.floor(o.copies));
    if (Array.isArray(o.pageRanges) && o.pageRanges.length) opts.pageRanges = o.pageRanges;
    if (typeof o.landscape === 'boolean') opts.landscape = o.landscape;
    if (o.paper && PAPER_SIZES[o.paper]) opts.pageSize = PAPER_SIZES[o.paper];
    if (o.color === false) opts.color = false;
    win.webContents.print(opts, (success, reason) => {
      // Chromium reports "cancelled" when the user backs out of the dialog — not an error.
      if (success) resolve({ ok: true });
      else resolve(/cancel/i.test(reason || '') ? { ok: false, cancelled: true } : { ok: false, error: reason || 'print failed' });
    });
  }));
}

// The preview: the same document as a PDF (base64) plus its page count.
function printPreview({ html, title, options }, owner) {
  const o = options || {};
  return withPrintWindow({ html, title }, owner, async (win) => {
    const size = PAPER_INCHES[o.paper] || PAPER_INCHES.A4;
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      // The document's @page rule (size, orientation, margins) is what the paper gets, so the PDF follows it too.
      preferCSSPageSize: true,
      pageSize: { width: o.landscape ? size[1] : size[0], height: o.landscape ? size[0] : size[1] },
      landscape: !!o.landscape,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      ...(o.pageRanges ? { pageRanges: o.pageRanges } : {}),
    });
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    return { ok: true, pdf: pdf.toString('base64'), pages };
  });
}

// The printers the system knows (the print dialog's printer list); the default one is flagged.
async function printers() {
  const wc = (mainWin && !mainWin.isDestroyed() ? mainWin : BrowserWindow.getAllWindows()[0] || null);
  if (!wc) return [];
  const list = await wc.webContents.getPrintersAsync();
  return list.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault }));
}

function iconPath() {
  const dir = path.join(__dirname, '..', 'build', 'icons');
  return path.join(dir, process.platform === 'win32' ? 'icon.ico' : 'icon.png');
}

function createWindow() {
  const session = api.session.get();
  const saved = session.windowBounds || null;
  const MIN_W = 1142, MIN_H = 713;   // outer size (1126×674 of content) — see .app min-width in styles.css
  const win = new BrowserWindow({
    // The window always opens at its minimum size; only the last position is restored.
    width: MIN_W,
    height: MIN_H,
    x: saved && Number.isFinite(saved.x) ? saved.x : undefined,
    y: saved && Number.isFinite(saved.y) ? saved.y : undefined,
    // Wide enough for the full icon toolbar (measured ~1110 px) in either language, so
    // switching the language never changes the window and no button is ever clipped.
    minWidth: MIN_W,
    minHeight: MIN_H,
    backgroundColor: session.themeBg || '#12161c',
    autoHideMenuBar: true,
    show: false,
    title: PRODUCT,
    icon: fs.existsSync(iconPath()) ? iconPath() : undefined,
    webPreferences: {
      // --smoke-url=<http://…> loads the web version instead (no preload, so
      // the UI runs exactly as it does in a browser) — used by the smoke test.
      preload: argValue('smoke-url') ? undefined : path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });
  mainWin = win;

  win.once('ready-to-show', () => win.show());

  // Links and "open in browser" requests go to the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  const saveBounds = () => {
    if (win.isDestroyed()) return;
    const b = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
    api.session.save({ windowBounds: { ...b, maximized: win.isMaximized() } });
  };
  win.on('close', saveBounds);
  // Tool windows are independent, but they belong to the app: closing the main window closes them all —
  // the hidden menu popup too, otherwise it alone would keep the app running (window-all-closed).
  win.on('closed', () => {
    mainWin = null;
    for (const w of Array.from(toolWins)) { if (!w.isDestroyed()) w.close(); }
    if (menuWin && !menuWin.isDestroyed()) menuWin.destroy();
  });

  loadApp(win, null);

  const shot = argValue('smoke-shot');
  if (shot) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          // Optional script run inside the page first (drives dialogs etc.).
          const script = argValue('smoke-script');
          if (script) {
            const result = await win.webContents.executeJavaScript(fs.readFileSync(script, 'utf-8'), true);
            await new Promise((r) => setTimeout(r, Number(argValue('smoke-settle') || 800)));
            // --smoke-tool-script=<file>: run inside every tool window the scenario opened (drives them from within).
            if (argValue('smoke-tool-script')) {
              for (const w of Array.from(toolWins)) {
                if (w.isDestroyed()) continue;
                // The script may close its window (OK buttons do) — then the call never settles, so race it.
                const r = await Promise.race([w.webContents.executeJavaScript(fs.readFileSync(argValue('smoke-tool-script'), 'utf-8'), true), new Promise((res) => w.once('closed', () => res('(window closed)')))]);
                console.log(`[smoke-tool:${w.ccKind}]`, typeof r === 'string' ? r : JSON.stringify(r));
              }
              await new Promise((r) => setTimeout(r, Number(argValue('smoke-settle') || 800)));
            }
            // --smoke-menu-script=<file>: run inside the menu popup window (clicking an item, say), so the
            // whole pick path — popup click → main → the window that opened the menu — is exercised.
            if (argValue('smoke-menu-script') && menuWin && !menuWin.isDestroyed() && menuWin.isVisible()) {
              const r = await menuWin.webContents.executeJavaScript(fs.readFileSync(argValue('smoke-menu-script'), 'utf-8'), true);
              console.log('[smoke-menu]', typeof r === 'string' ? r : JSON.stringify(r));
              await new Promise((res) => setTimeout(res, Number(argValue('smoke-settle') || 800)));
            }
            if (argValue('smoke-probe')) {
              const probe = await win.webContents.executeJavaScript(fs.readFileSync(argValue('smoke-probe'), 'utf-8'), true);
              console.log('[smoke-probe]', typeof probe === 'string' ? probe : JSON.stringify(probe));
            }
            if (result !== undefined) console.log('[smoke-script]', typeof result === 'string' ? result : JSON.stringify(result));
          }
          const img = await win.webContents.capturePage();
          fs.mkdirSync(path.dirname(shot), { recursive: true });
          fs.writeFileSync(shot, img.toPNG());
          console.log(`[smoke] wrote ${shot}`);
          // A menu left open by the scenario lives in its own window: captured next to the shot and reported.
          if (menuWin && !menuWin.isDestroyed() && menuWin.isVisible()) {
            const mshot = shot.replace(/\.png$/, '-menu.png');
            fs.writeFileSync(mshot, (await menuWin.webContents.capturePage()).toPNG());
            const mb = menuWin.getBounds();
            const items = await menuWin.webContents.executeJavaScript('document.querySelectorAll(".ctx-item").length', true);
            console.log(`[smoke] menu popup ${JSON.stringify(mb)} items=${items} → ${mshot}`);
          }
          // Tool windows the scenario opened are captured next to it (<shot>-<kind>.png) and reported.
          let n = 0;
          for (const w of Array.from(toolWins)) {
            if (w.isDestroyed()) continue;
            const file = shot.replace(/\.png$/i, '') + `-${w.ccKind}${n++ ? n : ''}.png`;
            fs.writeFileSync(file, (await w.webContents.capturePage()).toPNG());
            console.log(`[smoke] tool window ${w.ccKind} "${w.getTitle()}" ${JSON.stringify(w.getBounds())} → ${file}`);
          }
        } catch (err) {
          console.error('[smoke] capture failed:', err);
        }
        // --smoke-quit=close ends the run by closing the main window instead of quitting outright, which
        // exercises the real chain: the tool windows and the hidden menu popup must go with it, otherwise
        // window-all-closed never fires and the app would hang here.
        if (argValue('smoke-quit') === 'close') {
          const others = BrowserWindow.getAllWindows().filter((w) => w !== win && !w.isDestroyed()).length;
          app.once('window-all-closed', () => console.log(`[smoke] the main window took ${others} other window(s) with it`));
          const fail = setTimeout(() => {
            const left = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
            console.error(`[smoke] FAILED: ${left.length} window(s) outlived the main window`);
            app.exit(1);
          }, 5000);
          app.once('window-all-closed', () => clearTimeout(fail));
          win.close();
          return;
        }
        app.quit();
      }, Number(argValue('smoke-delay') || 2500));
    });
  }
  return win;
}

function buildMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  // macOS needs an application menu for Cmd+Q / Cmd+C / Cmd+V to work.
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'togglefullscreen' }, { role: 'toggleDevTools' }] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }] },
  ]));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWin) return;
    if (mainWin.isMinimized()) mainWin.restore();
    mainWin.focus();
  });

  app.whenReady().then(() => {
    api = createApi({
      name: 'electron',
      version: app.getVersion(),
      buildInfo: readBuildInfo(),
      configDir: app.getPath('userData'),
      // shell.openPath fails ("Failed to open path") for associations that
      // point at Store apps — Notepad on Windows 11, for one — so the shell
      // verb is tried through PowerShell / open / xdg-open as a fallback.
      openPath: async (p) => { const r = await shell.openPath(p); return r ? fsops.openWithDefaultApp(p) : ''; },
      trashPath: (p) => shell.trashItem(p),
      // Files the app cannot print itself (PDF, Office documents …) go through the OS (see fsops).
      printPath: (p) => fsops.printWithDefaultApp(p),
      clipboard: { readText: () => clipboard.readText(), writeText: (t) => clipboard.writeText(t), writeImage: (dataUrl) => clipboard.writeImage(nativeImage.createFromDataURL(dataUrl)) },
    });
    if (process.platform === 'darwin' && fs.existsSync(path.join(__dirname, '..', 'build', 'icons', 'icon.png'))) {
      app.dock.setIcon(nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icons', 'icon.png')));
    }
    buildMenu();
    registerIpc(api, () => mainWin, {
      // Native folder picker (settings › terminal › start directory); the web version types the path.
      openFolder: async ({ defaultPath } = {}, owner) => {
        const r = await dialog.showOpenDialog(owner || mainWin, { defaultPath: defaultPath || undefined, properties: ['openDirectory'] });
        return r.canceled ? null : r.filePaths[0];
      },
      // Save-as picker (image save / convert). Returns the chosen path or null.
      saveFile: async ({ defaultPath, filters } = {}, owner) => {
        const r = await dialog.showSaveDialog(owner || mainWin, { defaultPath: defaultPath || undefined, filters: filters || undefined });
        return r.canceled ? null : r.filePath;
      },
      // Program picker (settings › file open › text editor application).
      openFile: async ({ defaultPath, filters } = {}, owner) => {
        const r = await dialog.showOpenDialog(owner || mainWin, { defaultPath: defaultPath || undefined, properties: ['openFile'], filters: filters || undefined });
        return r.canceled ? null : r.filePaths[0];
      },
    }, { openToolWindow, toolWins: () => toolWins, showMenuPopup, placeMenuPopup, menuPopupPick, hideMenuPopup, printHtml, printPreview, printers });
    createWindow();
    // The menu popup is kept alive and hidden, so opening a menu never waits for a page to load.
    if (!argValue('smoke-url')) mainWin.once('ready-to-show', () => { try { menuPopupWindow(); } catch { /* menus fall back to drawing in the window */ } });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (api) api.jobs.cancelAll();
    app.quit();
  });
  // Every way out (closing the window, Cmd+Q, the smoke test) kills the dock's shells.
  app.on('will-quit', () => { if (api) api.shutdown(); });
}
