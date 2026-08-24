import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ArchiveEntry, ArchiveFormat, DirListing, FormatCaps, FsEntry, Progress } from '@core/types'
import { getDict, detectInitialLang, type Dict, type Lang } from '@core/i18n'
import { FORMAT_LABELS, formatBytes } from '@core/format'
import { useArchiveService } from './ServiceContext'

export type Theme = 'dark' | 'light'

interface Toast {
  msg: string
  kind: 'info' | 'error'
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
  rememberLast: boolean
  setRememberLast: (b: boolean) => void
  settingsOpen: boolean
  setSettingsOpen: (b: boolean) => void

  toast: Toast | null
  notify: (msg: string, kind: 'info' | 'error') => void

  // 심각한 오류: 상세 내용을 팝업으로 표시 + 복사 가능
  errorDetail: string | null
  showError: (detail: string) => void
  clearError: () => void

  aboutOpen: boolean
  setAboutOpen: (b: boolean) => void

  // 액션 (선택 → 실행, 참고 앱 흐름과 동일)
  doCompress: (kind: 'files' | 'folder') => Promise<void>
  doExtract: (selection?: string[], archivePath?: string) => Promise<void>
  doPreview: () => Promise<void>

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

  const [format, setFormat] = useState<ArchiveFormat>('zip')
  const [split, setSplit] = useState(false)
  const [splitSizeMb, setSplitSizeMb] = useState(100) // 참고 앱 기본값
  const [overwrite, setOverwrite] = useState(true)

  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [previewArchive, setPreviewArchive] = useState<string | null>(null)
  const [previewEntries, setPreviewEntries] = useState<ArchiveEntry[] | null>(null)
  const [listing, setListing] = useState<DirListing | null>(null)
  const [browseBusy, setBrowseBusy] = useState(false)
  const [selectedArchivePath, setSelectedArchivePath] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [appVersion, setAppVersion] = useState('1.0.0')
  const [defaultDir, setDefaultDirState] = useState<string>(() => readLS('zm.defaultDir', ''))
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

  const setRememberLast = useCallback((b: boolean) => {
    setRememberLastState(b)
    try {
      localStorage.setItem('zm.rememberLast', b ? '1' : '0')
    } catch {}
  }, [])

  const notify = useCallback((msg: string, kind: 'info' | 'error') => {
    setToast({ msg, kind })
    window.clearTimeout((notify as any)._t)
    ;(notify as any)._t = window.setTimeout(() => setToast(null), 5000)
  }, [])

  const showError = useCallback((detail: string) => setErrorDetail(detail), [])
  const clearError = useCallback(() => setErrorDetail(null), [])

  const isCancel = (msg?: string) => msg === '취소되었습니다.' || msg === 'Cancelled.'

  const doCompress = useCallback(
    async (kind: 'files' | 'folder') => {
      if (!caps.create[format]) {
        notify(t.createNotSupported(FORMAT_LABELS[format]), 'error')
        return
      }
      try {
        const inputs = await svc.pickInputs(kind)
        if (inputs.length === 0) return
        setBusy(true)
        setProgress({ message: t.compressing, kind: 'marquee' })
        const res = await svc.compress(inputs, { format, split, splitSizeMb }, setProgress)
        if (res.ok) {
          notify(res.partCount ? t.doneCompressSplit(res.partCount) : t.doneCompress, 'info')
        } else if (!isCancel(res.error)) {
          showError(`${t.error}: ${t.compressing}\n\n${res.error ?? t.error}`)
        }
      } catch (e) {
        showError(`${t.error}: ${t.compressing}\n\n${errorText(e)}`)
      } finally {
        setBusy(false)
        setProgress(null)
      }
    },
    [caps, format, split, splitSizeMb, svc, t, notify, showError]
  )

  const doExtract = useCallback(async (selection?: string[], archivePath?: string) => {
    try {
      // 우선순위: 명시된 경로 > 왼쪽에서 선택한 아카이브 > 파일 선택 다이얼로그
      const explicit = archivePath ?? (canBrowse ? selectedArchivePath : null)
      const archive = explicit
        ? { path: explicit, entryName: explicit.split(/[\\/]/).pop() ?? explicit }
        : await svc.pickArchive()
      if (!archive) return
      setBusy(true)
      setProgress({ message: t.extracting, kind: 'marquee' })
      const res = await svc.extract(archive, { overwrite, selection }, setProgress)
      if (res.ok) {
        if (res.warnings.length > 0) showError(res.warnings.join('\n'))
        notify(t.doneExtract, 'info')
      } else if (!isCancel(res.error)) {
        showError(`${t.error}: ${t.extracting}\n\n${res.error ?? t.error}`)
      }
    } catch (e) {
      showError(`${t.error}: ${t.extracting}\n\n${errorText(e)}`)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }, [svc, overwrite, t, notify, showError, canBrowse, selectedArchivePath])

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
        showError(`${t.error}\n\n${errorText(e)}`)
      } finally {
        setBrowseBusy(false)
      }
    },
    [canBrowse, svc, t, showError, rememberLast]
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
        await browseTo(entry.path)
        return
      }
      if (entry.isArchive) {
        // 오른쪽 패널에 아카이브 내부 표시
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
      }
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
    rememberLast,
    setRememberLast,
    settingsOpen,
    setSettingsOpen,
    toast,
    notify,
    errorDetail,
    showError,
    clearError,
    aboutOpen,
    setAboutOpen,
    doCompress,
    doExtract,
    doPreview,
    minimize: () => win?.minimizeWindow?.(),
    maximizeToggle: () => win?.maximizeWindow?.(),
    close: () => win?.closeWindow?.()
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export { formatBytes }
