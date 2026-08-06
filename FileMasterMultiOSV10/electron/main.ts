import { app, BrowserWindow, Menu, ipcMain } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import Store from 'electron-store'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compressZip, extractZip } from './archive.js'
import { chooseDirectory, chooseSaveZip, copyPaths, createFile, createFolder, deletePaths, getHomePath, getRoots, listDirectory, movePaths, openPath, readPreview, renamePath, revealPath, searchFiles, watchDirectory } from './fileSystem.js'
import { SearchIndexService } from './searchIndex.js'
import type { CompressRequest, ExtractRequest, FileOperationRequest, IndexStatus, OperationProgress, Preferences, SearchOptions } from '../src/shared.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const store = new Store<Preferences>({
  defaults: { language: 'ko', theme: 'light', bookmarks: [] },
})
const searchIndex = new SearchIndexService(getRoots)

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1220,
    minHeight: 640,
    show: false,
    title: 'Command Center',
    frame: false,
    autoHideMenuBar: true,
    icon: path.resolve(__dirname, '../../build/app_icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
  if (process.env.VITE_DEV_SERVER_URL) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  else mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
}

function registerIpc() {
  ipcMain.handle('app:get-info', async () => ({
    platform: 'desktop',
    os: process.platform,
    homePath: getHomePath(),
    roots: await getRoots(),
    preferences: store.store,
  }))
  ipcMain.handle('prefs:save', (_event, preferences: Preferences) => store.set(preferences))
  ipcMain.handle('fs:list', (_event, targetPath?: string) => listDirectory(targetPath))
  ipcMain.handle('fs:reveal', (_event, targetPath: string) => revealPath(targetPath))
  ipcMain.handle('fs:open', (_event, targetPath: string) => openPath(targetPath))
  ipcMain.handle('fs:preview', (_event, targetPath: string) => readPreview(targetPath))
  ipcMain.handle('fs:create-folder', (_event, parentPath: string, name: string) => createFolder(parentPath, name))
  ipcMain.handle('fs:create-file', (_event, parentPath: string, name: string) => createFile(parentPath, name))
  ipcMain.handle('fs:rename', (_event, sourcePath: string, newName: string) => renamePath(sourcePath, newName))
  ipcMain.handle('fs:copy', (event, request: FileOperationRequest) => copyPaths(request, progress => sendProgress(event.sender, progress)))
  ipcMain.handle('fs:move', (event, request: FileOperationRequest) => movePaths(request, progress => sendProgress(event.sender, progress)))
  ipcMain.handle('fs:delete', (event, paths: string[]) => deletePaths(paths, progress => sendProgress(event.sender, progress)))
  ipcMain.handle('fs:search', (_event, options: SearchOptions) => searchFiles(options))
  ipcMain.handle('index:status', () => searchIndex.getStatus())
  ipcMain.handle('index:rebuild', () => searchIndex.rebuild(broadcastIndexStatus))
  ipcMain.handle('index:cancel', () => searchIndex.cancel())
  ipcMain.handle('index:search', (_event, options: SearchOptions) => searchIndex.search(options))
  ipcMain.handle('archive:compress', (event, request: CompressRequest) => compressZip(request, progress => sendProgress(event.sender, progress)))
  ipcMain.handle('archive:extract', (event, request: ExtractRequest) => extractZip(request, progress => sendProgress(event.sender, progress)))
  ipcMain.handle('dialog:directory', event => chooseDirectory(BrowserWindow.fromWebContents(event.sender)!))
  ipcMain.handle('dialog:save-zip', (event, defaultPath: string) => chooseSaveZip(BrowserWindow.fromWebContents(event.sender)!, defaultPath))
  ipcMain.handle('fs:watch', (event, targetPath: string) => watchDirectory(BrowserWindow.fromWebContents(event.sender)!, targetPath))
  ipcMain.handle('window:minimize', event => BrowserWindow.fromWebContents(event.sender)?.minimize())
  ipcMain.handle('window:toggle-maximize', event => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  })
  ipcMain.handle('window:close', event => BrowserWindow.fromWebContents(event.sender)?.close())
}

function sendProgress(sender: Electron.WebContents, progress: OperationProgress) {
  sender.send('operation:progress', progress)
}

function broadcastIndexStatus(status: IndexStatus) {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send('index:status', status)
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  electronApp.setAppUserModelId('com.commandcenter.filemaster')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
