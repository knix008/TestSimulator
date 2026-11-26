/**
 * Left panel: the computer's folders and files. Quick places and drives at the
 * root, folders open lazily. Double-click an image to open it; drag files or
 * folders onto the image tree to add them (the drag uses the same page event
 * as OS drops, so the tree's drop targets work unchanged); right-click for the
 * menu that fits the item.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FsEntry, FsPlace } from '../platform/engine-types'
import type { ContextMenuItem } from '../components/ContextMenu'
import type { MessageKey } from '../i18n/messages'
import { NATIVE_DROP_EVENT, type NativeDropDetail } from '../platform/tauri-bridge'
import { Icons } from '../Toolbar'

type T = (key: MessageKey, ...args: string[]) => string

export type ExplorerActions = {
  openImage: (p: string) => void
  mountImage: (p: string) => void
  addToImage: ((paths: string[]) => void) | null
  useAsSource: (dir: string) => void
  extractHere: ((dir: string) => void) | null
  openPath: (p: string) => void
  copyText: (text: string) => void
}

const FOLDER = (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" fill="#f5c04a" stroke="#d29b18" strokeWidth="1" />
  </svg>
)
const FILE = (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path d="M6 3h8l4 4v14H6z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.2" />
    <path d="M14 3v4h4" fill="none" stroke="#94a3b8" strokeWidth="1.2" />
  </svg>
)
const DISC = (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="#60a5fa" stroke="#2563eb" strokeWidth="1.2" />
    <circle cx="12" cy="12" r="2.6" fill="#1e3a8a" />
    <path d="M7 9a6 6 0 0 1 3-3" stroke="#fff" strokeWidth="1.4" fill="none" />
  </svg>
)
const DRIVE = (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <rect x="3" y="7" width="18" height="10" rx="2" fill="#94a3b8" stroke="#475569" strokeWidth="1.2" />
    <circle cx="17" cy="12" r="1.3" fill="#22c55e" />
  </svg>
)
const PLACE: Record<FsPlace['kind'], { icon: React.ReactNode; color: string }> = {
  drive: { icon: DRIVE, color: '#64748b' },
  root: { icon: DRIVE, color: '#64748b' },
  home: { icon: Icons.home, color: '#f97316' },
  desktop: { icon: FOLDER, color: '#0ea5e9' },
  documents: { icon: FOLDER, color: '#8b5cf6' },
  downloads: { icon: Icons.download, color: '#22c55e' },
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

export function Explorer({
  t,
  actions,
  onMenu,
  reloadKey,
}: {
  t: T
  actions: ExplorerActions
  onMenu: (x: number, y: number, items: ContextMenuItem[]) => void
  reloadKey: number
}) {
  const [places, setPlaces] = useState<FsPlace[]>([])
  const [children, setChildren] = useState<Record<string, FsEntry[] | 'loading' | string>>({})
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const [selected, setSelected] = useState<string[]>([])
  const [showFiles, setShowFiles] = useState(true)
  const anchor = useRef<string | null>(null)

  const api = window.isoMaker

  const load = useCallback(
    async (dir: string) => {
      if (!api?.fsList) return
      setChildren((c) => ({ ...c, [dir]: 'loading' }))
      try {
        const list = await api.fsList(dir)
        setChildren((c) => ({ ...c, [dir]: list }))
      } catch (err) {
        setChildren((c) => ({ ...c, [dir]: err instanceof Error ? err.message : String(err) }))
      }
    },
    [api],
  )

  useEffect(() => {
    if (!api?.fsPlaces) return
    void api.fsPlaces().then(setPlaces, () => setPlaces([]))
    // reload what is open
    setChildren({})
    for (const dir of open) void load(dir)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey])

  const toggle = (dir: string) => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(dir)) next.delete(dir)
      else {
        next.add(dir)
        if (!children[dir] || typeof children[dir] === 'string') void load(dir)
      }
      return next
    })
  }

  // ── selection over the visible rows ──
  const visibleRows: FsEntry[] = []
  const walk = (dir: string) => {
    const list = children[dir]
    if (!Array.isArray(list)) return
    for (const e of list) {
      if (!e.isDir && !showFiles) continue
      visibleRows.push(e)
      if (e.isDir && open.has(e.path)) walk(e.path)
    }
  }
  for (const p of places) {
    visibleRows.push({ name: p.name, path: p.path, isDir: true, size: 0, mtime: 0, image: false })
    if (open.has(p.path)) walk(p.path)
  }

  const select = (p: string, e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => {
    if (e.shiftKey && anchor.current) {
      const a = visibleRows.findIndex((r) => r.path === anchor.current)
      const b = visibleRows.findIndex((r) => r.path === p)
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a]
        setSelected(visibleRows.slice(lo, hi + 1).map((r) => r.path))
        return
      }
    }
    if (e.ctrlKey || e.metaKey) {
      setSelected((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]))
    } else setSelected([p])
    anchor.current = p
  }

  // ── drag into the image tree (pointer based, works inside the webview) ──
  const drag = useRef<{ paths: string[]; x: number; y: number; started: boolean; ghost: HTMLDivElement | null } | null>(null)
  const fire = (type: NativeDropDetail['type'], paths: string[], x: number, y: number) =>
    window.dispatchEvent(new CustomEvent<NativeDropDetail>(NATIVE_DROP_EVENT, { detail: { type, paths, x, y } }))

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      if (!d.started) {
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return
        d.started = true
        const g = document.createElement('div')
        g.className = 'explorer-ghost'
        g.textContent = d.paths.length === 1 ? (d.paths[0]!.split(/[\\/]/).pop() ?? '') : t('explorerDragMany', String(d.paths.length))
        document.body.appendChild(g)
        d.ghost = g
        fire('enter', d.paths, e.clientX, e.clientY)
      }
      if (d.ghost) {
        d.ghost.style.left = `${e.clientX + 14}px`
        d.ghost.style.top = `${e.clientY + 10}px`
      }
      fire('over', d.paths, e.clientX, e.clientY)
    }
    const up = (e: PointerEvent) => {
      const d = drag.current
      drag.current = null
      if (!d) return
      d.ghost?.remove()
      if (d.started) fire(e.type === 'pointerup' ? 'drop' : 'leave', d.paths, e.clientX, e.clientY)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [t])

  const menuFor = (e: FsEntry, isPlace: boolean): ContextMenuItem[] => {
    const paths = selected.includes(e.path) && selected.length > 1 ? selected : [e.path]
    const items: ContextMenuItem[] = []
    if (e.image) {
      items.push({ id: 'open', label: t('explorerOpenImage'), icon: Icons.openIso, onClick: () => actions.openImage(e.path) })
      items.push({ id: 'mount', label: t('explorerMount'), icon: Icons.mount, onClick: () => actions.mountImage(e.path) })
    }
    if (e.isDir) {
      items.push({
        id: 'expand',
        label: open.has(e.path) ? t('explorerCollapse') : t('explorerExpand'),
        icon: Icons.folder,
        onClick: () => toggle(e.path),
      })
      items.push({ id: 'source', label: t('explorerUseAsSource'), icon: Icons.create, onClick: () => actions.useAsSource(e.path) })
      if (actions.extractHere) {
        const fn = actions.extractHere
        items.push({ id: 'extract-here', label: t('explorerExtractHere'), icon: Icons.extract, onClick: () => fn(e.path) })
      }
    }
    if (!isPlace) {
      items.push({
        id: 'add',
        label: paths.length > 1 ? t('explorerAddMany', String(paths.length)) : t('explorerAdd'),
        icon: Icons.addFile,
        disabled: !actions.addToImage,
        onClick: () => actions.addToImage?.(paths),
      })
    }
    items.push({ id: 'sep', label: '', separator: true })
    items.push({
      id: 'show',
      label: e.isDir ? t('explorerShowFolder') : t('explorerOpenFile'),
      icon: Icons.search,
      onClick: () => actions.openPath(e.path),
    })
    items.push({ id: 'copy', label: t('ctxCopyPath'), icon: Icons.copy, onClick: () => actions.copyText(paths.join('\n')) })
    if (e.isDir) {
      items.push({ id: 'refresh', label: t('explorerRefresh'), icon: Icons.refresh, onClick: () => void load(e.path) })
    }
    return items
  }

  const row = (e: FsEntry, depth: number, isPlace = false, placeIcon?: React.ReactNode) => {
    const isOpen = open.has(e.path)
    const sel = selected.includes(e.path)
    return (
      <div
        key={e.path}
        className={`explorer-row${sel ? ' selected' : ''}${e.image ? ' image' : ''}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        data-fs-path={e.path}
        title={e.path}
        onPointerDown={(ev) => {
          if (ev.button !== 0 || isPlace) return
          const paths = selected.includes(e.path) ? selected : [e.path]
          drag.current = { paths, x: ev.clientX, y: ev.clientY, started: false, ghost: null }
        }}
        onClick={(ev) => {
          select(e.path, ev)
          if (e.isDir && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey) toggle(e.path)
        }}
        onDoubleClick={() => {
          if (e.image) actions.openImage(e.path)
          else if (!e.isDir) actions.openPath(e.path)
        }}
        onContextMenu={(ev) => {
          ev.preventDefault()
          ev.stopPropagation()
          if (!selected.includes(e.path)) setSelected([e.path])
          onMenu(ev.clientX, ev.clientY, menuFor(e, isPlace))
        }}
      >
        <span className="explorer-twist">{e.isDir ? (isOpen ? '▾' : '▸') : ''}</span>
        <span className="explorer-icon">{placeIcon ?? (e.isDir ? FOLDER : e.image ? DISC : FILE)}</span>
        <span className="explorer-name">{e.name}</span>
        {!e.isDir ? <span className="explorer-size">{fmtSize(e.size)}</span> : null}
      </div>
    )
  }

  const renderDir = (dir: string, depth: number): React.ReactNode => {
    const list = children[dir]
    if (list === 'loading') return <div className="explorer-note" style={{ paddingLeft: 20 + depth * 14 }}>…</div>
    if (typeof list === 'string') return <div className="explorer-note error" style={{ paddingLeft: 20 + depth * 14 }}>{list}</div>
    if (!list) return null
    const shown = list.filter((e) => e.isDir || showFiles)
    if (!shown.length) return <div className="explorer-note" style={{ paddingLeft: 20 + depth * 14 }}>{t('explorerEmpty')}</div>
    return shown.map((e) => (
      <div key={e.path}>
        {row(e, depth)}
        {e.isDir && open.has(e.path) ? renderDir(e.path, depth + 1) : null}
      </div>
    ))
  }

  return (
    <div className="explorer">
      <div className="explorer-tools">
        <label className="explorer-check">
          <input type="checkbox" checked={showFiles} onChange={(e) => setShowFiles(e.target.checked)} />
          <span>{t('explorerShowFiles')}</span>
        </label>
      </div>
      <div
        className="explorer-tree"
        onContextMenu={(ev) => {
          ev.preventDefault()
          onMenu(ev.clientX, ev.clientY, [
            { id: 'refresh-all', label: t('explorerRefresh'), icon: Icons.refresh, onClick: () => void api?.fsPlaces?.().then(setPlaces) },
            { id: 'collapse-all', label: t('explorerCollapseAll'), icon: Icons.folder, onClick: () => setOpen(new Set()) },
            {
              id: 'toggle-files',
              label: showFiles ? t('explorerHideFiles') : t('explorerShowFiles'),
              icon: FILE,
              onClick: () => setShowFiles((v) => !v),
            },
          ])
        }}
      >
        {places.map((p) => (
          <div key={p.id}>
            {row({ name: p.name, path: p.path, isDir: true, size: 0, mtime: 0, image: false }, 0, true, PLACE[p.kind].icon)}
            {open.has(p.path) ? renderDir(p.path, 1) : null}
          </div>
        ))}
      </div>
      <div className="explorer-status" title={selected.join('\n')}>
        {selected.length > 1 ? t('explorerSelected', String(selected.length)) : selected[0] ?? t('explorerHint')}
      </div>
    </div>
  )
}
