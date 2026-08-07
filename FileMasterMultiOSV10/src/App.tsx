import { useEffect, useState } from 'react'
import { Archive, Check, ChevronUp, Copy, Database, FilePlus2, FolderPlus, Info, Languages, Minus, Moon, MoveRight, RefreshCw, Search, Square, Sun, Trash2, X } from 'lucide-react'
import './App.css'
import type { AppInfo, DirectoryListing, FileEntry, IndexStatus, OperationProgress, Preferences } from './shared'

type PanelSide = 'left' | 'right'
type SortKey = 'name' | 'size' | 'type' | 'modified'
type SortDirection = 'asc' | 'desc'
type PanelState = { listing: DirectoryListing | null; selected: string[]; busy: boolean; sortKey: SortKey; sortDirection: SortDirection }
type ClipboardState = { mode: 'copy' | 'move'; paths: string[] } | null
type ContextMenuState = { x: number; y: number; side: PanelSide; entry: FileEntry } | null
type TreeNodeState = { expanded: boolean; loading: boolean; children: FileEntry[]; error?: string }
type ErrorDialogState = { title: string; message: string; detail: string; copied: boolean } | null
type AppDialogState =
  | { kind: 'prompt'; title: string; value: string; resolve(value: string | null): void }
  | { kind: 'confirm'; title: string; message: string; resolve(value: boolean): void }
  | { kind: 'info'; title: string; message: string }
  | null

const translations = {
  ko: {
    ready: 'Command Center 준비 완료',
    webLimited: '웹 제한 모드: 브라우저 보안 정책 때문에 전체 파일 시스템 작업은 Electron 앱에서만 동작합니다.',
    left: '왼쪽',
    right: '오른쪽',
    searchPlaceholder: '파일명 검색, * 와 ? 지원',
    newFolder: '새 폴더',
    newFile: '새 파일',
    copy: '복사',
    move: '이동',
    paste: '붙여넣기',
    delete: '삭제',
    rename: '이름 변경',
    compress: '압축',
    extract: '해제',
    open: '열기',
    reveal: '위치 열기',
    properties: '속성',
    roots: '위치',
    showLocations: '위치 목록',
    parentDirectory: '상위 디렉터리로 이동',
    includeFolders: '폴더 포함',
    contentSearch: '내용 검색',
    contentPlaceholder: '내용 검색어',
    selectAll: '전체 선택',
    useIndex: '인덱스',
    rebuildIndex: '재색인',
    stopIndex: '중지',
    nameColumn: '이름',
    sizeColumn: '크기',
    typeColumn: '종류',
    modifiedColumn: '수정한 날짜',
    searchAction: '검색',
    searchResults: '검색 결과',
    noSearchResults: '검색 결과 없음',
    operationDone: '완료',
    indexingStatus: '색인 중',
    indexReadyStatus: '색인 준비됨',
    indexNotBuiltStatus: '색인이 생성되지 않음',
    itemCount: '개 항목',
    loading: '불러오는 중...',
    noFiles: '파일 없음',
    folderKind: '폴더',
    fileKind: '파일',
    theme: '테마',
    lightTheme: '라이트',
    darkTheme: '다크',
    language: '언어',
    about: '프로그램 정보',
    aboutDescription: '크로스 플랫폼 듀얼 패널 파일 관리자',
    versionLabel: '버전',
    buildLabel: '빌드 번호',
    copyrightLabel: '저작권',
    authorLabel: '저작자',
    activePanelLabel: '활성 패널',
    selectedCount: '선택',
    folderCount: '폴더',
    fileCount: '파일',
    totalCount: '전체',
    refresh: '새로 고침',
    errorTitle: '오류가 발생했습니다',
    errorDetails: '상세 내용',
    copyDetails: '상세 내용 복사',
    copiedDetails: '복사됨',
    ok: '확인',
    cancel: '취소',
    deleteConfirm: '선택한 항목을 삭제하시겠습니까?',
    minimize: '최소화',
    maximize: '최대화',
    close: '닫기',
  },
  en: {
    ready: 'Command Center ready',
    webLimited: 'Web limited mode: full file-system access is available in the Electron app only.',
    left: 'Left',
    right: 'Right',
    searchPlaceholder: 'Search names, supports * and ?',
    newFolder: 'New folder',
    newFile: 'New file',
    copy: 'Copy',
    move: 'Move',
    paste: 'Paste',
    delete: 'Delete',
    rename: 'Rename',
    compress: 'Compress',
    extract: 'Extract',
    open: 'Open',
    reveal: 'Reveal',
    properties: 'Properties',
    roots: 'Locations',
    showLocations: 'Show locations',
    parentDirectory: 'Go to parent directory',
    includeFolders: 'Folders',
    contentSearch: 'Content',
    contentPlaceholder: 'Content text',
    selectAll: 'Select all',
    useIndex: 'Index',
    rebuildIndex: 'Reindex',
    stopIndex: 'Stop',
    nameColumn: 'Name',
    sizeColumn: 'Size',
    typeColumn: 'Type',
    modifiedColumn: 'Modified',
    searchAction: 'Search',
    searchResults: 'Search results',
    noSearchResults: 'No search results',
    operationDone: 'done',
    indexingStatus: 'Indexing',
    indexReadyStatus: 'Index ready',
    indexNotBuiltStatus: 'Index not built',
    itemCount: 'items',
    loading: 'Loading...',
    noFiles: 'No files',
    folderKind: 'Folder',
    fileKind: 'File',
    theme: 'Theme',
    lightTheme: 'Light',
    darkTheme: 'Dark',
    language: 'Language',
    about: 'About',
    aboutDescription: 'Cross-platform dual-pane file manager',
    versionLabel: 'Version',
    buildLabel: 'Build',
    copyrightLabel: 'Copyright',
    authorLabel: 'Author',
    activePanelLabel: 'Active panel',
    selectedCount: 'Selected',
    folderCount: 'Folders',
    fileCount: 'Files',
    totalCount: 'Total',
    refresh: 'Refresh',
    errorTitle: 'An error occurred',
    errorDetails: 'Details',
    copyDetails: 'Copy details',
    copiedDetails: 'Copied',
    ok: 'OK',
    cancel: 'Cancel',
    deleteConfirm: 'Delete the selected items?',
    minimize: 'Minimize',
    maximize: 'Maximize',
    close: 'Close',
  },
}

const webPreferences: Preferences = { language: 'ko', theme: 'light', bookmarks: [] }
const appVersion = '1.0.0'
const appBuildNumber = '20260806.1'
const appAuthor = 'SHKWON(knix008@naver.com)'
const appCopyright = `Copyright © 2026 ${appAuthor}`

function App() {
  const [info, setInfo] = useState<AppInfo>({ platform: 'web', os: 'browser', homePath: 'Web sandbox', roots: ['Web sandbox'], preferences: webPreferences })
  const [preferences, setPreferences] = useState<Preferences>(webPreferences)
  const [left, setLeft] = useState<PanelState>({ listing: null, selected: [], busy: true, sortKey: 'name', sortDirection: 'asc' })
  const [right, setRight] = useState<PanelState>({ listing: null, selected: [], busy: true, sortKey: 'name', sortDirection: 'asc' })
  const [activeSide, setActiveSide] = useState<PanelSide>('left')
  const [clipboard, setClipboard] = useState<ClipboardState>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [treeSide, setTreeSide] = useState<PanelSide | null>(null)
  const [treeNodes, setTreeNodes] = useState<Record<string, TreeNodeState>>({})
  const [errorDialog, setErrorDialog] = useState<ErrorDialogState>(null)
  const [appDialog, setAppDialog] = useState<AppDialogState>(null)
  const [status, setStatus] = useState(translations.ko.ready)
  const [progress, setProgress] = useState<OperationProgress | null>(null)
  const [showDirectoryLoading, setShowDirectoryLoading] = useState(false)
  const [dragOverSide, setDragOverSide] = useState<PanelSide | null>(null)
  const [indexStatus, setIndexStatus] = useState<IndexStatus>({ state: 'not-built', count: 0, indexedCount: 0, lastBuiltMs: null })
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<FileEntry[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [contentQuery, setContentQuery] = useState('')
  const [includeFolders, setIncludeFolders] = useState(true)
  const [searchContent, setSearchContent] = useState(false)
  const [useIndex, setUseIndex] = useState(false)

  const api = window.commandCenter
  const t = translations[preferences.language]
  const activePanel = activeSide === 'left' ? left : right
  const otherPanel = activeSide === 'left' ? right : left
  const activeListingPath = activePanel.listing?.path
  const leftPath = left.listing?.path
  const rightPath = right.listing?.path

  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme
  }, [preferences.theme])

  useEffect(() => {
    setStatus(translations[preferences.language].ready)
  }, [preferences.language])

  useEffect(() => {
    if (!api) {
      const emptyListing = { path: 'Web sandbox', parentPath: null, entries: [] }
      setLeft(current => ({ ...current, listing: emptyListing, selected: [], busy: false }))
      setRight(current => ({ ...current, listing: emptyListing, selected: [], busy: false }))
      setStatus(translations.ko.webLimited)
      return
    }

    void api.getAppInfo().then(async appInfo => {
      setInfo(appInfo)
      setPreferences(appInfo.preferences)
      setIndexStatus(await api.getIndexStatus())
      const loadInitialListing = async (targetPath?: string) => {
        try {
          return await api.listDirectory(targetPath || appInfo.homePath)
        } catch {
          return api.listDirectory(appInfo.homePath)
        }
      }
      const [leftListing, rightListing] = await Promise.all([
        loadInitialListing(appInfo.preferences.leftPath),
        loadInitialListing(appInfo.preferences.rightPath),
      ])
      setLeft(current => ({ ...current, listing: leftListing, selected: [], busy: false }))
      setRight(current => ({ ...current, listing: rightListing, selected: [], busy: false }))
      setStatus(translations[appInfo.preferences.language].ready)
    }).catch(error => showError(t.errorTitle, error))
  }, [api])

  useEffect(() => {
    if (!api) return
    return api.onDirectoryChanged(changedPath => {
      if (leftPath === changedPath) void api.listDirectory(changedPath).then(listing => setLeft(current => ({ ...current, listing, selected: [], busy: false }))).catch(error => showError(t.errorTitle, error))
      if (rightPath === changedPath) void api.listDirectory(changedPath).then(listing => setRight(current => ({ ...current, listing, selected: [], busy: false }))).catch(error => showError(t.errorTitle, error))
    })
  }, [api, leftPath, rightPath, t.errorTitle])

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      showError(t.errorTitle, event.error ?? event.message)
      event.preventDefault()
    }
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      showError(t.errorTitle, event.reason)
      event.preventDefault()
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  })

  useEffect(() => {
    if (!api) return
    return api.onOperationProgress(nextProgress => {
      setProgress(nextProgress)
      setStatus(`${localizeProgressLabel(nextProgress.label, t)}: ${nextProgress.currentPath}`)
      if (nextProgress.done) window.setTimeout(() => setProgress(null), 1400)
    })
  }, [api, t])

  useEffect(() => {
    if (!api) return
    return api.onIndexStatus(nextStatus => {
      setIndexStatus(nextStatus)
      setStatus(formatIndexStatus(nextStatus, t))
    })
  }, [api, t])

  useEffect(() => {
    if (!api || !activeListingPath) return
    void api.watchDirectory(activeListingPath)
  }, [api, activeListingPath])

  useEffect(() => {
    if (!left.busy && !right.busy) {
      setShowDirectoryLoading(false)
      return
    }

    const timer = window.setTimeout(() => setShowDirectoryLoading(true), 300)
    return () => window.clearTimeout(timer)
  }, [left.busy, right.busy])

  useEffect(() => {
    if (!api || !leftPath || !rightPath) return
    void api.savePreferences({ language: preferences.language, theme: preferences.theme, bookmarks: preferences.bookmarks, leftPath, rightPath })
  }, [api, preferences.language, preferences.theme, preferences.bookmarks, leftPath, rightPath])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return
      if (event.ctrlKey && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        selectAllActive()
      } else if (event.ctrlKey && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        if (activePanel.selected.length > 0) setClipboard({ mode: 'copy', paths: activePanel.selected })
      } else if (event.ctrlKey && event.key.toLowerCase() === 'x') {
        event.preventDefault()
        if (activePanel.selected.length > 0) setClipboard({ mode: 'move', paths: activePanel.selected })
      } else if (event.ctrlKey && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        void pasteClipboard()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        clearActiveSelection()
      } else if (event.key === 'F2') {
        event.preventDefault()
        void renameActive()
      } else if (event.key === 'F5') {
        event.preventDefault()
        void copyActiveToOther()
      } else if (event.key === 'F6') {
        event.preventDefault()
        void moveActiveToOther()
      } else if (event.key === 'F8' || event.key === 'Delete') {
        event.preventDefault()
        void deleteActive()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  useEffect(() => {
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
    }
  }, [])

  async function loadPanel(side: PanelSide, targetPath?: string) {
    const setPanel = side === 'left' ? setLeft : setRight
    setPanel(current => ({ ...current, busy: true }))
    try {
      if (!api) throw new Error(t.webLimited)
      const listing = await api.listDirectory(targetPath)
      setPanel(current => ({ ...current, listing, selected: [], busy: false }))
    } catch (error) {
      setPanel(current => ({ ...current, busy: false }))
      showError(t.errorTitle, error)
    }
  }

  async function selectEntry(side: PanelSide, entry: FileEntry, multi: boolean) {
    setActiveSide(side)
    const setPanel = side === 'left' ? setLeft : setRight
    setPanel(current => ({
      ...current,
      selected: multi
        ? current.selected.includes(entry.fullPath) ? current.selected.filter(item => item !== entry.fullPath) : [...current.selected, entry.fullPath]
        : [entry.fullPath],
    }))
  }

  async function openEntry(entry: FileEntry) {
    if (entry.kind === 'directory') await loadPanel(activeSide, entry.fullPath)
    else await api?.openPath(entry.fullPath)
  }

  async function refreshOpenPanels() {
    await Promise.all([left.listing && loadPanel('left', left.listing.path), right.listing && loadPanel('right', right.listing.path)])
  }

  async function runAction(action: string, work: () => Promise<void>, refresh = true) {
    try {
      setStatus(`${action}...`)
      await work()
      if (refresh) await refreshOpenPanels()
      setStatus(`${action} ${t.operationDone}`)
    } catch (error) {
      showError(`${action} ${t.errorTitle}`, error)
    }
  }

  function showError(title: string, error: unknown) {
    const message = formatErrorMessage(error)
    const detail = formatErrorDetail(title, error, {
      activeSide,
      activePath: activePanel.listing?.path ?? null,
      leftPath: left.listing?.path ?? null,
      rightPath: right.listing?.path ?? null,
      platform: info.platform,
      os: info.os,
    })
    setStatus(message)
    setErrorDialog({ title, message, detail, copied: false })
  }

  async function copyErrorDetails() {
    if (!errorDialog) return
    const detail = `${errorDialog.title}\n\n${errorDialog.message}\n\n${errorDialog.detail}`
    await navigator.clipboard.writeText(detail)
    setErrorDialog({ ...errorDialog, copied: true })
  }

  async function promptName(label: string, defaultValue = '') {
    const value = await showPrompt(label, defaultValue)
    return value?.trim() || null
  }

  async function searchActive() {
    if (!api || !activePanel.listing || !query.trim()) return
    await runAction(t.searchAction, async () => {
      const options = { rootPath: activePanel.listing!.path, pattern: query.trim(), includeFolders, searchContent, contentPattern: contentQuery.trim() || undefined, caseSensitive: false, useRegex: false }
      const results = useIndex && !searchContent && indexStatus.state === 'ready'
        ? await api.searchIndex(options)
        : await api.search(options)
      setSearchResults(results)
      setSearchOpen(true)
    }, false)
  }

  async function openSearchResult(entry: FileEntry) {
    setSearchOpen(false)
    if (entry.kind === 'directory') {
      await loadPanel(activeSide, entry.fullPath)
      return
    }
    const parentPath = entry.fullPath.replace(/[\\/][^\\/]*$/, '')
    const setPanel = activeSide === 'left' ? setLeft : setRight
    try {
      if (!api) throw new Error(t.webLimited)
      const listing = await api.listDirectory(parentPath)
      setPanel(current => ({ ...current, listing, selected: [entry.fullPath], busy: false }))
    } catch (error) {
      showError(t.errorTitle, error)
    }
  }

  function sortPanel(side: PanelSide, key: SortKey) {
    const setPanel = side === 'left' ? setLeft : setRight
    setPanel(current => ({
      ...current,
      sortKey: key,
      sortDirection: current.sortKey === key && current.sortDirection === 'asc' ? 'desc' : 'asc',
    }))
  }

  async function renameActive() {
    if (!api || activePanel.selected.length !== 1) return
    const currentName = activePanel.selected[0].split(/[\\/]/).pop() || ''
    const name = await promptName(t.rename, currentName)
    if (name) await runAction(t.rename, () => api.renamePath(activePanel.selected[0], name))
  }

  async function copyActiveToOther() {
    if (!api || activePanel.selected.length === 0 || !otherPanel.listing) return
    await runAction(t.copy, () => api.copy({ sources: activePanel.selected, destinationDir: otherPanel.listing!.path }))
  }

  async function copyBetweenPanels(from: PanelSide) {
    if (!api) return
    const source = from === 'left' ? left : right
    const destination = from === 'left' ? right : left
    if (source.selected.length === 0 || !destination.listing) return
    setActiveSide(from)
    await runAction(t.copy, () => api.copy({ sources: source.selected, destinationDir: destination.listing!.path }))
  }

  async function moveActiveToOther() {
    if (!api || activePanel.selected.length === 0 || !otherPanel.listing) return
    await runAction(t.move, () => api.move({ sources: activePanel.selected, destinationDir: otherPanel.listing!.path }))
  }

  async function moveBetweenPanels(from: PanelSide) {
    if (!api) return
    const source = from === 'left' ? left : right
    const destination = from === 'left' ? right : left
    if (source.selected.length === 0 || !destination.listing) return
    setActiveSide(from)
    await runAction(t.move, () => api.move({ sources: source.selected, destinationDir: destination.listing!.path }))
  }

  async function pasteClipboard() {
    if (!api || !clipboard || !activePanel.listing) return
    await runAction(t.paste, () => clipboard.mode === 'copy'
      ? api.copy({ sources: clipboard.paths, destinationDir: activePanel.listing!.path })
      : api.move({ sources: clipboard.paths, destinationDir: activePanel.listing!.path }))
  }

  async function copyDroppedFiles(side: PanelSide, event: React.DragEvent) {
    event.preventDefault()
    setDragOverSide(null)

    const panel = side === 'left' ? left : right
    const destinationDir = panel.listing?.path
    if (!api || !destinationDir) return

    const sources = Array.from(event.dataTransfer.files)
      .map(file => api.getDroppedFilePath(file))
      .filter(Boolean)
    if (sources.length === 0) return

    setActiveSide(side)
    await runAction(t.copy, () => api.copy({ sources, destinationDir }))
  }

  function startFileDrag(side: PanelSide, entry: FileEntry) {
    if (!api) return

    const panel = side === 'left' ? left : right
    const paths = panel.selected.includes(entry.fullPath) ? panel.selected : [entry.fullPath]
    if (paths.length === 0) return

    setActiveSide(side)
    api.startDrag(paths)
  }

  async function deleteActive() {
    if (!api || activePanel.selected.length === 0 || !await showConfirm(t.delete, t.deleteConfirm)) return
    await runAction(t.delete, () => api.delete(activePanel.selected))
  }

  async function showProperties() {
    if (!api || activePanel.selected.length !== 1) return
    setStatus(activePanel.selected[0])
  }

  function toggleTree(side: PanelSide) {
    const panel = side === 'left' ? left : right
    setActiveSide(side)
    setTreeSide(current => current === side ? null : side)
    if (panel.listing) void expandTreeNode(panel.listing.path)
  }

  async function expandTreeNode(targetPath: string) {
    if (!api) return
    const current = treeNodes[targetPath]
    if (current?.expanded && current.children.length > 0) {
      setTreeNodes(nodes => ({ ...nodes, [targetPath]: { ...nodes[targetPath], expanded: false } }))
      return
    }

    setTreeNodes(nodes => ({ ...nodes, [targetPath]: { expanded: true, loading: true, children: nodes[targetPath]?.children ?? [] } }))
    try {
      const listing = await api.listDirectory(targetPath)
      setTreeNodes(nodes => ({
        ...nodes,
        [targetPath]: { expanded: true, loading: false, children: listing.entries.filter(child => child.kind === 'directory') },
      }))
    } catch (error) {
      setTreeNodes(nodes => ({ ...nodes, [targetPath]: { expanded: true, loading: false, children: [], error: error instanceof Error ? error.message : String(error) } }))
    }
  }

  function selectTreeDirectory(side: PanelSide, targetPath: string) {
    setTreeSide(null)
    void loadPanel(side, targetPath)
  }

  function selectAllActive() {
    const setPanel = activeSide === 'left' ? setLeft : setRight
    setPanel(current => ({ ...current, selected: current.listing?.entries.map(entry => entry.fullPath) ?? [] }))
  }

  function clearActiveSelection() {
    const setPanel = activeSide === 'left' ? setLeft : setRight
    setPanel(current => ({ ...current, selected: [] }))
  }

  function switchLanguage() {
    setPreferences({ ...preferences, language: preferences.language === 'ko' ? 'en' : 'ko' })
  }

  function switchTheme() {
    setPreferences({ ...preferences, theme: preferences.theme === 'light' ? 'dark' : 'light' })
  }

  function showAbout() {
    setAppDialog({ kind: 'info', title: t.about, message: '' })
  }

  function showPrompt(title: string, value: string) {
    return new Promise<string | null>(resolve => setAppDialog({ kind: 'prompt', title, value, resolve }))
  }

  function showConfirm(title: string, message: string) {
    return new Promise<boolean>(resolve => setAppDialog({ kind: 'confirm', title, message, resolve }))
  }

  function closeAppDialog() {
    if (appDialog?.kind === 'prompt') appDialog.resolve(null)
    if (appDialog?.kind === 'confirm') appDialog.resolve(false)
    setAppDialog(null)
  }

  function confirmAppDialog() {
    if (appDialog?.kind === 'prompt') appDialog.resolve(appDialog.value)
    if (appDialog?.kind === 'confirm') appDialog.resolve(true)
    setAppDialog(null)
  }

  function openContextMenu(event: React.MouseEvent, side: PanelSide, entry: FileEntry) {
    event.preventDefault()
    setActiveSide(side)
    const setPanel = side === 'left' ? setLeft : setRight
    setPanel(current => ({ ...current, selected: current.selected.includes(entry.fullPath) ? current.selected : [entry.fullPath] }))
    setContextMenu({ x: event.clientX, y: event.clientY, side, entry })
  }

  async function toggleIndex() {
    if (!api) return
    if (indexStatus.state === 'building') await api.cancelIndex()
    else void api.rebuildIndex()
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="title-block">
          <img src="./app_icon.ico" alt="" />
          <h1>CommandCenter V1.0.0</h1>
        </div>
        <div className="topbar-actions">
          <div className="toolbar">
            <button title={t.newFolder} onClick={() => activePanel.listing && void promptName(t.newFolder).then(name => { if (name) void runAction(t.newFolder, () => api!.createFolder(activePanel.listing!.path, name)) })} disabled={!api}><FolderPlus /></button>
            <button title={t.newFile} onClick={() => activePanel.listing && void promptName(t.newFile).then(name => { if (name) void runAction(t.newFile, () => api!.createFile(activePanel.listing!.path, name)) })} disabled={!api}><FilePlus2 /></button>
            <button title={`${t.copy} (F5)`} onClick={() => void copyActiveToOther()} disabled={!api || activePanel.selected.length === 0 || !otherPanel.listing}><Copy /></button>
            <button title={t.paste} onClick={() => void pasteClipboard()} disabled={!api || !clipboard}><ChevronUp /></button>
            <button title={`${t.delete} (F8)`} onClick={() => void deleteActive()} disabled={!api || activePanel.selected.length === 0}><Trash2 /></button>
            <button title={`${t.rename} (F2)`} onClick={() => void renameActive()} disabled={!api || activePanel.selected.length !== 1}>F2</button>
            <button title={t.compress} onClick={() => activePanel.selected.length > 0 && activePanel.listing && void api!.chooseSaveZip(`${activePanel.listing.path}/archive.zip`).then(target => { if (target) void runAction(t.compress, () => api!.compress({ sources: activePanel.selected, destinationZip: target, splitSizeBytes: 0 })) })} disabled={!api || activePanel.selected.length === 0}><Archive /></button>
            <button title={t.extract} onClick={() => activePanel.selected[0] && activePanel.listing && void runAction(t.extract, () => api!.extract({ archivePath: activePanel.selected[0], destinationDir: activePanel.listing!.path }))} disabled={!api || activePanel.selected.length !== 1}><Archive /></button>
            <button title={`${t.theme}: ${preferences.theme === 'light' ? t.lightTheme : t.darkTheme}`} onClick={switchTheme}>{preferences.theme === 'light' ? <Moon /> : <Sun />}</button>
            <button title={t.language} onClick={switchLanguage}><Languages /></button>
          </div>
          <div className="window-controls" aria-label="Window controls">
            <button title={t.about} onClick={showAbout}><Info /></button>
            <button title={t.minimize} onClick={() => void api?.minimizeWindow()} disabled={!api}><Minus /></button>
            <button title={t.maximize} onClick={() => void api?.toggleMaximizeWindow()} disabled={!api}><Square /></button>
            <button className="close" title={t.close} onClick={() => void api?.closeWindow()} disabled={!api}><X /></button>
          </div>
        </div>
      </header>

      <section className="searchbar">
        <Search size={18} />
        <input value={query} onChange={event => { setQuery(event.target.value); if (!event.target.value.trim()) setSearchOpen(false) }} onKeyDown={event => event.key === 'Enter' && void searchActive()} onFocus={() => searchResults.length > 0 && setSearchOpen(true)} placeholder={t.searchPlaceholder} />
        <label><input type="checkbox" checked={includeFolders} onChange={event => setIncludeFolders(event.target.checked)} /> {t.includeFolders}</label>
        <label><input type="checkbox" checked={searchContent} onChange={event => setSearchContent(event.target.checked)} /> {t.contentSearch}</label>
        <label><input type="checkbox" checked={useIndex} onChange={event => setUseIndex(event.target.checked)} disabled={searchContent || indexStatus.state !== 'ready'} /> {t.useIndex}</label>
        {searchContent && <input className="content-search" value={contentQuery} onChange={event => setContentQuery(event.target.value)} onKeyDown={event => event.key === 'Enter' && void searchActive()} placeholder={t.contentPlaceholder} />}
        <button title={t.searchAction} onClick={() => void searchActive()} disabled={!api || !query.trim()}><Search size={16} /> {t.searchAction}</button>
        <button title={indexStatus.state === 'building' ? t.stopIndex : t.rebuildIndex} onClick={() => void toggleIndex()} disabled={!api}><Database size={16} /> {indexStatus.state === 'building' ? t.stopIndex : t.rebuildIndex}</button>
        <button title={t.refresh} onClick={() => activePanel.listing && void loadPanel(activeSide, activePanel.listing.path)}><RefreshCw size={16} /></button>
        {searchOpen && <div className="search-results-dropdown">
          <header>{t.searchResults}</header>
          {searchResults.length === 0 && <p>{t.noSearchResults}</p>}
          {searchResults.map(result => <button key={result.fullPath} onClick={() => void openSearchResult(result)}>
            <span>{result.kind === 'directory' ? t.folderKind : result.extension || t.fileKind}</span>
            <strong>{result.name}</strong>
            <small>{result.fullPath}</small>
          </button>)}
        </div>}
      </section>

      <main className="workspace">
        <FilePanel side="left" title={t.left} panel={left} active={activeSide === 'left'} dropTarget={dragOverSide === 'left'} treeOpen={treeSide === 'left'} roots={info.roots} treeNodes={treeNodes} columns={{ name: t.nameColumn, size: t.sizeColumn, type: t.typeColumn, modified: t.modifiedColumn }} labels={{ loading: t.loading, noFiles: t.noFiles, folder: t.folderKind, file: t.fileKind, showLocations: t.showLocations, parentDirectory: t.parentDirectory }} onActivate={() => setActiveSide('left')} onNavigate={path => loadPanel('left', path)} onToggleTree={toggleTree} onExpandTree={expandTreeNode} onSelectTree={selectTreeDirectory} onSelect={selectEntry} onOpen={openEntry} onSort={sortPanel} onContextMenu={openContextMenu} onDragOver={setDragOverSide} onDropFiles={copyDroppedFiles} onStartDrag={startFileDrag} />
        <div className="center-split" aria-label="Panel transfer controls">
          <button title={`${t.copy}: ${t.left} → ${t.right}`} onClick={() => void copyBetweenPanels('left')} disabled={!api || left.selected.length === 0 || !right.listing}><Copy />→</button>
          <button title={`${t.move}: ${t.left} → ${t.right}`} onClick={() => void moveBetweenPanels('left')} disabled={!api || left.selected.length === 0 || !right.listing}><MoveRight />→</button>
          <button title={`${t.copy}: ${t.right} → ${t.left}`} onClick={() => void copyBetweenPanels('right')} disabled={!api || right.selected.length === 0 || !left.listing}>←<Copy /></button>
          <button title={`${t.move}: ${t.right} → ${t.left}`} onClick={() => void moveBetweenPanels('right')} disabled={!api || right.selected.length === 0 || !left.listing}>←<MoveRight /></button>
        </div>
        <FilePanel side="right" title={t.right} panel={right} active={activeSide === 'right'} dropTarget={dragOverSide === 'right'} treeOpen={treeSide === 'right'} roots={info.roots} treeNodes={treeNodes} columns={{ name: t.nameColumn, size: t.sizeColumn, type: t.typeColumn, modified: t.modifiedColumn }} labels={{ loading: t.loading, noFiles: t.noFiles, folder: t.folderKind, file: t.fileKind, showLocations: t.showLocations, parentDirectory: t.parentDirectory }} onActivate={() => setActiveSide('right')} onNavigate={path => loadPanel('right', path)} onToggleTree={toggleTree} onExpandTree={expandTreeNode} onSelectTree={selectTreeDirectory} onSelect={selectEntry} onOpen={openEntry} onSort={sortPanel} onContextMenu={openContextMenu} onDragOver={setDragOverSide} onDropFiles={copyDroppedFiles} onStartDrag={startFileDrag} />
      </main>

      {contextMenu && <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={event => event.stopPropagation()}>
        <button onClick={() => { setContextMenu(null); void openEntry(contextMenu.entry) }}><FolderPlus /> {t.open}</button>
        <button onClick={() => { setContextMenu(null); void api?.revealPath(contextMenu.entry.fullPath) }}><Search /> {t.reveal}</button>
        <hr />
        <button onClick={() => { setContextMenu(null); void copyActiveToOther() }}><Copy /> {t.copy} →</button>
        <button onClick={() => { setContextMenu(null); void moveActiveToOther() }}><MoveRight /> {t.move} →</button>
        <hr />
        <button onClick={() => { setContextMenu(null); void renameActive() }}><FilePlus2 /> {t.rename}</button>
        <button onClick={() => { setContextMenu(null); void deleteActive() }}><Trash2 /> {t.delete}</button>
        <hr />
        <button onClick={() => {
          setContextMenu(null)
          if (activePanel.listing) void api!.chooseSaveZip(`${activePanel.listing.path}/archive.zip`).then(target => { if (target) void runAction(t.compress, () => api!.compress({ sources: activePanel.selected, destinationZip: target, splitSizeBytes: 0 })) })
        }}><Archive /> {t.compress}</button>
        <button onClick={() => {
          setContextMenu(null)
          if (activePanel.listing) void runAction(t.extract, () => api!.extract({ archivePath: contextMenu.entry.fullPath, destinationDir: activePanel.listing!.path }))
        }}><Archive /> {t.extract}</button>
        <hr />
        <button onClick={() => { setContextMenu(null); void showProperties() }}><Info /> {t.properties}</button>
      </div>}

      {showDirectoryLoading && <div className="loading-popup" role="status" aria-live="polite">
        <strong>{t.loading}</strong>
        <div className="loading-track"><span /></div>
        <small>{[left.busy && t.left, right.busy && t.right].filter(Boolean).join(' / ')}</small>
      </div>}

      {progress && <div className="progress-strip" role="status" aria-live="polite">
        <strong>{localizeProgressLabel(progress.label, t)}</strong>
        <div className="progress-track"><span style={{ width: `${progress.total > 0 ? Math.min(100, (progress.completed / progress.total) * 100) : 0}%` }} /></div>
        <span>{progress.completed}/{progress.total}</span>
        <small>{progress.currentPath}</small>
      </div>}
      {errorDialog && <div className="dialog-backdrop" role="presentation">
        <section className="error-dialog" role="alertdialog" aria-modal="true" aria-labelledby="error-dialog-title">
          <header>
            <strong id="error-dialog-title">{errorDialog.title}</strong>
          </header>
          <p>{errorDialog.message}</p>
          <label>{t.errorDetails}</label>
          <textarea readOnly value={errorDialog.detail} />
          <footer>
            <button onClick={() => void copyErrorDetails()}><Copy /> {errorDialog.copied ? t.copiedDetails : t.copyDetails}</button>
            <button onClick={() => setErrorDialog(null)}><X /> {t.close}</button>
          </footer>
        </section>
      </div>}
      {appDialog && <div className="dialog-backdrop" role="presentation">
        <section className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title">
          <header>
            <strong id="app-dialog-title">{appDialog.title}</strong>
          </header>
          {appDialog.kind === 'prompt' && <input autoFocus value={appDialog.value} onChange={event => setAppDialog({ ...appDialog, value: event.target.value })} onKeyDown={event => event.key === 'Enter' && confirmAppDialog()} />}
          {appDialog.kind === 'info' && <AboutContent t={t} />}
          {appDialog.kind === 'confirm' && <p>{appDialog.message}</p>}
          <footer className={appDialog.kind === 'info' ? 'centered-actions' : undefined}>
            {appDialog.kind !== 'info' && <button onClick={closeAppDialog}><X /> {t.cancel}</button>}
            <button onClick={confirmAppDialog}><Check /> {t.ok}</button>
          </footer>
        </section>
      </div>}
      <footer className="statusbar">
        <span>{status}</span>
        <span>{formatPanelStatus(activeSide, activePanel, t)}</span>
        <span>{formatIndexStatus(indexStatus, t)}</span>
      </footer>
    </div>
  )
}

function AboutContent({ t }: { t: typeof translations.ko }) {
  return <div className="about-content">
    <img src="./app_icon.ico" alt="" />
    <div>
      <h2>CommandCenter</h2>
      <p>{t.aboutDescription}</p>
      <dl>
        <div><dt>{t.versionLabel}</dt><dd>{appVersion}</dd></div>
        <div><dt>{t.buildLabel}</dt><dd>{appBuildNumber}</dd></div>
        <div><dt>{t.copyrightLabel}</dt><dd>{appCopyright}</dd></div>
        <div><dt>{t.authorLabel}</dt><dd>{appAuthor}</dd></div>
      </dl>
    </div>
  </div>
}

function FilePanel({ side, title, panel, active, dropTarget, treeOpen, roots, treeNodes, columns, labels, onActivate, onNavigate, onToggleTree, onExpandTree, onSelectTree, onSelect, onOpen, onSort, onContextMenu, onDragOver, onDropFiles, onStartDrag }: {
  side: PanelSide
  title: string
  panel: PanelState
  active: boolean
  dropTarget: boolean
  treeOpen: boolean
  roots: string[]
  treeNodes: Record<string, TreeNodeState>
  columns: { name: string; size: string; type: string; modified: string }
  labels: { loading: string; noFiles: string; folder: string; file: string; showLocations: string; parentDirectory: string }
  onActivate(): void
  onNavigate(path: string): void | Promise<void>
  onToggleTree(side: PanelSide): void
  onExpandTree(path: string): void | Promise<void>
  onSelectTree(side: PanelSide, path: string): void
  onSelect(side: PanelSide, entry: FileEntry, multi: boolean): void | Promise<void>
  onOpen(entry: FileEntry): void | Promise<void>
  onSort(side: PanelSide, key: SortKey): void
  onContextMenu(event: React.MouseEvent, side: PanelSide, entry: FileEntry): void
  onDragOver(side: PanelSide | null): void
  onDropFiles(side: PanelSide, event: React.DragEvent): void | Promise<void>
  onStartDrag(side: PanelSide, entry: FileEntry): void
}) {
  const entries = sortEntries(panel.listing?.entries ?? [], panel.sortKey, panel.sortDirection)
  const [pathDropdownOpen, setPathDropdownOpen] = useState(false)

  useEffect(() => {
    setPathDropdownOpen(false)
  }, [panel.listing?.path])

  return <section
    className={`file-panel ${active ? 'active' : ''} ${dropTarget ? 'drop-target' : ''}`}
    onFocus={onActivate}
    onClick={onActivate}
    onDragEnter={event => {
      event.preventDefault()
      onDragOver(side)
    }}
    onDragOver={event => {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
      onDragOver(side)
    }}
    onDragLeave={event => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
      onDragOver(null)
    }}
    onDrop={event => void onDropFiles(side, event)}
  >
    <header>
      <button className="panel-title" title={`${title}: ${labels.showLocations}`} onClick={() => onToggleTree(side)}>{treeOpen ? '▾' : '▸'} {title}</button>
      <button title={labels.parentDirectory} onClick={() => panel.listing?.parentPath && void onNavigate(panel.listing.parentPath)} disabled={!panel.listing?.parentPath}><ChevronUp size={16} /></button>
      <button className="current-path" onClick={() => panel.listing && setPathDropdownOpen(open => !open)} disabled={!panel.listing}>{panel.listing?.path ?? '...'}</button>
      {treeOpen && <DirectoryTree side={side} roots={roots} currentPath={panel.listing?.path ?? ''} treeNodes={treeNodes} loadingLabel={labels.loading} onExpand={onExpandTree} onSelect={onSelectTree} />}
      {pathDropdownOpen && <div className="path-dropdown" onClick={event => event.stopPropagation()}>
        {entries.length === 0 && <p>{labels.noFiles}</p>}
        {entries.map(entry => <button key={entry.fullPath} onClick={() => {
          setPathDropdownOpen(false)
          if (entry.kind === 'directory') void onNavigate(entry.fullPath)
          else void onOpen(entry)
        }}>
          <span>{entry.kind === 'directory' ? '▸' : ''}</span>
          <strong>{entry.name}</strong>
          <small>{entry.kind === 'directory' ? labels.folder : entry.extension || labels.file}</small>
        </button>)}
      </div>}
    </header>
    <div className="table-head">
      <button onClick={() => onSort(side, 'name')}>{columns.name} {sortMark(panel, 'name')}</button>
      <button onClick={() => onSort(side, 'size')}>{columns.size} {sortMark(panel, 'size')}</button>
      <button onClick={() => onSort(side, 'type')}>{columns.type} {sortMark(panel, 'type')}</button>
      <button onClick={() => onSort(side, 'modified')}>{columns.modified} {sortMark(panel, 'modified')}</button>
    </div>
    <div className="file-list" role="listbox" aria-label={title}>
      {!panel.busy && panel.listing?.entries.length === 0 && <p className="empty">{labels.noFiles}</p>}
      {entries.map(entry => <button
        key={entry.fullPath}
        draggable
        className={`file-row ${panel.selected.includes(entry.fullPath) ? 'selected' : ''}`}
        onClick={event => void onSelect(side, entry, event.ctrlKey || event.metaKey)}
        onDoubleClick={() => void onOpen(entry)}
        onContextMenu={event => onContextMenu(event, side, entry)}
        onDragStart={event => {
          event.preventDefault()
          onStartDrag(side, entry)
        }}
      >
        <span>{entry.kind === 'directory' ? '▸ ' : ''}{entry.name}</span>
        <span>{entry.kind === 'directory' ? '' : formatSize(entry.size)}</span>
        <span>{entry.kind === 'directory' ? labels.folder : entry.extension || labels.file}</span>
        <span>{new Date(entry.modifiedMs).toLocaleString()}</span>
      </button>)}
    </div>
  </section>
}

function DirectoryTree({ side, roots, currentPath, treeNodes, loadingLabel, onExpand, onSelect }: {
  side: PanelSide
  roots: string[]
  currentPath: string
  treeNodes: Record<string, TreeNodeState>
  loadingLabel: string
  onExpand(path: string): void | Promise<void>
  onSelect(side: PanelSide, path: string): void
}) {
  return <div className="directory-tree" onClick={event => event.stopPropagation()}>
    {roots.map(root => <DirectoryTreeItem key={root} side={side} path={root} label={root} currentPath={currentPath} depth={0} treeNodes={treeNodes} loadingLabel={loadingLabel} onExpand={onExpand} onSelect={onSelect} />)}
  </div>
}

function DirectoryTreeItem({ side, path, label, currentPath, depth, treeNodes, loadingLabel, onExpand, onSelect }: {
  side: PanelSide
  path: string
  label: string
  currentPath: string
  depth: number
  treeNodes: Record<string, TreeNodeState>
  loadingLabel: string
  onExpand(path: string): void | Promise<void>
  onSelect(side: PanelSide, path: string): void
}) {
  const node = treeNodes[path]
  const selected = normalizePath(path) === normalizePath(currentPath)

  return <div className="tree-node">
    <div className={`tree-row ${selected ? 'selected' : ''}`} style={{ paddingLeft: 8 + depth * 16 }}>
      <button className="tree-expander" onClick={() => void onExpand(path)}>{node?.expanded ? '▾' : '▸'}</button>
      <button className="tree-label" onClick={() => onSelect(side, path)}>{label}</button>
    </div>
    {node?.loading && <div className="tree-message" style={{ paddingLeft: 32 + depth * 16 }}>{loadingLabel}</div>}
    {node?.error && <div className="tree-message error" style={{ paddingLeft: 32 + depth * 16 }}>{node.error}</div>}
    {node?.expanded && node.children.map(child => <DirectoryTreeItem key={child.fullPath} side={side} path={child.fullPath} label={child.name} currentPath={currentPath} depth={depth + 1} treeNodes={treeNodes} loadingLabel={loadingLabel} onExpand={onExpand} onSelect={onSelect} />)}
  </div>
}

function sortEntries(entries: FileEntry[], sortKey: SortKey, direction: SortDirection) {
  const factor = direction === 'asc' ? 1 : -1
  return [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    if (sortKey === 'size') return (a.size - b.size) * factor
    if (sortKey === 'modified') return (a.modifiedMs - b.modifiedMs) * factor
    if (sortKey === 'type') return (a.extension || a.kind).localeCompare(b.extension || b.kind) * factor
    return a.name.localeCompare(b.name) * factor
  })
}

function sortMark(panel: PanelState, key: SortKey) {
  if (panel.sortKey !== key) return ''
  return panel.sortDirection === 'asc' ? '▲' : '▼'
}

function formatIndexStatus(status: IndexStatus, t: typeof translations.ko) {
  if (status.state === 'building') return `${t.indexingStatus} ${status.indexedCount.toLocaleString()} ${t.itemCount}`
  if (status.state === 'ready') return `${t.indexReadyStatus} ${status.count.toLocaleString()} ${t.itemCount}`
  return t.indexNotBuiltStatus
}

function formatPanelStatus(side: PanelSide, panel: PanelState, t: typeof translations.ko) {
  if (!panel.listing) return `${t.activePanelLabel}: ${side === 'left' ? t.left : t.right}`
  const folders = panel.listing.entries.filter(entry => entry.kind === 'directory').length
  const files = panel.listing.entries.length - folders
  return [
    `${t.activePanelLabel}: ${side === 'left' ? t.left : t.right}`,
    `${t.selectedCount} ${panel.selected.length.toLocaleString()}`,
    `${t.totalCount} ${panel.listing.entries.length.toLocaleString()}`,
    `${t.folderCount} ${folders.toLocaleString()}`,
    `${t.fileCount} ${files.toLocaleString()}`,
    panel.listing.path,
  ].join(' · ')
}

function localizeProgressLabel(label: string, t: typeof translations.ko) {
  const labels: Record<string, string> = {
    Copy: t.copy,
    Move: t.move,
    Delete: t.delete,
  }
  return labels[label] ?? label
}

function formatErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message || error.name
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function formatErrorDetail(title: string, error: unknown, context: { activeSide: PanelSide; activePath: string | null; leftPath: string | null; rightPath: string | null; platform: AppInfo['platform']; os: AppInfo['os'] }) {
  const lines = [
    `Title: ${title}`,
    `Time: ${new Date().toISOString()}`,
    `App: CommandCenter ${appVersion} (${appBuildNumber})`,
    `Platform: ${context.platform} / ${context.os}`,
    `Active panel: ${context.activeSide}`,
    `Active path: ${context.activePath ?? '(none)'}`,
    `Left path: ${context.leftPath ?? '(none)'}`,
    `Right path: ${context.rightPath ?? '(none)'}`,
    '',
    `Message: ${formatErrorMessage(error)}`,
  ]

  if (error instanceof Error) {
    if (error.name) lines.push(`Name: ${error.name}`)
    if (error.stack) lines.push('', 'Stack:', error.stack)
    if ('cause' in error && error.cause) lines.push('', 'Cause:', formatErrorMessage(error.cause))
  } else {
    lines.push('', 'Raw error:', formatErrorMessage(error))
  }

  return lines.join('\n')
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function normalizePath(targetPath: string) {
  return targetPath.replace(/[\\/]$/, '').toLowerCase()
}

export default App
