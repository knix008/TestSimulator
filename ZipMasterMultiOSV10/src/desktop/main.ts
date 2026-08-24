import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  type IpcMainInvokeEvent
} from 'electron'
import * as path from 'node:path'
import * as fsp from 'node:fs/promises'
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
        {
          name: '압축 파일',
          extensions: [
            'zip', '7z', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'tbz2', 'xz', 'txz', 'lzma', 'cab', 'iso', '001'
          ]
        },
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

  ipcMain.handle('dialog:pickDir', async (_e, defaultPath?: string): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: '압축을 풀 폴더 선택',
      defaultPath: defaultPath || undefined,
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

  // 진행 중인 압축/해제 취소.
  ipcMain.on('archive:cancel', () => backend.requestCancel())

  // 결과물 위치 열기: 폴더면 그 폴더를, 파일이면 파일이 든 폴더를 연다(파일은 선택 표시도).
  ipcMain.handle('shell:reveal', async (_e, target: string) => {
    try {
      const st = await fsp.stat(target)
      if (st.isDirectory()) {
        await shell.openPath(target)
      } else {
        // 포함 폴더를 열고(확실히 창이 뜨도록) 파일도 선택 표시.
        await shell.openPath(path.dirname(target))
        shell.showItemInFolder(target)
      }
    } catch {
      // stat 실패 시 상위 폴더라도 연다.
      await shell.openPath(path.dirname(target)).catch(() => {})
    }
  })

  // 압축 저장 경로 계산(팝업에서 지정한 폴더 + 이름 → 충돌 회피된 전체 경로).
  ipcMain.handle(
    'archive:resolvePath',
    async (_e, args: { dir: string; baseName: string; format: string }) =>
      backend.resolveCompressPath(args.dir, args.baseName, args.format as CompressOptions['format'])
  )

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
  ipcMain.handle('fs:rename', async (_e, args: { target: string; newName: string }) =>
    backend.renamePath(args.target, args.newName)
  )

  // ---- 탐색기 → OS 로 드래그(파일 내보내기) ----
  // startDrag 는 비어있지 않은 아이콘을 요구하므로 1x1 투명 PNG 를 16x16 으로 확대해 사용.
  const dragIcon = nativeImage
    .createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII='
    )
    .resize({ width: 16, height: 16 })
  ipcMain.on('fs:startDrag', (e, filePaths: string[]) => {
    const files = (Array.isArray(filePaths) ? filePaths : [filePaths]).filter(Boolean)
    if (files.length === 0) return
    // file(단일) + files(다중) 을 함께 지정해 여러 항목을 OS 로 내보낼 수 있게 한다.
    e.sender.startDrag({ file: files[0], files, icon: dragIcon })
  })

  // 복사한 파일/폴더를 OS 클립보드에 올려 프로그램 밖(탐색기 등)에 붙여넣기 가능하게 한다.
  // Windows: CF_HDROP(DROPFILES 구조) 형식. 그 외 플랫폼은 경로 텍스트로 폴백.
  ipcMain.on('clipboard:copyFiles', (_e, paths: string[]) => {
    const list = (paths ?? []).filter(Boolean)
    if (list.length === 0) return
    if (process.platform === 'win32') {
      // DROPFILES 헤더(20바이트): pFiles=20, pt(0,0), fNC=0, fWide=1
      const header = Buffer.alloc(20)
      header.writeUInt32LE(20, 0)
      header.writeUInt32LE(1, 16)
      // 파일 경로들을 UTF-16LE, 각 경로 null 종료 + 목록 끝 이중 null
      const filesBuf = Buffer.from(list.join('\0') + '\0\0', 'ucs2')
      try {
        clipboard.writeBuffer('CF_HDROP', Buffer.concat([header, filesBuf]))
        return
      } catch {
        /* 폴백: 텍스트 */
      }
    }
    clipboard.writeText(list.join('\n'))
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
