import { useEffect, useState, type JSX, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react'
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
    showError
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

  const refresh = (dirPath: string) => loadChildren(dirPath).catch(() => {})

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

  // 여러 경로를 destDir 로 복사 또는 이동.
  const transferMany = async (srcs: string[], destDir: string, mode: 'copy' | 'cut') => {
    for (const src of srcs) {
      if (src === destDir) continue
      try {
        if (mode === 'copy') await svc.copyPath(src, destDir)
        else await svc.movePath(src, destDir)
      } catch (e) {
        showError(`${t.error}\n\n${e instanceof Error ? e.message : String(e)}`)
      }
    }
    refreshDirs([destDir, ...srcs.map(parentOf)])
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

  // 우클릭/단축키 대상: 우클릭한 항목이 선택에 포함되면 선택 전체, 아니면 그 항목만.
  const targetPaths = (e: FsEntry): string[] => (selectedPaths.has(e.path) ? [...selectedPaths] : [e.path])

  // 외부(OS)에서 드롭된 파일들을 destDir 로 복사.
  const dropExternal = async (files: FileList, destDir: string) => {
    const paths: string[] = []
    for (let i = 0; i < files.length; i++) {
      const p = (files[i] as unknown as { path?: string }).path
      if (p) paths.push(p)
    }
    for (const p of paths) {
      try {
        await svc.copyPath(p, destDir)
      } catch (e) {
        showError(`${t.error}\n\n${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (paths.length > 0) refreshDirs([destDir])
  }

  // 드롭 처리(내부 이동 우선, 없으면 외부 파일 복사).
  const handleDrop = (ev: DragEvent, destDir: string) => {
    ev.preventDefault()
    ev.stopPropagation()
    setDragOver(null)
    const internal = ev.dataTransfer.getData('application/x-zipmaster-paths')
    if (internal) {
      let paths: string[] = []
      try {
        paths = JSON.parse(internal)
      } catch {
        paths = []
      }
      transferMany(paths.filter((p) => p !== destDir), destDir, 'cut') // 내부 드래그 = 이동
      return
    }
    if (ev.dataTransfer.files && ev.dataTransfer.files.length > 0) {
      dropExternal(ev.dataTransfer.files, destDir)
    }
  }

  const onTreeKeyDown = (ev: KeyboardEvent) => {
    const mod = ev.ctrlKey || ev.metaKey
    const sel = [...selectedPaths]
    if (mod && ev.key.toLowerCase() === 'c') {
      if (sel.length) setClipboard({ paths: sel, mode: 'copy' })
    } else if (mod && ev.key.toLowerCase() === 'x') {
      if (sel.length) setClipboard({ paths: sel, mode: 'cut' })
    } else if (mod && ev.key.toLowerCase() === 'v') {
      pasteInto(listing?.path ?? ROOT)
    } else if (ev.key === 'Delete') {
      if (sel.length) deletePaths(sel)
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
      items.push({ label: t.ctxOpen, onClick: () => onEntryActivate(e) })
      items.push({ label: t.ctxCompress, onClick: () => compressEntry(e) })
      items.push({ label: t.ctxSetDefault, onClick: () => setDefaultDir(e.path) })
    } else if (e.isArchive) {
      items.push({ label: t.ctxViewContents, onClick: () => openFsEntry(e) })
      items.push({ label: t.ctxExtract, onClick: () => doExtract(undefined, e.path) })
      items.push({ label: t.ctxCompress, onClick: () => compressEntry(e) })
    } else {
      // 일반 파일: 압축만 가능
      items.push({ label: t.ctxCompress, onClick: () => compressEntry(e) })
    }
    items.push({ separator: true })
    items.push({ label: t.ctxCopy, onClick: () => setClipboard({ paths: targets, mode: 'copy' }) })
    items.push({ label: t.ctxCut, onClick: () => setClipboard({ paths: targets, mode: 'cut' }) })
    if (e.isDirectory) {
      items.push({ label: t.ctxPaste, disabled: !clipboard, onClick: () => pasteInto(e.path) })
    }
    items.push({ label: t.ctxDelete, danger: true, onClick: () => deletePaths(targets) })
    items.push({ separator: true })
    items.push({ label: t.ctxUp, onClick: () => browseUp(), disabled: !listing?.path })
    items.push({ label: t.ctxRefresh, onClick: () => refresh(e.isDirectory ? e.path : listing?.path ?? ROOT) })
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
          draggable
          onClick={(ev) => onRowClick(e, ev)}
          onContextMenu={(ev) => onRowContextMenu(e, ev)}
          onDragStart={(ev) => {
            // 드래그 대상: 이미 선택된 항목이면 선택 전체, 아니면 이 항목만
            const paths = selectedPaths.has(e.path) ? [...selectedPaths] : [e.path]
            if (!selectedPaths.has(e.path)) {
              setSelectedPaths(new Set([e.path]))
              setAnchor(e.path)
            }
            if (ev.altKey) {
              // Alt+드래그: OS 로 파일 내보내기(네이티브 드래그)
              ev.preventDefault()
              svc.startDrag(e.path)
              return
            }
            ev.dataTransfer.setData('application/x-zipmaster-paths', JSON.stringify(paths))
            ev.dataTransfer.effectAllowed = 'copyMove'
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
          <span className="fs-name">{e.name}</span>
          {!e.isDirectory && <span className="fs-size">{formatBytes(e.size)}</span>}
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

      {/* 상단: 전체 경로를 드롭다운으로 표시(조상 선택 시 이동) */}
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
            { label: t.ctxPaste, disabled: !clipboard || atDrives, onClick: () => pasteInto(listing!.path) },
            { separator: true },
            { label: t.ctxUp, onClick: () => browseUp(), disabled: atDrives },
            { label: t.ctxRefresh, onClick: () => refresh(listing?.path ?? ROOT) }
          ])
        }
      >
        {renderNodes(ROOT, 0)}
      </div>
    </section>
  )
}
