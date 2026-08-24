import { useEffect, useRef, useState, type JSX, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { formatBytes, useStore } from './store'
import { useArchiveService } from './ServiceContext'
import { useContextMenu, type MenuItem } from './ContextMenu'
import type { FsEntry } from '@core/types'

/** 현재 경로를 루트→현재까지의 계보(조상 목록)로 분해. 드롭다운/계보 확장 공용. */
function pathAncestors(full: string): Array<{ label: string; path: string }> {
  if (!full) return []
  const isWin = /^[a-zA-Z]:/.test(full)
  const parts = full.split(/[\\/]+/).filter(Boolean)
  const out: Array<{ label: string; path: string }> = []
  if (isWin) {
    let acc = parts[0] + '\\' // "D:\"
    out.push({ label: parts[0] + '\\', path: acc })
    for (let i = 1; i < parts.length; i++) {
      acc = acc.endsWith('\\') ? acc + parts[i] : acc + '\\' + parts[i]
      out.push({ label: parts[i], path: acc })
    }
  } else {
    let acc = ''
    for (const p of parts) {
      acc = acc + '/' + p
      out.push({ label: p, path: acc })
    }
    if (out.length === 0) out.push({ label: '/', path: '/' })
  }
  return out
}

// 트리 루트(드라이브/루트 목록)를 담는 캐시 키.
const ROOT = ''

/** 되돌릴 수 있는 파일 작업(삭제는 휴지통 복원이 어려워 제외). */
type FileOp =
  | { kind: 'rename'; from: string; to: string }
  | { kind: 'move'; pairs: { from: string; to: string }[] }
  | { kind: 'copy'; srcs: string[]; destDir: string; created: string[] }

/** 왼쪽 패널: 상단 경로 드롭다운 + 하단 확장 가능한 디렉터리 트리. */
export function FileBrowser() {
  const {
    t,
    canBrowse,
    listing,
    browseBusy,
    browseUp,
    browseTo,
    openFsEntry,
    setDefaultDir,
    doExtract,
    compressEntry,
    showError,
    setUndoRedo
  } = useStore()
  const svc = useArchiveService()
  const { openMenu } = useContextMenu()

  // 트리 상태: 로드된 디렉터리 자식 캐시 · 펼쳐진 경로 · 로딩 중 경로.
  const [childrenCache, setChildrenCache] = useState<Record<string, FsEntry[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState<Set<string>>(new Set())
  // 파일 조작용 상태: 클립보드(복사/잘라내기), 선택 집합(단일=한 개, Ctrl/Shift=여러 개), 드롭 대상.
  const [clipboard, setClipboard] = useState<{ paths: string[]; mode: 'copy' | 'cut' } | null>(null)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  // 인라인 이름 변경 중인 항목 경로와 편집 값.
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // 시스템 드라이브/루트 목록(상단 빠른 선택 바).
  const [drives, setDrives] = useState<FsEntry[]>([])
  // 파일 작업 실행 취소/다시 실행 스택.
  const [undoStack, setUndoStack] = useState<FileOp[]>([])
  const [redoStack, setRedoStack] = useState<FileOp[]>([])
  // 시작 시 복원된 현재 폴더를 트리 가운데로 스크롤(최초 1회).
  const currentRowRef = useRef<HTMLDivElement | null>(null)
  const didCenter = useRef(false)
  // 키보드 탐색 시 포커스 행을 보이도록 스크롤하기 위한 트리 컨테이너 ref.
  const treeRef = useRef<HTMLDivElement | null>(null)
  // 현재 드래그 세션에서 트리가 내보낸 경로들(내부 이동/외부 복사 구분용).
  const dragSrcRef = useRef<string[] | null>(null)
  // 드라이브 선택 시 해당 행을 트리 최상단으로 스크롤하기 위한 대상 경로.
  const [scrollTopTarget, setScrollTopTarget] = useState<string | null>(null)

  const markLoading = (path: string, on: boolean) =>
    setLoading((s) => {
      const n = new Set(s)
      if (on) n.add(path)
      else n.delete(path)
      return n
    })

  // 특정 디렉터리의 자식을 로드해 캐시에 저장(이미 있으면 그대로 반환).
  const loadChildren = async (path: string): Promise<FsEntry[]> => {
    markLoading(path, true)
    try {
      const res = await svc.listDir(path)
      setChildrenCache((c) => ({ ...c, [path]: res.entries }))
      return res.entries
    } finally {
      markLoading(path, false)
    }
  }

  // 현재 경로(및 조상)를 자동으로 로드·펼침 — "현재 경로에 이르는 전체 계보"가 보이도록.
  useEffect(() => {
    if (!canBrowse) return
    let cancelled = false
    ;(async () => {
      const rootRes = await svc.listDir(ROOT) // 드라이브/루트
      const updates: Record<string, FsEntry[]> = { [ROOT]: rootRes.entries }
      const exp: string[] = []
      const path = listing?.path
      if (path) {
        for (const a of pathAncestors(path)) {
          const r = await svc.listDir(a.path)
          updates[a.path] = r.entries
          exp.push(a.path)
        }
      }
      if (cancelled) return
      setChildrenCache((c) => ({ ...c, ...updates }))
      setExpanded((prev) => new Set([...prev, ...exp]))
    })().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [canBrowse, listing?.path, svc])

  // 트리가 현재 폴더까지 펼쳐져 그 행이 렌더된 뒤, 최초 1회만 가운데로 스크롤.
  useEffect(() => {
    if (didCenter.current || !listing?.path) return
    const el = currentRowRef.current
    if (el) {
      el.scrollIntoView({ block: 'center' })
      didCenter.current = true
    }
  }, [listing?.path, childrenCache, expanded])

  const toggle = async (path: string) => {
    if (expanded.has(path)) {
      setExpanded((s) => {
        const n = new Set(s)
        n.delete(path)
        return n
      })
    } else {
      if (!childrenCache[path]) await loadChildren(path)
      setExpanded((s) => new Set(s).add(path))
    }
  }

  // 항목 활성화(폴더=이동/펼침, 아카이브=내용, 일반 파일=정보). 선택 자체는 onRowClick 이 담당.
  const onEntryActivate = (e: FsEntry) => {
    if (e.isDirectory) {
      browseTo(e.path) // 드롭다운/상태바 동기화 + 계보 자동 펼침
      if (!expanded.has(e.path)) toggle(e.path)
    } else {
      openFsEntry(e) // 아카이브면 내용, 일반 파일이면 정보 표시
    }
  }

  // 현재 펼쳐진 상태의 트리를 렌더 순서대로 평탄화(Shift 범위 선택용).
  const flatEntries = (): FsEntry[] => {
    const out: FsEntry[] = []
    const walk = (dir: string) => {
      const kids = childrenCache[dir]
      if (!kids) return
      for (const e of kids) {
        out.push(e)
        if (e.isDirectory && expanded.has(e.path)) walk(e.path)
      }
    }
    walk(ROOT)
    return out
  }

  // 클릭 = 단일 선택 + 활성화. Ctrl/Meta = 토글(여러 개). Shift = 앵커~클릭 범위.
  const onRowClick = (e: FsEntry, ev: MouseEvent) => {
    if (ev.shiftKey && anchor) {
      const order = flatEntries().map((x) => x.path)
      const i = order.indexOf(anchor)
      const j = order.indexOf(e.path)
      if (i >= 0 && j >= 0) {
        const [lo, hi] = i <= j ? [i, j] : [j, i]
        setSelectedPaths(new Set(order.slice(lo, hi + 1)))
      } else {
        setSelectedPaths(new Set([e.path]))
        setAnchor(e.path)
      }
      return
    }
    if (ev.ctrlKey || ev.metaKey) {
      setSelectedPaths((s) => {
        const n = new Set(s)
        if (n.has(e.path)) n.delete(e.path)
        else n.add(e.path)
        return n
      })
      setAnchor(e.path)
      return
    }
    // 일반 클릭: 오직 이 항목 하나만 선택하고 활성화
    setSelectedPaths(new Set([e.path]))
    setAnchor(e.path)
    onEntryActivate(e)
  }

  // 시작 시 드라이브 목록을 한 번 로드(상단 빠른 선택 바).
  useEffect(() => {
    if (!canBrowse) return
    svc.listDrives().then(setDrives).catch(() => {})
  }, [canBrowse, svc])

  // 드라이브 선택 후 트리가 펼쳐지면 해당 드라이브 행을 최상단으로 스크롤(1회).
  useEffect(() => {
    if (!scrollTopTarget) return
    const el = treeRef.current?.querySelector(`[data-path="${CSS.escape(scrollTopTarget)}"]`)
    if (el) {
      el.scrollIntoView({ block: 'start' })
      setScrollTopTarget(null)
    }
  }, [scrollTopTarget, childrenCache, expanded, listing?.path])

  const refresh = (dirPath: string) => loadChildren(dirPath).catch(() => {})

  // 인라인 이름 변경 시작/확정/취소.
  const startRename = (e: FsEntry) => {
    setRenaming(e.path)
    setRenameValue(e.name)
  }
  const cancelRename = () => setRenaming(null)
  const commitRename = async (e: FsEntry) => {
    const newName = renameValue.trim()
    setRenaming(null)
    if (!newName || newName === e.name) return
    try {
      const to = await svc.renamePath(e.path, newName)
      refresh(parentOf(e.path)) // 상위 폴더 다시 로드
      pushOp({ kind: 'rename', from: e.path, to })
    } catch (err) {
      showError(`${t.error}\n\n${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // 경로의 상위 디렉터리(드라이브 루트는 "D:\" 형태로 보정).
  const parentOf = (p: string): string => {
    const norm = p.replace(/[\\/]+$/, '')
    const idx = Math.max(norm.lastIndexOf('\\'), norm.lastIndexOf('/'))
    if (idx < 0) return ROOT
    let parent = norm.slice(0, idx)
    if (/^[a-zA-Z]:$/.test(parent)) parent += '\\'
    return parent
  }

  // 조작 후 영향을 받은 디렉터리들을 다시 로드(캐시에 있는 것만 갱신하면 충분).
  const refreshDirs = (dirs: Array<string | undefined | null>) => {
    const uniq = new Set(dirs.filter((d): d is string => d != null))
    for (const d of uniq) if (childrenCache[d] !== undefined || d === (listing?.path ?? ROOT)) refresh(d)
  }

  const baseName = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? p

  const pushOp = (op: FileOp) => {
    setUndoStack((s) => [...s, op])
    setRedoStack([])
  }

  // 여러 경로를 destDir 로 복사 또는 이동. 결과를 실행 취소 스택에 기록.
  const transferMany = async (srcs: string[], destDir: string, mode: 'copy' | 'cut') => {
    const pairs: { from: string; to: string }[] = []
    for (const src of srcs) {
      if (src === destDir) continue
      try {
        const to = mode === 'copy' ? await svc.copyPath(src, destDir) : await svc.movePath(src, destDir)
        pairs.push({ from: src, to })
      } catch (e) {
        showError(`${t.error}\n\n${e instanceof Error ? e.message : String(e)}`)
      }
    }
    refreshDirs([destDir, ...srcs.map(parentOf)])
    if (pairs.length > 0) {
      if (mode === 'copy') {
        pushOp({ kind: 'copy', srcs: pairs.map((p) => p.from), destDir, created: pairs.map((p) => p.to) })
      } else {
        pushOp({ kind: 'move', pairs })
      }
    }
  }

  const pasteInto = async (destDir: string) => {
    if (!clipboard) return
    await transferMany(clipboard.paths, destDir, clipboard.mode)
    if (clipboard.mode === 'cut') setClipboard(null)
  }

  const deletePaths = async (paths: string[]) => {
    if (paths.length === 0) return
    const msg = paths.length === 1 ? t.confirmDelete(baseName(paths[0])) : t.confirmDeleteMany(paths.length)
    if (!window.confirm(msg)) return
    for (const p of paths) {
      try {
        await svc.deletePath(p)
      } catch (err) {
        showError(`${t.error}\n\n${err instanceof Error ? err.message : String(err)}`)
      }
    }
    refreshDirs(paths.map(parentOf))
    // 현재 보고 있는 폴더(또는 그 상위)가 삭제되면 상위로 이동
    for (const p of paths) {
      if (listing?.path && (listing.path === p || listing.path.startsWith(p + '\\') || listing.path.startsWith(p + '/'))) {
        browseTo(parentOf(p))
        break
      }
    }
    setSelectedPaths(new Set())
  }

  // 작업을 반대로 되돌린다(실행 취소).
  const reverseOp = async (op: FileOp) => {
    if (op.kind === 'rename') {
      await svc.renamePath(op.to, baseName(op.from))
      refreshDirs([parentOf(op.from)])
    } else if (op.kind === 'move') {
      for (const { from, to } of op.pairs) await svc.movePath(to, parentOf(from))
      refreshDirs([...op.pairs.map((p) => parentOf(p.from)), ...op.pairs.map((p) => parentOf(p.to))])
    } else {
      for (const c of op.created) await svc.deletePath(c)
      refreshDirs([op.destDir])
    }
  }

  // 작업을 다시 실행한다. copy 는 재복사 경로가 달라질 수 있어 갱신된 op 를 반환.
  const forwardOp = async (op: FileOp): Promise<FileOp> => {
    if (op.kind === 'rename') {
      await svc.renamePath(op.from, baseName(op.to))
      refreshDirs([parentOf(op.to)])
      return op
    } else if (op.kind === 'move') {
      for (const { from, to } of op.pairs) await svc.movePath(from, parentOf(to))
      refreshDirs([...op.pairs.map((p) => parentOf(p.from)), ...op.pairs.map((p) => parentOf(p.to))])
      return op
    } else {
      const created: string[] = []
      for (const s of op.srcs) created.push(await svc.copyPath(s, op.destDir))
      refreshDirs([op.destDir])
      return { ...op, created }
    }
  }

  const doUndo = async () => {
    const op = undoStack[undoStack.length - 1]
    if (!op) return
    try {
      await reverseOp(op)
      setUndoStack((s) => s.slice(0, -1))
      setRedoStack((s) => [...s, op])
    } catch (e) {
      showError(`${t.error}\n\n${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const doRedo = async () => {
    const op = redoStack[redoStack.length - 1]
    if (!op) return
    try {
      const updated = await forwardOp(op)
      setRedoStack((s) => s.slice(0, -1))
      setUndoStack((s) => [...s, updated])
    } catch (e) {
      showError(`${t.error}\n\n${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // 실행 취소/다시 실행 핸들러와 가능 여부를 스토어(툴바)에 등록.
  useEffect(() => {
    setUndoRedo({ undo: doUndo, redo: doRedo, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoStack, redoStack])

  // 우클릭/단축키 대상: 우클릭한 항목이 선택에 포함되면 선택 전체, 아니면 그 항목만.
  const targetPaths = (e: FsEntry): string[] => (selectedPaths.has(e.path) ? [...selectedPaths] : [e.path])

  // 드롭 처리: 드롭된 경로가 우리 트리에서 시작한 드래그면 이동, 아니면(외부 OS) 복사.
  const handleDrop = (ev: DragEvent, destDir: string) => {
    ev.preventDefault()
    ev.stopPropagation()
    setDragOver(null)

    // 네이티브 드래그(내부/외부 공통)로 들어온 실제 파일 경로 수집.
    const dropped: string[] = []
    const files = ev.dataTransfer.files
    for (let i = 0; i < files.length; i++) {
      const p = (files[i] as unknown as { path?: string }).path
      if (p) dropped.push(p)
    }
    // 폴백: 구형 커스텀 mime(HTML5 내부 드래그)
    if (dropped.length === 0) {
      const internal = ev.dataTransfer.getData('application/x-zipmaster-paths')
      if (internal) {
        try {
          dropped.push(...(JSON.parse(internal) as string[]))
        } catch {
          /* 무시 */
        }
      }
    }
    const src = dragSrcRef.current
    dragSrcRef.current = null
    if (dropped.length === 0) return

    // 드래그 시작이 우리 트리였고 드롭 경로가 그 집합이면 내부 이동, 아니면 외부 복사.
    const isInternal = !!src && dropped.every((p) => src.includes(p))
    transferMany(
      dropped.filter((p) => p !== destDir),
      destDir,
      isInternal ? 'cut' : 'copy'
    )
  }

  // 포커스(anchor) 행을 화면에 보이도록 스크롤.
  const scrollToPath = (p: string) => {
    const el = treeRef.current?.querySelector(`[data-path="${CSS.escape(p)}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }
  const focusRow = (e: FsEntry) => {
    setSelectedPaths(new Set([e.path]))
    setAnchor(e.path)
    scrollToPath(e.path)
  }

  const onTreeKeyDown = (ev: KeyboardEvent) => {
    const mod = ev.ctrlKey || ev.metaKey
    const sel = [...selectedPaths]
    const key = ev.key
    if (mod && key.toLowerCase() === 'z' && !ev.shiftKey) {
      doUndo()
    } else if (mod && (key.toLowerCase() === 'y' || (key.toLowerCase() === 'z' && ev.shiftKey))) {
      doRedo()
    } else if (mod && key.toLowerCase() === 'c') {
      if (sel.length) {
        setClipboard({ paths: sel, mode: 'copy' })
        svc.copyToClipboard(sel) // 외부(탐색기)에도 붙여넣기 가능하도록 OS 클립보드에 올림
      }
    } else if (mod && key.toLowerCase() === 'x') {
      if (sel.length) setClipboard({ paths: sel, mode: 'cut' })
    } else if (mod && key.toLowerCase() === 'v') {
      pasteInto(listing?.path ?? ROOT)
    } else if (key === 'Delete') {
      if (sel.length) deletePaths(sel)
    } else if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
      // 위/아래 이동(펼쳐진 순서 기준).
      const order = flatEntries()
      if (order.length === 0) return
      let i = order.findIndex((e) => e.path === anchor)
      if (i < 0) i = 0
      else if (key === 'ArrowDown') i = Math.min(order.length - 1, i + 1)
      else if (key === 'ArrowUp') i = Math.max(0, i - 1)
      if (key === 'Home') i = 0
      if (key === 'End') i = order.length - 1
      focusRow(order[i])
    } else if (key === 'ArrowRight') {
      // 폴더면 펼치기(이미 펼쳐졌으면 첫 자식으로).
      const e = flatEntries().find((x) => x.path === anchor)
      if (!e || !e.isDirectory) return
      if (!expanded.has(e.path)) toggle(e.path)
      else {
        const order = flatEntries()
        const i = order.findIndex((x) => x.path === e.path)
        if (i >= 0 && i + 1 < order.length) focusRow(order[i + 1])
      }
    } else if (key === 'ArrowLeft') {
      // 펼쳐진 폴더면 접기, 아니면 상위로 이동.
      const e = flatEntries().find((x) => x.path === anchor)
      if (!e) return
      if (e.isDirectory && expanded.has(e.path)) {
        toggle(e.path)
      } else {
        const par = parentOf(e.path)
        const pe = flatEntries().find((x) => x.path === par)
        if (pe) focusRow(pe)
        else return
      }
    } else if (key === 'Enter') {
      const e = flatEntries().find((x) => x.path === anchor)
      if (!e) return
      onEntryActivate(e)
    } else {
      return
    }
    ev.preventDefault()
  }

  // 항목 우클릭 시: 선택에 없던 항목이면 그 항목만 단일 선택으로 만든 뒤 메뉴 표시.
  const onRowContextMenu = (e: FsEntry, ev: MouseEvent) => {
    if (!selectedPaths.has(e.path)) {
      setSelectedPaths(new Set([e.path]))
      setAnchor(e.path)
    }
    openMenu(ev, entryMenu(e))
  }

  // 트리 항목 우클릭 메뉴 구성(폴더/아카이브/일반 파일별로 다름). 복사/삭제는 선택 전체 대상.
  const entryMenu = (e: FsEntry): MenuItem[] => {
    const targets = targetPaths(e)
    const items: MenuItem[] = []
    if (e.isDirectory) {
      items.push({ label: t.ctxOpen, icon: '📂', onClick: () => onEntryActivate(e) })
      items.push({ label: t.ctxCompress, icon: '🗜️', onClick: () => compressEntry(e) })
      items.push({ label: t.ctxSetDefault, icon: '📌', onClick: () => setDefaultDir(e.path) })
    } else if (e.isArchive) {
      items.push({ label: t.ctxViewContents, icon: '👁️', onClick: () => openFsEntry(e) })
      items.push({ label: t.ctxExtract, icon: '📤', onClick: () => doExtract(undefined, e.path) })
      items.push({ label: t.ctxCompress, icon: '🗜️', onClick: () => compressEntry(e) })
    } else {
      // 일반 파일: 압축만 가능
      items.push({ label: t.ctxCompress, icon: '🗜️', onClick: () => compressEntry(e) })
    }
    items.push({ separator: true })
    items.push({
      label: t.ctxCopy,
      icon: '📄',
      onClick: () => {
        setClipboard({ paths: targets, mode: 'copy' })
        svc.copyToClipboard(targets) // 외부(탐색기)에도 붙여넣기 가능
      }
    })
    items.push({ label: t.ctxCut, icon: '✂️', onClick: () => setClipboard({ paths: targets, mode: 'cut' }) })
    if (e.isDirectory) {
      items.push({ label: t.ctxPaste, icon: '📋', disabled: !clipboard, onClick: () => pasteInto(e.path) })
    }
    // 이름 변경은 단일 대상에만 제공.
    items.push({ label: t.ctxRename, icon: '✏️', onClick: () => startRename(e) })
    items.push({ label: t.ctxDelete, icon: '🗑️', danger: true, onClick: () => deletePaths(targets) })
    items.push({ separator: true })
    items.push({ label: t.ctxUndo, icon: '↩️', disabled: undoStack.length === 0, onClick: doUndo })
    items.push({ label: t.ctxRedo, icon: '↪️', disabled: redoStack.length === 0, onClick: doRedo })
    items.push({ separator: true })
    items.push({ label: t.ctxUp, icon: '⬆️', onClick: () => browseUp(), disabled: !listing?.path })
    items.push({ label: t.ctxRefresh, icon: '🔄', onClick: () => refresh(e.isDirectory ? e.path : listing?.path ?? ROOT) })
    return items
  }

  if (!canBrowse) {
    return (
      <section className="card browser">
        <h2>{t.browserTitle}</h2>
        <p className="hint">{t.browserWebUnsupported}</p>
      </section>
    )
  }

  const atDrives = !listing || !listing.path
  const ancestors = pathAncestors(listing?.path ?? '')

  // 트리 재귀 렌더: dirPath 의 자식들을 depth 들여쓰기로 그리고, 펼쳐진 폴더는 이어서 재귀.
  const renderNodes = (dirPath: string, depth: number): JSX.Element[] => {
    const kids = childrenCache[dirPath]
    if (!kids) {
      if (loading.has(dirPath)) {
        return [
          <div key={dirPath + '::loading'} className="tree-note" style={{ paddingLeft: 12 + depth * 16 }}>
            …
          </div>
        ]
      }
      return []
    }
    if (kids.length === 0) {
      return [
        <div key={dirPath + '::empty'} className="tree-note" style={{ paddingLeft: 12 + depth * 16 }}>
          {t.browserEmpty}
        </div>
      ]
    }
    const rows: JSX.Element[] = []
    for (const e of kids) {
      const isExp = expanded.has(e.path)
      const isCurrent = e.path === listing?.path
      rows.push(
        <div
          key={e.path}
          data-path={e.path}
          ref={isCurrent ? currentRowRef : undefined}
          className={
            'tree-row' +
            (selectedPaths.has(e.path) ? ' selected' : '') +
            (e.isArchive ? ' archive' : '') +
            (e.isDirectory ? ' dir' : '') +
            (isCurrent ? ' current' : '') +
            (clipboard?.mode === 'cut' && clipboard.paths.includes(e.path) ? ' cut' : '') +
            (dragOver === e.path ? ' drag-over' : '')
          }
          style={{ paddingLeft: 6 + depth * 16 }}
          title={e.path}
          draggable={renaming !== e.path}
          onClick={(ev) => onRowClick(e, ev)}
          onContextMenu={(ev) => onRowContextMenu(e, ev)}
          onDragStart={(ev) => {
            // 드래그 대상: 이미 선택된 항목이면 선택 전체, 아니면 이 항목만
            const paths = selectedPaths.has(e.path) ? [...selectedPaths] : [e.path]
            if (!selectedPaths.has(e.path)) {
              setSelectedPaths(new Set([e.path]))
              setAnchor(e.path)
            }
            // 네이티브 드래그로 시작 → OS(탐색기/바탕화면)로 내보내기 가능.
            // 창 안 폴더로 되떨구면 handleDrop 이 dragSrcRef 로 내부 이동을 판별.
            dragSrcRef.current = paths
            ev.preventDefault()
            svc.startDrag(paths)
          }}
          onDragEnd={() => {
            dragSrcRef.current = null
          }}
          onDragOver={
            e.isDirectory
              ? (ev) => {
                  ev.preventDefault()
                  ev.dataTransfer.dropEffect = 'move'
                  if (dragOver !== e.path) setDragOver(e.path)
                }
              : undefined
          }
          onDragLeave={e.isDirectory ? () => setDragOver((d) => (d === e.path ? null : d)) : undefined}
          onDrop={e.isDirectory ? (ev) => handleDrop(ev, e.path) : undefined}
        >
          {e.isDirectory ? (
            <span
              className="tree-twist"
              onClick={(ev) => {
                ev.stopPropagation()
                toggle(e.path)
              }}
              aria-hidden
            >
              {isExp ? '▼' : '▶'}
            </span>
          ) : (
            <span className="tree-twist tree-twist-empty" aria-hidden />
          )}
          <span className="fs-ico" aria-hidden>
            {e.isDirectory ? (isExp ? '📂' : '📁') : e.isArchive ? '🗜️' : '📄'}
          </span>
          {renaming === e.path ? (
            <input
              className="fs-rename-input"
              value={renameValue}
              autoFocus
              spellCheck={false}
              onClick={(ev) => ev.stopPropagation()}
              onChange={(ev) => setRenameValue(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter') commitRename(e)
                else if (ev.key === 'Escape') cancelRename()
                ev.stopPropagation()
              }}
              onBlur={() => commitRename(e)}
            />
          ) : (
            <span className="fs-name">{e.name}</span>
          )}
          {!e.isDirectory && renaming !== e.path && <span className="fs-size">{formatBytes(e.size)}</span>}
        </div>
      )
      if (e.isDirectory && isExp) rows.push(...renderNodes(e.path, depth + 1))
    }
    return rows
  }

  return (
    <section className="card browser">
      <div className="browser-head">
        <h2>{t.browserTitle}</h2>
        <button className="up-btn" disabled={browseBusy || atDrives} onClick={browseUp} title={t.browserUp}>
          ⬆ {t.browserUp}
        </button>
      </div>

      {/* 상단: 시스템 드라이브 빠른 선택 바 */}
      {drives.length > 0 && (
        <div className="drive-bar">
          {drives.map((d) => (
            <button
              key={d.path}
              className={'drive-btn' + (listing?.path === d.path ? ' active' : '')}
              disabled={browseBusy}
              title={d.path}
              onClick={() => {
                browseTo(d.path)
                setScrollTopTarget(d.path) // 선택한 드라이브를 트리 최상단으로
              }}
            >
              💽 {d.name}
            </button>
          ))}
        </div>
      )}

      {/* 전체 경로를 드롭다운으로 표시(조상 선택 시 이동) */}
      <select
        className="browser-path-select"
        value={listing?.path ?? ''}
        disabled={browseBusy || atDrives}
        onChange={(e) => browseTo(e.target.value)}
        title={listing?.path}
      >
        {atDrives ? (
          <option value="">💽 {t.browserTitle}</option>
        ) : (
          ancestors.map((a) => (
            <option key={a.path} value={a.path}>
              {a.path}
            </option>
          ))
        )}
      </select>

      {/* 하단: 드라이브 루트부터 시작하는 확장 가능한 트리
          - 키보드: Ctrl+C/X 복사·잘라내기, Ctrl+V 붙여넣기, Delete 삭제
          - 드롭: 내부 항목은 이동, 외부(OS) 파일은 현재 폴더로 복사 */}
      <div
        className="fs-tree"
        ref={treeRef}
        tabIndex={0}
        onKeyDown={onTreeKeyDown}
        onDragOver={(ev) => {
          ev.preventDefault()
          ev.dataTransfer.dropEffect = 'copy'
        }}
        onDrop={(ev) => {
          if (!atDrives) handleDrop(ev, listing!.path)
        }}
        onContextMenu={(ev) =>
          openMenu(ev, [
            { label: t.ctxPaste, icon: '📋', disabled: !clipboard || atDrives, onClick: () => pasteInto(listing!.path) },
            { separator: true },
            { label: t.ctxUndo, icon: '↩️', disabled: undoStack.length === 0, onClick: doUndo },
            { label: t.ctxRedo, icon: '↪️', disabled: redoStack.length === 0, onClick: doRedo },
            { separator: true },
            { label: t.ctxUp, icon: '⬆️', onClick: () => browseUp(), disabled: atDrives },
            { label: t.ctxRefresh, icon: '🔄', onClick: () => refresh(listing?.path ?? ROOT) }
          ])
        }
      >
        {renderNodes(ROOT, 0)}
      </div>
    </section>
  )
}
