import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const mainSrc = fs.readFileSync(path.join(root, 'electron', 'main.js'), 'utf8');
const preloadSrc = fs.readFileSync(path.join(root, 'electron', 'preload.js'), 'utf8');

function matches(src, re) {
  return [...src.matchAll(re)].map((m) => m[1]);
}

describe('preload ↔ main IPC contract', () => {
  const handles = new Set(matches(mainSrc, /ipcMain\.handle\('([^']+)'/g));
  const invokes = matches(preloadSrc, /ipcRenderer\.invoke\('([^']+)'/g);
  const listeners = matches(preloadSrc, /ipcRenderer\.on\('([^']+)'/g);

  it('exposes every invoke channel from main', () => {
    const missing = invokes.filter((ch) => !handles.has(ch));
    expect(missing).toEqual([]);
  });

  it('covers the file / dialog / clipboard / print / window surface', () => {
    const required = [
      'app:getInfo', 'app:takePendingOpen',
      'fs:home', 'fs:exists', 'fs:stat', 'fs:readBinary', 'fs:readText', 'fs:writeText', 'fs:writeBinary',
      'dialog:openPdf', 'dialog:pickDirectory', 'dialog:saveText', 'dialog:saveBinary', 'dialog:pickSavePath',
      'net:download', 'print:pages',
      'clipboard:writeText', 'clipboard:writeImage',
      'shell:openExternal', 'shell:showItem',
      'settings:load', 'settings:save',
      'win:minimize', 'win:toggleMaximize', 'win:close', 'win:forceClose', 'win:isMaximized',
      'win:setTitle', 'win:getSize', 'win:setSize', 'win:setMinWidth',
      'win:getContentBounds', 'win:openThemePopup', 'win:setPopupSize', 'win:pickTheme',
    ];
    for (const ch of required) expect(handles.has(ch), ch).toBe(true);
  });

  it('listens for open-path and progress events', () => {
    expect(listeners).toEqual(expect.arrayContaining(['app:openPath', 'task:progress', 'win:close-request', 'theme:picked']));
    expect(mainSrc).toContain("win.webContents.send('app:openPath'");
    expect(mainSrc).toContain("win.webContents.send('win:close-request'");
    expect(mainSrc).toContain("sender.send('task:progress'");
    expect(mainSrc).toContain("mainWin.webContents.send('theme:picked'");
  });

  it('does not put Node or ipcRenderer on the renderer global except through contextBridge', () => {
    expect(preloadSrc).toContain("contextBridge.exposeInMainWorld('electronAPI'");
    expect(preloadSrc).toContain('isElectron: true');
    expect(preloadSrc).not.toMatch(/exposeInMainWorld\('require'/);
  });
});

describe('packaged app protocol', () => {
  it('registers the app:// scheme so pdf.js workers can fetch', () => {
    expect(mainSrc).toMatch(/protocol\.registerSchemesAsPrivileged/);
    expect(mainSrc).toMatch(/scheme:\s*'app'/);
    expect(mainSrc).toMatch(/standard:\s*true/);
    expect(mainSrc).toMatch(/secure:\s*true/);
    expect(mainSrc).toMatch(/supportFetchAPI:\s*true/);
    expect(mainSrc).toMatch(/app:\/\/bundle/);
  });
});
