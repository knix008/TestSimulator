import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

// The renderer and the main process only ever meet over the preload bridge, and
// nothing type-checks that meeting. These tests read both files and make sure
// every call the renderer can make is answered, and that nothing dangerous is
// exposed on the way.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf-8');

const preload = read('electron/preload.js');
const main = read('electron/main.js');
const childWindows = read('electron/childwindows.js');
const platform = read('src/lib/platform.js');

const channelsIn = (source, pattern) => [...source.matchAll(pattern)].map((m) => m[1]);

describe('the preload bridge', () => {
  const invoked = new Set(channelsIn(preload, /ipcRenderer\.invoke\('([^']+)'/g));
  const handled = new Set([
    ...channelsIn(main, /ipcMain\.handle\('([^']+)'/g),
    ...channelsIn(childWindows, /ipcMain\.handle\('([^']+)'/g),
  ]);

  it('exposes calls that the main process actually answers', () => {
    const unanswered = [...invoked].filter((channel) => !handled.has(channel));
    expect(unanswered).toEqual([]);
  });

  it('answers nothing the renderer cannot reach', () => {
    const subscribed = new Set(channelsIn(preload, /subscribe\('([^']+)'/g));
    const unreachable = [...handled].filter((channel) => !invoked.has(channel) && !subscribed.has(channel));
    expect(unreachable).toEqual([]);
  });

  it('keeps Node out of the renderer', () => {
    expect(preload).toContain('contextBridge.exposeInMainWorld');
    expect(preload).not.toMatch(/exposeInMainWorld\('[^']*',\s*require/);
    expect(preload).not.toContain('nodeIntegration');
    expect(main).toContain('contextIsolation: true');
    expect(main).toContain('nodeIntegration: false');
    expect(main).toContain('webSecurity: true');
  });

  it('gives the popup windows the same narrow bridge', () => {
    expect(childWindows).toContain("preload: preloadPath()");
    expect(childWindows).toContain('contextIsolation: true');
    expect(childWindows).toContain('nodeIntegration: false');
  });

  it('covers everything the renderer calls through the platform layer', () => {
    const used = new Set([...platform.matchAll(/\bapi\.(?:win|menu|dialog)?\.?(\w+)\(/g)].map((m) => m[1]));
    for (const name of ['readBinary', 'openBookDialog', 'saveText', 'download', 'printHtml', 'writeClipboardText']) {
      expect(used.has(name) || platform.includes(`api.${name}`), name).toBe(true);
      expect(preload, name).toContain(`${name}:`);
    }
  });
});

describe('the main window', () => {
  it('is frameless, with the in-app title bar providing the controls', () => {
    expect(main).toContain('frame: false');
    expect(main).toContain("ipcMain.handle('win:minimize'");
    expect(main).toContain("ipcMain.handle('win:toggleMaximize'");
    expect(main).toContain("ipcMain.handle('win:close'");
  });

  it('does not make the window transparent', () => {
    // Window transparency was asked for and then withdrawn; nothing about it
    // should be left behind on either side of the bridge.
    expect(main).not.toContain('setOpacity');
    expect(preload).not.toContain('setOpacity');
  });

  it('never gets narrower than its toolbar needs', () => {
    expect(main).toContain("ipcMain.handle('win:setMinWidth'");
    expect(main).toMatch(/MIN_WINDOW_WIDTH = \d+/);
  });

  it('asks the renderer before closing, so unsaved marks can be saved', () => {
    expect(main).toContain("win.webContents.send('win:close-request')");
    expect(main).toContain("ipcMain.handle('win:forceClose'");
  });

  it('tears every popup window down when the app quits', () => {
    expect(main).toContain('child.closeAllChildWindows()');
    expect(main).toContain("app.on('before-quit'");
  });

  it('serves the built renderer over its own app:// origin', () => {
    expect(main).toContain("protocol.registerSchemesAsPrivileged");
    expect(main).toContain("APP_ORIGIN = 'app://bundle'");
    expect(main).toContain("return new Response('Forbidden', { status: 403 })");
  });

  it('opens only web links outside the app', () => {
    expect(main).toContain("if (!/^(https?|mailto):/i.test(url)) throw new Error");
  });

  it('hands files from the shell to the renderer', () => {
    expect(main).toContain("app.on('open-file'");
    expect(main).toContain("app.on('second-instance'");
    expect(main).toContain('OPENABLE_EXTENSIONS');
  });
});

describe('the popup windows', () => {
  it('sizes every dialog, and fixes the ones with tabs or a preview', () => {
    const specs = childWindows.slice(childWindows.indexOf('const DIALOG_SPECS'), childWindows.indexOf('const DEFAULT_SPEC'));
    for (const name of ['settings', 'about', 'error', 'unsaved', 'progress', 'print', 'properties', 'prompt', 'note', 'shortcuts']) {
      expect(specs, name).toContain(`${name}: {`);
    }
    expect(specs).toMatch(/settings:.*fixed: true/);
    expect(specs).toMatch(/print:.*fixed: true/);
  });

  it('makes no popup resizable', () => {
    expect(childWindows).toContain('win.setResizable(false)');
    expect(childWindows).toContain('win.setMaximizable(false)');
  });

  it('owns the dialogs with the main window so they close with it', () => {
    expect(childWindows).toContain('win.setParentWindow(parent)');
    expect(childWindows).toContain('function closeAllChildWindows');
  });

  it('keeps the menu window out of its parent so a menu can overhang the app', () => {
    expect(childWindows).toContain('alwaysOnTop: true');
    expect(childWindows).toMatch(/Deliberately not a child window/);
  });

  it('lets a menu size itself to its rows and stay on the display', () => {
    expect(childWindows).toContain('function sizeMenuWindow');
    expect(childWindows).toContain('screen.getDisplayNearestPoint');
  });

  it('pools popup windows rather than building one per click', () => {
    expect(childWindows).toContain('spareDialogs');
    expect(childWindows).toContain('function warmDialogPool');
    expect(childWindows).toContain('function recycleDialogWindow');
  });
});

describe('the renderer routes', () => {
  it('runs the reader, a menu or a dialog from the same bundle', () => {
    const entry = read('src/main.jsx');
    expect(entry).toContain("params.get('popup')");
    expect(entry).toContain('MenuHost');
    expect(entry).toContain('DialogHost');
  });

  it('opens popups on the route the main process loads', () => {
    expect(childWindows).toContain('?popup=${route}');
    expect(childWindows).toContain("load(win, 'menu')");
    expect(childWindows).toContain("load(win, 'dialog')");
  });
});
