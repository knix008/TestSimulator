import { useEffect, useState, type JSX } from 'react'
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
  const { t, canBrowse, listing, browseBusy, selectedArchivePath, browseUp, browseTo, openFsEntry, setDefaultDir, doExtract } =
    useStore()
  const svc = useArchiveService()
  const { openMenu } = useContextMenu()

  // 트리 상태: 로드된 디렉터리 자식 캐시 · 펼쳐진 경로 · 로딩 중 경로.
  const [childrenCache, setChildrenCache] = useState<Record<string, FsEntry[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState<Set<string>>(new Set())

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

  const onEntryClick = (e: FsEntry) => {
    if (e.isDirectory) {
      browseTo(e.path) // 드롭다운/상태바 동기화 + 계보 자동 펼침
      if (!expanded.has(e.path)) toggle(e.path)
    } else {
      openFsEntry(e) // 아카이브면 오른쪽 패널에 내용 표시
    }
  }

  const refresh = (dirPath: string) => loadChildren(dirPath).catch(() => {})

  // 트리 항목 우클릭 메뉴 구성(폴더/아카이브/일반 파일별로 다름).
  const entryMenu = (e: FsEntry): MenuItem[] => {
    const items: MenuItem[] = []
    if (e.isDirectory) {
      items.push({ label: t.ctxOpen, onClick: () => onEntryClick(e) })
      items.push({ label: t.ctxSetDefault, onClick: () => setDefaultDir(e.path) })
    } else if (e.isArchive) {
      items.push({ label: t.ctxViewContents, onClick: () => openFsEntry(e) })
      items.push({ label: t.ctxExtract, onClick: () => doExtract(undefined, e.path) })
    }
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
            (e.path === selectedArchivePath ? ' selected' : '') +
            (e.isArchive ? ' archive' : '') +
            (e.isDirectory ? ' dir' : '') +
            (isCurrent ? ' current' : '')
          }
          style={{ paddingLeft: 6 + depth * 16 }}
          title={e.path}
          onContextMenu={(ev) => openMenu(ev, entryMenu(e))}
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
          <span className="fs-ico" aria-hidden onClick={() => onEntryClick(e)}>
            {e.isDirectory ? (isExp ? '📂' : '📁') : e.isArchive ? '🗜️' : '📄'}
          </span>
          <span className="fs-name" onClick={() => onEntryClick(e)}>
            {e.name}
          </span>
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

      {/* 하단: 드라이브 루트부터 시작하는 확장 가능한 트리 */}
      <div
        className="fs-tree"
        onContextMenu={(ev) =>
          openMenu(ev, [
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
