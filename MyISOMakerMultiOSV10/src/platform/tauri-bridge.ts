/**
 * `window.isoMaker` on Tauri — the same API the Electron preload exposed, so
 * App.tsx did not have to change. Calls go to src-tauri/src/lib.rs:
 *   ipc(ch, args)       → the Node host (host/host.ts), channel names as before
 *   pick / open_path / start_file_drag / set_locale / close_*   → Rust
 * Host events arrive as the `host-event` event ({ ch, p }).
 *
 * Files dragged in from Explorer: Tauri owns the window's drop target, so the
 * page gets no HTML5 drop with paths. The webview's drag-drop events are passed
 * on as a `isomaker-native-drop` window event ({ type, paths, x, y } in CSS px);
 * IsoTreeView turns them into its folder drop targets.
 */
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { IsoMakerApi } from '../vite-env'

export type NativeDropDetail = {
  type: 'enter' | 'over' | 'drop' | 'leave'
  paths: string[]
  x: number
  y: number
}

export const NATIVE_DROP_EVENT = 'isomaker-native-drop'

type Filters = { name: string; extensions: string[] }[] | undefined

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function call<T>(ch: string, ...args: unknown[]): Promise<T> {
  return invoke<T>('ipc', { ch, args })
}

type Listener = (payload: any) => void
const listeners = new Map<string, Set<Listener>>()

function on(ch: string, fn: Listener): () => void {
  if (!listeners.has(ch)) listeners.set(ch, new Set())
  listeners.get(ch)!.add(fn)
  return () => {
    listeners.get(ch)?.delete(fn)
  }
}

function dispatch(ch: string, payload: unknown): void {
  for (const fn of listeners.get(ch) ?? []) {
    try {
      fn(payload)
    } catch (err) {
      console.error('[isomaker] listener failed', ch, err)
    }
  }
}

function pick<T>(kind: 'file' | 'files' | 'dir' | 'save', opts: {
  title?: string
  filters?: Filters
  hintPath?: string | null
  fileName?: string | null
}): Promise<T> {
  return invoke<T>('pick', {
    options: {
      kind,
      title: opts.title ?? null,
      filters: opts.filters?.length ? opts.filters : null,
      hintPath: opts.hintPath || null,
      fileName: opts.fileName || null,
    },
  })
}

export function installTauriBridge(): void {
  if (!isTauri() || window.isoMaker) return

  void listen<{ ch: string; p: unknown }>('host-event', (event) => {
    dispatch(event.payload.ch, event.payload.p)
  })

  // Native file drops → page event in CSS pixels.
  void getCurrentWebview().onDragDropEvent((event) => {
    const p = event.payload as {
      type: NativeDropDetail['type']
      paths?: string[]
      position?: { x: number; y: number }
    }
    const scale = window.devicePixelRatio || 1
    const detail: NativeDropDetail = {
      type: p.type,
      paths: p.paths ?? [],
      x: (p.position?.x ?? -1) / scale,
      y: (p.position?.y ?? -1) / scale,
    }
    window.dispatchEvent(new CustomEvent(NATIVE_DROP_EVENT, { detail }))
  })

  // The window title follows document.title (App marks unsaved changes with "*").
  const win = getCurrentWindow()
  let lastTitle = ''
  const syncTitle = () => {
    if (document.title && document.title !== lastTitle) {
      lastTitle = document.title
      void win.setTitle(document.title).catch(() => {})
    }
  }
  new MutationObserver(syncTitle).observe(document.head, {
    subtree: true,
    childList: true,
    characterData: true,
  })
  // Title bar colours follow the app theme.
  const syncTheme = () => {
    const theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
    void win.setTheme(theme).catch(() => {})
  }
  new MutationObserver(syncTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
  syncTheme()

  const api: IsoMakerApi = {
    getEngineInfo: () => call('engine:info'),
    openFile: (filters, hintPath, title) => pick('file', { filters, hintPath, title }),
    openFiles: async (filters, hintPath, title) =>
      (await pick<string[] | null>('files', { filters, hintPath, title })) ?? [],
    openDirectory: (hintPath, title) => pick('dir', { hintPath, title }),
    saveFile: (defaultPath, hintPath, title, filters) =>
      pick('save', {
        filters,
        hintPath: hintPath ?? defaultPath,
        fileName: defaultPath || 'output.iso',
        title,
      }),
    openPath: (target) => invoke<string>('open_path', { target }),
    extractIso: (options) => call('iso:extract', options),
    createIso: (options) => call('iso:create', options),
    createBootableIso: (options) => call('iso:createBootable', options),
    createAppImage: (options) => call('iso:createAppImage', options),
    cancelJob: () => call('iso:cancel'),
    mountIso: (isoPath) => call('iso:mount', isoPath),
    unmountIso: (target) => call('iso:unmount', target),
    listIsoTree: (isoPath) => call('iso:listTree', isoPath),

    openEditSession: (isoPath) => call('session:open', isoPath),
    getEditSession: () => call('session:get'),
    closeEditSession: () => call('session:close'),
    addPathsToSession: (destDir, filePaths) => call('session:addPaths', destDir, filePaths),
    removeFromSession: (entryPath) => call('session:remove', entryPath),
    removeManyFromSession: (entryPaths) => call('session:removeMany', entryPaths),
    mkdirInSession: (dirPath, name) => call('session:mkdir', dirPath, name),
    renameInSession: (entryPath, newName) => call('session:rename', entryPath, newName),
    exportFileFromSession: (entryPath, outputPath) =>
      call('session:exportFile', entryPath, outputPath),
    exportFilesToDirectory: (entryPaths, outputDir) =>
      call('session:exportFilesToDir', entryPaths, outputDir),
    prepareDragOut: (entryPath) => call('session:prepareDragOut', entryPath),
    prepareDragOutMany: (entryPaths) => call('session:prepareDragOutMany', entryPaths),
    saveEditSession: (outputPath) => call('session:save', outputPath),
    isEditDirty: () => call('session:isDirty'),
    startDrag: (filePathOrPaths) => {
      const paths = Array.isArray(filePathOrPaths) ? filePathOrPaths : [filePathOrPaths]
      void invoke('start_file_drag', { paths }).catch((err) =>
        console.error('[isomaker] start_file_drag failed', err),
      )
    },
    // Tauri gives dropped files no path; drops arrive via NATIVE_DROP_EVENT instead.
    getPathForFile: () => '',
    nativeDrop: true,

    setLocale: async (locale) => {
      await invoke('set_locale', { locale })
      return { ok: true }
    },
    onProgress: (handler) => on('job:progress', handler),
    onNavigate: (handler) => on('menu:navigate', handler),
    onPrefs: (handler) => on('menu:prefs', handler),
    onSessionUpdated: (handler) => on('session:updated', handler),
    onCloseRequest: (handler) => on('app:close-request', () => handler()),
    onHostError: (handler) => on('host:error', handler),
    fsPlaces: () => call('fs:places'),
    fsList: (dir) => call('fs:list', dir),
    fsStat: (p) => call('fs:stat', p),
    packageStatus: () => call('pkg:status'),
    missingRequiredPackages: () => call('pkg:missingRequired'),
    runPackage: (id, action) => call('pkg:run', id, action),
    cancelPackage: () => call('pkg:cancel'),
    onPackageProgress: (handler) => on('pkg:progress', handler),
    ackCloseRequest: async () => {
      await invoke('close_ack')
      return { ok: true }
    },
    decideClose: async (decision) => {
      await invoke('close_decision', { decision })
      return { ok: true }
    },
  }
  window.isoMaker = api
}
