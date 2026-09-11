import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

const isDev = !app.isPackaged;
// Explicit IPv4 — see the note in vite.config.ts. "localhost" is ambiguous
// between 127.0.0.1 and ::1, and Node and Chromium do not always pick the same.
const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5174';

let mainWindow: BrowserWindow | null = null;
let startupFile: string | null = null;
let isDirty = false;
let allowClose = false;

/** %AppData%/DBTools on Windows, ~/.config/DBTools on Linux, Application Support on macOS. */
function userDataFile(name: string): string {
  return path.join(app.getPath('userData'), name);
}

function templateDirectory(): string {
  return isDev
    ? path.join(app.getAppPath(), 'template')
    : path.join(process.resourcesPath, 'template');
}

/**
 * Title-bar / taskbar icon. Windows wants the .ico; Linux and macOS take the
 * PNG. Packaged builds get the icon from electron-builder, but in development
 * the window would otherwise show Electron's default logo.
 */
function resolveWindowIcon(): string | undefined {
  const names = process.platform === 'win32' ? ['icon.ico', 'icon.png'] : ['icon.png', 'icon.ico'];
  for (const name of names) {
    const candidate = path.join(app.getAppPath(), 'build', name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Electron hands window.open features through as a raw string
 * ("width=520,height=700,left=..."); turn the geometry back into window options.
 */
function parseWindowFeatures(features: string): Electron.BrowserWindowConstructorOptions {
  const parsed = new Map<string, string>();
  for (const part of features.split(',')) {
    const [key, value] = part.split('=');
    if (key && value !== undefined) parsed.set(key.trim().toLowerCase(), value.trim());
  }
  const num = (key: string) => {
    const value = Number(parsed.get(key));
    return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
  };
  return {
    width: num('width'),
    height: num('height'),
    x: num('left'),
    y: num('top'),
  };
}

/** A project/database path passed on the command line or via file association. */
function findStartupFile(argv: string[]): string | null {
  const candidates = argv.slice(isDev ? 2 : 1);
  for (const arg of candidates) {
    if (arg.startsWith('-')) continue;
    if (!/\.(mdprj|json|db|sqlite|sqlite3|db3|sql|faiss|findex|hnsw|index)$/i.test(arg)) continue;
    const resolved = path.resolve(arg);
    if (fs.existsSync(resolved)) return resolved;
  }
  return null;
}

/**
 * The report font picker reads the installed fonts through Chromium's Local
 * Font Access API, which is permission-gated. This is our own local page asking
 * for a font list, so it is granted; everything else a page might ask for is
 * refused rather than left to Chromium's default.
 */
/**
 * Shown before the renderer has mounted and set its own title. Kept in step
 * with `src/appInfo.ts` by a test — this file cannot import from `src/`,
 * because the Electron build compiles `electron/` on its own.
 */
const APP_TITLE = 'DBTools v1.0';

function applyPermissionPolicy(): void {
  // Compared as a plain string: Electron's typed permission union does not
  // list 'local-fonts', but Chromium still asks for it under that name.
  const allowed = (permission: string) => permission === 'local-fonts';
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(allowed(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_contents, permission) =>
    allowed(permission),
  );
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#f0f2f5',
    title: APP_TITLE,
    icon: resolveWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // A failed load otherwise leaves an empty white window with no explanation.
  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return; // -3 is an aborted navigation
    console.error(`[dbtools] failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
    if (!mainWindow) return;
    mainWindow.show();
    void showMessage(
      mainWindow,
      '화면을 불러오지 못했습니다.',
      `<p><code>${validatedURL}</code></p>` +
        `<p>${errorDescription} (${errorCode})</p>` +
        `<p>개발 서버가 실행 중인지 확인하세요. <code>npm start</code>는 Vite 개발 서버와 ` +
        `Electron을 함께 실행합니다.</p>`,
    );
  });

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[dbtools] renderer process gone:', details.reason);
  });

  mainWindow.on('close', (event) => {
    if (allowClose || !isDirty) return;
    event.preventDefault();
    mainWindow?.webContents.send('app:close-requested');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url, features }) => {
    // The renderer opens each dialog with window.open('', '', features), which
    // arrives here as about:blank. Let those through as real child windows so a
    // dialog gets its own title bar, icon and taskbar entry.
    if (url === 'about:blank' || url === '') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          ...parseWindowFeatures(features),
          parent: mainWindow ?? undefined,
          modal: false,
          minimizable: false,
          maximizable: true,
          resizable: true,
          autoHideMenuBar: true,
          icon: resolveWindowIcon(),
          backgroundColor: '#ffffff',
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false },
        },
      };
    }
    // Anything with a real URL is an external link — hand it to the OS browser.
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  void loadRenderer(mainWindow);
}

/** Render a message in the window instead of leaving the user a blank frame. */
function showMessage(window: BrowserWindow, title: string, body: string): Promise<void> {
  const html = `<!doctype html><meta charset="utf-8">
    <style>
      body { font-family: "Malgun Gothic", "맑은 고딕", system-ui, sans-serif;
             padding: 40px; line-height: 1.7; color: #111827; }
      h2 { margin: 0 0 12px; }
      code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
    </style>
    <h2>${title}</h2>${body}`;
  return window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

/**
 * In development load the Vite dev server so a running `npm start` always shows
 * the latest code. Fall back to the built files only when the dev server is not
 * up, which keeps a plain `electron .` against `dist/` working.
 */
async function loadRenderer(window: BrowserWindow): Promise<void> {
  if (isDev) {
    if (await isDevServerUp()) {
      console.log(`[dbtools] loading dev server ${DEV_URL}`);
      await window.loadURL(DEV_URL);
      return;
    }
    console.warn(`[dbtools] dev server ${DEV_URL} is not reachable`);
  }

  const indexFile = path.join(app.getAppPath(), 'dist', 'index.html');
  if (fs.existsSync(indexFile)) {
    if (isDev) {
      // Say so loudly: this build may be older than the working tree.
      console.warn('[dbtools] falling back to the built dist/ — it may be stale');
    }
    await window.loadFile(indexFile);
    return;
  }

  await showMessage(
    window,
    '빌드 결과가 없습니다.',
    `<p><code>npm start</code>로 개발 서버와 함께 실행하거나, ` +
      `<code>npm run build</code>를 먼저 실행하세요.</p>` +
      `<p>개발 서버 주소: <code>${DEV_URL}</code></p>`,
  );
}

/** True when the dev server answers on the exact address Chromium will load. */
async function isDevServerUp(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(DEV_URL, { signal: controller.signal });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

// ─── File dialogs and I/O ────────────────────────────────────────────────────

ipcMain.handle('file:open', async (_e, filters: Electron.FileFilter[]) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters,
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const buffer = await fsp.readFile(filePath);
  return {
    path: filePath,
    name: path.basename(filePath),
    bytes: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  };
});

ipcMain.handle('file:read', async (_e, filePath: string) => {
  try {
    const buffer = await fsp.readFile(filePath);
    return {
      path: filePath,
      name: path.basename(filePath),
      bytes: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    };
  } catch {
    return null;
  }
});

ipcMain.handle(
  'file:save',
  async (_e, suggestedName: string, filters: Electron.FileFilter[], data: ArrayBuffer) => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: suggestedName,
      filters,
    });
    if (result.canceled || !result.filePath) return null;
    await fsp.writeFile(result.filePath, Buffer.from(data));
    return result.filePath;
  },
);

ipcMain.handle('file:write', async (_e, filePath: string, data: ArrayBuffer) => {
  await fsp.writeFile(filePath, Buffer.from(data));
  return filePath;
});

ipcMain.handle('dir:choose', async (_e, defaultPath?: string) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    defaultPath,
  });
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
});

ipcMain.handle(
  'dir:writeFiles',
  async (_e, directory: string, files: { name: string; data: ArrayBuffer }[]) => {
    await fsp.mkdir(directory, { recursive: true });
    for (const file of files) {
      await fsp.writeFile(path.join(directory, file.name), Buffer.from(file.data));
    }
    return files.length;
  },
);

ipcMain.handle('app:templateDir', () => templateDirectory());
ipcMain.handle('app:startupFile', () => startupFile);

// ─── Settings and recent files ───────────────────────────────────────────────

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(file: string, value: unknown): Promise<void> {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(value, null, 2), 'utf8');
}

ipcMain.handle('settings:read', () => readJsonFile(userDataFile('settings.json'), null));
ipcMain.handle('settings:write', (_e, settings: unknown) =>
  writeJsonFile(userDataFile('settings.json'), settings),
);
ipcMain.handle('recent:read', () => readJsonFile<string[]>(userDataFile('recent.json'), []));
ipcMain.handle('recent:write', (_e, files: string[]) =>
  writeJsonFile(userDataFile('recent.json'), files),
);

// ─── Window chrome ───────────────────────────────────────────────────────────

ipcMain.on('app:setMinimumWidth', (_e, contentWidth: number) => {
  if (!mainWindow || !Number.isFinite(contentWidth)) return;
  // The renderer measures its content area; setMinimumSize wants the outer
  // window size, so add the frame that sits around it.
  const [outerW] = mainWindow.getSize();
  const [innerW] = mainWindow.getContentSize();
  const frame = Math.max(0, outerW - innerW);
  const minWidth = Math.round(contentWidth) + frame;
  const [, currentMinHeight] = mainWindow.getMinimumSize();
  mainWindow.setMinimumSize(minWidth, currentMinHeight);
  // Widen the window if it is already narrower than the new minimum.
  if (outerW < minWidth) mainWindow.setSize(minWidth, mainWindow.getSize()[1]);
});

ipcMain.on('app:setTitle', (_e, title: string) => mainWindow?.setTitle(title));

// The corner resize grip. Driven from the window the event came from, so it
// works for the dialog windows as well as the main one. The size is absolute —
// the renderer works it out from where the drag started, which is the only way
// to keep a drag-resize from feeding back on its own movement.
ipcMain.on('app:resizeTo', (event, width: number, height: number) => {
  const target = BrowserWindow.fromWebContents(event.sender);
  if (!target || target.isFullScreen()) return;
  // A maximized window has to come back to a normal state before it can take a
  // size, otherwise the call is silently ignored.
  if (target.isMaximized()) target.unmaximize();
  const [minWidth, minHeight] = target.getMinimumSize();
  const { x, y } = target.getBounds();
  target.setBounds({
    x,
    y,
    width: Math.max(minWidth || 320, Math.round(width)),
    height: Math.max(minHeight || 200, Math.round(height)),
  });
});
ipcMain.on('app:setDirty', (_e, dirty: boolean) => {
  isDirty = dirty;
  mainWindow?.setDocumentEdited?.(dirty);
});
ipcMain.on('app:confirmClose', () => {
  allowClose = true;
  mainWindow?.close();
});

// ─── PDF via Chromium's own renderer (keeps Korean text intact) ──────────────

interface PdfPrintOptions {
  headerTemplate?: string;
  footerTemplate?: string;
}

ipcMain.handle(
  'export:pdf',
  async (_e, html: string, suggestedName: string, options?: PdfPrintOptions) => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: suggestedName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return null;

    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: true, javascript: false },
    });
    try {
      await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      // Chromium draws the header and footer inside the page margins, so the
      // top and bottom margins have to grow to make room — otherwise it renders
      // them over the content, or drops them silently.
      const running = Boolean(options?.headerTemplate || options?.footerTemplate);
      const pdf = await printWindow.webContents.printToPDF({
        printBackground: true,
        margins: running
          ? { top: 0.7, bottom: 0.7, left: 0.5, right: 0.5 }
          : { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
        pageSize: 'A4',
        displayHeaderFooter: running,
        ...(running
          ? {
              headerTemplate: options?.headerTemplate ?? '<span></span>',
              footerTemplate: options?.footerTemplate ?? '<span></span>',
            }
          : {}),
      });
      await fsp.writeFile(result.filePath, pdf);
      return result.filePath;
    } finally {
      printWindow.destroy();
    }
  },
);

// ─── Lifecycle ───────────────────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const file = findStartupFile(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (file) mainWindow.webContents.send('app:open-file', file);
    }
  });

  // macOS file association
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (mainWindow) mainWindow.webContents.send('app:open-file', filePath);
    else startupFile = filePath;
  });

  void app.whenReady().then(() => {
    applyPermissionPolicy();
    startupFile = findStartupFile(process.argv);
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
