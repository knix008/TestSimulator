const { app, BrowserWindow, dialog, nativeImage, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");

function appIcon() {
  const file = process.platform === "win32" ? "icon.ico" : "icon.png";
  const image = nativeImage.createFromPath(path.join(__dirname, "..", "assets", file));
  if (!image.isEmpty()) return image;
  return nativeImage.createFromPath(path.join(__dirname, "..", "assets", "icon.png"));
}

let mainWindow = null;

const MODE_CONTENT_SIZE = {
  basic: { width: 360, height: 594 },
  scientific: { width: 560, height: 594 },
  programmer: { width: 480, height: 700 },
  currency: { width: 380, height: 594 },
  unit: { width: 400, height: 594 },
  graph: { width: 520, height: 594 },
};

// A frameless, transparent window on Windows comes up without a resize border,
// and every setBounds then raises its minimum size to whatever it was just
// given. The grip could only grow such a window, never shrink it, so each
// resizable window remembers the floor it was opened with and that floor is
// put back around every move.
const windowFloor = new WeakMap();

function allowResize(win, minWidth, minHeight) {
  windowFloor.set(win, [minWidth, minHeight]);
  win.setMaximumSize(0, 0);
  win.setMinimumSize(minWidth, minHeight);
  win.setResizable(true);
}

function lockContentSize(win, width, height) {
  win.setResizable(true);
  win.setMinimumSize(1, 1);
  win.setMaximumSize(4000, 4000);
  win.setContentSize(width, height);
  const [outerW, outerH] = win.getSize();
  win.setMinimumSize(outerW, outerH);
  win.setMaximumSize(outerW, outerH);
  win.setResizable(false);
}

function createWindow() {
  const icon = appIcon();
  const win = new BrowserWindow({
    width: MODE_CONTENT_SIZE.basic.width,
    height: MODE_CONTENT_SIZE.basic.height,
    useContentSize: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    transparent: true,
    roundedCorners: true,
    hasShadow: true,
    title: "MyCalc 10.0",
    icon,
    autoHideMenuBar: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "desktop-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = win;
  win.setMenuBarVisibility(false);
  lockContentSize(win, MODE_CONTENT_SIZE.basic.width, MODE_CONTENT_SIZE.basic.height);
  win.on("maximize", () => {
    if (!win.isDestroyed()) win.unmaximize();
  });
  win.on("enter-full-screen", () => {
    if (!win.isDestroyed()) win.setFullScreen(false);
  });

  const childWindows = { graph: null, settings: null, info: null, help: null };
  let printWindow = null;
  const openPrint = (owner) => {
    if (printWindow && !printWindow.isDestroyed()) {
      printWindow.focus();
      return;
    }
    const parent = owner && !owner.isDestroyed() ? owner : undefined;
    printWindow = new BrowserWindow({
      width: 920,
      height: 680,
      minWidth: 760,
      minHeight: 520,
      useContentSize: true,
      parent,
      frame: false,
      transparent: true,
      roundedCorners: true,
      title: "인쇄 — MyCalc 10.0",
      icon,
      autoHideMenuBar: true,
      backgroundColor: "#00000000",
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    printWindow.setIcon(icon);
    if (process.platform === "win32") {
      printWindow.setAppDetails({
        appId: "local.mycalc.desktop",
        appIconPath: path.join(__dirname, "..", "assets", "icon.ico"),
        relaunchDisplayName: "MyCalc 10.0",
      });
    }
    printWindow.setMenuBarVisibility(false);
    printWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    printWindow.on("closed", () => {
      printWindow = null;
    });
    printWindow.loadFile(path.join(__dirname, "..", "index.html"), { query: { pop: "print" } });
  };
  win.on("closed", () => {
    const graph = childWindows.graph;
    if (graph && !graph.isDestroyed()) graph.close();
    if (printWindow && !printWindow.isDestroyed()) printWindow.close();
  });
  const childSpec = {
    graph: {
      width: 1140,
      height: 700,
      // Narrower than this and the toolbar would fold onto a second line.
      minWidth: 790,
      minHeight: 520,
      title: "MyCalc 10.0 Graph",
      backgroundColor: "#100e0c",
    },
    settings: {
      width: 780,
      height: 520,
      minWidth: 720,
      minHeight: 460,
      title: "설정 — MyCalc 10.0",
      backgroundColor: "#1c1917",
    },
    info: {
      width: 560,
      height: 436,
      minWidth: 500,
      minHeight: 436,
      title: "프로그램 정보 — MyCalc 10.0",
      backgroundColor: "#1c1917",
    },
    help: {
      width: 720,
      height: 640,
      minWidth: 560,
      minHeight: 420,
      title: "그래프 도움말 — MyCalc 10.0",
      backgroundColor: "#1c1917",
    },
  };
  const openChild = (kind) => {
    const spec = childSpec[kind];
    if (!spec) return;
    const existing = childWindows[kind];
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return;
    }
    const graph = kind === "graph";
    const chromeless = true;
    const fixed = kind === "info";
    const child = new BrowserWindow({
      ...spec,
      useContentSize: true,
      icon,
      frame: !chromeless,
      transparent: true,
      roundedCorners: true,
      hasShadow: true,
      backgroundColor: "#00000000",
      autoHideMenuBar: true,
      resizable: chromeless,
      maximizable: chromeless,
      fullscreenable: chromeless,
      webPreferences: {
        ...(chromeless ? { preload: path.join(__dirname, "desktop-preload.js") } : {}),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    child.setIcon(icon);
    if (process.platform === "win32") {
      child.setAppDetails({
        appId: "local.mycalc.desktop",
        appIconPath: path.join(__dirname, "..", "assets", "icon.ico"),
        relaunchDisplayName: "MyCalc 10.0",
      });
    }
    child.setMenuBarVisibility(false);
    if (!fixed) allowResize(child, spec.minWidth || 320, spec.minHeight || 240);
    if (fixed) {
      lockContentSize(child, spec.width, spec.height);
      child.on("maximize", () => {
        if (!child.isDestroyed()) child.unmaximize();
      });
      child.on("enter-full-screen", () => {
        if (!child.isDestroyed()) child.setFullScreen(false);
      });
    }
    if (chromeless) {
      const publishWindow = () => {
        if (child.isDestroyed()) return;
        child.webContents.send("mycalc-window-state", { maximized: child.isMaximized() });
      };
      child.on("maximize", publishWindow);
      child.on("unmaximize", publishWindow);
    }
    childWindows[kind] = child;
    child.on("closed", () => {
      childWindows[kind] = null;
    });
    child.webContents.setWindowOpenHandler(({ url }) => {
      const next = kindFromUrl(url);
      if (next === "print") openPrint(child);
      else if (next === "settings" || next === "info" || next === "help") openChild(next);
      return { action: "deny" };
    });
    child.loadFile(path.join(__dirname, "..", "index.html"), {
      query: graph ? { pop: kind, desktop: "1" } : { pop: kind },
    });
  };
  const kindFromUrl = (url) => {
    const kinds = ["graph", "settings", "info", "help", "print"];
    try {
      const parsed = new URL(url);
      const query = parsed.searchParams.get("pop");
      if (kinds.includes(query)) return query;
      const hash = parsed.hash.replace(/^#/, "");
      if (kinds.includes(hash)) return hash;
    } catch {
      /* The raw URL is checked below. */
    }
    return kinds.find((kind) => url.includes(`pop=${kind}`) || url.includes(`#${kind}`)) || null;
  };

  win.webContents.setWindowOpenHandler(({ url }) => {
    const kind = kindFromUrl(url);
    if (kind === "print") openPrint(win);
    else if (kind) openChild(kind);
    return { action: "deny" };
  });
  win.loadFile(path.join(__dirname, "..", "index.html"), { query: { desktop: "1" } });
}

function pageSizeOf(settings) {
  const named = ["A3", "A4", "A5", "Legal", "Letter"];
  if (named.includes(settings.paper)) return settings.paper;
  const width = Math.round(Number(settings.width));
  const height = Math.round(Number(settings.height));
  if (width >= 80000 && width <= 600000 && height >= 80000 && height <= 600000) return { width, height };
  return "A4";
}

function marginMicrons(value) {
  const microns = Math.round(Number(value) || 0);
  return Math.max(0, Math.min(40000, microns));
}

ipcMain.handle("mycalc-window", (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed() || win === mainWindow) return { maximized: false };
  if (action === "minimize") win.minimize();
  else if (action === "maximize") {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  }
  return { maximized: win.isMaximized() };
});

ipcMain.handle("mycalc-window-bounds", (event, bounds) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed() || win === mainWindow || win.isMaximized() || !bounds) return;
  const [minW, minH] = windowFloor.get(win) || win.getMinimumSize();
  const x = Math.round(Number(bounds.x));
  const y = Math.round(Number(bounds.y));
  const width = Math.max(minW, Math.round(Number(bounds.width)));
  const height = Math.max(minH, Math.round(Number(bounds.height)));
  if (![x, y, width, height].every(Number.isFinite)) return;
  win.setMinimumSize(minW, minH);
  win.setBounds({ x, y, width, height });
  win.setMinimumSize(minW, minH);
});

ipcMain.handle("mycalc-save-file", async (event, payload) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const bytes = payload && payload.bytes;
  if (!win || win.isDestroyed() || !bytes || bytes.byteLength < 8 || bytes.byteLength > 40 * 1024 * 1024) {
    return { canceled: true, error: "invalid" };
  }
  const name = String((payload && payload.name) || "MyCalc-10.0.png").replace(/[\\/:*?"<>|]/g, "_");
  const ext = (name.split(".").pop() || "png").toLowerCase();
  try {
    const result = await dialog.showSaveDialog(win, {
      defaultPath: name,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    fs.writeFileSync(result.filePath, Buffer.from(bytes));
    return { canceled: false };
  } catch (err) {
    return { canceled: true, error: err && err.message ? err.message : "save" };
  }
});

ipcMain.on("mycalc-content-size", (event, mode) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const size = MODE_CONTENT_SIZE[mode];
  if (!win || win !== mainWindow || win.isDestroyed() || !size) return;
  lockContentSize(win, size.width, size.height);
});

ipcMain.handle("mycalc-printers", async (event) => {
  const printers = await event.sender.getPrintersAsync();
  return printers.map((printer) => ({
    name: printer.name,
    displayName: printer.displayName || printer.name,
    isDefault: !!printer.isDefault,
  }));
});

ipcMain.handle("mycalc-print", async (event, options) => {
  const settings = options && typeof options === "object" ? options : {};
  const printers = await event.sender.getPrintersAsync();
  const requested = typeof settings.deviceName === "string" ? settings.deviceName : "";
  const known = printers.some((printer) => printer.name === requested);
  const copies = Math.max(1, Math.min(99, Math.round(Number(settings.copies) || 1)));
  const pageSize = pageSizeOf(settings);
  const margins = settings.margins && typeof settings.margins === "object" ? settings.margins : {};
  return new Promise((resolve) => {
    event.sender.print({
      silent: false,
      printBackground: true,
      deviceName: known ? requested : "",
      copies,
      color: settings.color !== false,
      landscape: pageSize === settings.paper ? !!settings.landscape : false,
      pageSize,
      margins: {
        marginType: "custom",
        top: marginMicrons(margins.top),
        bottom: marginMicrons(margins.bottom),
        left: marginMicrons(margins.left),
        right: marginMicrons(margins.right),
      },
      preferCSSPageSize: false,
      header: "",
      footer: "",
    }, (success, failureReason) => {
      resolve({ success: !!success, failureReason: failureReason || "" });
    });
  });
});

app.setAppUserModelId("local.mycalc.desktop");
app.whenReady().then(() => {
  if (process.platform === "darwin" && app.dock) app.dock.setIcon(appIcon());
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
