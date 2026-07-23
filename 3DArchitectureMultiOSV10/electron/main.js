const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path    = require('path');
const fs      = require('fs');
const { spawn } = require('child_process');

const isDev = !app.isPackaged;

// ── AI Server (Python) ─────────────────────────────────────
let aiProc = null;

function startAIServer() {
  const scriptDir  = isDev
    ? path.join(__dirname, '..', 'python')
    : path.join(path.dirname(app.getPath('exe')), 'python');
  const scriptPath = path.join(scriptDir, 'ai_server.py');

  if (!fs.existsSync(scriptPath)) {
    console.log('[AI] ai_server.py not found at', scriptPath);
    return;
  }

  // 가상환경 우선, 없으면 시스템 Python
  const venvPy = process.platform === 'win32'
    ? path.join(scriptDir, '.venv', 'Scripts', 'python.exe')
    : path.join(scriptDir, '.venv', 'bin', 'python');
  const sysPy  = process.platform === 'win32' ? 'python' : 'python3';
  const pyExe  = fs.existsSync(venvPy) ? venvPy : sysPy;
  aiProc = spawn(pyExe, [scriptPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  });

  aiProc.stdout.on('data', (d) => process.stdout.write(`[AI] ${d}`));
  aiProc.stderr.on('data', (d) => process.stderr.write(`[AI] ${d}`));
  aiProc.on('exit', (code) => {
    console.log(`[AI] Server exited (code ${code})`);
    aiProc = null;
  });
  aiProc.on('error', (err) => {
    console.error('[AI] Failed to start Python:', err.message);
    aiProc = null;
  });
}

app.on('before-quit', () => {
  if (aiProc) { aiProc.kill(); aiProc = null; }
});

app.commandLine.appendSwitch('disable-features', 'Autofill');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      webSecurity:      true,
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    backgroundColor: '#12121f',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    show: false,
    title: '3D Architecture Viewer',
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.once('ready-to-show', () => win.show());
}

app.whenReady().then(() => {
  const { Menu } = require('electron');
  Menu.setApplicationMenu(null);
  startAIServer();
  createWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── 파일 열기 ─────────────────────────────────────────────
ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: '도면 / BIM 파일 열기',
    filters: [
      { name: '지원 파일', extensions: ['dxf', 'ifc', 'obj', 'gltf', 'glb', 'jpg', 'jpeg', 'png', 'bmp', 'webp', 'svg'] },
      { name: 'DXF 파일', extensions: ['dxf'] },
      { name: 'BIM / IFC',  extensions: ['ifc'] },
      { name: '3D 모델',     extensions: ['obj', 'gltf', 'glb'] },
      { name: '이미지 파일', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'webp', 'svg'] },
      { name: '모든 파일',   extensions: ['*'] },
    ],
    properties: ['openFile'],
  });

  if (canceled || !filePaths.length) return null;

  const filePath = filePaths[0];
  const ext  = path.extname(filePath).toLowerCase().slice(1);
  const name = path.basename(filePath);

  const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'bmp', 'webp', 'svg'];
  const TEXT_EXTS  = ['dxf', 'ifc', 'obj', 'gltf'];
  const BINARY_EXTS = ['glb'];

  if (IMAGE_EXTS.includes(ext)) {
    // 이미지: base64 data URL로 변환
    const buf  = fs.readFileSync(filePath);
    const b64  = buf.toString('base64');
    const mime = ext === 'svg' ? 'image/svg+xml'
               : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
               : `image/${ext}`;
    return { type: 'image', name, path: filePath, dataUrl: `data:${mime};base64,${b64}` };
  }

  if (TEXT_EXTS.includes(ext)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (ext === 'dxf') return { type: 'dxf',  name, path: filePath, content };
    if (ext === 'ifc') return { type: 'ifc',  name, path: filePath, content };
    if (ext === 'obj') return { type: 'model', name, path: filePath, content, modelType: 'obj' };
    if (ext === 'gltf') return { type: 'model', name, path: filePath, content, modelType: 'gltf' };
  }

  if (BINARY_EXTS.includes(ext)) {
    // GLB 바이너리: ArrayBuffer로 넘김
    const buf = fs.readFileSync(filePath);
    const b64 = buf.toString('base64');
    return { type: 'model', name, path: filePath, content: b64, modelType: 'glb' };
  }

  // 기타: 텍스트로 시도
  const content = fs.readFileSync(filePath, 'utf-8');
  return { type: 'dxf', name, path: filePath, content };
});

// ── 스크린샷 저장 ─────────────────────────────────────────
ipcMain.handle('dialog:saveScreenshot', async (event, dataUrl) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '스크린샷 저장',
    defaultPath: 'architecture-3d.png',
    filters: [{ name: 'PNG 이미지', extensions: ['png'] }],
  });
  if (canceled || !filePath) return false;
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return true;
});

ipcMain.handle('app:getVersion',  () => app.getVersion());
ipcMain.handle('app:getPlatform', () => process.platform);
