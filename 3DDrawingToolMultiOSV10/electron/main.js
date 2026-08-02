import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged;

// Windows taskbar grouping / icon identity
if (process.platform === 'win32') {
  app.setAppUserModelId('com.shkwon.3ddrawingtool');
}

function resolveAppIcon() {
  const candidates =
    process.platform === 'win32'
      ? [
          path.join(__dirname, 'assets', 'icon.ico'),
          path.join(__dirname, '../build/icon.ico'),
          path.join(__dirname, 'assets', 'icon.png'),
          path.join(__dirname, '../build/icon.png'),
        ]
      : [
          path.join(__dirname, 'assets', 'icon.png'),
          path.join(__dirname, '../build/icon.png'),
          path.join(__dirname, 'assets', 'icon.ico'),
        ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function loadAppIcon() {
  const iconPath = resolveAppIcon();
  if (!iconPath) return undefined;
  const image = nativeImage.createFromPath(iconPath);
  return image.isEmpty() ? undefined : image;
}

let mainWindow = null;

function createWindow() {
  const icon = loadAppIcon();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    frame: false,
    titleBarStyle: 'hidden',
    title: '3D Drawing Tool',
    backgroundColor: '#0f1419',
    show: false,
    autoHideMenuBar: true,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // No developer / code inspection window
      devTools: false,
    },
  });

  if (icon) {
    // Re-apply after creation — Windows taskbar caches the first icon
    mainWindow.setIcon(icon);
    // Force title used by some shells
    mainWindow.setTitle('3D Drawing Tool');
  }

  // Block common DevTools shortcuts (F12, Ctrl+Shift+I/J/C)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const key = input.key?.toLowerCase();
    if (input.type !== 'keyDown') return;
    if (key === 'f12') {
      event.preventDefault();
      return;
    }
    if (input.control && input.shift && ['i', 'j', 'c'].includes(key)) {
      event.preventDefault();
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    if (icon) mainWindow?.setIcon(icon);
    // Ensure any leftover DevTools from older runs are closed
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
    }
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Also set dock icon on macOS
  const icon = loadAppIcon();
  if (process.platform === 'darwin' && icon && app.dock) {
    app.dock.setIcon(icon);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);

ipcMain.handle('dialog:saveProject', async (_event, data) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Project',
    defaultPath: 'untitled.3ddraw',
    filters: [{ name: '3D Drawing Project', extensions: ['3ddraw', 'json'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  fs.writeFileSync(result.filePath, data, 'utf-8');
  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle('dialog:openProject', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Project',
    filters: [{ name: '3D Drawing Project', extensions: ['3ddraw', 'json'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths?.[0]) return { canceled: true };
  const filePath = result.filePaths[0];
  const data = fs.readFileSync(filePath, 'utf-8');
  return { canceled: false, filePath, data };
});

ipcMain.handle('shell:openExternal', async (_event, url) => {
  await shell.openExternal(url);
});

ipcMain.handle('dialog:exportImage', async (_event, payload) => {
  const {
    pngBase64,
    format = 'png',
    fileName = 'viewport.png',
    quality = 92,
    includeBackground = true,
    backgroundColor = '#ffffff',
  } = payload || {};

  const ext = String(format).toLowerCase().replace(/^\./, '');
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Image',
    defaultPath: fileName,
    filters: [
      { name: ext.toUpperCase(), extensions: [ext] },
      {
        name: 'Images',
        extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'gif', 'tiff', 'tif', 'ico', 'bmp'],
      },
    ],
  });
  if (result.canceled || !result.filePath) return { canceled: true };

  const input = Buffer.from(pngBase64, 'base64');
  const q = Math.min(100, Math.max(1, Number(quality) || 92));
  let outPath = result.filePath;
  if (!outPath.toLowerCase().endsWith(`.${ext}`)) {
    outPath = `${outPath}.${ext}`;
  }

  try {
    const sharp = (await import('sharp')).default;
    let pipeline = sharp(input);

    const opaqueFormats = new Set(['jpg', 'jpeg', 'bmp']);
    if (opaqueFormats.has(ext)) {
      pipeline = pipeline.flatten({ background: backgroundColor || '#ffffff' });
    }

    let buffer;
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        buffer = await pipeline.jpeg({ quality: q, mozjpeg: true }).toBuffer();
        break;
      case 'webp':
        buffer = await pipeline
          .webp({ quality: q, alphaQuality: q, lossless: false })
          .toBuffer();
        break;
      case 'avif':
        buffer = await pipeline.avif({ quality: q }).toBuffer();
        break;
      case 'gif':
        buffer = await pipeline.gif().toBuffer();
        break;
      case 'tiff':
      case 'tif':
        buffer = await pipeline.tiff({ compression: 'lzw' }).toBuffer();
        break;
      case 'bmp':
        // sharp has limited bmp write — convert via png then raw fallback to png if needed
        try {
          buffer = await pipeline.toFormat('png').toBuffer();
          // Prefer real BMP via raw pixel encode below if png-only
          const { data, info } = await sharp(buffer)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
          buffer = encodeBmpBuffer(data, info.width, info.height);
        } catch {
          buffer = await sharp(input).png().toBuffer();
          outPath = outPath.replace(/\.bmp$/i, '.png');
        }
        break;
      case 'ico': {
        const pngBuf = await pipeline.png().toBuffer();
        const toIco = (await import('to-ico')).default;
        // Multi-resolution icons look better in shells
        const sizes = [16, 32, 48, 256];
        const pngs = await Promise.all(
          sizes.map((size) => sharp(pngBuf).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer())
        );
        buffer = await toIco(pngs);
        break;
      }
      case 'png':
      default:
        buffer = await pipeline.png().toBuffer();
        break;
    }

    fs.writeFileSync(outPath, buffer);
    return { canceled: false, filePath: outPath };
  } catch (err) {
    // Last resort: write original PNG bytes
    const fallback = outPath.replace(/\.[^.]+$/, '.png');
    fs.writeFileSync(fallback, input);
    return {
      canceled: false,
      filePath: fallback,
      warning: err instanceof Error ? err.message : String(err),
    };
  }
});

function encodeBmpBuffer(rgba, width, height) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelSize = rowSize * height;
  const headerSize = 54;
  const buffer = Buffer.alloc(headerSize + pixelSize);
  buffer.writeUInt16LE(0x4d42, 0);
  buffer.writeUInt32LE(headerSize + pixelSize, 2);
  buffer.writeUInt32LE(headerSize, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(-height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);

  let offset = headerSize;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = rgba[i + 3] / 255;
      buffer[offset++] = Math.round(rgba[i + 2] * a + 255 * (1 - a));
      buffer[offset++] = Math.round(rgba[i + 1] * a + 255 * (1 - a));
      buffer[offset++] = Math.round(rgba[i] * a + 255 * (1 - a));
    }
    offset += rowSize - width * 3;
  }
  return buffer;
}
