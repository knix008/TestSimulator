// The desktop bridge (src/lib/desktop-bridge.js) ↔ Tauri host
// (src-tauri/src/lib.rs) contract, the Tauri config and the installer hooks.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  createDesktopApi, installDesktopBridge, hasTauri, parseFramedDownload,
} from '../src/lib/desktop-bridge.js';

const root = path.resolve(import.meta.dirname, '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const hostSrc = read('src-tauri', 'src', 'lib.rs');
const bridgeSrc = read('src', 'lib', 'desktop-bridge.js');
const conf = JSON.parse(read('src-tauri', 'tauri.conf.json'));
const capability = JSON.parse(read('src-tauri', 'capabilities', 'default.json'));
const hooks = fs.readFileSync(path.join(root, 'src-tauri', 'windows', 'hooks.nsh'));

const matches = (src, re) => [...src.matchAll(re)].map((m) => m[1]);

describe('bridge ↔ host commands', () => {
  const handlerBlock = hostSrc.slice(hostSrc.indexOf('generate_handler!['), hostSrc.indexOf('])', hostSrc.indexOf('generate_handler![')));
  const registered = new Set(matches(handlerBlock, /^\s*([a-z_]+),?\s*$/gm));
  const defined = new Set(matches(hostSrc, /#\[tauri::command\]\s*(?:pub\s+)?(?:async\s+)?fn\s+([a-z_]+)/g));
  const called = new Set(matches(bridgeSrc, /call\('([a-z_]+)'/g));

  it('registers every command it defines', () => {
    expect([...defined].filter((c) => !registered.has(c))).toEqual([]);
    expect([...registered].filter((c) => !defined.has(c))).toEqual([]);
  });

  it('defines every command the bridge calls, and none it never calls', () => {
    expect([...called].filter((c) => !registered.has(c))).toEqual([]);
    expect([...registered].filter((c) => !called.has(c))).toEqual([]);
  });

  it('emits every event the bridge listens for', () => {
    const listened = new Set(matches(bridgeSrc, /(?:on|channel)\('([a-z-]+)'/g));
    const emitted = new Set(matches(hostSrc, /emit(?:_to)?\((?:MAIN, )?"([a-z-]+)"/g));
    expect([...listened].sort()).toEqual(
      ['close-request', 'file-drop', 'maximized', 'open-path', 'task-progress', 'theme-picked'],
    );
    expect([...listened].filter((e) => !emitted.has(e))).toEqual([]);
  });

  it('covers the file / dialog / clipboard / print / window surface the app uses', () => {
    const api = createDesktopApi({ call: vi.fn(), listen: vi.fn() });
    for (const key of [
      'getInfo', 'takePendingOpen', 'onOpenPath', 'home', 'exists', 'stat', 'readDir', 'listDrives',
      'readBinary', 'readText', 'writeText', 'openPdfDialog', 'pickDirectory', 'saveText', 'saveBinary',
      'pickSavePath', 'writeBinary', 'download', 'printPages', 'writeClipboardText', 'writeClipboardImage',
      'openExternal', 'showItem', 'listFonts', 'loadSettings', 'saveSettings', 'onProgress', 'onFileDrop', 'ready',
    ]) expect(typeof api[key], key).toBe('function');
    for (const key of [
      'minimize', 'toggleMaximize', 'close', 'forceClose', 'onCloseRequest', 'isMaximized', 'setTitle',
      'setMinWidth', 'getSize', 'setSize', 'onMaximizeChange', 'getContentBounds', 'openThemePopup',
      'closeThemePopup', 'setPopupSize', 'pickTheme', 'onThemePicked',
    ]) expect(typeof api.win[key], `win.${key}`).toBe('function');
    expect(api.isDesktop).toBe(true);
  });
});

describe('bridge behaviour against a fake host', () => {
  it('reads a file as raw bytes plus its stat', async () => {
    const call = vi.fn(async (cmd) => {
      if (cmd === 'fs_read_binary') return new Uint8Array([37, 80, 68, 70]).buffer;
      if (cmd === 'fs_stat') return { size: 4, mtime: 42, dir: 'C:\\d', name: 'a.pdf' };
      return null;
    });
    const api = createDesktopApi({ call, listen: vi.fn() });
    const out = await api.readBinary({ filePath: 'C:\\d\\a.pdf', id: 't1' });
    expect(Array.from(out.data)).toEqual([37, 80, 68, 70]);
    expect(out).toMatchObject({ name: 'a.pdf', dir: 'C:\\d', path: 'C:\\d\\a.pdf', size: 4, mtime: 42 });
    expect(call).toHaveBeenCalledWith('fs_read_binary', { path: 'C:\\d\\a.pdf', id: 't1' });
  });

  it('writes bytes as the raw body with the path in a header', async () => {
    const call = vi.fn(async () => 'ok');
    const api = createDesktopApi({ call, listen: vi.fn() });
    await api.writeBinary({ filePath: 'C:\\문서\\a b.pdf', data: [1, 2, 3], id: 't9' });
    const [cmd, body, opts] = call.mock.calls[0];
    expect(cmd).toBe('fs_write_binary');
    expect(body).toBeInstanceOf(Uint8Array);
    expect(Array.from(body)).toEqual([1, 2, 3]);
    expect(decodeURIComponent(opts.headers['x-path'])).toBe('C:\\문서\\a b.pdf');
    expect(opts.headers['x-id']).toBe('t9');
  });

  it('saves through the dialog, and not at all when it is cancelled', async () => {
    const call = vi.fn(async (cmd) => (cmd === 'dialog_save_path' ? null : 'x'));
    const api = createDesktopApi({ call, listen: vi.fn() });
    expect(await api.saveBinary({ defaultName: 'a.pdf', data: new Uint8Array(1) })).toBeNull();
    expect(call.mock.calls.map((c) => c[0])).toEqual(['dialog_save_path']);

    const call2 = vi.fn(async (cmd) => (cmd === 'dialog_save_path' ? '/tmp/a.pdf' : 'x'));
    const api2 = createDesktopApi({ call: call2, listen: vi.fn() });
    expect(await api2.saveBinary({ defaultName: 'a.pdf', data: new Uint8Array(1) })).toBe('/tmp/a.pdf');
    expect(call2.mock.calls.map((c) => c[0])).toEqual(['dialog_save_path', 'fs_write_binary']);
  });

  it('parses the framed download reply', () => {
    const head = new TextEncoder().encode(JSON.stringify({ name: '보고.pdf', url: 'https://x/y' }));
    const buf = new Uint8Array(4 + head.length + 3);
    new DataView(buf.buffer).setUint32(0, head.length, true);
    buf.set(head, 4);
    buf.set([7, 8, 9], 4 + head.length);
    const out = parseFramedDownload(buf.buffer);
    expect(out).toMatchObject({ name: '보고.pdf', url: 'https://x/y', size: 3 });
    expect(Array.from(out.data)).toEqual([7, 8, 9]);
  });

  it('keeps a file handed over before the app subscribes', async () => {
    const handlers = {};
    const listen = vi.fn(async (event, fn) => { handlers[event] = fn; });
    const api = createDesktopApi({ call: vi.fn(), listen });
    handlers['open-path']('C:\\early.pdf');
    const got = [];
    api.onOpenPath((p) => got.push(p));
    await Promise.resolve();
    handlers['open-path']('C:\\later.pdf');
    expect(got).toEqual(['C:\\early.pdf', 'C:\\later.pdf']);
  });

  it('fans one host event out to every subscriber and lets them leave', () => {
    const handlers = {};
    const api = createDesktopApi({ call: vi.fn(), listen: (e, fn) => { handlers[e] = fn; } });
    const a = vi.fn();
    const b = vi.fn();
    const offA = api.win.onMaximizeChange(a);
    api.win.onMaximizeChange(b);
    handlers.maximized(true);
    offA();
    handlers.maximized(false);
    expect(a.mock.calls).toEqual([[true]]);
    expect(b.mock.calls).toEqual([[true], [false]]);
  });

  it('shows the window only after its listeners are in place', async () => {
    const pending = [];
    const listen = vi.fn(() => new Promise((r) => { pending.push(r); }));
    const call = vi.fn(async () => true);
    const api = createDesktopApi({ call, listen });
    const ready = api.ready();
    await Promise.resolve();
    expect(pending.length).toBeGreaterThan(0);
    expect(call).not.toHaveBeenCalled();
    for (const r of pending) r();
    await ready;
    expect(call).toHaveBeenCalledWith('window_ready');
  });

  it('is not installed in a plain browser', () => {
    expect(hasTauri({})).toBe(false);
    expect(installDesktopBridge({})).toBeUndefined();
    expect(window.desktopAPI).toBeUndefined();
  });
});

describe('Tauri configuration', () => {
  it('names the product, the identifier and the dev server', () => {
    expect(conf.productName).toBe('MyPDFViewer');
    expect(conf.mainBinaryName).toBe('MyPDFViewer');
    expect(conf.identifier).toBe('com.shkwon.mypdfviewer');
    expect(conf.build.devUrl).toBe('http://localhost:5179');
    expect(read('vite.config.mjs')).toMatch(/port:\s*5179/);
    expect(conf.build.frontendDist).toBe('../dist');
  });

  it('builds the main window in code, hidden until the page is ready', () => {
    expect(conf.app.windows).toEqual([]);
    expect(hostSrc).toMatch(/WebviewWindowBuilder::new\(app, MAIN/);
    expect(hostSrc).toMatch(/\.decorations\(false\)/);
    expect(hostSrc).toMatch(/\.visible\(false\)/);
    expect(hostSrc).toMatch(/tauri_plugin_single_instance::init/);
  });

  it('grants the two windows nothing but event listening', () => {
    expect(capability.windows).toEqual(['main', 'theme-popup']);
    expect(capability.permissions).toEqual(['core:event:default']);
    expect(hostSrc).toContain('const THEME_POPUP: &str = "theme-popup";');
  });

  it('uses an installer hooks file NSIS can read and that matches the config', () => {
    expect(conf.bundle.windows.nsis.installerHooks).toBe('windows/hooks.nsh');
    expect([...hooks.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = hooks.toString('utf8');
    expect(text).toContain(`!define MP_NAME "${conf.productName}"`);
    expect(text).toContain(`!define MP_IDENTIFIER "${conf.identifier}"`);
    expect(text).toContain(`!define MP_WS_PROGID "${conf.bundle.fileAssociations[0].name}"`);
    expect(text).toMatch(/!macro NSIS_HOOK_PREINSTALL[\s\S]*Call MP_RemoveElectron[\s\S]*Call MP_AskAboutData/);
    expect(text).toMatch(/MessageBox MB_YESNO\|MB_ICONQUESTION "\$1" \/SD IDNO/);
    expect(text).toContain('$INSTDIR\\file.ico,0');
    expect(conf.bundle.resources['icons/file.ico']).toBe('file.ico');
  });

  it('lets the installer run in Korean or English, asking every time', () => {
    const nsis = conf.bundle.windows.nsis;
    expect(nsis.displayLanguageSelector).toBe(true);
    expect(nsis.languages).toEqual(['Korean', 'English']);
    const text = hooks.toString('utf8');
    expect(text).toMatch(/^!define MUI_LANGDLL_ALWAYSSHOW$/m);
    expect(text).toMatch(/^!define MUI_LANGDLL_ALLLANGUAGES$/m);
    // Every Korean string on the custom page and in the data question has an English twin.
    expect((text.match(/\$\{If\} \$LANGUAGE == 1042/g) || []).length).toBe(2);
  });

  it('removes the Electron build by its electron-builder uninstall key', async () => {
    const crypto = await import('node:crypto');
    const ns = Buffer.from('50e065bc313411e69bab38c9862bdaf3', 'hex');
    const h = crypto.createHash('sha1').update(Buffer.concat([ns, Buffer.from(conf.identifier)])).digest();
    h[6] = (h[6] & 0x0f) | 0x50;
    h[8] = (h[8] & 0x3f) | 0x80;
    const x = h.subarray(0, 16).toString('hex');
    const guid = `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
    expect(hooks.toString('utf8')).toContain(`Uninstall\\${guid}"`);
  });
});
