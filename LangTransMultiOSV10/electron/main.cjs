const { app, BrowserWindow, ipcMain, shell } = require('electron')
const { spawn } = require('node:child_process')
const path = require('node:path')

let mainWindow
let ttsProcess

const WINDOW_WIDTH = 1360
const WINDOW_HEIGHT = 940

const appIconPath = app.isPackaged
  ? path.join(process.resourcesPath, 'app-icon.png')
  : path.join(__dirname, '..', 'src', 'assets', 'app-icon.png')

const ttsServicePath = app.isPackaged
  ? path.join(process.resourcesPath, 'tts-service')
  : path.join(__dirname, '..', 'tts-service')

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: WINDOW_WIDTH,
    minHeight: WINDOW_HEIGHT,
    title: 'LangTrans V1.0.0',
    frame: false,
    titleBarStyle: 'hidden',
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  } else {
    mainWindow.loadURL('http://localhost:5173')
  }
}

ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:toggle-maximize', () => {
  if (!mainWindow) {
    return
  }

  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow.maximize()
  }
})
ipcMain.handle('window:close', () => mainWindow?.close())
ipcMain.handle('tts:start', () => {
  if (ttsProcess && !ttsProcess.killed) {
    return { ok: true, message: 'TTS server is already running.' }
  }

  ttsProcess = spawn('python', ['-m', 'uvicorn', 'server:app', '--host', '127.0.0.1', '--port', '8756'], {
    cwd: ttsServicePath,
    windowsHide: true,
  })

  ttsProcess.once('error', (error) => {
    mainWindow?.webContents.send('tts:log', `TTS server failed: ${error.message}`)
  })
  ttsProcess.stdout?.on('data', (chunk) => mainWindow?.webContents.send('tts:log', String(chunk)))
  ttsProcess.stderr?.on('data', (chunk) => mainWindow?.webContents.send('tts:log', String(chunk)))
  ttsProcess.once('exit', (code) => {
    mainWindow?.webContents.send('tts:log', `TTS server exited with code ${code ?? 'unknown'}`)
    ttsProcess = undefined
  })

  return { ok: true, message: 'TTS server start requested.' }
})

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  ttsProcess?.kill()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})