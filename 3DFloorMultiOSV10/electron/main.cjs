const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'svg'];
const MODEL_EXTENSIONS = [
  'glb', 'gltf', 'obj', 'mtl', 'stl', 'fbx', 'ply', 'dae',
  '3ds', '3mf', 'amf', 'pcd', 'xyz', 'wrl', 'vrml', 'gcode',
  'usdz', 'usd', 'usda', 'usdc', 'vox', 'vtk', 'vtp', 'kmz',
];

function resolveAppIcon() {
  const candidates = [
    path.join(__dirname, 'icon.png'),
    path.join(__dirname, '..', 'assets', 'icon.png'),
    path.join(__dirname, '..', 'build', 'icon.png'),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

function resolveDistIndex() {
  return path.join(__dirname, '..', 'dist', 'index.html');
}

function prefsPath() {
  return path.join(app.getPath('userData'), 'preferences.json');
}

function loadPrefs() {
  try {
    const raw = fs.readFileSync(prefsPath(), 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function savePrefs(prefs) {
  try {
    fs.mkdirSync(path.dirname(prefsPath()), { recursive: true });
    fs.writeFileSync(prefsPath(), `${JSON.stringify(prefs, null, 2)}\n`, 'utf8');
  } catch (err) {
    console.error('Failed to save preferences:', err);
  }
}

function resolveExistingDir(candidate) {
  if (!candidate || typeof candidate !== 'string') return undefined;
  try {
    let dir = candidate;
    if (fs.existsSync(dir) && fs.statSync(dir).isFile()) {
      dir = path.dirname(dir);
    }
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      return dir;
    }
  } catch {
    // ignore
  }
  return undefined;
}

function rememberDirectoryFromPaths(filePaths, key = 'lastOpenDir') {
  const first = (filePaths || []).find((p) => typeof p === 'string' && p);
  if (!first) return;
  const dir = resolveExistingDir(path.dirname(first)) || resolveExistingDir(first);
  if (!dir) return;
  const prefs = loadPrefs();
  if (prefs[key] === dir) return;
  prefs[key] = dir;
  savePrefs(prefs);
}

function mimeForExt(ext) {
  const map = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    glb: 'model/gltf-binary',
    gltf: 'model/gltf+json',
    obj: 'text/plain',
    mtl: 'text/plain',
    stl: 'model/stl',
    fbx: 'application/octet-stream',
    ply: 'application/octet-stream',
    dae: 'model/vnd.collada+xml',
    '3ds': 'application/octet-stream',
    '3mf': 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml',
    amf: 'application/octet-stream',
    pcd: 'application/octet-stream',
    xyz: 'text/plain',
    wrl: 'model/vrml',
    vrml: 'model/vrml',
    gcode: 'text/plain',
    usdz: 'model/vnd.usdz+zip',
    usd: 'application/octet-stream',
    usda: 'text/plain',
    usdc: 'application/octet-stream',
    vox: 'application/octet-stream',
    vtk: 'application/octet-stream',
    vtp: 'application/octet-stream',
    kmz: 'application/vnd.google-earth.kmz',
  };
  return map[ext] || 'application/octet-stream';
}

function filtersForMode(mode) {
  if (mode === 'image') {
    return [
      { name: 'Images', extensions: IMAGE_EXTENSIONS },
      { name: 'All Files', extensions: ['*'] },
    ];
  }
  if (mode === 'model') {
    return [
      { name: '3D Models', extensions: MODEL_EXTENSIONS },
      { name: 'All Files', extensions: ['*'] },
    ];
  }
  return [
    { name: 'Images & 3D Models', extensions: [...IMAGE_EXTENSIONS, ...MODEL_EXTENSIONS] },
    { name: 'Images', extensions: IMAGE_EXTENSIONS },
    { name: '3D Models', extensions: MODEL_EXTENSIONS },
    { name: 'All Files', extensions: ['*'] },
  ];
}

function createWindow() {
  Menu.setApplicationMenu(null);

  const icon = resolveAppIcon();
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'FloorPlanTo3D',
    autoHideMenuBar: true,
    backgroundColor: '#1a1d21',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.setMenuBarVisibility(false);

  const distIndex = resolveDistIndex();
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    win.loadURL(devServerUrl);
  } else if (app.isPackaged || fs.existsSync(distIndex)) {
    win.loadFile(distIndex);
  } else {
    win.loadURL('http://127.0.0.1:5173/');
  }

  return win;
}

function registerIpc() {
  ipcMain.handle('fp3d:openFiles', async (event, options = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow();
    const prefs = loadPrefs();
    const defaultPath = resolveExistingDir(prefs.lastOpenDir);
    const multi = options.multiple !== false;

    const result = await dialog.showOpenDialog(win || undefined, {
      title: options.title || 'Open',
      defaultPath,
      properties: multi ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: filtersForMode(options.mode || 'any'),
    });

    if (result.canceled || !result.filePaths?.length) {
      return [];
    }

    rememberDirectoryFromPaths(result.filePaths);

    const files = [];
    for (const filePath of result.filePaths) {
      try {
        const data = await fs.promises.readFile(filePath);
        const name = path.basename(filePath);
        const ext = path.extname(name).slice(1).toLowerCase();
        files.push({
          name,
          path: filePath,
          type: mimeForExt(ext),
          data,
        });
      } catch (err) {
        console.error('Failed to read file:', filePath, err);
      }
    }
    return files;
  });

  ipcMain.handle('fp3d:rememberPaths', async (_event, filePaths = []) => {
    rememberDirectoryFromPaths(filePaths);
    return loadPrefs().lastOpenDir || '';
  });

  ipcMain.handle('fp3d:saveFile', async (event, payload = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow();
    const prefs = loadPrefs();
    const defaultDir = resolveExistingDir(prefs.lastSaveDir) || resolveExistingDir(prefs.lastOpenDir);
    const defaultName = payload.defaultName || 'floorplan-3d.bin';
    const defaultPath = defaultDir ? path.join(defaultDir, defaultName) : defaultName;
    const filters = Array.isArray(payload.filters) && payload.filters.length
      ? payload.filters
      : [{ name: 'All Files', extensions: ['*'] }];

    const result = await dialog.showSaveDialog(win || undefined, {
      title: payload.title || 'Save',
      defaultPath,
      filters,
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    let filePath = result.filePath;
    const preferredExt = filters[0]?.extensions?.[0];
    if (preferredExt && preferredExt !== '*' && !new RegExp(`\\.${preferredExt}$`, 'i').test(filePath)) {
      filePath = `${filePath}.${preferredExt}`;
    }

    if (typeof payload.dataText === 'string') {
      await fs.promises.writeFile(filePath, payload.dataText, 'utf8');
    } else {
      const base64 = String(payload.dataBase64 || '').replace(/^data:[^;]+;base64,/, '');
      if (!base64) {
        return { canceled: false, ok: false, error: 'empty' };
      }
      await fs.promises.writeFile(filePath, Buffer.from(base64, 'base64'));
    }

    rememberDirectoryFromPaths([filePath], 'lastSaveDir');
    return { canceled: false, ok: true, path: filePath, name: path.basename(filePath) };
  });

}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
