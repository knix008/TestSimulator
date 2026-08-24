import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type {
  ArchiveEntry,
  ArchiveFormat,
  CompressOptions,
  DirListing,
  FormatCaps,
  FsEntry,
  InputSource,
  Progress
} from '@core/types'
import { getDict, detectInitialLang, type Dict, type Lang } from '@core/i18n'
import { formatBytes } from '@core/format'
import { useArchiveService } from './ServiceContext'

export type Theme = 'dark' | 'light'

interface Toast {
  msg: string
  kind: 'info' | 'warn' | 'error'
  /** 선택적 액션 버튼(예: 결과 폴더 열기). */
  action?: { label: string; onClick: () => void }
}

interface Store {
  t: Dict
  lang: Lang
  toggleLang: () => void
  theme: Theme
  toggleTheme: () => void

  caps: FormatCaps
  isDesktop: boolean
  appVersion: string

  // 압축 옵션
  format: ArchiveFormat
  setFormat: (f: ArchiveFormat) => void
  split: boolean
  setSplit: (b: boolean) => void
  splitSizeMb: number
  setSplitSizeMb: (n: number) => void
  overwrite: boolean
  setOverwrite: (b: boolean) => void

  busy: boolean
  progress: Progress | null

  previewArchive: string | null
  previewEntries: ArchiveEntry[] | null
  /** 오른쪽 패널에 표시할 일반 파일 정보(아카이브가 아닐 때). */
  fileInfo: FsEntry | null

  // 파일 시스템 탐색(왼쪽 패널)
  canBrowse: boolean
  listing: DirListing | null
  browseBusy: boolean
  selectedArchivePath: string | null
  browseTo: (path: string) => Promise<void>
  browseUp: () => Promise<void>
  openFsEntry: (entry: FsEntry) => Promise<void>

  // 설정(기본 폴더 · 마지막 폴더 기억)
  defaultDir: string
  setDefaultDir: (path: string) => void
  pickDefaultDir: () => Promise<void>
  useCurrentAsDefault: () => void
  /** 직전에 사용한 압축 해제 폴더(다음 해제 시 기본값). */
  extractDir: string
  setExtractDir: (path: string) => void
  /** 직전에 사용한 압축 저장 폴더(다음 압축 팝업의 기본 폴더). */
  compressDir: string
  setCompressDir: (path: string) => void
  rememberLast: boolean
  setRememberLast: (b: boolean) => void
  settingsOpen: boolean
  setSettingsOpen: (b: boolean) => void

  toast: Toast | null
  notify: (msg: string, kind: 'info' | 'warn' | 'error', action?: Toast['action']) => void
  dismissToast: () => void
  /** 진행 중인 압축/해제 작업 취소. */
  cancelOperation: () => void

  // 심각한 오류: 상세 내용을 팝업으로 표시 + 복사 가능
  errorDetail: string | null
  showError: (detail: string) => void
  clearError: () => void

  aboutOpen: boolean
  setAboutOpen: (b: boolean) => void

  // 액션 (선택 → 실행, 참고 앱 흐름과 동일)
  doCompress: (kind: 'files' | 'folder') => Promise<void>
  compressEntry: (entry: FsEntry) => Promise<void>
  doExtract: (selection?: string[], archivePath?: string) => Promise<void>
  doPreview: () => Promise<void>
  // 압축 옵션 팝업(대상이 정해지면 열림). 확인 시 지정 옵션으로 압축.
  compressReq: InputSource[] | null
  confirmCompress: (opts: CompressOptions) => Promise<void>
  cancelCompress: () => void

  // 파일 작업 실행 취소/다시 실행(실제 스택은 FileBrowser 가 관리, 여기로 등록).
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
  setUndoRedo: (v: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }) => void

  // 창 제어 (데스크톱)
  minimize: () => void
  maximizeToggle: () => void
  close: () => void
}

const StoreContext = createContext<Store | null>(null)

export function useStore(): Store {
  const s = useContext(StoreContext)
  if (!s) throw new Error('StoreProvider 가 필요합니다.')
  return s
}

/** 예외에서 사람이 읽을 수 있는 상세 문자열(메시지 + 스택)을 추출. */
function errorText(e: unknown): string {
  if (e instanceof Error) return e.stack ? `${e.message}\n\n${e.stack}` : e.message
  return String(e)
}

/** 접근 불가/없음 폴더 오류를 친절한 지역화 메시지로 매핑(없으면 null). */
function fsErrorMessage(e: unknown, t: Dict): string | null {
  const msg = e instanceof Error ? e.message : String(e)
  const m = msg.match(/(EPERM|EACCES|ENOENT|ENOTDIR):\s*(.*)$/)
  if (!m) return null
  const target = m[2]?.trim()
  return m[1] === 'ENOENT' ? t.dirNotFound(target) : t.accessDenied(target)
}

function readLS<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback
  } catch {
    return fallback
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const svc = useArchiveService()
  const caps = useMemo(() => svc.capabilities(), [svc])
  const canBrowse = svc.canBrowse()

  const [lang, setLang] = useState<Lang>(() => readLS<Lang>('zm.lang', detectInitialLang()))
  const [theme, setTheme] = useState<Theme>(() => readLS<Theme>('zm.theme', 'dark'))
  const t = useMemo(() => getDict(lang), [lang])

  // 압축 옵션(마지막 선택을 기억해 다음 압축 팝업의 기본값으로 사용).
  const [format, setFormatState] = useState<ArchiveFormat>(() => readLS('zm.format', 'zip') as ArchiveFormat)
  const [split, setSplitState] = useState<boolean>(() => readLS<string>('zm.split', '0') === '1')
  const [splitSizeMb, setSplitSizeMbState] = useState<number>(() => {
    const n = Number(readLS<string>('zm.splitSizeMb', '10'))
    return n >= 1 ? n : 10
  })
  const [overwrite, setOverwrite] = useState(true)
  // 압축 옵션 팝업이 대상으로 삼는 입력들(null 이면 팝업 닫힘).
  const [compressReq, setCompressReq] = useState<InputSource[] | null>(null)

  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [previewArchive, setPreviewArchive] = useState<string | null>(null)
  const [previewEntries, setPreviewEntries] = useState<ArchiveEntry[] | null>(null)
  const [fileInfo, setFileInfo] = useState<FsEntry | null>(null)
  const [listing, setListing] = useState<DirListing | null>(null)
  const [browseBusy, setBrowseBusy] = useState(false)
  const [selectedArchivePath, setSelectedArchivePath] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [appVersion, setAppVersion] = useState('1.0.0')
  const [defaultDir, setDefaultDirState] = useState<string>(() => readLS('zm.defaultDir', ''))
  const [extractDir, setExtractDirState] = useState<string>(() => readLS('zm.extractDir', ''))
  const [compressDir, setCompressDirState] = useState<string>(() => readLS('zm.compressDir', ''))
  const [rememberLast, setRememberLastState] = useState<boolean>(() => readLS<string>('zm.rememberLast', '1') !== '0')
  const [settingsOpen, setSettingsOpen] = useState(false)

  const win = (typeof window !== 'undefined' ? (window as any).zipmaster : undefined) as
    | undefined
    | {
        getVersion?: () => Promise<string>
        minimizeWindow?: () => void
        maximizeWindow?: () => void
        closeWindow?: () => void
      }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('zm.theme', theme)
    } catch {}
  }, [theme])

  useEffect(() => {
    try {
      localStorage.setItem('zm.lang', lang)
    } catch {}
    document.documentElement.setAttribute('lang', lang)
  }, [lang])

  useEffect(() => {
    win?.getVersion?.().then((v) => v && setAppVersion(v))
  }, [])

  const setDefaultDir = useCallback((path: string) => {
    setDefaultDirState(path)
    try {
      localStorage.setItem('zm.defaultDir', path)
    } catch {}
  }, [])

  const setExtractDir = useCallback((path: string) => {
    setExtractDirState(path)
    try {
      localStorage.setItem('zm.extractDir', path)
    } catch {}
  }, [])

  const setCompressDir = useCallback((path: string) => {
    setCompressDirState(path)
    try {
      localStorage.setItem('zm.compressDir', path)
    } catch {}
  }, [])

  const setFormat = useCallback((f: ArchiveFormat) => {
    setFormatState(f)
    try {
      localStorage.setItem('zm.format', f)
    } catch {}
  }, [])

  const setSplit = useCallback((b: boolean) => {
    setSplitState(b)
    try {
      localStorage.setItem('zm.split', b ? '1' : '0')
    } catch {}
  }, [])

  const setSplitSizeMb = useCallback((n: number) => {
    setSplitSizeMbState(n)
    try {
      localStorage.setItem('zm.splitSizeMb', String(n))
    } catch {}
  }, [])

  const setRememberLast = useCallback((b: boolean) => {
    setRememberLastState(b)
    try {
      localStorage.setItem('zm.rememberLast', b ? '1' : '0')
    } catch {}
  }, [])

  const notify = useCallback((msg: string, kind: 'info' | 'warn' | 'error', action?: Toast['action']) => {
    setToast({ msg, kind, action })
    window.clearTimeout((notify as any)._t)
    // 액션이 있는 토스트는 눌러볼 시간을 위해 더 오래 유지.
    ;(notify as any)._t = window.setTimeout(() => setToast(null), action ? 9000 : 5000)
  }, [])

  const dismissToast = useCallback(() => {
    window.clearTimeout((notify as any)._t)
    setToast(null)
  }, [notify])

  const cancelOperation = useCallback(() => svc.cancel(), [svc])

  // 실행 취소/다시 실행 핸들러는 FileBrowser 가 스택과 함께 등록한다.
  const [undoRedo, setUndoRedoState] = useState<{
    undo: () => void
    redo: () => void
    canUndo: boolean
    canRedo: boolean
  }>({ undo: () => {}, redo: () => {}, canUndo: false, canRedo: false })
  const setUndoRedo = useCallback((v: typeof undoRedo) => setUndoRedoState(v), [])

  const showError = useCallback((detail: string) => setErrorDetail(detail), [])
  const clearError = useCallback(() => setErrorDetail(null), [])

  const isCancel = (msg?: string) => msg === '취소되었습니다.' || msg === 'Cancelled.'

  // 공용 압축 실행: 확보된 입력 소스들을 지정 옵션으로 압축(출력 경로/파일 다이얼로그는 서비스가 처리).
  const runCompress = useCallback(
    async (inputs: InputSource[], opts: CompressOptions) => {
      if (inputs.length === 0) return
      setBusy(true)
      setProgress({ message: t.compressing, kind: 'marquee' })
      try {
        const res = await svc.compress(inputs, opts, setProgress)
        if (res.ok) {
          const msg = res.partCount ? t.doneCompressSplit(res.partCount) : t.doneCompress
          const out = res.outputs[0]
          // 데스크톱: 결과물 위치를 바로 열 수 있는 액션 제공.
          const action = canBrowse && out ? { label: t.openFolder, onClick: () => svc.revealPath(out) } : undefined
          notify(msg, 'info', action)
        } else if (isCancel(res.error)) {
          notify(t.cancelled, 'warn')
        } else {
          showError(`${t.error}: ${t.compressing}\n\n${res.error ?? t.error}`)
        }
      } catch (e) {
        showError(`${t.error}: ${t.compressing}\n\n${errorText(e)}`)
      } finally {
        setBusy(false)
        setProgress(null)
      }
    },
    [svc, t, notify, showError, canBrowse]
  )

  // 툴바 압축: 대상 선택 후 압축 옵션 팝업을 연다(실제 압축은 confirmCompress).
  const doCompress = useCallback(
    async (kind: 'files' | 'folder') => {
      const inputs = await svc.pickInputs(kind)
      if (inputs.length > 0) setCompressReq(inputs)
    },
    [svc]
  )

  // 탐색기에서 선택한 파일/폴더 하나를 압축(우클릭 메뉴용) — 옵션 팝업을 연다.
  const compressEntry = useCallback(async (entry: FsEntry) => {
    setCompressReq([{ path: entry.path, entryName: entry.name, isDirectory: entry.isDirectory }])
  }, [])

  // 압축 옵션 팝업 확인: 선택 옵션을 기억한 뒤 압축 실행.
  const confirmCompress = useCallback(
    async (opts: CompressOptions) => {
      const inputs = compressReq
      setCompressReq(null)
      if (!inputs || inputs.length === 0) return
      setFormat(opts.format)
      setSplit(opts.split)
      setSplitSizeMb(opts.splitSizeMb)
      if (opts.outDir) setCompressDir(opts.outDir)
      await runCompress(inputs, opts)
    },
    [compressReq, runCompress, setFormat, setSplit, setSplitSizeMb, setCompressDir]
  )

  const cancelCompress = useCallback(() => setCompressReq(null), [])

  const doExtract = useCallback(async (selection?: string[], archivePath?: string) => {
    try {
      // 우선순위: 명시된 경로 > 왼쪽에서 선택한 아카이브 > 파일 선택 다이얼로그
      const explicit = archivePath ?? (canBrowse ? selectedArchivePath : null)
      const archive = explicit
        ? { path: explicit, entryName: explicit.split(/[\\/]/).pop() ?? explicit }
        : await svc.pickArchive()
      if (!archive) return
      // 해제 폴더를 먼저 선택(데스크톱). 취소하면 진행 표시 없이 즉시 종료.
      let outDir: string | undefined
      if (canBrowse) {
        const dir = await svc.pickDirectory(extractDir || undefined)
        if (!dir) return
        outDir = dir
        setExtractDir(dir) // 다음 해제의 기본 폴더로 기억
      }
      setBusy(true)
      setProgress({ message: t.extracting, kind: 'marquee' })
      const res = await svc.extract(archive, { overwrite, selection, outDir }, setProgress)
      if (res.ok) {
        if (res.warnings.length > 0) showError(res.warnings.join('\n'))
        const action = outDir ? { label: t.openFolder, onClick: () => svc.revealPath(outDir!) } : undefined
        notify(t.doneExtract, 'info', action)
      } else if (isCancel(res.error)) {
        notify(t.cancelled, 'warn')
      } else {
        showError(`${t.error}: ${t.extracting}\n\n${res.error ?? t.error}`)
      }
    } catch (e) {
      showError(`${t.error}: ${t.extracting}\n\n${errorText(e)}`)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }, [svc, overwrite, t, notify, showError, canBrowse, selectedArchivePath, extractDir, setExtractDir])

  const doPreview = useCallback(async () => {
    try {
      const archive = await svc.pickArchive()
      if (!archive) return
      setBusy(true)
      setProgress({ message: t.opening, kind: 'marquee' })
      const entries = await svc.listEntries(archive)
      setPreviewArchive(archive.entryName)
      setPreviewEntries(entries)
    } catch (e) {
      showError(`${t.error}: ${t.extracting}\n\n${errorText(e)}`)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }, [svc, t, notify, showError])

  const browseTo = useCallback(
    async (path: string) => {
      if (!canBrowse) return
      setBrowseBusy(true)
      try {
        const result = await svc.listDir(path)
        setListing(result)
        // 마지막으로 열었던 폴더를 기억(빈 경로=드라이브 목록도 저장하여 다음 시작 시 복원)
        if (rememberLast) {
          try {
            localStorage.setItem('zm.lastDir', result.path)
          } catch {}
        }
      } catch (e) {
        const friendly = fsErrorMessage(e, t)
        // 접근 불가/없음은 정상적으로 발생할 수 있으므로 오류 모달 대신 가벼운 경고 토스트로 표시.
        if (friendly) notify(friendly, 'warn')
        else showError(`${t.error}\n\n${errorText(e)}`)
      } finally {
        setBrowseBusy(false)
      }
    },
    [canBrowse, svc, t, showError, notify, rememberLast]
  )

  const pickDefaultDir = useCallback(async () => {
    const dir = await svc.pickDirectory()
    if (dir) setDefaultDir(dir)
  }, [svc, setDefaultDir])

  const useCurrentAsDefault = useCallback(() => {
    if (listing?.path) setDefaultDir(listing.path)
  }, [listing, setDefaultDir])

  const browseUp = useCallback(async () => {
    if (listing?.parent !== undefined && listing?.parent !== null) {
      await browseTo(listing.parent)
    } else if (listing) {
      await browseTo('') // 드라이브 목록으로
    }
  }, [listing, browseTo])

  const openFsEntry = useCallback(
    async (entry: FsEntry) => {
      if (entry.isDirectory) {
        // 오른쪽 패널에 디렉토리 정보를 표시하면서 해당 폴더로 이동.
        setSelectedArchivePath(null)
        setPreviewArchive(null)
        setPreviewEntries(null)
        setFileInfo(entry)
        await browseTo(entry.path)
        return
      }
      if (entry.isArchive) {
        // 오른쪽 패널에 아카이브 내부 표시
        setFileInfo(null)
        setSelectedArchivePath(entry.path)
        setBrowseBusy(true)
        setProgress({ message: t.opening, kind: 'marquee' })
        try {
          const entries = await svc.listEntriesByPath(entry.path)
          setPreviewArchive(entry.name)
          setPreviewEntries(entries)
        } catch (e) {
          showError(`${t.error}\n\n${errorText(e)}`)
        } finally {
          setBrowseBusy(false)
          setProgress(null)
        }
        return
      }
      // 일반 파일: 오른쪽 패널에 파일 정보 표시
      setSelectedArchivePath(null)
      setPreviewArchive(null)
      setPreviewEntries(null)
      setFileInfo(entry)
    },
    [browseTo, svc, t, showError]
  )

  // 데스크톱 최초 진입: 기억된 마지막 폴더 → 기본 폴더 → 드라이브 목록 순으로 시도
  useEffect(() => {
    if (!canBrowse) return
    const start = (rememberLast ? readLS('zm.lastDir', '') : '') || defaultDir || ''
    ;(async () => {
      if (start) {
        setBrowseBusy(true)
        try {
          const result = await svc.listDir(start)
          setListing(result)
          return
        } catch {
          // 폴더가 사라졌으면 드라이브 목록으로 폴백
        } finally {
          setBrowseBusy(false)
        }
      }
      browseTo('')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canBrowse])

  const value: Store = {
    t,
    lang,
    toggleLang: () => setLang((l) => (l === 'ko' ? 'en' : 'ko')),
    theme,
    toggleTheme: () => setTheme((th) => (th === 'dark' ? 'light' : 'dark')),
    caps,
    isDesktop: caps.nativePaths,
    appVersion,
    format,
    setFormat,
    split,
    setSplit,
    splitSizeMb,
    setSplitSizeMb,
    overwrite,
    setOverwrite,
    busy,
    progress,
    previewArchive,
    previewEntries,
    fileInfo,
    canBrowse,
    listing,
    browseBusy,
    selectedArchivePath,
    browseTo,
    browseUp,
    openFsEntry,
    defaultDir,
    setDefaultDir,
    pickDefaultDir,
    useCurrentAsDefault,
    extractDir,
    setExtractDir,
    compressDir,
    setCompressDir,
    rememberLast,
    setRememberLast,
    settingsOpen,
    setSettingsOpen,
    toast,
    notify,
    dismissToast,
    cancelOperation,
    errorDetail,
    showError,
    clearError,
    aboutOpen,
    setAboutOpen,
    doCompress,
    compressEntry,
    doExtract,
    doPreview,
    compressReq,
    confirmCompress,
    cancelCompress,
    canUndo: undoRedo.canUndo,
    canRedo: undoRedo.canRedo,
    undo: undoRedo.undo,
    redo: undoRedo.redo,
    setUndoRedo,
    minimize: () => win?.minimizeWindow?.(),
    maximizeToggle: () => win?.maximizeWindow?.(),
    close: () => win?.closeWindow?.()
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export { formatBytes }
