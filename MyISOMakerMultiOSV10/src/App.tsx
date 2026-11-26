import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { EngineInfo, JobProgress } from '../host/iso/types'
import { ContextMenu, type ContextMenuItem } from './components/ContextMenu'
import { ConfirmDialog, Dialog, DialogButton, PromptDialog } from './components/Dialog'
import { IsoTreeView } from './components/IsoTreeView'
import { usePrefs } from './i18n/Preferences'
import {
  discImageFileFilters,
  editedImageName,
  guessImageKindByName,
  saveImageFileFilters,
} from './iso9660/image-formats'
import type { IsoTreeNode } from './iso9660/tree-types'
import { END_LEAD, Icons, Toolbar, type ToolbarAction } from './Toolbar'
import { APP_VERSION } from './version'
import type { EditSessionSnapshot, IsoMakerApi } from './vite-env'
import { StartScreen } from './start/StartScreen'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauri } from './platform/tauri-bridge'
import { defaultOutputFor, volumeLabelFor } from './lib/names'
import { loadBgPrefs, saveBgPrefs, type BgPrefs } from './start/bgPrefs'
import type { SettingsTab } from './settings/SettingsView'
import { ThemeSplitButton } from './theme/ThemeMenu'
import { DockPanel, loadDock, saveDock, type DockState } from './layout/Panel'
import { Explorer } from './layout/Explorer'
import { InfoPanel, LogPanel, type LogEntry } from './layout/InfoLog'
import { Flag, WindowControls, TitleBrand } from './layout/TitleBar'
import { WorkEmpty } from './layout/WorkEmpty'
import {
  loadAutoInstall,
  PackageProgressDialog,
  usePackageStatus,
  type PackageAction,
  type PackageId,
  type PackageProgress,
} from './packages/packages'
import type { MessageKey } from './i18n/messages'
import {
  addRecent,
  clearRecent,
  loadRecent,
  loadShowOnStart,
  removeRecent,
  saveShowOnStart,
} from './start/recent'

const EMPTY_TREE: IsoTreeNode[] = []

type ChangeLogKind = 'info' | 'add' | 'out' | 'save' | 'error' | 'job'
type ChangeLogEntry = {
  id: number
  time: string
  kind: ChangeLogKind
  message: string
}

let changeLogSeq = 0

function getApi(): IsoMakerApi {
  const api = window.isoMaker
  if (!api) {
    throw new Error('Desktop bridge missing')
  }
  return api
}

type Tab = 'home' | 'extract' | 'create' | 'bootable' | 'mount'

export default function App() {
  const { t, locale, theme, setLocale, themeId, themeName } = usePrefs()
  const [bg, setBgState] = useState<BgPrefs>(() => loadBgPrefs())
  const setBg = useCallback((next: BgPrefs) => {
    setBgState(next)
    saveBgPrefs(next)
  }, [])
  const [autoInstall, setAutoInstallState] = useState(() => loadAutoInstall())
  const pkgs = usePackageStatus()
  const [pkgProgress, setPkgProgress] = useState<PackageProgress | null>(null)
  const [pkgRunning, setPkgRunning] = useState(false)
  const [pkgNote, setPkgNote] = useState('')
  const ownPkgRun = useRef(false)
  const [tab, setTab] = useState<Tab>(() => (loadShowOnStart() ? 'home' : 'extract'))
  const [recent, setRecent] = useState(() => loadRecent())
  const [showOnStart, setShowOnStart] = useState(() => loadShowOnStart())
  const [engine, setEngine] = useState<EngineInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [cancelable, setCancelable] = useState(false)
  const [progress, setProgress] = useState<JobProgress | null>(null)
  const [statusNote, setStatusNote] = useState('')
  const [error, setError] = useState<string>('')
  const [errorOpen, setErrorOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const [isoPath, setIsoPath] = useState('')
  const [sourceDir, setSourceDir] = useState('')
  const [outputIso, setOutputIsoState] = useState('')
  /** The output name still follows the source (the user has not typed or picked one). */
  const outputAuto = useRef(true)
  const volumeAuto = useRef(true)
  const setOutputIso = (p: string) => {
    outputAuto.current = !p
    setOutputIsoState(p)
  }
  /** Source folder (or file) for Create / Bootable: the output ISO and volume label follow its name until changed. */
  // Create tab: ISO or AppImage (remembered)
  const [createFormat, setCreateFormatState] = useState<'iso' | 'appimage'>(() => {
    try {
      return localStorage.getItem('isomaker.createFormat') === 'appimage' ? 'appimage' : 'iso'
    } catch {
      return 'iso'
    }
  })
  const [appName, setAppName] = useState('')
  const appNameAuto = useRef(true)
  const extFor = (f: 'iso' | 'appimage') => (f === 'appimage' ? 'AppImage' : 'iso')
  const chooseSource = (dir: string) => {
    setSourceDir(dir)
    if (outputAuto.current) setOutputIsoState(defaultOutputFor(dir, extFor(createFormat)))
    if (volumeAuto.current) setVolumeLabel(volumeLabelFor(dir))
    if (appNameAuto.current) setAppName(dir.trim().replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? '')
  }
  const setCreateFormat = (f: 'iso' | 'appimage') => {
    setCreateFormatState(f)
    try {
      localStorage.setItem('isomaker.createFormat', f)
    } catch {
      /* no storage */
    }
    if (outputAuto.current && sourceDir) setOutputIsoState(defaultOutputFor(sourceDir, extFor(f)))
    else setOutputIsoState((cur) => cur.replace(/\.(iso|AppImage)$/i, `.${extFor(f)}`))
  }
  const [volumeLabel, setVolumeLabel] = useState('ISOMAKER')
  const [biosBootImage, setBiosBootImage] = useState('boot/grub/i386-pc/eltorito.img')
  const [efiBootImage, setEfiBootImage] = useState('EFI/BOOT/efiboot.img')
  const [isohybridMbr, setIsohybridMbr] = useState('')
  const [useBios, setUseBios] = useState(true)
  const [useEfi, setUseEfi] = useState(true)
  const [mountIsoPath, setMountIsoPath] = useState('')
  const [mountPoint, setMountPoint] = useState('')
  const [session, setSession] = useState<EditSessionSnapshot | null>(null)
  const [treeLoading, setTreeLoading] = useState(false)
  const [pendingOpenPath, setPendingOpenPath] = useState<string | null>(null)
  const [unsavedReason, setUnsavedReason] = useState<'open' | 'close' | 'closeImage' | null>(null)
  const [changeLog, setChangeLog] = useState<ChangeLogEntry[]>([])
  const [dock, setDockState] = useState<DockState>(() => loadDock())
  const setDock = useCallback((patch: Partial<DockState>, persist = true) => {
    setDockState((prev) => {
      const next = { ...prev, ...patch }
      if (persist) saveDock(next)
      return next
    })
  }, [])
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)
  const openMenu = useCallback((x: number, y: number, items: ContextMenuItem[]) => setMenu({ x, y, items }), [])
  const [explorerReload, setExplorerReload] = useState(0)
  const measuredMin = useRef(0)
  const lastWorkTab = useRef<Exclude<Tab, 'home'>>('extract')
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [treeReveal, setTreeReveal] = useState<{ paths: string[]; nonce: number } | null>(
    null,
  )
  const [promptDlg, setPromptDlg] = useState<
    | null
    | {
        mode: 'mkdir' | 'rename'
        destDir: string
        node?: IsoTreeNode
        defaultValue: string
      }
  >(null)
  const [confirmDlg, setConfirmDlg] = useState<null | { paths: string[] }>(null)
  const [ctxMenu, setCtxMenu] = useState<{
    x: number
    y: number
    node: IsoTreeNode | null
    selectedPaths: string[]
  } | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)

  const dirty = Boolean(session?.dirty)

  useEffect(() => {
    if (tab !== 'home') lastWorkTab.current = tab
  }, [tab])

  /** Start button: shows the start screen, pressed again goes back to the work view. */
  function toggleHome() {
    setTab((cur) => (cur === 'home' ? lastWorkTab.current : 'home'))
  }

  const appendChangeLog = useCallback((kind: ChangeLogKind, message: string) => {
    const entry: ChangeLogEntry = {
      id: ++changeLogSeq,
      time: formatLogTime(new Date()),
      kind,
      message,
    }
    setChangeLog((prev) => [...prev, entry].slice(-300))
  }, [])


  function showError(message: string) {
    setError(message)
    setCopied(false)
    setErrorOpen(true)
    appendChangeLog('error', t('logError', message))
  }

  function applySession(snap: EditSessionSnapshot | null, status?: string) {
    setSession(snap)
    if (snap) {
      setIsoPath(snap.sourcePath)
      setMountIsoPath(snap.sourcePath)
      setStatusNote(
        status ??
          (snap.dirty
            ? t('statusDirty')
            : t('isoTreeSummary', String(snap.entryCount), formatBytes(snap.totalBytes))),
      )
    }
  }

  useEffect(() => {
    const api = window.isoMaker
    return api?.onPackageProgress?.((p) => {
      if (ownPkgRun.current) setPkgProgress(p)
      if (p.phase === 'done') void api.getEngineInfo().then(setEngine, () => {})
    })
  }, [])

  async function runPackage(id: PackageId, action: PackageAction, note = '') {
    const api = window.isoMaker
    if (!api?.runPackage || pkgRunning) return
    setPkgNote(note)
    setPkgProgress({ id, action, phase: 'index', percent: null, message: '' })
    setPkgRunning(true)
    ownPkgRun.current = true
    const name = t(`pkg_${id}` as MessageKey)
    try {
      pkgs.setList(await api.runPackage(id, action))
      appendChangeLog('job', action === 'remove' ? t('pkgDoneRemove', name) : t('pkgDoneInstall', name))
      void api.getEngineInfo().then(setEngine, () => {})
    } catch (err) {
      const message = cleanIpcError(err)
      if (message !== 'PKG_CANCELED') appendChangeLog('error', t('pkgFailed', name, message))
      void pkgs.refresh()
    } finally {
      setPkgRunning(false)
      ownPkgRun.current = false
    }
  }

  // The Settings window saved something: follow at once.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === 'isomaker.showStartOnLaunch') setShowOnStart(loadShowOnStart())
      if (!e.key || e.key === 'isomaker.autoInstallPackages') setAutoInstallState(loadAutoInstall())
      if (!e.key || e.key === 'isomaker.startBackground') setBgState(loadBgPrefs())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Required packages that are missing are installed at startup (Settings > General).
  // The window's minimum width: both toolbar rows fit on one line, nothing hidden.
  useLayoutEffect(() => {
    const measure = () => {
      const w = (sel: string) => document.querySelector<HTMLElement>(sel)?.getBoundingClientRect().width ?? 0
      const sw = (sel: string) => document.querySelector<HTMLElement>(sel)?.scrollWidth ?? 0
      // Title row: icon·name·version, a little drag room, the panel buttons, the window buttons.
      const title = w('.titlebar .title-brand') + 40 + w('.titlebar .titlebar-actions') + w('.titlebar .window-controls') + 10 + 16
      // Tool row: every tool group (natural width), a gap, the right-hand group.
      const tools = sw('.app > .toolbar .toolbar-main') + 24 + w('.app > .toolbar .toolbar-end') + 20
      const need = Math.ceil(Math.max(title, tools) + 8)
      if (need > 300 && need !== measuredMin.current) {
        measuredMin.current = need
        if (isTauri()) void invoke('set_min_width', { width: need }).catch(() => {})
      }
    }
    measure()
    const timer = window.setTimeout(measure, 400)
    return () => window.clearTimeout(timer)
  }, [locale, themeId, tab, Boolean(session), dirty])

  const autoInstallDone = useRef(false)
  useEffect(() => {
    if (autoInstallDone.current || !autoInstall) return
    autoInstallDone.current = true
    const api = window.isoMaker
    if (!api?.missingRequiredPackages) return
    void (async () => {
      try {
        const missing = await api.missingRequiredPackages!()
        for (const id of missing) {
          await runPackage(id, 'install', t('pkgAuto', t(`pkg_${id}` as MessageKey)))
        }
      } catch {
        /* host not ready: Settings > Packages can still install */
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Help, Settings and About are windows of their own (tool.html). */
  function openTool(kind: 'help' | 'settings' | 'about', route?: string) {
    if (!isTauri()) return
    void invoke('open_tool_window', { kind, route: route ?? kind }).catch((err) => showError(String(err)))
  }
  function openSettings(tab: SettingsTab = 'general') {
    openTool('settings', `settings:${tab}`)
  }
  const setHelpOpen = (open: boolean) => open && openTool('help')
  const setAboutOpen = (open: boolean) => open && openTool('about')

  useEffect(() => {
    document.title = dirty ? `${t('brand')} *` : t('brand')
  }, [dirty, t])

  useEffect(() => {
    const api = window.isoMaker
    if (!api) {
      setError(t('preloadError'))
      setCopied(false)
      setErrorOpen(true)
      return
    }
    void api.getEngineInfo().then(setEngine, (err) => showError(cleanIpcError(err)))
    const offHostError = api.onHostError?.((message) => showError(String(message)))
    const offProgress = api.onProgress((p) => {
      setProgress(p)
      if (p.message) setStatusNote(p.message.trim())
    })
    const offNavigate = api.onNavigate((next) => {
      if (next === 'home' || next === 'extract' || next === 'create' || next === 'bootable' || next === 'mount') {
        setTab(next)
      }
    })
    const offSession = api.onSessionUpdated?.((snap) => {
      applySession(snap)
    })
    const offClose = api.onCloseRequest?.(() => {
      void api.ackCloseRequest?.()
      setPendingOpenPath(null)
      setUnsavedReason('close')
    })
    return () => {
      offHostError?.()
      offProgress()
      offNavigate()
      offSession?.()
      offClose?.()
    }
  }, [t])

  async function loadIsoSession(path: string) {
    setTreeLoading(true)
    setStatusNote(t('statusTreeLoading'))
    try {
      const snap = await getApi().openEditSession(path)
      setChangeLog([])
      setSelectedPaths([])
      setTreeReveal(null)
      setCtxMenu(null)
      setUnsavedReason(null)
      applySession(snap)
      appendChangeLog('info', t('logOpened', path))
      setRecent(addRecent(path))
      setTab('extract')
    } catch (err) {
      applySession(null)
      const message = cleanIpcError(err)
      setStatusNote(message)
      showError(message)
    } finally {
      setTreeLoading(false)
    }
  }

  async function openIsoFile() {
    const p = await getApi().openFile(
      discImageFileFilters(locale === 'en' ? 'en' : 'ko'),
      isoPath || mountIsoPath,
      t('dlgOpenIso'),
    )
    if (!p) return
    if (dirty) {
      setPendingOpenPath(p)
      setUnsavedReason('open')
      return
    }
    await loadIsoSession(p)
  }

  /** Start screen › Recent images. */
  async function openRecentImage(p: string) {
    if (dirty) {
      setPendingOpenPath(p)
      setUnsavedReason('open')
      return
    }
    await loadIsoSession(p)
  }

  /** Close the open image (asks first when it has unsaved changes); the empty main view shows again. */
  function closeImage() {
    if (!session) return
    if (dirty) {
      setPendingOpenPath(null)
      setUnsavedReason('closeImage')
      return
    }
    void doCloseImage()
  }

  async function doCloseImage() {
    const was = session?.sourcePath ?? ''
    try {
      await getApi().closeEditSession()
    } catch (err) {
      showError(cleanIpcError(err))
      return
    }
    applySession(null)
    setSelectedPaths([])
    setTreeReveal(null)
    setCtxMenu(null)
    setIsoPath('')
    setStatusNote(t('statusClosed'))
    if (was) appendChangeLog('info', t('logClosed', was))
    setTab((cur) => (cur === 'home' ? cur : 'extract'))
  }

  async function recheckEngine() {
    setEngine(null)
    try {
      setEngine(await getApi().getEngineInfo())
    } catch (err) {
      showError(cleanIpcError(err))
    }
  }

  async function saveIsoAs(): Promise<boolean> {
    if (!session) return false
    const defaultName = editedImageName(pathBaseName(session.sourcePath))
    const preferred = session.sourceKind ?? guessImageKindByName(session.sourcePath)
    const lang = locale === 'en' ? 'en' : 'ko'
    const out = await getApi().saveFile(
      defaultName,
      session.sourcePath,
      t('dlgSaveIso'),
      saveImageFileFilters(lang, preferred),
    )
    if (!out) return false
    setBusy(true)
    setCancelable(true)
    setStatusNote(t('jobStart', t('saveIso')))
    try {
      const snap = await getApi().saveEditSession(out)
      applySession(snap, `${t('statusSaved')}: ${out}`)
      appendChangeLog('save', t('logSaved', out))
      return true
    } catch (err) {
      const message = cleanIpcError(err)
      if (isCanceledJobMessage(message)) {
        setStatusNote(t('jobCanceled'))
        appendChangeLog('job', t('jobCanceled'))
        return false
      }
      setStatusNote(message)
      showError(message)
      return false
    } finally {
      setCancelable(false)
      setBusy(false)
    }
  }

  /** Select + expand + scroll newly added tree entries into view. */
  function focusTreeEntries(entryPaths: string[]) {
    const paths = entryPaths.filter(Boolean)
    if (!paths.length) return
    setSelectedPaths(paths)
    setTreeReveal({ paths, nonce: Date.now() })
  }

  function treePathsForAdded(destDir: string, diskPaths: string[]): string[] {
    return diskPaths.map((p) =>
      destDir ? `${destDir}/${pathBaseName(p)}` : pathBaseName(p),
    )
  }

  async function onDropFiles(destDir: string, files: File[]) {
    if (!session) return
    const paths = files
      .map((f) => getApi().getPathForFile(f))
      .filter((p): p is string => Boolean(p))
    if (!paths.length) {
      // Tauri delivers OS drops with their paths through onDropPaths instead.
      if (!getApi().nativeDrop) showError(t('dropNoPath'))
      return
    }
    await onDropPaths(destDir, paths)
  }

  async function onDropPaths(destDir: string, paths: string[]) {
    if (!session || !paths.length) return
    try {
      const snap = await getApi().addPathsToSession(destDir, paths)
      applySession(snap, t('statusAdded', String(paths.length)))
      focusTreeEntries(treePathsForAdded(destDir, paths))
      const where = destDir || '/'
      if (paths.length === 1) {
        appendChangeLog('add', t('logAdded', where, pathBaseName(paths[0]!)))
      } else {
        appendChangeLog('add', t('logAddedMany', where, String(paths.length)))
        for (const p of paths.slice(0, 20)) {
          appendChangeLog('add', `  · ${pathBaseName(p)}`)
        }
        if (paths.length > 20) {
          appendChangeLog('add', `  · … +${paths.length - 20}`)
        }
      }
    } catch (err) {
      showError(cleanIpcError(err))
    }
  }

  async function onPrepareDragOut(entryPaths: string[]): Promise<string[]> {
    if (!session || !entryPaths.length) return entryPaths.map(() => '')
    const temps: string[] = []
    for (const entryPath of entryPaths) {
      try {
        const prepared = await getApi().prepareDragOut(entryPath)
        temps.push(prepared.tempPath || '')
      } catch (err) {
        const message = cleanIpcError(err)
        // Ignore stale hover after session close / main reload.
        if (/열린 ISO|NO_SESSION|No ISO session/i.test(message)) {
          temps.push('')
          continue
        }
        setStatusNote(message)
        appendChangeLog('error', t('logError', message))
        temps.push('')
      }
    }
    return temps
  }

  function parentOf(entryPath: string): string {
    const parts = entryPath.split('/').filter(Boolean)
    return parts.slice(0, -1).join('/')
  }

  function findTreeNodes(paths: string[]): IsoTreeNode[] {
    const want = new Set(paths)
    const found: IsoTreeNode[] = []
    const walk = (list: IsoTreeNode[]) => {
      for (const n of list) {
        if (want.has(n.path)) found.push(n)
        if (n.children?.length) walk(n.children)
      }
    }
    walk(session?.root ?? EMPTY_TREE)
    return found
  }

  async function ctxExtractFiles(fileNodes: IsoTreeNode[]) {
    if (!fileNodes.length) return
    if (fileNodes.length === 1) {
      const node = fileNodes[0]!
      const out = await getApi().saveFile(node.name, session?.sourcePath, t('dlgExportFile'))
      if (!out) return
      try {
        await getApi().exportFileFromSession(node.path, out)
        appendChangeLog('out', t('logExported', node.path, out))
        setStatusNote(t('logExported', node.path, out))
      } catch (err) {
        showError(cleanIpcError(err))
      }
      return
    }
    const dir = await getApi().openDirectory(session?.sourcePath, t('dlgExportDir'))
    if (!dir) return
    try {
      const result = await getApi().exportFilesToDirectory(
        fileNodes.map((n) => n.path),
        dir,
      )
      appendChangeLog('out', t('logExportedMany', String(result.count), result.outputDir))
      setStatusNote(t('logExportedMany', String(result.count), result.outputDir))
    } catch (err) {
      showError(cleanIpcError(err))
    }
  }

  async function ctxAddFiles(destDir: string) {
    const title = destDir ? t('dlgAddFilesTo', destDir) : t('dlgAddFiles')
    const paths = await getApi().openFiles(undefined, session?.sourcePath, title)
    if (!paths.length) return
    try {
      const snap = await getApi().addPathsToSession(destDir, paths)
      applySession(snap, t('statusAdded', String(paths.length)))
      focusTreeEntries(treePathsForAdded(destDir, paths))
      appendChangeLog('add', t('logAddedMany', destDir || '/', String(paths.length)))
    } catch (err) {
      showError(cleanIpcError(err))
    }
  }

  function ctxNewFolder(destDir: string) {
    setPromptDlg({ mode: 'mkdir', destDir, defaultValue: '' })
  }

  function ctxRename(node: IsoTreeNode) {
    setPromptDlg({ mode: 'rename', destDir: parentOf(node.path), node, defaultValue: node.name })
  }

  function ctxDeleteMany(paths: string[]) {
    if (!paths.length) return
    setConfirmDlg({ paths: [...paths] })
  }

  async function applyMkdir(name: string) {
    if (!promptDlg || promptDlg.mode !== 'mkdir') return
    const destDir = promptDlg.destDir
    setPromptDlg(null)
    try {
      const snap = await getApi().mkdirInSession(destDir, name)
      const created = destDir ? `${destDir}/${name}` : name
      applySession(snap, t('logMkdir', created))
      focusTreeEntries([created])
      appendChangeLog('add', t('logMkdir', created))
    } catch (err) {
      showError(cleanIpcError(err))
    }
  }

  async function applyRename(name: string) {
    if (!promptDlg || promptDlg.mode !== 'rename' || !promptDlg.node) return
    const node = promptDlg.node
    if (name === node.name) {
      setPromptDlg(null)
      return
    }
    setPromptDlg(null)
    try {
      const snap = await getApi().renameInSession(node.path, name)
      applySession(snap, t('logRenamed', node.path, name))
      appendChangeLog('info', t('logRenamed', node.path, name))
      const nextPath = parentOf(node.path) ? `${parentOf(node.path)}/${name}` : name
      setSelectedPaths([nextPath])
    } catch (err) {
      showError(cleanIpcError(err))
    }
  }

  async function applyDelete() {
    if (!confirmDlg?.paths.length) return
    const paths = confirmDlg.paths
    setConfirmDlg(null)
    try {
      const snap =
        paths.length === 1
          ? await getApi().removeFromSession(paths[0]!)
          : await getApi().removeManyFromSession(paths)
      applySession(
        snap,
        paths.length === 1
          ? t('logDeleted', paths[0]!)
          : t('logDeletedMany', String(paths.length)),
      )
      appendChangeLog(
        'info',
        paths.length === 1
          ? t('logDeleted', paths[0]!)
          : t('logDeletedMany', String(paths.length)),
      )
      setSelectedPaths([])
    } catch (err) {
      showError(cleanIpcError(err))
    }
  }

  async function extractSelectedTo(dir: string) {
    const files = findTreeNodes(selectedPaths).filter((n) => !n.isDir)
    if (!files.length) return
    try {
      const result = await getApi().exportFilesToDirectory(files.map((n) => n.path), dir)
      appendChangeLog('out', t('logExportedMany', String(result.count), result.outputDir))
      setStatusNote(t('logExportedMany', String(result.count), result.outputDir))
      setExplorerReload((n) => n + 1)
    } catch (err) {
      showError(cleanIpcError(err))
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setStatusNote(t('logCopied'))
    } catch {
      showError(t('logError', 'clipboard'))
    }
  }

  function logMenuItems(entry: LogEntry | null): ContextMenuItem[] {
    const all = changeLog.map((e) => `${e.time} [${e.kind}] ${e.message}`).join('\n')
    const items: ContextMenuItem[] = []
    if (entry) {
      items.push({ id: 'copy-line', label: t('logCopy'), icon: Icons.copy, onClick: () => void copyText(entry.message) })
    }
    items.push({ id: 'copy-all', label: t('logCopyAll'), icon: Icons.copy, disabled: !changeLog.length, onClick: () => void copyText(all) })
    items.push({ id: 'clear', label: t('logClear'), icon: Icons.clear, danger: true, disabled: !changeLog.length, onClick: () => setChangeLog([]) })
    items.push({ id: 'sep', label: '', separator: true })
    items.push({ id: 'hide', label: t('panelCollapse'), icon: Icons.close, onClick: () => setDock({ bottom: true }) })
    return items
  }

  function recentMenuItems(p: string): ContextMenuItem[] {
    return [
      { id: 'open', label: t('explorerOpenImage'), icon: Icons.openIso, disabled: busy, onClick: () => void openRecentImage(p) },
      {
        id: 'mount',
        label: t('explorerMount'),
        icon: Icons.mount,
        onClick: () => {
          setMountIsoPath(p)
          setTab('mount')
        },
      },
      { id: 'folder', label: t('explorerShowFolder'), icon: Icons.folder, onClick: () => void getApi().openPath(parentDir(p)) },
      { id: 'copy', label: t('ctxCopyPath'), icon: Icons.copy, onClick: () => void copyText(p) },
      { id: 'sep', label: '', separator: true },
      { id: 'remove', label: t('homeRecentRemove'), icon: Icons.close, danger: true, onClick: () => setRecent(removeRecent(p)) },
    ]
  }

  async function ctxCopyPath(pathValue: string) {
    try {
      await navigator.clipboard.writeText(pathValue || '/')
      appendChangeLog('info', t('logPathCopied', pathValue || '/'))
      setStatusNote(t('logPathCopied', pathValue || '/'))
    } catch {
      showError(t('logError', 'clipboard'))
    }
  }

  function buildContextMenuItems(
    node: IsoTreeNode | null,
    menuSelected: string[],
  ): ContextMenuItem[] {
    if (!session) return []
    const destDir = node ? (node.isDir ? node.path : parentOf(node.path)) : ''
    const targets = menuSelected.length
      ? findTreeNodes(menuSelected)
      : node
        ? [node]
        : []
    const fileTargets = targets.filter((n) => !n.isDir)
    const deletePaths = targets.map((n) => n.path)
    const items: ContextMenuItem[] = []

    if (fileTargets.length === 1) {
      items.push({
        id: 'extract',
        label: t('ctxExtract'),
        icon: Icons.exportFile,
        onClick: () => void ctxExtractFiles(fileTargets),
      })
    } else if (fileTargets.length > 1) {
      items.push({
        id: 'extract',
        label: t('ctxExtractMany', String(fileTargets.length)),
        icon: Icons.exportFile,
        onClick: () => void ctxExtractFiles(fileTargets),
      })
    }

    items.push({
      id: 'add',
      label: destDir ? t('ctxAddFilesTo', destDir) : t('ctxAddFiles'),
      icon: Icons.addFile,
      onClick: () => void ctxAddFiles(destDir),
    })
    items.push({
      id: 'mkdir',
      label: destDir ? t('ctxNewFolderIn', destDir) : t('ctxNewFolder'),
      icon: Icons.mkdir,
      onClick: () => void ctxNewFolder(destDir),
    })

    if (targets.length) {
      items.push({ id: 'sep1', label: '', separator: true })
      if (targets.length === 1) {
        items.push({
          id: 'rename',
          label: t('ctxRename'),
          icon: Icons.rename,
          onClick: () => void ctxRename(targets[0]!),
        })
      }
      items.push({
        id: 'delete',
        label:
          deletePaths.length === 1
            ? t('ctxDelete')
            : t('ctxDeleteMany', String(deletePaths.length)),
        icon: Icons.trash,
        danger: true,
        onClick: () => void ctxDeleteMany(deletePaths),
      })
      items.push({ id: 'sep2', label: '', separator: true })
      items.push({
        id: 'info',
        label: t('ctxShowInfo'),
        icon: Icons.info,
        onClick: () => {
          setSelectedPaths(targets.map((n) => n.path))
          setDock({ right: false })
        },
      })
      items.push({
        id: 'copy',
        label: t('ctxCopyPath'),
        icon: Icons.copy,
        onClick: () =>
          void ctxCopyPath(
            targets.length === 1 ? targets[0]!.path : targets.map((n) => n.path).join('\n'),
          ),
      })
    } else {
      items.push({ id: 'sep-close', label: '', separator: true })
      items.push({ id: 'close-image', label: t('closeImage'), icon: Icons.eject, onClick: closeImage })
      items.push({ id: 'sep-root', label: '', separator: true })
      items.push({
        id: 'copy-root',
        label: t('ctxCopyPath'),
        icon: Icons.copy,
        onClick: () => void ctxCopyPath('/'),
      })
    }

    return items
  }

  const engineBadge = useMemo(() => {
    if (!engine) return t('engineChecking')
    if (engine.available) {
      return `xorriso ${engine.version ?? ''} · ${engine.platform}`
    }
    return t('engineMissing')
  }, [engine, t])

  async function runJob(
    labelKey: 'jobCreate' | 'jobCreateAppImage' | 'jobBootable' | 'jobMount' | 'jobUnmount',
    fn: () => Promise<unknown>,
    options: { cancelable?: boolean } = {},
  ) {
    const label = t(labelKey)
    setBusy(true)
    setCancelable(Boolean(options.cancelable))
    setError('')
    setErrorOpen(false)
    setProgress({ phase: label, percent: 0, message: t('jobStart', label) })
    setStatusNote(t('jobStart', label))
    appendChangeLog('job', t('jobStart', label))
    try {
      await fn()
      setProgress({ phase: label, percent: 100, message: t('jobDone', label) })
      setStatusNote(t('jobDone', label))
      appendChangeLog('job', t('jobDone', label))
    } catch (err) {
      const message = cleanIpcError(err)
      if (isCanceledJobMessage(message)) {
        setProgress({ phase: label, percent: null, message: t('jobCanceled') })
        setStatusNote(t('jobCanceled'))
        appendChangeLog('job', t('jobCanceled'))
        return
      }
      setStatusNote(message)
      showError(message)
    } finally {
      setCancelable(false)
      setBusy(false)
    }
  }

  async function cancelCurrentJob() {
    if (!busy || !cancelable) return
    setCancelable(false)
    setStatusNote(t('cancelRequested'))
    appendChangeLog('job', t('cancelRequested'))
    try {
      await getApi().cancelJob()
    } catch (err) {
      const message = cleanIpcError(err)
      setStatusNote(message)
      showError(message)
    }
  }

  async function copyError() {
    try {
      await navigator.clipboard.writeText(error)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // fallback for restricted clipboard
      const ta = document.createElement('textarea')
      ta.value = error
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    }
  }

  function runCreate() {
    if (!sourceDir || !outputIso) return
    if (createFormat === 'appimage') {
      void runJob('jobCreateAppImage', async () => {
        const r = await getApi().createAppImage!({ sourceDir, output: outputIso, name: appName || undefined })
        appendChangeLog('save', t('logAppImageMade', outputIso, formatBytes(r.size)))
      })
      return
    }
    void runJob('jobCreate', () => getApi().createIso({ sourceDir, outputIso, volumeLabel }), { cancelable: true })
  }

  function runCurrentAction() {
    if (tab === 'extract') return
    if (tab === 'create') {
      if (!sourceDir || !outputIso) return
      runCreate()
      return
    }
    if (tab === 'bootable') {
      if (!sourceDir || !outputIso || (!useBios && !useEfi)) return
      void runJob(
        'jobBootable',
        () =>
          getApi().createBootableIso({
            sourceDir,
            outputIso,
            volumeLabel,
            biosBootImage: useBios ? biosBootImage : undefined,
            efiBootImage: useEfi ? efiBootImage : undefined,
            isohybridMbr: isohybridMbr || undefined,
          }),
        { cancelable: true },
      )
      return
    }
    const mountTarget = mountIsoPath || isoPath
    if (!mountTarget) return
    void runJob('jobMount', async () => {
      const result = await getApi().mountIso(mountTarget)
      if (!result.mounted) throw new Error(result.message)
      setMountPoint(result.mountPoint ?? '')
      if (result.mountPoint) await getApi().openPath(result.mountPoint)
    })
  }

  const canRun =
    !busy &&
    ((tab === 'create' && !!sourceDir && !!outputIso) ||
      (tab === 'bootable' && !!sourceDir && !!outputIso && (useBios || useEfi)) ||
      (tab === 'mount' && !!(mountIsoPath || isoPath)))

  const runLabel =
    tab === 'create' ? t('runCreate') : tab === 'bootable' ? t('runBootable') : t('runMount')

  const runTooltip =
    tab === 'create' ? t('tipRunCreate') : tab === 'bootable' ? t('tipRunBootable') : t('tipRunMount')

  const folderTarget =
    tab === 'home'
      ? ''
      : tab === 'extract'
      ? parentDir(isoPath)
      : tab === 'mount'
        ? mountPoint || parentDir(mountIsoPath || isoPath)
        : sourceDir

  /** Destination folder for Add — selected dir, or parent of selected file (all image kinds). */
  function resolveAddDestDir(): string {
    if (!session || selectedPaths.length === 0) return ''
    const nodes = findTreeNodes(selectedPaths)
    if (nodes.length === 1) {
      const n = nodes[0]!
      return n.isDir ? n.path : parentOf(n.path)
    }
    const dirs = nodes.filter((n) => n.isDir)
    if (dirs.length === 1) return dirs[0]!.path
    if (nodes.length > 0) return parentOf(nodes[0]!.path)
    return ''
  }

  const addDestDir = resolveAddDestDir()

  const selectedNodes = session ? findTreeNodes(selectedPaths) : []
  const selectedFiles = selectedNodes.filter((n) => !n.isDir)
  const canEditTree = Boolean(session) && !busy && (tab === 'extract' || tab === 'mount')

  const titleActions: ToolbarAction[] = [
      {
        id: 'view-explorer',
        label: t('explorer'),
        tooltip: dock.left ? t('toolShowExplorer') : t('toolHideExplorer'),
        icon: Icons.panelLeft,
        iconOnly: true,
        active: !dock.left,
        onClick: () => setDock({ left: !dock.left }),
      },
      {
        id: 'view-log',
        label: t('logPanel'),
        tooltip: dock.bottom ? t('toolShowLog') : t('toolHideLog'),
        icon: Icons.panelBottom,
        iconOnly: true,
        active: !dock.bottom,
        onClick: () => setDock({ bottom: !dock.bottom }),
      },
      {
        id: 'view-info',
        label: t('infoPanel'),
        tooltip: dock.right ? t('toolShowInfo') : t('toolHideInfo'),
        icon: Icons.panelRight,
        iconOnly: true,
        active: !dock.right,
        onClick: () => setDock({ right: !dock.right }),
      },
  ]

  const toolbarGroups: ToolbarAction[][] = [
    [
      {
        id: 'home',
        label: t('tabHome'),
        tooltip: tab === 'home' ? t('tipHomeBack') : t('tipHome'),
        icon: Icons.home,
        active: tab === 'home',
        disabled: busy,
        onClick: toggleHome,
      },
      {
        id: 'open-iso',
        label: t('openIso'),
        tooltip: t('tipOpenIso'),
        icon: Icons.openIso,
        disabled: busy,
        onClick: () => void openIsoFile(),
      },
      {
        id: 'close-iso',
        label: t('closeImage'),
        tooltip: t('tipCloseImage'),
        icon: Icons.eject,
        disabled: busy || !session,
        onClick: closeImage,
      },
      {
        id: 'save-iso',
        label: dirty ? `${t('saveIso')} *` : t('saveIso'),
        tooltip: t('tipSaveIso'),
        icon: Icons.save,
        disabled: busy || !session || !dirty,
        onClick: () => void saveIsoAs(),
      },
    ],
    [
      {
        id: 'add-files',
        label: addDestDir ? t('addFilesTo', pathBaseName(addDestDir) || addDestDir) : t('addFiles'),
        tooltip: addDestDir ? t('tipAddFilesTo', addDestDir) : t('tipAddFiles'),
        icon: Icons.addFile,
        iconOnly: true,
        disabled: !canEditTree,
        onClick: () => void ctxAddFiles(addDestDir),
      },
      {
        id: 'mkdir',
        label: t('toolNewFolder'),
        tooltip: t('toolNewFolder'),
        icon: Icons.mkdir,
        iconOnly: true,
        disabled: !canEditTree,
        onClick: () => ctxNewFolder(addDestDir),
      },
      {
        id: 'rename',
        label: t('ctxRename'),
        tooltip: t('ctxRename'),
        icon: Icons.rename,
        iconOnly: true,
        disabled: !canEditTree || selectedNodes.length !== 1,
        onClick: () => selectedNodes[0] && ctxRename(selectedNodes[0]),
      },
      {
        id: 'delete',
        label: t('ctxDelete'),
        tooltip: selectedNodes.length > 1 ? t('ctxDeleteMany', String(selectedNodes.length)) : t('ctxDelete'),
        icon: Icons.trash,
        iconOnly: true,
        disabled: !canEditTree || !selectedNodes.length,
        onClick: () => ctxDeleteMany(selectedNodes.map((n) => n.path)),
      },
      {
        id: 'export',
        label: t('toolExtract'),
        tooltip: selectedFiles.length > 1 ? t('ctxExtractMany', String(selectedFiles.length)) : t('toolExtract'),
        icon: Icons.exportFile,
        iconOnly: true,
        disabled: !session || busy || !selectedFiles.length,
        onClick: () => void ctxExtractFiles(selectedFiles),
      },
      {
        id: 'copy-path',
        label: t('ctxCopyPath'),
        tooltip: t('ctxCopyPath'),
        icon: Icons.copy,
        iconOnly: true,
        disabled: !selectedNodes.length,
        onClick: () => void ctxCopyPath(selectedNodes.map((n) => n.path).join('\n')),
      },
    ],
    [
      {
        id: 'extract',
        label: t('tabExtract'),
        tooltip: t('tipExtract'),
        icon: Icons.extract,
        active: tab === 'extract',
        disabled: busy,
        onClick: () => setTab('extract'),
      },
      {
        id: 'create',
        label: t('tabCreate'),
        tooltip: t('tipCreate'),
        icon: Icons.create,
        active: tab === 'create',
        disabled: busy,
        onClick: () => setTab('create'),
      },
      {
        id: 'bootable',
        label: t('tabBootable'),
        tooltip: t('tipBootable'),
        icon: Icons.bootable,
        active: tab === 'bootable',
        disabled: busy,
        onClick: () => setTab('bootable'),
      },
      {
        id: 'mount',
        label: t('tabMount'),
        tooltip: t('tipMount'),
        icon: Icons.mount,
        active: tab === 'mount',
        disabled: busy,
        onClick: () => setTab('mount'),
      },
    ],
    [
      {
        id: 'run',
        label: runLabel,
        tooltip: runTooltip,
        icon: Icons.run,
        iconOnly: true,
        disabled: tab === 'extract' || tab === 'home' || !canRun,
        onClick: runCurrentAction,
      },
      {
        id: 'cancel',
        label: t('cancelJob'),
        tooltip: t('tipCancelJob'),
        icon: Icons.stop,
        iconOnly: true,
        disabled: !busy || !cancelable,
        onClick: () => void cancelCurrentJob(),
      },
      {
        id: 'folder',
        label: t('openFolder'),
        tooltip:
          tab === 'extract'
            ? t('tipOpenExtract')
            : tab === 'mount' && mountPoint
              ? t('tipOpenMount')
              : t('tipOpenSource'),
        icon: Icons.folder,
        iconOnly: true,
        disabled: busy || !folderTarget,
        onClick: () => {
          if (folderTarget) void getApi().openPath(folderTarget)
        },
      },
      {
        id: 'recheck',
        label: t('homeEngineRecheck'),
        tooltip: t('toolRecheck'),
        icon: Icons.engine,
        iconOnly: true,
        onClick: () => void recheckEngine(),
      },
    ],
    [
      { id: END_LEAD, label: '', tooltip: '', icon: null, onClick: () => {} },
      {
        id: 'lang',
        label: locale === 'ko' ? t('langEn') : t('langKo'),
        tooltip: locale === 'ko' ? t('tipLangEn') : t('tipLangKo'),
        icon: <Flag locale={locale} />,
        iconOnly: true,
        onClick: () => setLocale(locale === 'ko' ? 'en' : 'ko'),
      },
      {
        id: 'settings',
        label: t('settings'),
        tooltip: t('tipSettings'),
        icon: Icons.settings,
        iconOnly: true,
        onClick: () => openSettings(),
      },
      {
        id: 'help',
        label: t('help'),
        tooltip: t('tipHelp'),
        icon: Icons.help,
        iconOnly: true,
        onClick: () => setHelpOpen(true),
      },
      {
        id: 'about',
        label: t('menuAbout'),
        tooltip: t('tipAbout'),
        icon: Icons.info,
        iconOnly: true,
        onClick: () => setAboutOpen(true),
      },
    ],
  ]

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        void openIsoFile()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canRun) {
        e.preventDefault()
        runCurrentAction()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canRun, tab, isoPath, sourceDir, outputIso, volumeLabel, useBios, useEfi, biosBootImage, efiBootImage, isohybridMbr, mountIsoPath, locale])

  const statusIsoLabel = session?.sourcePath || isoPath || mountIsoPath || t('statusNoIso')
  const statusMessage =
    progress?.message?.trim() ||
    statusNote ||
    (treeLoading ? t('statusTreeLoading') : t('statusReady'))
  const statusPercent =
    progress?.percent != null && busy ? `${Math.round(progress.percent)}%` : busy ? '…' : ''
  const treeForView = session?.root ?? EMPTY_TREE
  const treeVolume = session?.volumeLabel
  const treeEditable = Boolean(session) && (tab === 'extract' || tab === 'mount')

  return (
    <div className="app">
      <Toolbar
        groups={toolbarGroups}
        ariaLabel={t('toolbarAria')}
        lead={<TitleBrand name={t('brand')} version={APP_VERSION} dirty={dirty} />}
        titleActions={titleActions}
        endLead={<ThemeSplitButton onEditCustom={() => openSettings('theme')} />}
        trail={<WindowControls t={t} />}
      />

      <div className="workspace">
        {tab !== 'home' ? (
        <DockPanel
          side="left"
          toggleIcon={Icons.panelLeft}
          title={t('explorer')}
          icon={Icons.folder}
          collapsed={dock.left}
          onToggle={() => setDock({ left: !dock.left })}
          size={dock.leftSize}
          minSize={200}
          maxSize={520}
          onResize={(size, done) => setDock({ leftSize: size }, done)}
          collapseTip={t('panelCollapse')}
          expandTip={t('panelExpand')}
          actions={
            <button type="button" className="dock-btn" title={t('explorerRefresh')} onClick={() => setExplorerReload((n) => n + 1)}>
              {Icons.refresh}
            </button>
          }
        >
          <Explorer
            t={t}
            reloadKey={explorerReload}
            onMenu={openMenu}
            actions={{
              openImage: (p) => {
                if (dirty) {
                  setPendingOpenPath(p)
                  setUnsavedReason('open')
                } else void loadIsoSession(p)
              },
              mountImage: (p) => {
                setMountIsoPath(p)
                setTab('mount')
              },
              addToImage: session && !busy ? (paths) => void onDropPaths(addDestDir, paths) : null,
              useAsSource: (dir) => {
                chooseSource(dir)
                setTab('create')
              },
              extractHere: session && selectedFiles.length ? (dir) => void extractSelectedTo(dir) : null,
              openPath: (p) => void getApi().openPath(p),
              copyText: (text) => void copyText(text),
            }}
          />
        </DockPanel>
        ) : null}

        <div className="workspace-center">

      {tab === 'home' ? (
        <main className="panel home">
          <StartScreen
            t={t}
            theme={theme}
            locale={locale}
            engine={engine}
            recent={recent}
            showOnStart={showOnStart}
            busy={busy}
            onShowOnStart={(on) => {
              setShowOnStart(on)
              saveShowOnStart(on)
            }}
            onOpenImage={() => void openIsoFile()}
            onOpenRecent={(p) => void openRecentImage(p)}
            onRecentMenu={(x, y, p) => openMenu(x, y, recentMenuItems(p))}
            onRemoveRecent={(p) => setRecent(removeRecent(p))}
            onClearRecent={() => setRecent(clearRecent())}
            onGo={(next) => setTab(next)}
            onAbout={() => setAboutOpen(true)}
            onRecheckEngine={() => void recheckEngine()}
            bg={bg}
            onBg={setBg}
          />
        </main>
      ) : (
      <main className="panel" ref={panelRef}>
        <div className="panel-work">
        {tab === 'extract' && !session && !treeLoading && (
          <section className="work-empty-section">
            <WorkEmpty
              t={t}
              version={APP_VERSION}
              busy={busy}
              onOpen={() => void openIsoFile()}
              onGo={(next) => setTab(next)}
              onPackages={() => openSettings('packages')}
              onHelp={() => setHelpOpen(true)}
            />
          </section>
        )}
        {tab === 'extract' && (session || treeLoading) && (
          <section className="has-tree tree-only">
            <IsoTreeView
              nodes={treeForView}
              volumeLabel={treeVolume}
              loading={treeLoading}
              emptyText={t('isoTreeEmpty')}
              loadingText={t('isoTreeLoading')}
              filterPlaceholder={t('isoTreeFilter')}
              editable={treeEditable}
              dropHint={session ? t('treeDropHint') : undefined}
              reveal={treeReveal}
              onDropFiles={onDropFiles}
              onDropPaths={(dest, paths) => void onDropPaths(dest, paths)}
              onPrepareDragOut={onPrepareDragOut}
              onStartDrag={(tempPaths) => getApi().startDrag(tempPaths)}
              onDragOutNotReady={(paths) => {
                setStatusNote(
                  paths.length === 1
                    ? t('logDragPreparing', paths[0]!)
                    : t('logDragPreparingMany', String(paths.length)),
                )
              }}
              onDragOutReady={(paths) => {
                setStatusNote(
                  paths.length === 1
                    ? t('logDragReady', paths[0]!)
                    : t('logDragReadyMany', String(paths.length)),
                )
              }}
              onDragOutStarted={(paths) => {
                appendChangeLog(
                  'out',
                  paths.length === 1
                    ? t('logDragOut', paths[0]!)
                    : t('logDragOutMany', String(paths.length)),
                )
              }}
              selectedPaths={selectedPaths}
              onSelectionChange={setSelectedPaths}
              onNodeContextMenu={(node, x, y, sel) =>
                setCtxMenu({ node, x, y, selectedPaths: sel })
              }
            />
          </section>
        )}

        {tab === 'create' && (
          <section>
            <h2>{createFormat === 'appimage' ? t('createAppImageTitle') : t('createTitle')}</h2>
            <p className="hint">{createFormat === 'appimage' ? t('createAppImageHint') : t('createHint')}</p>
            <div className="field">
              <span>{t('createFormat')}</span>
              <div className="settings-seg" role="radiogroup" data-create-format={createFormat}>
                <button type="button" role="radio" aria-checked={createFormat === 'iso'} className={`settings-seg-btn${createFormat === 'iso' ? ' on' : ''}`} onClick={() => setCreateFormat('iso')}>
                  {Icons.disc}
                  <span>ISO (ISO 9660 + Joliet)</span>
                </button>
                <button type="button" role="radio" aria-checked={createFormat === 'appimage'} className={`settings-seg-btn${createFormat === 'appimage' ? ' on' : ''}`} onClick={() => setCreateFormat('appimage')}>
                  {Icons.bootable}
                  <span>AppImage (Linux)</span>
                </button>
              </div>
            </div>
            <Field label={t('sourceDir')}>
              <PathRow
                value={sourceDir}
                browseLabel={t('browse')}
                onBrowse={async () => {
                  const p = await getApi().openDirectory(sourceDir || parentDir(isoPath), t('dlgOpenDir'))
                  if (p) chooseSource(p)
                }}
                onChange={chooseSource}
                placeholder={t('placeholderSource')}
              />
            </Field>
            {createFormat === 'appimage' ? (
              <Field label={t('appImageName')}>
                <input
                  value={appName}
                  onChange={(e) => {
                    appNameAuto.current = !e.target.value
                    setAppName(e.target.value)
                  }}
                  maxLength={64}
                />
              </Field>
            ) : (
              <Field label={t('volumeLabel')}>
                <input
                  value={volumeLabel}
                  onChange={(e) => {
                    volumeAuto.current = !e.target.value
                    setVolumeLabel(e.target.value)
                  }}
                  maxLength={32}
                />
              </Field>
            )}
            <Field label={createFormat === 'appimage' ? t('outputAppImage') : t('outputIso')}>
              <PathRow
                value={outputIso}
                browseLabel={t('browse')}
                onBrowse={async () => {
                  const p = await getApi().saveFile(
                    outputIso || `output.${extFor(createFormat)}`,
                    outputIso || sourceDir,
                    t('dlgSaveIso'),
                    createFormat === 'appimage' ? [{ name: 'AppImage', extensions: ['AppImage'] }] : undefined,
                  )
                  if (p) setOutputIso(p)
                }}
                onChange={setOutputIso}
                placeholder="output.iso"
              />
            </Field>
            <div className="actions">
              <DialogButton
                id="create-iso"
                label={createFormat === 'appimage' ? t('createAppImage') : t('createIso')}
                icon={Icons.create}
                primary
                disabled={busy || !sourceDir || !outputIso}
                onClick={runCreate}
              />
            </div>
          </section>
        )}

        {tab === 'bootable' && (
          <section>
            <h2>{t('bootableTitle')}</h2>
            <p className="hint">{t('bootableHint')}</p>
            <Field label={t('sourceDir')}>
              <PathRow
                value={sourceDir}
                browseLabel={t('browse')}
                onBrowse={async () => {
                  const p = await getApi().openDirectory(sourceDir || parentDir(isoPath), t('dlgOpenDir'))
                  if (p) chooseSource(p)
                }}
                onChange={chooseSource}
                placeholder={t('placeholderBootSource')}
              />
            </Field>
            <Field label={t('volumeLabel')}>
              <input
                value={volumeLabel}
                onChange={(e) => {
                  volumeAuto.current = !e.target.value
                  setVolumeLabel(e.target.value)
                }}
                maxLength={32}
              />
            </Field>
            <div className="checks">
              <label>
                <input
                  type="checkbox"
                  checked={useBios}
                  onChange={(e) => setUseBios(e.target.checked)}
                />
                BIOS (El Torito)
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={useEfi}
                  onChange={(e) => setUseEfi(e.target.checked)}
                />
                UEFI
              </label>
            </div>
            {useBios && (
              <Field label={t('biosBootImage')}>
                <input
                  value={biosBootImage}
                  onChange={(e) => setBiosBootImage(e.target.value)}
                />
              </Field>
            )}
            {useEfi && (
              <Field label={t('efiBootImage')}>
                <input value={efiBootImage} onChange={(e) => setEfiBootImage(e.target.value)} />
              </Field>
            )}
            <Field label={t('isohybridMbr')}>
              <input
                value={isohybridMbr}
                onChange={(e) => setIsohybridMbr(e.target.value)}
                placeholder="boot/grub/i386-pc/boot_hybrid.img"
              />
            </Field>
            <Field label={t('outputIso')}>
              <PathRow
                value={outputIso}
                browseLabel={t('browse')}
                onBrowse={async () => {
                  const p = await getApi().saveFile(
                    outputIso || 'bootable.iso',
                    outputIso || sourceDir,
                    t('dlgSaveIso'),
                  )
                  if (p) setOutputIso(p)
                }}
                onChange={setOutputIso}
                placeholder="bootable.iso"
              />
            </Field>
            <div className="actions">
              <DialogButton
                id="create-bootable"
                label={t('createBootable')}
                icon={Icons.bootable}
                primary
                disabled={busy || !sourceDir || !outputIso || (!useBios && !useEfi)}
                onClick={() =>
                  void runJob(
                    'jobBootable',
                    () =>
                      getApi().createBootableIso({
                        sourceDir,
                        outputIso,
                        volumeLabel,
                        biosBootImage: useBios ? biosBootImage : undefined,
                        efiBootImage: useEfi ? efiBootImage : undefined,
                        isohybridMbr: isohybridMbr || undefined,
                      }),
                    { cancelable: true },
                  )
                }
              />
            </div>
          </section>
        )}

        {tab === 'mount' && (
          <section className="has-tree">
            <h2>{t('mountTitle')}</h2>
            <p className="hint">{t('mountHint')}</p>
            {mountPoint && (
              <p className="mount-point">
                {t('currentlyMounted')} <code>{mountPoint}</code>
              </p>
            )}
            <div className="actions">
              <DialogButton
                id="mount"
                label={t('mount')}
                icon={Icons.mount}
                primary
                disabled={busy || !(mountIsoPath || isoPath)}
                onClick={() =>
                  void runJob('jobMount', async () => {
                    const target = mountIsoPath || isoPath
                    const result = await getApi().mountIso(target)
                    if (!result.mounted) throw new Error(result.message)
                    setMountPoint(result.mountPoint ?? '')
                    if (result.mountPoint) await getApi().openPath(result.mountPoint)
                  })
                }
              />
              <DialogButton
                id="unmount"
                label={t('unmount')}
                icon={Icons.unmount}
                disabled={busy || (!mountPoint && !(mountIsoPath || isoPath))}
                onClick={() =>
                  void runJob('jobUnmount', async () => {
                    const iso = mountIsoPath || isoPath
                    const target =
                      processPlatform() === 'win32' ? iso : mountPoint || iso
                    const result = await getApi().unmountIso(target)
                    if (result.mounted && result.message !== 'Unmounted') {
                      throw new Error(result.message)
                    }
                    setMountPoint('')
                  })
                }
              />
            </div>
            <IsoTreeView
              nodes={treeForView}
              volumeLabel={treeVolume}
              loading={treeLoading}
              emptyText={t('isoTreeEmpty')}
              loadingText={t('isoTreeLoading')}
              filterPlaceholder={t('isoTreeFilter')}
              editable={treeEditable}
              dropHint={session ? t('treeDropHint') : undefined}
              reveal={treeReveal}
              onDropFiles={onDropFiles}
              onDropPaths={(dest, paths) => void onDropPaths(dest, paths)}
              onPrepareDragOut={onPrepareDragOut}
              onStartDrag={(tempPaths) => getApi().startDrag(tempPaths)}
              onDragOutNotReady={(paths) => {
                setStatusNote(
                  paths.length === 1
                    ? t('logDragPreparing', paths[0]!)
                    : t('logDragPreparingMany', String(paths.length)),
                )
              }}
              onDragOutReady={(paths) => {
                setStatusNote(
                  paths.length === 1
                    ? t('logDragReady', paths[0]!)
                    : t('logDragReadyMany', String(paths.length)),
                )
              }}
              onDragOutStarted={(paths) => {
                appendChangeLog(
                  'out',
                  paths.length === 1
                    ? t('logDragOut', paths[0]!)
                    : t('logDragOutMany', String(paths.length)),
                )
              }}
              selectedPaths={selectedPaths}
              onSelectionChange={setSelectedPaths}
              onNodeContextMenu={(node, x, y, sel) =>
                setCtxMenu({ node, x, y, selectedPaths: sel })
              }
            />
          </section>
        )}
        </div>

      </main>
      )}

          {tab !== 'home' ? (
          <DockPanel
            side="bottom"
            toggleIcon={Icons.panelBottom}
            title={t('logPanel')}
            icon={Icons.recent}
            collapsed={dock.bottom}
            onToggle={() => setDock({ bottom: !dock.bottom })}
            size={dock.bottomSize}
            minSize={90}
            maxSize={420}
            onResize={(size, done) => setDock({ bottomSize: size }, done)}
            collapseTip={t('panelCollapse')}
            expandTip={t('panelExpand')}
            actions={
              <>
                <span className="dock-count">{changeLog.length}</span>
                <button
                  type="button"
                  className="dock-btn"
                  title={t('logCopyAll')}
                  disabled={!changeLog.length}
                  onClick={() => void copyText(changeLog.map((e) => `${e.time} [${e.kind}] ${e.message}`).join('\n'))}
                >
                  {Icons.copy}
                </button>
                <button type="button" className="dock-btn" title={t('logClear')} disabled={!changeLog.length} onClick={() => setChangeLog([])}>
                  {Icons.clear}
                </button>
              </>
            }
          >
            <LogPanel t={t} entries={changeLog} onMenu={(x, y, entry) => openMenu(x, y, logMenuItems(entry))} />
          </DockPanel>
          ) : null}
        </div>

        {tab !== 'home' ? (
        <DockPanel
          side="right"
          toggleIcon={Icons.panelRight}
          title={t('infoPanel')}
          icon={Icons.info}
          collapsed={dock.right}
          onToggle={() => setDock({ right: !dock.right })}
          size={dock.rightSize}
          minSize={220}
          maxSize={520}
          onResize={(size, done) => setDock({ rightSize: size }, done)}
          collapseTip={t('panelCollapse')}
          expandTip={t('panelExpand')}
        >
          <InfoPanel t={t} session={session} selected={selectedNodes} engine={engine} onMenu={openMenu} copyText={(x) => void copyText(x)} />
        </DockPanel>
        ) : null}
      </div>

      <ContextMenu open={Boolean(menu)} x={menu?.x ?? 0} y={menu?.y ?? 0} items={menu?.items ?? []} onClose={() => setMenu(null)} />

      <ContextMenu
        open={Boolean(ctxMenu && session && treeEditable)}
        x={ctxMenu?.x ?? 0}
        y={ctxMenu?.y ?? 0}
        items={
          ctxMenu
            ? buildContextMenuItems(ctxMenu.node, ctxMenu.selectedPaths)
            : []
        }
        onClose={() => setCtxMenu(null)}
      />

      <footer className="app-statusbar" role="status">
        <span
          className={`sb-item engine-pill ${engine?.available ? 'ok' : 'warn'}`}
          title={[engineBadge, engine?.hint].filter(Boolean).join('\n')}
        >
          {engineBadge}
        </span>
        <span className="sb-item path" title={statusIsoLabel}>
          {statusIsoLabel}
        </span>
        {session && (
          <>
            <span className="sb-item">{t('statusVolume', session.volumeLabel)}</span>
            <span className="sb-item">
              {t('statusEntries', String(session.entryCount))} · {formatBytes(session.totalBytes)}
            </span>
            {dirty ? <span className="sb-item dirty">{t('dirtyBadge')}</span> : null}
          </>
        )}
        <span className="sb-spacer" />
        {error ? (
          <button type="button" className="sb-item error-link" onClick={() => setErrorOpen(true)}>
            {t('errorTitle')}
          </button>
        ) : null}
        <span className="sb-item msg" title={statusMessage}>
          {statusMessage}
        </span>
        {statusPercent ? <span className="sb-item pct">{statusPercent}</span> : null}
        <span className="sb-meter" aria-hidden="true">
          <span
            className="sb-meter-fill"
            style={{ width: `${progress?.percent ?? (busy ? 18 : 0)}%` }}
          />
        </span>
        <span className="sb-sep" aria-hidden="true" />
        <span className="sb-item sb-tab" title={t('statusTab')}>
          {tab === 'home' ? t('tabHome') : tab === 'extract' ? t('tabExtract') : tab === 'create' ? t('tabCreate') : tab === 'bootable' ? t('tabBootable') : t('tabMount')}
        </span>
        {session ? (
          <span className="sb-item" title={t('infoSelection')}>
            {t('statusSelected', String(selectedPaths.length))}
          </span>
        ) : null}
        <span className="sb-item" title={t('settingsTabTheme')}>
          {themeName(themeId)}
        </span>
        <span className="sb-item sb-lang" title={t('settingsLanguage')}>
          <Flag locale={locale} />
          {locale === 'ko' ? '한국어' : 'English'}
        </span>
        <span
          className="sb-grip"
          title={t('statusResize')}
          aria-hidden="true"
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.preventDefault()
            if (isTauri()) void getCurrentWindow().startResizeDragging('SouthEast').catch(() => {})
          }}
        >
          <svg viewBox="0 0 12 12" width="12" height="12">
            <circle cx="10" cy="10" r="1.2" />
            <circle cx="6" cy="10" r="1.2" />
            <circle cx="10" cy="6" r="1.2" />
            <circle cx="2" cy="10" r="1.2" />
            <circle cx="6" cy="6" r="1.2" />
            <circle cx="10" cy="2" r="1.2" />
          </svg>
        </span>
      </footer>

      <Dialog
        open={errorOpen}
        title={t('errorTitle')}
        icon={Icons.warning}
        onClose={() => setErrorOpen(false)}
        wide
        buttons={[
          {
            id: 'copy',
            label: copied ? t('dialogCopied') : t('dialogCopy'),
            icon: copied ? Icons.check : Icons.copy,
            onClick: () => void copyError(),
          },
          {
            id: 'close',
            label: t('dialogClose'),
            icon: Icons.close,
            primary: true,
            onClick: () => setErrorOpen(false),
          },
        ]}
      >
        <p className="dialog-message">{t('errorDetailHeading')}</p>
        <pre className="dialog-error-box">{error}</pre>
      </Dialog>


      <Dialog
        open={Boolean(unsavedReason)}
        title={t('unsavedTitle')}
        icon={Icons.save}
        onClose={() => {
          if (unsavedReason === 'close') {
            void getApi().decideClose?.('cancel')
          }
          setUnsavedReason(null)
          setPendingOpenPath(null)
        }}
        buttons={[
          {
            id: 'save',
            label: unsavedReason === 'close' ? t('unsavedSaveClose') : t('unsavedSave'),
            icon: Icons.save,
            primary: true,
            onClick: () => {
              void (async () => {
                const ok = await saveIsoAs()
                if (!ok) return
                if (unsavedReason === 'close') {
                  setUnsavedReason(null)
                  await getApi().decideClose?.('save-done')
                  return
                }
                if (unsavedReason === 'closeImage') {
                  setUnsavedReason(null)
                  await doCloseImage()
                  return
                }
                const next = pendingOpenPath
                setUnsavedReason(null)
                setPendingOpenPath(null)
                if (next) await loadIsoSession(next)
              })()
            },
          },
          {
            id: 'discard',
            label: t('unsavedDiscard'),
            icon: Icons.clear,
            onClick: () => {
              void (async () => {
                if (unsavedReason === 'close') {
                  setUnsavedReason(null)
                  await getApi().decideClose?.('discard')
                  return
                }
                if (unsavedReason === 'closeImage') {
                  setUnsavedReason(null)
                  await doCloseImage()
                  return
                }
                const next = pendingOpenPath
                setUnsavedReason(null)
                setPendingOpenPath(null)
                if (next) await loadIsoSession(next)
              })()
            },
          },
          {
            id: 'cancel',
            label: t('dialogCancel'),
            icon: Icons.close,
            onClick: () => {
              if (unsavedReason === 'close') {
                void getApi().decideClose?.('cancel')
              }
              setUnsavedReason(null)
              setPendingOpenPath(null)
            },
          },
        ]}
      >
        <p className="dialog-message">
          {unsavedReason === 'close'
            ? t('unsavedCloseMessage')
            : unsavedReason === 'closeImage'
              ? t('unsavedCloseImageMessage')
              : t('unsavedOpenMessage')}
        </p>
        <p className="dialog-detail hint">{t('saveBootNote')}</p>
      </Dialog>

      <PromptDialog
        open={Boolean(promptDlg)}
        title={
          promptDlg?.mode === 'rename' ? t('promptRename') : t('promptNewFolder')
        }
        message={
          promptDlg?.mode === 'rename' && promptDlg.node
            ? t('promptRenameHint', promptDlg.node.path)
            : promptDlg
              ? t('promptNewFolderHint', promptDlg.destDir || '/')
              : undefined
        }
        label={
          promptDlg?.mode === 'rename' ? t('promptRenameLabel') : t('promptNewFolderLabel')
        }
        defaultValue={promptDlg?.defaultValue ?? ''}
        confirmLabel={
          promptDlg?.mode === 'rename' ? t('dialogRename') : t('dialogCreate')
        }
        cancelLabel={t('dialogCancel')}
        onCancel={() => setPromptDlg(null)}
        onConfirm={(value) => {
          if (promptDlg?.mode === 'rename') void applyRename(value)
          else void applyMkdir(value)
        }}
      />


      <PackageProgressDialog
        t={t}
        progress={pkgProgress}
        running={pkgRunning}
        note={pkgNote}
        onCancel={() => void window.isoMaker?.cancelPackage?.()}
        onClose={() => {
          setPkgProgress(null)
          setPkgNote('')
        }}
      />

      <ConfirmDialog
        open={Boolean(confirmDlg)}
        title={t('confirmDeleteTitle')}
        message={
          confirmDlg && confirmDlg.paths.length === 1
            ? t('confirmDeleteOne', confirmDlg.paths[0]!)
            : t('confirmDeleteMany', String(confirmDlg?.paths.length ?? 0))
        }
        confirmLabel={t('confirmDeleteAction')}
        cancelLabel={t('dialogCancel')}
        danger
        onCancel={() => setConfirmDlg(null)}
        onConfirm={() => void applyDelete()}
      />
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function PathRow({
  value,
  onChange,
  onBrowse,
  placeholder,
  browseLabel,
}: {
  value: string
  onChange: (v: string) => void
  onBrowse: () => void | Promise<void>
  placeholder?: string
  browseLabel: string
}) {
  return (
    <div className="path-row">
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      <DialogButton
        id="browse"
        label={browseLabel}
        icon={Icons.search}
        onClick={() => void onBrowse()}
      />
    </div>
  )
}

/** Strip Electron IPC wrapper from thrown errors for clearer dialogs. */
function cleanIpcError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  const unwrapped = raw.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '')
  return unwrapped.trim() || raw
}

function isCanceledJobMessage(message: string): boolean {
  return message.trim() === 'JOB_CANCELED'
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

function parentDir(filePath: string): string {
  if (!filePath) return ''
  const normalized = filePath.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  if (idx <= 0) return ''
  const dir = normalized.slice(0, idx)
  return filePath.includes('\\') ? dir.replace(/\//g, '\\') : dir
}

function pathBaseName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

function formatLogTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}



function processPlatform(): string {
  const ua = navigator.userAgent
  if (ua.includes('Windows')) return 'win32'
  if (ua.includes('Mac')) return 'darwin'
  return 'linux'
}
