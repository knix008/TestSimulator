import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
} from 'react'
import type { IsoTreeNode } from '../iso9660/tree-types'

export type TreeSelectEvent = {
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

type IsoTreeViewProps = {
  nodes: IsoTreeNode[]
  volumeLabel?: string
  loading?: boolean
  emptyText: string
  loadingText: string
  filterPlaceholder: string
  editable?: boolean
  dropHint?: string
  /**
   * After add/mkdir: expand parents, clear filter, scroll first path into view,
   * and briefly highlight these entries. `nonce` forces re-run when paths repeat.
   */
  reveal?: { paths: string[]; nonce: number } | null
  onDropFiles?: (destDir: string, files: File[]) => void
  onPrepareDragOut?: (entryPaths: string[]) => Promise<string[]>
  onStartDrag?: (tempPaths: string[]) => void
  onDragOutReady?: (entryPaths: string[]) => void
  onDragOutNotReady?: (entryPaths: string[]) => void
  onDragOutStarted?: (entryPaths: string[]) => void
  selectedPaths?: string[]
  onSelectionChange?: (paths: string[]) => void
  onNodeContextMenu?: (
    node: IsoTreeNode | null,
    clientX: number,
    clientY: number,
    selectedPaths: string[],
  ) => void
}

export function IsoTreeView({
  nodes,
  volumeLabel,
  loading,
  emptyText,
  loadingText,
  filterPlaceholder,
  editable,
  dropHint,
  reveal,
  onDropFiles,
  onPrepareDragOut,
  onStartDrag,
  onDragOutReady,
  onDragOutNotReady,
  onDragOutStarted,
  selectedPaths = [],
  onSelectionChange,
  onNodeContextMenu,
}: IsoTreeViewProps) {
  const [filter, setFilter] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [flashPaths, setFlashPaths] = useState<Set<string>>(() => new Set())
  const readyMapRef = useRef(new Map<string, string>())
  const failedDragRef = useRef(new Set<string>())
  const anchorRef = useRef<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const selectedSet = useMemo(() => new Set(selectedPaths), [selectedPaths])
  const flashSet = flashPaths

  /** Reset expand only when a different image/session root is loaded. */
  const rootIdentity = useMemo(
    () => nodes.map((n) => n.path).join('\0') + `#${nodes.length}`,
    [nodes],
  )

  useEffect(() => {
    setFilter('')
    setExpanded(new Set(nodes.filter((n) => n.isDir).map((n) => n.path)))
    readyMapRef.current.clear()
    failedDragRef.current.clear()
    setPreparing(false)
    setFlashPaths(new Set())
    anchorRef.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootIdentity])

  useEffect(() => {
    if (!reveal?.paths.length) return
    const focusPaths = reveal.paths
    // Search filter would hide newly added rows — clear it.
    setFilter('')
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const entryPath of focusPaths) {
        const parts = entryPath.split('/').filter(Boolean)
        let acc = ''
        for (const part of parts) {
          acc = acc ? `${acc}/${part}` : part
          next.add(acc)
        }
      }
      return next
    })
    setFlashPaths(new Set(focusPaths))
    const flashTimer = window.setTimeout(() => setFlashPaths(new Set()), 2800)

    const first = focusPaths[0]!
    const escaped =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(first)
        : first.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    let cancelled = false
    let tries = 0
    const tryScroll = () => {
      if (cancelled) return
      const el = bodyRef.current?.querySelector(`[data-tree-path="${escaped}"]`)
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        return
      }
      // Wait for session tree re-render + expand to paint the new row.
      if (tries++ < 40) {
        window.requestAnimationFrame(tryScroll)
      }
    }
    window.requestAnimationFrame(tryScroll)

    return () => {
      cancelled = true
      window.clearTimeout(flashTimer)
    }
  }, [reveal?.nonce])

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return nodes
    return filterTree(nodes, q)
  }, [nodes, filter])

  const flatVisible = useMemo(
    () => flattenVisible(visible, expanded, Boolean(filter.trim())),
    [visible, expanded, filter],
  )

  const filePathSet = useMemo(() => {
    const set = new Set<string>()
    const walk = (list: IsoTreeNode[]) => {
      for (const n of list) {
        if (!n.isDir) set.add(n.path)
        if (n.children?.length) walk(n.children)
      }
    }
    walk(nodes)
    return set
  }, [nodes])

  function toggle(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function ensureExpanded(path: string) {
    if (!path) return
    setExpanded((prev) => {
      if (prev.has(path)) return prev
      const next = new Set(prev)
      next.add(path)
      return next
    })
  }

  function applySelection(path: string, ev: TreeSelectEvent) {
    const additive = ev.ctrlKey || ev.metaKey
    if (ev.shiftKey && anchorRef.current) {
      const a = flatVisible.findIndex((n) => n.path === anchorRef.current)
      const b = flatVisible.findIndex((n) => n.path === path)
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a]
        const range = flatVisible.slice(lo, hi + 1).map((n) => n.path)
        if (additive) {
          const next = new Set(selectedPaths)
          for (const p of range) next.add(p)
          onSelectionChange?.([...next])
        } else {
          onSelectionChange?.(range)
        }
        return
      }
    }

    if (additive) {
      const next = new Set(selectedPaths)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      onSelectionChange?.([...next])
      anchorRef.current = path
      return
    }

    onSelectionChange?.([path])
    anchorRef.current = path
  }

  async function ensurePrepared(entryPaths: string[]): Promise<string[]> {
    if (!onPrepareDragOut || !entryPaths.length) return []
    const missing = entryPaths.filter(
      (p) => !readyMapRef.current.get(p) && !failedDragRef.current.has(p),
    )
    if (!missing.length) {
      return entryPaths.map((p) => readyMapRef.current.get(p)!).filter(Boolean)
    }
    setPreparing(true)
    try {
      const temps = await onPrepareDragOut(missing)
      missing.forEach((p, i) => {
        const temp = temps[i]
        if (temp) readyMapRef.current.set(p, temp)
        else failedDragRef.current.add(p)
      })
      const all = entryPaths.map((p) => readyMapRef.current.get(p)!).filter(Boolean)
      if (all.length) onDragOutReady?.(entryPaths.filter((p) => readyMapRef.current.has(p)))
      return all
    } finally {
      setPreparing(false)
    }
  }

  function dragPathsFor(node: IsoTreeNode): string[] {
    if (selectedSet.has(node.path) && selectedPaths.length > 1) {
      return selectedPaths.filter((p) => filePathSet.has(p))
    }
    return node.isDir ? [] : [node.path]
  }

  function isFileDrag(e: DragEvent) {
    return Array.from(e.dataTransfer.types).includes('Files')
  }

  /** True when the event is over a folder/file row that handles its own drop target. */
  function isNestedDropZone(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false
    return Boolean(
      target.closest(
        '.iso-tree-row, .iso-tree-list, .iso-tree-empty-folder, .iso-tree-branch',
      ),
    )
  }

  return (
    <div
      className={[
        'iso-tree',
        editable ? 'editable' : '',
        dropTarget === '' ? 'drop-active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onDragOver={(e) => {
        if (!editable || !onDropFiles || !isFileDrag(e)) return
        // Nested folder/file rows own the drop target (ISO / Docker / AppImage / IMG).
        if (isNestedDropZone(e.target)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDropTarget('')
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setDropTarget(null)
      }}
      onDrop={(e) => {
        if (!editable || !onDropFiles) return
        if (isNestedDropZone(e.target)) return
        e.preventDefault()
        setDropTarget(null)
        const files = Array.from(e.dataTransfer.files)
        if (files.length) onDropFiles('', files)
      }}
      onContextMenu={(e) => {
        if (!editable || !onNodeContextMenu) return
        e.preventDefault()
        onSelectionChange?.([])
        anchorRef.current = null
        onNodeContextMenu(null, e.clientX, e.clientY, [])
      }}
    >
      <div className="iso-tree-toolbar">
        {volumeLabel ? <span className="iso-tree-vol">{volumeLabel}</span> : <span />}
        <div className="iso-tree-toolbar-right">
          {selectedPaths.length > 0 ? (
            <span className="iso-tree-selcount">{selectedPaths.length}</span>
          ) : null}
          <input
            className="iso-tree-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={filterPlaceholder}
          />
        </div>
      </div>
      {editable && dropHint ? <p className="iso-tree-drop-hint">{dropHint}</p> : null}
      <div className="iso-tree-body" ref={bodyRef}>
        {loading ? (
          <div className="iso-tree-empty">{loadingText}</div>
        ) : visible.length === 0 ? (
          <div className="iso-tree-empty">{emptyText}</div>
        ) : (
          <ul className="iso-tree-list">
            {visible.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                depth={0}
                expanded={expanded}
                onToggle={toggle}
                forceOpen={Boolean(filter.trim())}
                editable={editable}
                dropTarget={dropTarget}
                setDropTarget={setDropTarget}
                ensureExpanded={ensureExpanded}
                preparing={preparing}
                readyMapRef={readyMapRef}
                ensurePrepared={ensurePrepared}
                dragPathsFor={dragPathsFor}
                onDropFiles={onDropFiles}
                onStartDrag={onStartDrag}
                onDragOutNotReady={onDragOutNotReady}
                onDragOutStarted={onDragOutStarted}
                selectedSet={selectedSet}
                flashSet={flashSet}
                onSelect={applySelection}
                onNodeContextMenu={(n, x, y) => {
                  let nextSelected = selectedPaths
                  if (n && !selectedSet.has(n.path)) {
                    nextSelected = [n.path]
                    onSelectionChange?.(nextSelected)
                    anchorRef.current = n.path
                  }
                  onNodeContextMenu?.(n, x, y, nextSelected)
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function parentDirPath(entryPath: string): string {
  const parts = entryPath.split('/').filter(Boolean)
  if (parts.length <= 1) return ''
  return parts.slice(0, -1).join('/')
}

function TreeNode({
  node,
  depth,
  expanded,
  onToggle,
  forceOpen,
  editable,
  dropTarget,
  setDropTarget,
  ensureExpanded,
  preparing,
  readyMapRef,
  ensurePrepared,
  dragPathsFor,
  onDropFiles,
  onStartDrag,
  onDragOutNotReady,
  onDragOutStarted,
  selectedSet,
  flashSet,
  onSelect,
  onNodeContextMenu,
}: {
  node: IsoTreeNode
  depth: number
  expanded: Set<string>
  onToggle: (path: string) => void
  forceOpen: boolean
  editable?: boolean
  dropTarget: string | null
  setDropTarget: (path: string | null) => void
  ensureExpanded: (path: string) => void
  preparing: boolean
  readyMapRef: MutableRefObject<Map<string, string>>
  ensurePrepared: (entryPaths: string[]) => Promise<string[]>
  dragPathsFor: (node: IsoTreeNode) => string[]
  onDropFiles?: (destDir: string, files: File[]) => void
  onStartDrag?: (tempPaths: string[]) => void
  onDragOutNotReady?: (entryPaths: string[]) => void
  onDragOutStarted?: (entryPaths: string[]) => void
  selectedSet: Set<string>
  flashSet: Set<string>
  onSelect: (path: string, ev: TreeSelectEvent) => void
  onNodeContextMenu?: (node: IsoTreeNode, clientX: number, clientY: number) => void
}) {
  const isOpen = forceOpen || expanded.has(node.path)
  const hasChildren = Boolean(node.children?.length)
  const isDrop = dropTarget === node.path
  const isSelected = selectedSet.has(node.path)
  const isFlash = flashSet.has(node.path)

  function acceptIncomingFiles(e: DragEvent, destDir: string) {
    if (!editable || !onDropFiles) return false
    if (!Array.from(e.dataTransfer.types).includes('Files')) return false
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    setDropTarget(destDir)
    if (destDir) ensureExpanded(destDir)
    return true
  }

  function dropIncomingFiles(e: DragEvent, destDir: string) {
    if (!editable || !onDropFiles) return
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(null)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) onDropFiles(destDir, files)
  }

  return (
    <li className={isDrop && node.isDir ? 'iso-tree-branch drop-over' : 'iso-tree-branch'}>
      <div
        className={[
          node.isDir ? 'iso-tree-row dir' : 'iso-tree-row file',
          isDrop ? 'drop-over' : '',
          isSelected ? 'selected' : '',
          isFlash ? 'just-added' : '',
          editable && !node.isDir ? 'draggable' : '',
          preparing && isSelected ? 'preparing' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        data-tree-path={node.path}
        style={{ paddingLeft: 8 + depth * 14 }}
        draggable={Boolean(editable && !node.isDir && onStartDrag)}
        onClick={(e: ReactMouseEvent) => {
          e.stopPropagation()
          onSelect(node.path, {
            ctrlKey: e.ctrlKey,
            metaKey: e.metaKey,
            shiftKey: e.shiftKey,
          })
          // Expand/collapse dirs only on plain click (not multi-select modifiers)
          if (node.isDir && !e.ctrlKey && !e.metaKey && !e.shiftKey) onToggle(node.path)
        }}
        onContextMenu={(e) => {
          if (!editable || !onNodeContextMenu) return
          e.preventDefault()
          e.stopPropagation()
          onNodeContextMenu(node, e.clientX, e.clientY)
        }}
        onMouseEnter={() => {
          if (!editable || node.isDir) return
          const paths = dragPathsFor(node)
          if (paths.length) void ensurePrepared(paths)
        }}
        onMouseDown={() => {
          if (!editable || node.isDir) return
          const paths = dragPathsFor(node)
          if (paths.length) void ensurePrepared(paths)
        }}
        onDragStart={(e) => {
          if (!editable || node.isDir || !onStartDrag) return
          const paths = dragPathsFor(node)
          if (!paths.length) {
            e.preventDefault()
            return
          }
          const temps = paths.map((p) => readyMapRef.current.get(p)!).filter(Boolean)
          if (temps.length < paths.length) {
            e.preventDefault()
            onDragOutNotReady?.(paths)
            void ensurePrepared(paths)
            return
          }
          e.preventDefault()
          onStartDrag(temps)
          onDragOutStarted?.(paths)
        }}
        onDragOver={(e) => {
          // Directory → that folder; file → parent folder (so nested IMG/AppImage dirs work).
          const dest = node.isDir ? node.path : parentDirPath(node.path)
          acceptIncomingFiles(e, dest)
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
          if (dropTarget === (node.isDir ? node.path : parentDirPath(node.path))) {
            setDropTarget(null)
          }
        }}
        onDrop={(e) => {
          const dest = node.isDir ? node.path : parentDirPath(node.path)
          dropIncomingFiles(e, dest)
        }}
      >
        <span className="iso-tree-twist">
          {node.isDir ? (isOpen ? '▾' : '▸') : preparing && isSelected ? '…' : '·'}
        </span>
        <span className={node.isDir ? 'iso-tree-icon dir' : 'iso-tree-icon file'} />
        <span className="iso-tree-name" title={node.path}>
          {node.name}
        </span>
        <span className="iso-tree-size">{node.isDir ? '' : formatBytes(node.size)}</span>
      </div>
      {node.isDir && isOpen && (
        <ul
          className={['iso-tree-list', isDrop ? 'drop-over' : ''].filter(Boolean).join(' ')}
          onDragOver={(e) => {
            acceptIncomingFiles(e, node.path)
          }}
          onDrop={(e) => {
            dropIncomingFiles(e, node.path)
          }}
        >
          {hasChildren ? (
            node.children!.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                onToggle={onToggle}
                forceOpen={forceOpen}
                editable={editable}
                dropTarget={dropTarget}
                setDropTarget={setDropTarget}
                ensureExpanded={ensureExpanded}
                preparing={preparing}
                readyMapRef={readyMapRef}
                ensurePrepared={ensurePrepared}
                dragPathsFor={dragPathsFor}
                onDropFiles={onDropFiles}
                onStartDrag={onStartDrag}
                onDragOutNotReady={onDragOutNotReady}
                onDragOutStarted={onDragOutStarted}
                selectedSet={selectedSet}
                flashSet={flashSet}
                onSelect={onSelect}
                onNodeContextMenu={onNodeContextMenu}
              />
            ))
          ) : (
            <li
              className="iso-tree-empty-folder"
              style={{ paddingLeft: 8 + (depth + 1) * 14 }}
              onDragOver={(e) => {
                acceptIncomingFiles(e, node.path)
              }}
              onDrop={(e) => {
                dropIncomingFiles(e, node.path)
              }}
            />
          )}
        </ul>
      )}
    </li>
  )
}

function flattenVisible(
  nodes: IsoTreeNode[],
  expanded: Set<string>,
  forceOpen: boolean,
): IsoTreeNode[] {
  const out: IsoTreeNode[] = []
  function walk(list: IsoTreeNode[]) {
    for (const n of list) {
      out.push(n)
      if (n.isDir && n.children?.length && (forceOpen || expanded.has(n.path))) {
        walk(n.children)
      }
    }
  }
  walk(nodes)
  return out
}

function filterTree(nodes: IsoTreeNode[], q: string): IsoTreeNode[] {
  const out: IsoTreeNode[] = []
  for (const node of nodes) {
    if (node.isDir && node.children) {
      const kids = filterTree(node.children, q)
      if (kids.length > 0 || node.name.toLowerCase().includes(q)) {
        out.push({ ...node, children: kids.length ? kids : node.children })
      }
    } else if (node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)) {
      out.push(node)
    }
  }
  return out
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}
