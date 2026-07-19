import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import type { EngineInfo, JobProgress } from '../electron/iso/types'
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
import { Icons, Toolbar, type ToolbarAction } from './Toolbar'
import { APP_VERSION, APP_YEAR } from './version'
import type { EditSessionSnapshot, IsoMakerApi } from './vite-env'

const EMPTY_TREE: IsoTreeNode[] = []
const LOG_WIDTH_KEY = 'isomaker.logPanelWidth'
const LOG_WIDTH_DEFAULT = 300
const LOG_WIDTH_MIN = 200
const LOG_WIDTH_MAX = 560

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
    throw new Error('Electron preload missing')
  }
  return api
}

type Tab = 'extract' | 'create' | 'bootable' | 'mount'

export default function App() {
  const { t, locale, theme, setLocale, setTheme } = usePrefs()
  const [tab, setTab] = useState<Tab>('extract')
  const [engine, setEngine] = useState<EngineInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [cancelable, setCancelable] = useState(false)
  const [progress, setProgress] = useState<JobProgress | null>(null)
  const [statusNote, setStatusNote] = useState('')
  const [error, setError] = useState<string>('')
  const [errorOpen, setErrorOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const [isoPath, setIsoPath] = useState('')
  const [sourceDir, setSourceDir] = useState('')
  const [outputIso, setOutputIso] = useState('')
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
  const [unsavedReason, setUnsavedReason] = useState<'open' | 'close' | null>(null)
  const [changeLog, setChangeLog] = useState<ChangeLogEntry[]>([])
  const [logPanelWidth, setLogPanelWidth] = useState(() => loadLogPanelWidth())
  const [splitterActive, setSplitterActive] = useState(false)
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
  const changeLogEndRef = useRef<HTMLLIElement | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  const splitterDragging = useRef(false)

  const dirty = Boolean(session?.dirty)

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!splitterDragging.current || !panelRef.current) return
      const rect = panelRef.current.getBoundingClientRect()
      const next = clamp(
        rect.right - e.clientX,
        LOG_WIDTH_MIN,
        Math.min(LOG_WIDTH_MAX, Math.max(LOG_WIDTH_MIN, rect.width - 320)),
      )
      setLogPanelWidth(next)
    }
    function onUp() {
      if (!splitterDragging.current) return
      splitterDragging.current = false
      setSplitterActive(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setLogPanelWidth((w) => {
        localStorage.setItem(LOG_WIDTH_KEY, String(w))
        return w
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  function beginSplitDrag(e: ReactMouseEvent | ReactPointerEvent) {
    e.preventDefault()
    splitterDragging.current = true
    setSplitterActive(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
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

  useEffect(() => {
    changeLogEndRef.current?.scrollIntoView({ block: 'end' })
  }, [changeLog])

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
    void api.getEngineInfo().then(setEngine)
    const offProgress = api.onProgress((p) => {
      setProgress(p)
      if (p.message) setStatusNote(p.message.trim())
    })
    const offNavigate = api.onNavigate((next) => {
      if (next === 'extract' || next === 'create' || next === 'bootable' || next === 'mount') {
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
      showError(t('dropNoPath'))
      return
    }
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
        id: 'copy',
        label: t('ctxCopyPath'),
        icon: Icons.copy,
        onClick: () =>
          void ctxCopyPath(
            targets.length === 1 ? targets[0]!.path : targets.map((n) => n.path).join('\n'),
          ),
      })
    } else {
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
    labelKey: 'jobCreate' | 'jobBootable' | 'jobMount' | 'jobUnmount',
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

  function runCurrentAction() {
    if (tab === 'extract') return
    if (tab === 'create') {
      if (!sourceDir || !outputIso) return
      void runJob(
        'jobCreate',
        () => getApi().createIso({ sourceDir, outputIso, volumeLabel }),
        { cancelable: true },
      )
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
    tab === 'extract'
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

  const toolbarGroups: ToolbarAction[][] = [
    [
      {
        id: 'open-iso',
        label: t('openIso'),
        tooltip: t('tipOpenIso'),
        icon: Icons.openIso,
        primary: true,
        disabled: busy,
        onClick: () => void openIsoFile(),
      },
      {
        id: 'save-iso',
        label: dirty ? `${t('saveIso')} *` : t('saveIso'),
        tooltip: t('tipSaveIso'),
        icon: Icons.save,
        disabled: busy || !session || !dirty,
        onClick: () => void saveIsoAs(),
      },
      {
        id: 'add-files',
        label: addDestDir ? t('addFilesTo', pathBaseName(addDestDir) || addDestDir) : t('addFiles'),
        tooltip: addDestDir ? t('tipAddFilesTo', addDestDir) : t('tipAddFiles'),
        icon: Icons.addFile,
        disabled: busy || !session || !(tab === 'extract' || tab === 'mount'),
        onClick: () => void ctxAddFiles(addDestDir),
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
        disabled: tab === 'extract' || !canRun,
        onClick: runCurrentAction,
      },
      {
        id: 'cancel',
        label: t('cancelJob'),
        tooltip: t('tipCancelJob'),
        icon: Icons.stop,
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
        disabled: busy || !folderTarget,
        onClick: () => {
          if (folderTarget) void getApi().openPath(folderTarget)
        },
      },
    ],
    [
      {
        id: 'theme',
        label: theme === 'dark' ? t('themeLight') : t('themeDark'),
        tooltip: theme === 'dark' ? t('tipThemeLight') : t('tipThemeDark'),
        icon: theme === 'dark' ? Icons.sun : Icons.moon,
        onClick: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      },
      {
        id: 'lang',
        label: locale === 'ko' ? t('langEn') : t('langKo'),
        tooltip: locale === 'ko' ? t('tipLangEn') : t('tipLangKo'),
        icon: Icons.lang,
        onClick: () => setLocale(locale === 'ko' ? 'en' : 'ko'),
      },
      {
        id: 'about',
        label: t('menuAbout'),
        tooltip: t('tipAbout'),
        icon: Icons.info,
        onClick: () => setAboutOpen(true),
      },
    ],
  ]

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'O') {
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
      <header className="hero">
        <p className="brand">{t('brand')}</p>
      </header>

      <Toolbar groups={toolbarGroups} ariaLabel={t('toolbarAria')} />

      <main
        className="panel"
        ref={panelRef}
        style={{ ['--log-panel-width' as string]: `${logPanelWidth}px` }}
      >
        <div className="panel-work">
        {tab === 'extract' && (
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
            <h2>{t('createTitle')}</h2>
            <p className="hint">{t('createHint')}</p>
            <Field label={t('sourceDir')}>
              <PathRow
                value={sourceDir}
                browseLabel={t('browse')}
                onBrowse={async () => {
                  const p = await getApi().openDirectory(sourceDir || parentDir(isoPath), t('dlgOpenDir'))
                  if (p) setSourceDir(p)
                }}
                onChange={setSourceDir}
                placeholder={t('placeholderSource')}
              />
            </Field>
            <Field label={t('volumeLabel')}>
              <input
                value={volumeLabel}
                onChange={(e) => setVolumeLabel(e.target.value)}
                maxLength={32}
              />
            </Field>
            <Field label={t('outputIso')}>
              <PathRow
                value={outputIso}
                browseLabel={t('browse')}
                onBrowse={async () => {
                  const p = await getApi().saveFile(
                    outputIso || 'output.iso',
                    outputIso || sourceDir,
                    t('dlgSaveIso'),
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
                label={t('createIso')}
                icon={Icons.create}
                primary
                disabled={busy || !sourceDir || !outputIso}
                onClick={() =>
                  void runJob(
                    'jobCreate',
                    () => getApi().createIso({ sourceDir, outputIso, volumeLabel }),
                    { cancelable: true },
                  )
                }
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
                  if (p) setSourceDir(p)
                }}
                onChange={setSourceDir}
                placeholder={t('placeholderBootSource')}
              />
            </Field>
            <Field label={t('volumeLabel')}>
              <input
                value={volumeLabel}
                onChange={(e) => setVolumeLabel(e.target.value)}
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

        <div
          className={splitterActive ? 'panel-splitter active' : 'panel-splitter'}
          role="separator"
          aria-orientation="vertical"
          aria-label={t('panelSplitter')}
          aria-valuenow={Math.round(logPanelWidth)}
          aria-valuemin={LOG_WIDTH_MIN}
          aria-valuemax={LOG_WIDTH_MAX}
          tabIndex={0}
          onMouseDown={beginSplitDrag}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
            e.preventDefault()
            const delta = e.key === 'ArrowLeft' ? 16 : -16
            setLogPanelWidth((w) => {
              const next = clamp(w + delta, LOG_WIDTH_MIN, LOG_WIDTH_MAX)
              localStorage.setItem(LOG_WIDTH_KEY, String(next))
              return next
            })
          }}
        />

        <aside className="change-log" aria-label={t('changeLogTitle')}>
          <div className="change-log-header">
            <h2>{t('changeLogTitle')}</h2>
            <button
              type="button"
              className="change-log-clear"
              disabled={changeLog.length === 0}
              onClick={() => setChangeLog([])}
            >
              {t('clearLog')}
            </button>
          </div>
          {changeLog.length === 0 ? (
            <div className="change-log-empty">{t('changeLogEmpty')}</div>
          ) : (
            <ul className="change-log-body">
              {changeLog.map((entry, i) => (
                <li
                  key={entry.id}
                  ref={i === changeLog.length - 1 ? changeLogEndRef : undefined}
                  className={`change-log-item kind-${entry.kind}`}
                >
                  <span className="change-log-time">{entry.time}</span>
                  <span className="change-log-msg">{entry.message}</span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </main>

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
      </footer>

      <Dialog
        open={errorOpen}
        title={t('errorTitle')}
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
        open={aboutOpen}
        title={t('aboutTitle')}
        onClose={() => setAboutOpen(false)}
        buttons={[
          {
            id: 'ok',
            label: t('dialogOk'),
            icon: Icons.check,
            primary: true,
            onClick: () => setAboutOpen(false),
          },
        ]}
      >
        <div className="dialog-about">
          <p className="about-title">{t('brand')}</p>
          <p>{t('aboutVersion', APP_VERSION)}</p>
          <p style={{ whiteSpace: 'pre-line' }}>{t('aboutDetail')}</p>
          <p>{t('aboutAuthor')}</p>
          <p className="about-copy">{t('aboutCopyright', APP_YEAR)}</p>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(unsavedReason)}
        title={t('unsavedTitle')}
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
          {unsavedReason === 'close' ? t('unsavedCloseMessage') : t('unsavedOpenMessage')}
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

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function loadLogPanelWidth(): number {
  try {
    const raw = localStorage.getItem(LOG_WIDTH_KEY)
    if (!raw) return LOG_WIDTH_DEFAULT
    const n = Number(raw)
    if (!Number.isFinite(n)) return LOG_WIDTH_DEFAULT
    return clamp(n, LOG_WIDTH_MIN, LOG_WIDTH_MAX)
  } catch {
    return LOG_WIDTH_DEFAULT
  }
}

function processPlatform(): string {
  const ua = navigator.userAgent
  if (ua.includes('Windows')) return 'win32'
  if (ua.includes('Mac')) return 'darwin'
  return 'linux'
}
