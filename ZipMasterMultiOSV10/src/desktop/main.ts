import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, type IpcMainInvokeEvent } from 'electron'
import * as path from 'node:path'
import type {
  CompressOptions,
  ExtractOptions,
  InputSource,
  Progress
} from '@core/types'
import { extensionFor } from '@core/format'
import * as backend from './backend'

const isDev = !!process.env['ELECTRON_RENDERER_URL']

function createWindow() {
  const win = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 980,
    minHeight: 600,
    backgroundColor: '#1e1e1e',
    title: 'ZipMaster',
    // 커스텀 타이틀바 사용 → 기본 프레임 제거
    frame: false,
    icon: path.join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (isDev) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']!)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  return win
}

/** 진행률을 요청한 렌더러로 전달하는 콜백 생성. */
function progressSender(event: IpcMainInvokeEvent): (p: Progress) => void {
  return (p: Progress) => {
    if (!event.sender.isDestroyed()) event.sender.send('archive:progress', p)
  }
}

app.whenReady().then(() => {
  // 기본 Electron 메뉴 제거
  Menu.setApplicationMenu(null)

  // ---- 창 제어 & 앱 정보 ----
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.on('win:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.on('win:maximize', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  ipcMain.on('win:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())

  // ---- 파일 선택 다이얼로그 ----
  ipcMain.handle('dialog:pickInputs', async (_e, kind: 'files' | 'folder'): Promise<InputSource[]> => {
    const result = await dialog.showOpenDialog({
      title: kind === 'folder' ? '압축할 폴더 선택' : '압축할 파일 선택',
      properties: kind === 'folder' ? ['openDirectory'] : ['openFile', 'multiSelections']
    })
    if (result.canceled) return []
    return result.filePaths.map((p) => ({
      path: p,
      entryName: path.basename(p),
      isDirectory: kind === 'folder'
    }))
  })

  ipcMain.handle('dialog:pickArchive', async (): Promise<InputSource | null> => {
    const result = await dialog.showOpenDialog({
      title: '해제할 아카이브 선택',
      properties: ['openFile'],
      filters: [
        { name: '압축 파일', extensions: ['zip', '7z', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'tbz2', '001'] },
        { name: '모든 파일', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const p = result.filePaths[0]
    return { path: p, entryName: path.basename(p) }
  })

  ipcMain.handle(
    'dialog:pickSave',
    async (_e, args: { format: string; defaultName?: string }): Promise<string | null> => {
      const { format, defaultName } = args
      const ext = extensionFor(format as any)
      const base = (defaultName ?? '').trim() || 'archive'
      const result = await dialog.showSaveDialog({
        title: '저장할 아카이브 이름',
        defaultPath: `${base}${ext}`,
        filters: [{ name: format.toUpperCase(), extensions: [ext.replace(/^\./, '')] }]
      })
      return result.canceled || !result.filePath ? null : result.filePath
    }
  )

  ipcMain.handle('dialog:pickDir', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: '압축을 풀 폴더 선택',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  // ---- 아카이브 작업 ----
  ipcMain.handle(
    'archive:compress',
    async (
      event,
      args: { inputs: InputSource[]; outPath: string; opts: CompressOptions }
    ) => backend.compress(args.inputs, args.outPath, args.opts, progressSender(event))
  )

  ipcMain.handle(
    'archive:extract',
    async (
      event,
      args: { archivePath: string; outDir: string; opts: ExtractOptions }
    ) => backend.extract(args.archivePath, args.outDir, args.opts, progressSender(event))
  )

  ipcMain.handle('archive:list', async (_e, archivePath: string) => backend.listEntries(archivePath))

  // ---- 파일 시스템 탐색 ----
  ipcMain.handle('fs:listDrives', async () => backend.listDrives())
  ipcMain.handle('fs:listDir', async (_e, dirPath: string) => backend.listDir(dirPath))

  // ---- 파일 조작(삭제/복사/이동) ----
  // 삭제는 복구 가능하도록 휴지통으로 이동.
  ipcMain.handle('fs:delete', async (_e, target: string) => {
    await shell.trashItem(target)
  })
  ipcMain.handle('fs:copy', async (_e, args: { src: string; destDir: string }) =>
    backend.copyPath(args.src, args.destDir)
  )
  ipcMain.handle('fs:move', async (_e, args: { src: string; destDir: string }) =>
    backend.movePath(args.src, args.destDir)
  )

  // ---- 탐색기 → OS 로 드래그(파일 내보내기) ----
  // startDrag 는 비어있지 않은 아이콘을 요구하므로 1x1 투명 PNG 를 16x16 으로 확대해 사용.
  const dragIcon = nativeImage
    .createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII='
    )
    .resize({ width: 16, height: 16 })
  ipcMain.on('fs:startDrag', (e, filePath: string) => {
    e.sender.startDrag({ file: filePath, icon: dragIcon })
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
