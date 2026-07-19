import { app, BrowserWindow, Menu, dialog, ipcMain, nativeImage, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  addPathsToSession,
  closeEditSession,
  exportFileFromSession,
  exportFilesToDirectory,
  getEditSnapshot,
  getEditSourcePath,
  isEditDirty,
  mkdirInSession,
  openEditSession,
  prepareDragOutFile,
  prepareDragOutFiles,
  removeFromSession,
  removeManyFromSession,
  renameInSession,
  saveEditSession,
} from './iso/edit-session'
import {
  createBootableIso,
  createIso,
  extractIso,
  getEngineInfo,
} from './iso/xorriso'
import type {
  CreateBootableIsoOptions,
  CreateIsoOptions,
  ExtractOptions,
  JobProgress,
} from './iso/types'
import { listIsoTree } from './iso/list-tree'
import { dialogDefaultPath, rememberPath } from './last-path'
import { mountIso, unmountIso } from './mount'
import { resolveResource } from './paths'
import {
  discImageFileFilters,
  editedImageName,
  guessImageKindByName,
  saveImageFileFilters,
} from '../src/iso9660/image-formats'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Windows notifications / taskbar grouping
app.setAppUserModelId('com.shkwon.isomaker')

let mainWindow: BrowserWindow | null = null
let allowClose = false
let closePromptOpen = false
let closeFallbackTimer: NodeJS.Timeout | null = null
let currentJobAbort: AbortController | null = null
/** App UI language from renderer prefs (not OS locale). */
let appLocale: 'ko' | 'en' = 'ko'

function isKo(): boolean {
  return appLocale === 'ko'
}

function resolvePreloadPath(): string {
  const candidates = [
    // Dev: source file next to this repo (most reliable with "type": "module")
    path.join(process.cwd(), 'electron', 'preload.cjs'),
    // Packaged / built next to main or project electron/
    path.join(__dirname, 'preload.cjs'),
    path.join(__dirname, '..', 'electron', 'preload.cjs'),
    path.join(__dirname, 'preload.js'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return candidates[0]!
}

function resolveAppIcon(): string | undefined {
  const file =
    process.platform === 'win32'
      ? 'icon.ico'
      : process.platform === 'darwin'
        ? 'icon.png'
        : 'icon.png'
  return resolveResource('assets', file) ?? undefined
}

function createWindow(): void {
  const preloadPath = resolvePreloadPath()
  const icon = resolveAppIcon()
  allowClose = false

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 900,
    minWidth: 1480,
    minHeight: 700,
    title: 'ISO Maker',
    autoHideMenuBar: true,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: false,
    },
  })

  // Never show the Chromium DevTools / script window
  mainWindow.webContents.closeDevTools()
  mainWindow.webContents.on('devtools-opened', () => {
    mainWindow?.webContents.closeDevTools()
  })

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[iso-maker] did-fail-load', { code, desc, url })
  })

  mainWindow.webContents.on('preload-error', (_e, preload, error) => {
    console.error('[iso-maker] preload-error', preload, error)
  })

  mainWindow.on('close', (event) => {
    if (allowClose || !isEditDirty()) {
      clearClosePrompt()
      closeEditSession()
      return
    }
    event.preventDefault()
    requestCloseConfirmation()
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

function clearClosePrompt(): void {
  closePromptOpen = false
  if (closeFallbackTimer) {
    clearTimeout(closeFallbackTimer)
    closeFallbackTimer = null
  }
}

function requestCloseConfirmation(): void {
  if (!mainWindow || closePromptOpen) return
  closePromptOpen = true
  mainWindow.webContents.send('app:close-request')
  // If the renderer never answers (crash / not ready), fall back to a native dialog.
  closeFallbackTimer = setTimeout(() => {
    if (!closePromptOpen) return
    void confirmCloseWithNativeDialog()
  }, 1500)
}

function forceCloseWindow(): void {
  clearClosePrompt()
  allowClose = true
  closeEditSession()
  mainWindow?.close()
}

async function confirmCloseWithNativeDialog(): Promise<void> {
  if (!mainWindow) {
    clearClosePrompt()
    return
  }
  const ko = isKo()
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ko
      ? ['저장 후 종료', '저장 안 함', '취소']
      : ['Save & quit', "Don't save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    title: ko ? '저장하지 않은 변경' : 'Unsaved changes',
    message: ko
      ? '내용이 변경되었습니다. 종료하기 전에 저장할까요?'
      : 'Contents have been modified. Save before quitting?',
    detail: ko
      ? '저장 형식(ISO/IMG/AppImage/tar)을 선택할 수 있습니다.'
      : 'You can choose the save format (ISO/IMG/AppImage/tar).',
  })

  if (result.response === 2) {
    clearClosePrompt()
    return
  }

  if (result.response === 0) {
    const src = getEditSourcePath()
    const base = src ? editedImageName(src) : 'edited.iso'
    const preferred = src ? guessImageKindByName(src) : 'iso'
    const save = await dialog.showSaveDialog(mainWindow, {
      title: ko ? '변경 내용 저장' : 'Save changes',
      defaultPath: dialogDefaultPath(src ?? undefined, base),
      filters: saveImageFileFilters(ko ? 'ko' : 'en', preferred),
    })
    if (save.canceled || !save.filePath) {
      clearClosePrompt()
      return
    }
    try {
      await saveEditSession(save.filePath, sendProgress)
      rememberPath(save.filePath)
      mainWindow.webContents.send('session:updated', getEditSnapshot())
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await dialog.showMessageBox(mainWindow, {
        type: 'error',
        message: ko ? '저장 실패' : 'Save failed',
        detail: message,
      })
      clearClosePrompt()
      return
    }
  }

  forceCloseWindow()
}

function sendProgress(progress: JobProgress): void {
  mainWindow?.webContents.send('job:progress', progress)
}

async function runCancelableJob<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (currentJobAbort) throw new Error('A job is already running')
  const controller = new AbortController()
  currentJobAbort = controller
  try {
    return await fn(controller.signal)
  } finally {
    if (currentJobAbort === controller) currentJobAbort = null
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', (event) => {
  if (allowClose || !isEditDirty()) return
  event.preventDefault()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close()
  } else {
    requestCloseConfirmation()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('app:close-ack', async () => {
  // Renderer is showing the in-app dialog; cancel the native fallback.
  if (closeFallbackTimer) {
    clearTimeout(closeFallbackTimer)
    closeFallbackTimer = null
  }
  return { ok: true as const }
})

ipcMain.handle('app:close-decision', async (_event, decision: 'save-done' | 'discard' | 'cancel') => {
  if (decision === 'cancel') {
    clearClosePrompt()
    return { ok: true as const }
  }
  // 'save-done' and 'discard' both proceed to quit; renderer already saved if needed.
  forceCloseWindow()
  return { ok: true as const }
})

ipcMain.handle('engine:info', async () => getEngineInfo())

ipcMain.handle(
  'dialog:openFile',
  async (
    _event,
    filters?: Electron.FileFilter[],
    hintPath?: string,
    title?: string,
  ) => {
    const result = await dialog.showOpenDialog({
      title: title || (isKo() ? '이미지 열기' : 'Open image'),
      properties: ['openFile'],
      filters: filters ?? discImageFileFilters(appLocale),
      defaultPath: dialogDefaultPath(hintPath),
    })
    const selected = result.canceled ? null : (result.filePaths[0] ?? null)
    if (selected) rememberPath(selected)
    return selected
  },
)

ipcMain.handle(
  'dialog:openFiles',
  async (
    _event,
    filters?: Electron.FileFilter[],
    hintPath?: string,
    title?: string,
  ) => {
    const result = await dialog.showOpenDialog({
      title: title || (isKo() ? '파일 선택' : 'Select files'),
      properties: ['openFile', 'multiSelections'],
      ...(filters?.length ? { filters } : {}),
      defaultPath: dialogDefaultPath(hintPath),
    })
    if (result.canceled || !result.filePaths.length) return [] as string[]
    rememberPath(result.filePaths[0]!)
    return result.filePaths
  },
)

ipcMain.handle(
  'dialog:openDirectory',
  async (_event, hintPath?: string, title?: string) => {
    const result = await dialog.showOpenDialog({
      title: title || (isKo() ? '디렉터리 선택' : 'Select directory'),
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: dialogDefaultPath(hintPath),
    })
    const selected = result.canceled ? null : (result.filePaths[0] ?? null)
    if (selected) rememberPath(selected)
    return selected
  },
)

ipcMain.handle(
  'dialog:saveFile',
  async (
    _event,
    defaultPath?: string,
    hintPath?: string,
    title?: string,
    filters?: { name: string; extensions: string[] }[],
  ) => {
    const fileName = defaultPath || 'output.iso'
    const preferred = guessImageKindByName(fileName)
    const result = await dialog.showSaveDialog({
      title: title || (isKo() ? '이미지 저장' : 'Save image'),
      defaultPath: dialogDefaultPath(hintPath ?? defaultPath, fileName),
      filters: filters?.length ? filters : saveImageFileFilters(appLocale, preferred),
    })
    const selected = result.canceled ? null : (result.filePath ?? null)
    if (selected) rememberPath(selected)
    return selected
  },
)

ipcMain.handle('shell:openPath', async (_event, targetPath: string) => {
  return shell.openPath(targetPath)
})

ipcMain.handle('iso:extract', async (_event, options: ExtractOptions) => {
  await runCancelableJob((signal) => extractIso(options, sendProgress, signal))
  return { ok: true }
})

ipcMain.handle('iso:create', async (_event, options: CreateIsoOptions) => {
  await runCancelableJob((signal) => createIso(options, sendProgress, signal))
  return { ok: true }
})

ipcMain.handle('iso:createBootable', async (_event, options: CreateBootableIsoOptions) => {
  await runCancelableJob((signal) => createBootableIso(options, sendProgress, signal))
  return { ok: true }
})

ipcMain.handle('iso:cancel', async () => {
  if (!currentJobAbort) return { ok: true, canceled: false }
  currentJobAbort.abort()
  sendProgress({ phase: 'cancel', percent: null, message: 'Canceling job…' })
  return { ok: true, canceled: true }
})

ipcMain.handle('iso:mount', async (_event, isoPath: string) => mountIso(isoPath))
ipcMain.handle('iso:unmount', async (_event, target: string) => unmountIso(target))
ipcMain.handle('iso:listTree', async (_event, isoPath: string) => listIsoTree(isoPath))

ipcMain.handle('session:open', async (_event, isoPath: string) => {
  const snap = await openEditSession(isoPath)
  return snap
})

ipcMain.handle('session:get', async () => getEditSnapshot())

ipcMain.handle('session:close', async () => {
  closeEditSession()
  return { ok: true }
})

ipcMain.handle('session:addPaths', async (_event, destDir: string, filePaths: string[]) => {
  return addPathsToSession(destDir, filePaths)
})

ipcMain.handle('session:remove', async (_event, entryPath: string) => removeFromSession(entryPath))

ipcMain.handle('session:removeMany', async (_event, entryPaths: string[]) => {
  return removeManyFromSession(entryPaths)
})

ipcMain.handle('session:mkdir', async (_event, dirPath: string, name: string) => {
  return mkdirInSession(dirPath, name)
})

ipcMain.handle('session:rename', async (_event, entryPath: string, newName: string) => {
  return renameInSession(entryPath, newName)
})

ipcMain.handle(
  'session:exportFile',
  async (_event, entryPath: string, outputPath: string) => {
    return exportFileFromSession(entryPath, outputPath)
  },
)

ipcMain.handle(
  'session:exportFilesToDir',
  async (_event, entryPaths: string[], outputDir: string) => {
    return exportFilesToDirectory(entryPaths, outputDir)
  },
)

ipcMain.handle('session:prepareDragOut', async (_event, entryPath: string) => {
  return prepareDragOutFile(entryPath)
})

ipcMain.handle('session:prepareDragOutMany', async (_event, entryPaths: string[]) => {
  return prepareDragOutFiles(entryPaths)
})

ipcMain.handle('session:save', async (_event, outputPath: string) => {
  const snap = await runCancelableJob((signal) => saveEditSession(outputPath, sendProgress, signal))
  rememberPath(outputPath)
  return snap
})

ipcMain.handle('session:isDirty', async () => ({ dirty: isEditDirty() }))

ipcMain.on('ondragstart', (event, filePathOrPaths: string | string[]) => {
  const list = (Array.isArray(filePathOrPaths) ? filePathOrPaths : [filePathOrPaths]).filter(
    (p) => typeof p === 'string' && fs.existsSync(p),
  )
  if (!list.length) return
  const iconPath = resolveResource('assets', 'icon-32.png')
  let icon = iconPath
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty()
  // Empty icons make startDrag fail silently on some Windows builds.
  if (icon.isEmpty()) {
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKElEQVQ4T2NkYGD4z0ABYBzVMKoBBkYGBgYGRkZGRgYGBgYGBgYGAAB/QAGH0b6bUQAAAABJRU5ErkJggg==',
    )
  }
  try {
    // Electron typings require `file`; when `files` is set it overrides `file`.
    event.sender.startDrag({
      file: list[0]!,
      files: list.length > 1 ? list : undefined,
      icon,
    })
  } catch (err) {
    console.error('[iso-maker] startDrag failed', list, err)
  }
})

ipcMain.handle('prefs:setLocale', async (_event, locale?: string) => {
  if (locale === 'ko' || locale === 'en') appLocale = locale
  return { ok: true }
})
