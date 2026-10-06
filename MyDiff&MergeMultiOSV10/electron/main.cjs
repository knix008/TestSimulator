// ELECTRON_RUN_AS_NODE makes the Electron binary behave like plain Node: there is no
// `app`, no window, and the process just exits. Some machines have it set globally, so
// relaunch ourselves without it rather than dying with a confusing TypeError.
if (process.env.ELECTRON_RUN_AS_NODE) {
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  require("node:child_process")
    .spawn(process.execPath, process.argv.slice(1), { env: environment, detached: true, stdio: "ignore" })
    .unref();
  process.exit(0);
}

const { app, BrowserWindow, Menu, ipcMain, dialog, clipboard, screen, shell, nativeTheme } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const childWindows = require("./childwindows.cjs");
const { themeBackground } = require("./theme-bg.cjs");

const APP_ID = "com.shkwon.mydiffmerge";
const isSmoke = Boolean(process.env.MDM_SMOKE);
const isProd = app.isPackaged || process.env.MDM_MODE === "prod" || isSmoke;
const devUrl = process.env.MDM_UI || "http://127.0.0.1:5176";

if (process.platform === "win32") app.setAppUserModelId(APP_ID);
// The app draws its own menu bar (see MenuBar.tsx) so that every item can carry an
// icon and the popups can overhang the window; the native one would do neither.
Menu.setApplicationMenu(null);

let mainWindow = null;
let server = null;
/**
 * `git mergetool` reads the exit code: zero means the conflict was resolved. The
 * renderer reports a successful save, and anything else leaves the file unresolved.
 */
let mergeToolRun = false;
let mergeSaved = false;

/* ------------------------------------------------------------- settings */

function settingsFile() {
  const directory = process.env.MDM_SETTINGS_DIR
    || (process.platform === "win32"
      ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "MyDiffMerge")
      : process.platform === "darwin"
        ? path.join(os.homedir(), "Library", "Application Support", "MyDiffMerge")
        : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "MyDiffMerge"));
  return path.join(directory, "settings.json");
}

function savedSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
  } catch {
    return {};
  }
}

function resolveIcon() {
  const names = process.platform === "win32" ? ["icon.ico", "icon.png"] : ["icon.png", "icon.ico"];
  const roots = [
    process.resourcesPath,
    path.join(__dirname, "..", "build"),
    path.join(__dirname, "..", "public"),
    __dirname,
  ];
  for (const root of roots) {
    if (!root) continue;
    for (const name of names) {
      const candidate = path.join(root, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

/* -------------------------------------------------------------- windows */

/** Minimum width reported by the renderer once the toolbar has been measured. */
let toolbarMinWidth = 1080;

async function createMainWindow(url) {
  const settings = savedSettings();
  const bounds = settings.window || {};
  const win = new BrowserWindow({
    width: Math.max(Number(bounds.width) || 1360, toolbarMinWidth),
    height: Math.max(Number(bounds.height) || 860, 620),
    x: Number.isFinite(bounds.x) ? bounds.x : undefined,
    y: Number.isFinite(bounds.y) ? bounds.y : undefined,
    minWidth: toolbarMinWidth,
    minHeight: 620,
    title: "My Diff & Merge V1.0",
    icon: resolveIcon(),
    // No OS title bar: the menu row carries the icon, the name and the window
    // controls, which is one row of chrome instead of two.
    frame: false,
    backgroundColor: themeBackground(settings.theme),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  win.setMenuBarVisibility(false);
  if (bounds.maximized) win.maximize();
  win.once("ready-to-show", () => win.show());

  const reportState = () => {
    if (!win.isDestroyed()) win.webContents.send("window:state", { maximized: win.isMaximized() });
  };
  win.on("maximize", reportState);
  win.on("unmaximize", reportState);
  win.on("restore", reportState);

  // The title is owned by the renderer (it carries the open file's name), so Electron
  // must not overwrite it with whatever the page's <title> happens to be.
  win.on("page-title-updated", (event) => event.preventDefault());

  win.on("close", () => {
    rememberWindow(win);
    childWindows.closeAllChildWindows();
  });
  win.on("closed", () => {
    mainWindow = null;
  });

  await win.loadURL(url);
  return win;
}

function rememberWindow(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const settings = savedSettings();
    const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
    settings.window = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized: win.isMaximized(),
    };
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  } catch {
    /* a read-only profile just loses the window position */
  }
}

/* ------------------------------------------------------------------ ipc */

function registerHandlers() {
  childWindows.registerChildWindowHandlers();

  ipcMain.handle("app:info", () => ({
    platform: process.platform,
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      v8: process.versions.v8,
    },
    packaged: app.isPackaged,
    launcher: app.isPackaged ? process.execPath : process.execPath,
    iconPath: resolveIcon() || "",
  }));

  ipcMain.handle("window:title", (_event, title) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setTitle(String(title || "My Diff & Merge"));
    return true;
  });

  ipcMain.handle("window:min-size", (_event, width, height) => {
    if (!mainWindow || mainWindow.isDestroyed()) return toolbarMinWidth;
    // Clamped to the display: a minimum wider than the screen would leave the window
    // unresizable and partly off the desktop.
    const area = screen.getDisplayNearestPoint(mainWindow.getBounds()).workAreaSize;
    const requested = Math.max(640, Math.ceil(Number(width) || toolbarMinWidth));
    toolbarMinWidth = Math.min(requested, area.width);
    const minHeight = Math.min(Math.max(480, Math.ceil(Number(height) || 620)), area.height);

    mainWindow.setMinimumSize(toolbarMinWidth, minHeight);
    const [currentWidth, currentHeight] = mainWindow.getSize();
    if (currentWidth < toolbarMinWidth) mainWindow.setSize(toolbarMinWidth, currentHeight);
    return toolbarMinWidth;
  });

  ipcMain.handle("window:minimize", () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
    return true;
  });

  // The corner grip. The window's own minimum is the floor — the renderer works in
  // screen coordinates and would otherwise be able to drag the window below the
  // width its toolbar needs.
  ipcMain.handle("window:resize-to", (_event, width, height) => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMaximized()) return false;
    const [minWidth, minHeight] = mainWindow.getMinimumSize();
    mainWindow.setSize(
      Math.max(minWidth, Math.round(Number(width) || minWidth)),
      Math.max(minHeight, Math.round(Number(height) || minHeight)),
    );
    return true;
  });

  ipcMain.handle("window:maximize-toggle", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });

  ipcMain.handle("window:is-maximized", () =>
    Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized()));

  ipcMain.handle("window:background", (_event, color) => {
    if (mainWindow && !mainWindow.isDestroyed() && typeof color === "string") {
      mainWindow.setBackgroundColor(color);
    }
    childWindows.setDialogBackground(color);
    return true;
  });

  ipcMain.handle("theme:native", (_event, kind) => {
    nativeTheme.themeSource = kind === "dark" ? "dark" : kind === "light" ? "light" : "system";
    return nativeTheme.themeSource;
  });

  ipcMain.handle("settings:broadcast", (event, settings) => {
    const sender = BrowserWindow.fromWebContents(event.sender);
    childWindows.broadcastSettings(settings, sender ? sender.id : -1);
    return true;
  });

  ipcMain.handle("pick:file", async (event, options) => {
    const owner = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    const result = await dialog.showOpenDialog(owner, {
      title: options?.title || undefined,
      defaultPath: options?.defaultPath || undefined,
      filters: options?.filters || undefined,
      properties: options?.multiple ? ["openFile", "multiSelections"] : ["openFile"],
    });
    return result.canceled ? null : (options?.multiple ? result.filePaths : result.filePaths[0]);
  });

  ipcMain.handle("pick:directory", async (event, options) => {
    const owner = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    const result = await dialog.showOpenDialog(owner, {
      title: options?.title || undefined,
      defaultPath: options?.defaultPath || undefined,
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("pick:save", async (event, options) => {
    const owner = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    const result = await dialog.showSaveDialog(owner, {
      title: options?.title || undefined,
      defaultPath: options?.defaultPath || undefined,
      filters: options?.filters || undefined,
    });
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle("clipboard:write", (_event, value) => {
    clipboard.writeText(String(value ?? ""));
    return true;
  });

  ipcMain.handle("clipboard:read", () => clipboard.readText());

  ipcMain.handle("shell:open", (_event, target) => {
    const value = String(target ?? "");
    if (/^https?:\/\//i.test(value)) shell.openExternal(value);
    else if (value) shell.openPath(value);
    return true;
  });

  ipcMain.handle("shell:reveal", (_event, target) => {
    if (target) shell.showItemInFolder(String(target));
    return true;
  });

  /** The renderer reports a successful merge save, which decides the exit code. */
  ipcMain.handle("merge:saved", () => {
    mergeSaved = true;
    return true;
  });

  ipcMain.handle("app:quit", () => {
    childWindows.closeAllChildWindows();
    app.quit();
    return true;
  });

  /** Printing goes through the renderer's own print view; this just drives it. */
  ipcMain.handle("print:now", async (event, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { ok: false, reason: "no window" };
    return new Promise((resolve) => {
      win.webContents.print(
        {
          silent: false,
          printBackground: options?.printBackground !== false,
          landscape: options?.landscape === true,
          margins: { marginType: "none" },
        },
        (ok, reason) => resolve({ ok, reason: reason || "" }),
      );
    });
  });
}

/* ------------------------------------------------------------- lifecycle */

const singleInstance = isSmoke ? true : app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    mainWindow.webContents.send("app:open-request", commandLine(argv));
  });

  app.whenReady().then(start).catch((error) => {
    const text = String(error && error.stack ? error.stack : error);
    // Always to stderr: a modal error box in an automated run would hang the process
    // with nothing printed, which is the worst of both worlds.
    process.stderr.write(`My Diff & Merge failed to start
${text}
`);
    if (!isSmoke) dialog.showErrorBox("My Diff & Merge", text);
    app.exit(1);
  });
}

function commandLine(argv) {
  const skip = app.isPackaged ? 1 : 2;
  return argv.slice(skip).filter((item) => item && !item.startsWith("--inspect") && item !== "--allow-file-access-from-files");
}

async function start() {
  registerHandlers();
  const argv = commandLine(process.argv);
  mergeToolRun = argv.includes("--merge") || argv.filter((item) => !item.startsWith("-")).length >= 4;

  let url;
  if (isProd) {
    const { startServer } = require(path.join(__dirname, "..", "dist-server", "index.cjs"));
    server = await startServer({
      port: 0,
      staticDir: path.join(__dirname, "..", "dist"),
      argv,
      launcher: process.execPath,
    });
    url = `http://127.0.0.1:${server.port}`;
  } else {
    url = devUrl;
  }

  childWindows.setBaseUrl(url);
  mainWindow = await createMainWindow(url);
  childWindows.setMainWindow(mainWindow);
  setTimeout(() => childWindows.warmChildWindows(), 1200);

  if (isSmoke) require("./smoke.cjs").install({ childWindows, getMainWindow: () => mainWindow });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") quit();
});

app.on("before-quit", () => {
  childWindows.closeAllChildWindows();
});

function quit() {
  if (server) {
    server.close().catch(() => {});
    server = null;
  }
  // `git mergetool` treats a non-zero exit as "still conflicted".
  app.exit(mergeToolRun && !mergeSaved ? 1 : 0);
}

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && mainWindow === null) start();
});
