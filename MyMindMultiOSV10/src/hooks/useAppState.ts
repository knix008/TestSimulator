import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { exportDiagram, type ExportFormat } from '../utils/exportImage'
import type {
  AppSettings,
  ContextMenuState,
  DiagramDocument,
  EdgeSide,
  EndCap,
  LayoutDirection,
  LinePattern,
  LineType,
  Locale,
  ShapeType,
  TextStyle,
  ThemeMode,
} from '../types'
import type { DiagramNode } from '../types'
import {
  addFreeNode,
  addChild,
  addSibling,
  collectSubtree,
  createMindmapDoc,
  deleteNodes,
  deserialize,
  duplicateNode,
  insertSubtree,
  moveNode,
  moveNodesBy,
  relayout,
  selectEdge,
  serialize,
  setEdgeLine,
  setEdgeColor,
  setEdgeEndCap,
  setEdgePattern,
  setEdgeStartCap,
  setMode,
  setNodeColor,
  setNodeNote,
  setNodeShape,
  setNodeTextStyle,
  updateEdgeById,
  updateNodeText,
} from '../store/document'

const SETTINGS_KEY = 'mymind.settings'

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>
      return {
        locale: parsed.locale ?? 'ko',
        theme: parsed.theme ?? 'dark',
        showGrid: parsed.showGrid ?? true,
      }
    }
  } catch {
    /* ignore */
  }
  return { locale: 'ko', theme: 'dark', showGrid: true }
}

export function useAppState() {
  const { t, i18n } = useTranslation()
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const [doc, setDoc] = useState<DiagramDocument>(() =>
    relayout(createMindmapDoc(t('canvas.centralTopic'))),
  )
  const [zoom, setZoom] = useState(1)
  const [viewResetKey, setViewResetKey] = useState(0)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [closePromptOpen, setClosePromptOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // In-app clipboard: a snapshot of a copied subtree (root at index 0).
  const [clipboard, setClipboard] = useState<DiagramNode[] | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    x: 0,
    y: 0,
    canvasX: 0,
    canvasY: 0,
    nodeId: null,
    visible: false,
  })

  // Undo/redo history. Content changes (new nodes/edges arrays, mode, layout,
  // defaults) create a history entry; selection-only changes reuse the same
  // arrays and are ignored. `timeTravel` suppresses recording during undo/redo.
  const past = useRef<DiagramDocument[]>([])
  const future = useRef<DiagramDocument[]>([])
  const prevDoc = useRef<DiagramDocument>(doc)
  const timeTravel = useRef(false)
  const [, bumpHistory] = useState(0)

  const contentChanged = (a: DiagramDocument, b: DiagramDocument) =>
    a.nodes !== b.nodes ||
    a.edges !== b.edges ||
    a.mode !== b.mode ||
    a.layout !== b.layout ||
    a.defaultShape !== b.defaultShape ||
    a.defaultLine !== b.defaultLine ||
    a.defaultLinePattern !== b.defaultLinePattern

  useEffect(() => {
    if (prevDoc.current === doc) return
    if (timeTravel.current) {
      timeTravel.current = false
      prevDoc.current = doc
      return
    }
    if (contentChanged(prevDoc.current, doc)) {
      past.current.push(prevDoc.current)
      if (past.current.length > 100) past.current.shift()
      future.current = []
      bumpHistory((v) => v + 1)
    }
    prevDoc.current = doc
  }, [doc])

  const resetHistory = () => {
    past.current = []
    future.current = []
    timeTravel.current = true // don't record the doc swap that triggered the reset
    bumpHistory((v) => v + 1)
  }

  const undo = () => {
    const prev = past.current.pop()
    if (!prev) return
    future.current.push(doc)
    timeTravel.current = true
    setDoc(prev)
    bumpHistory((v) => v + 1)
  }
  const redo = () => {
    const next = future.current.pop()
    if (!next) return
    past.current.push(doc)
    timeTravel.current = true
    setDoc(next)
    bumpHistory((v) => v + 1)
  }
  const canUndo = past.current.length > 0
  const canRedo = future.current.length > 0

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        Boolean(target?.isContentEditable)
      if (isTyping || !(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        undo()
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable)
      if (isTyping || (event.key !== 'Delete' && event.key !== 'Backspace')) return
      if (!doc.selectedId) return
      event.preventDefault()
      setDoc((d) => deleteNodes(d, d.selectedIds.length ? d.selectedIds : [d.selectedId!]))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [doc.selectedId])

  // Load a diagram opened via the OS file association (double-click / "Open with").
  useEffect(() => {
    if (!window.mymind?.onOpenFile) return
    return window.mymind.onOpenFile(({ filePath, content }) => {
      try {
        resetHistory()
        setDoc(deserialize(content, filePath))
        setZoom(1)
        setViewResetKey((k) => k + 1)
      } catch {
        /* ignore malformed file */
      }
    })
  }, [])

  // Tell the main process whether there are unsaved changes, so it can prompt
  // before the window closes; open the in-app prompt when a close is requested.
  useEffect(() => {
    window.mymind?.setDirty(doc.dirty)
  }, [doc.dirty])

  useEffect(() => {
    if (!window.mymind?.onRequestClose) return
    return window.mymind.onRequestClose(() => setClosePromptOpen(true))
  }, [])

  // Web fallback: the browser's native "leave site?" prompt on unsaved changes.
  useEffect(() => {
    if (window.mymind) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!doc.dirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [doc.dirty])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme)
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    localStorage.setItem('mymind.locale', settings.locale)
    void i18n.changeLanguage(settings.locale)
  }, [settings, i18n])

  const statusText = useMemo(() => {
    const file = doc.filePath ? doc.filePath.split(/[/\\]/).pop() : t('dialog.untitled')
    return `${file} · ${doc.dirty ? t('status.unsaved') : t('status.saved')}`
  }, [doc.dirty, doc.filePath, t])

  const setTheme = (theme: ThemeMode) => setSettings((s) => ({ ...s, theme }))
  const setLocale = (locale: Locale) => setSettings((s) => ({ ...s, locale }))
  const toggleGrid = () => setSettings((s) => ({ ...s, showGrid: !s.showGrid }))

  const newDoc = useCallback(() => {
    if (doc.dirty && !window.confirm(t('dialog.confirmNew'))) return
    resetHistory()
    setDoc(relayout(createMindmapDoc(t('canvas.centralTopic'))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.dirty, t])

  const openDoc = useCallback(async () => {
    if (!window.mymind) {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.mmap,.mymind,application/json'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) return
        const content = await file.text()
        resetHistory()
        setDoc(deserialize(content, file.name))
        setZoom(1)
        setViewResetKey((k) => k + 1)
      }
      input.click()
      return
    }
    const result = await window.mymind.openDialog()
    if (!result) return
    resetHistory()
    setDoc(deserialize(result.content, result.filePath))
    setZoom(1)
    setViewResetKey((k) => k + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Returns true if the document was written, false if the user cancelled.
  const saveDoc = useCallback(async (): Promise<boolean> => {
    const content = serialize(doc)
    if (!window.mymind) {
      const blob = new Blob([content], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'diagram.mmap'
      a.click()
      URL.revokeObjectURL(a.href)
      setDoc((d) => ({ ...d, dirty: false }))
      return true
    }
    let filePath = doc.filePath
    if (!filePath) {
      filePath = await window.mymind.saveDialog('diagram.mmap')
      if (!filePath) return false
    }
    await window.mymind.writeFile(filePath, content)
    setDoc((d) => ({ ...d, filePath, dirty: false }))
    return true
  }, [doc])

  // Open the export dialog (format + transparent background choices).
  const exportImage = useCallback(() => setExportOpen(true), [])

  const runExport = useCallback(
    async (format: ExportFormat, transparent: boolean) => {
      const svg = document.querySelector('.canvas-svg') as SVGSVGElement | null
      if (!svg) return
      const out = await exportDiagram(svg, doc.nodes, { format, transparent, theme: settings.theme })
      const base = doc.filePath ? doc.filePath.replace(/\.[^.]+$/, '').split(/[\\/]/).pop() : 'diagram'
      const name = `${base || 'diagram'}.${out.ext}`
      if (window.mymind) {
        const path = await window.mymind.saveImageDialog(name)
        if (!path) return
        if (out.kind === 'svg') await window.mymind.writeFile(path, out.text)
        else await window.mymind.writeBinaryFile(path, out.dataUrl.split(',')[1])
      } else {
        const a = document.createElement('a')
        if (out.kind === 'svg') {
          const blob = new Blob([out.text], { type: 'image/svg+xml' })
          a.href = URL.createObjectURL(blob)
          a.download = name
          a.click()
          URL.revokeObjectURL(a.href)
        } else {
          a.href = out.dataUrl
          a.download = name
          a.click()
        }
      }
      setExportOpen(false)
    },
    [doc.nodes, doc.filePath, settings.theme],
  )

  const selectNode = (id: string | null) =>
    setDoc((d) => ({ ...d, selectedId: id, selectedIds: id ? [id] : [], selectedEdgeId: null }))

  const selectNodes = (ids: string[]) =>
    setDoc((d) => ({ ...d, selectedId: ids[0] ?? null, selectedIds: ids, selectedEdgeId: null }))

  const selectEdgeById = (id: string | null) => setDoc((d) => selectEdge(d, id))

  const onMoveNode = (id: string, x: number, y: number) => {
    setDoc((d) => moveNode(d, id, x, y))
  }

  const onMoveNodes = (ids: string[], dx: number, dy: number) => {
    setDoc((d) => moveNodesBy(d, ids, dx, dy))
  }

  const onAddChild = () => {
    if (!doc.selectedId) return
    setDoc((d) =>
      addChild(d, d.selectedId!, t(d.mode === 'fishbone' ? 'canvas.cause' : 'canvas.centralTopic')),
    )
  }

  const onAddSibling = () => {
    if (!doc.selectedId) return
    setDoc((d) => addSibling(d, d.selectedId!, t('canvas.cause')))
  }

  const onDelete = () => {
    const ids = doc.selectedIds.length ? doc.selectedIds : doc.selectedId ? [doc.selectedId] : []
    if (!ids.length) return
    setDoc((d) => deleteNodes(d, ids))
  }

  const onLayout = (layout: LayoutDirection) => {
    // Re-lay out at the real viewport size (not setLayout's fixed 1200x700) so
    // the effect/head lands at the correct edge, then refit the view — otherwise
    // a flipped fishbone can shift off-screen and look unchanged.
    setDoc((d) =>
      relayout(
        { ...d, layout, dirty: true },
        Math.max(800, window.innerWidth),
        Math.max(500, window.innerHeight - 120),
      ),
    )
    setZoom(1)
    setViewResetKey((k) => k + 1)
  }

  const resetView = () => {
    setZoom(1)
    setViewResetKey((k) => k + 1)
  }

  const autoAlign = () => {
    setDoc((d) =>
      relayout(
        { ...d, dirty: true },
        Math.max(800, window.innerWidth),
        Math.max(500, window.innerHeight - 120),
      ),
    )
    setZoom(1)
    setViewResetKey((k) => k + 1)
  }

  const onShape = (shape: ShapeType) => {
    if (!doc.selectedId) return
    setDoc((d) => setNodeShape(d, d.selectedId!, shape))
  }
  const onColor = (color: string) => {
    if (!doc.selectedId) return
    setDoc((d) => setNodeColor(d, d.selectedId!, color))
  }
  const onNote = (id: string, note: string) => setDoc((d) => setNodeNote(d, id, note))
  // Line edits target the independently-selected edge when there is one,
  // otherwise every edge touching the selected node.
  const onLine = (line: LineType) => {
    setDoc((d) =>
      d.selectedEdgeId
        ? updateEdgeById(d, d.selectedEdgeId, { lineType: line })
        : d.selectedId
          ? setEdgeLine(d, d.selectedId, line)
          : d,
    )
  }
  const onLinePattern = (pattern: LinePattern) => {
    setDoc((d) =>
      d.selectedEdgeId
        ? updateEdgeById(d, d.selectedEdgeId, { linePattern: pattern })
        : d.selectedId
          ? setEdgePattern(d, d.selectedId, pattern)
          : d,
    )
  }
  const onLineColor = (color: string) => {
    setDoc((d) =>
      d.selectedEdgeId
        ? updateEdgeById(d, d.selectedEdgeId, { color })
        : d.selectedId
          ? setEdgeColor(d, d.selectedId, color)
          : d,
    )
  }
  const onLineStartCap = (cap: EndCap) => {
    setDoc((d) =>
      d.selectedEdgeId
        ? updateEdgeById(d, d.selectedEdgeId, { startCap: cap })
        : d.selectedId
          ? setEdgeStartCap(d, d.selectedId, cap)
          : d,
    )
  }
  const onLineEndCap = (cap: EndCap) => {
    setDoc((d) =>
      d.selectedEdgeId
        ? updateEdgeById(d, d.selectedEdgeId, { endCap: cap })
        : d.selectedId
          ? setEdgeEndCap(d, d.selectedId, cap)
          : d,
    )
  }
  // Manual connection-face overrides target the selected edge, or the edge from
  // the selected node to its parent (from = parent, to = node).
  const activeEdgeId = (d: DiagramDocument) =>
    d.selectedEdgeId ?? d.edges.find((e) => e.to === d.selectedId)?.id ?? null
  const onLineFromSide = (side: EdgeSide) => {
    setDoc((d) => {
      const id = activeEdgeId(d)
      return id ? updateEdgeById(d, id, { fromSide: side }) : d
    })
  }
  const onLineToSide = (side: EdgeSide) => {
    setDoc((d) => {
      const id = activeEdgeId(d)
      return id ? updateEdgeById(d, id, { toSide: side }) : d
    })
  }
  const onTextStyle = (style: Partial<TextStyle>) => {
    if (!doc.selectedId) return
    setDoc((d) => setNodeTextStyle(d, d.selectedId!, style))
  }

  const switchMode = (mode: 'mindmap' | 'fishbone') => {
    // Mindmap and fishbone share the same content; switching only re-renders it,
    // so there is nothing to lose and no need to confirm. Re-lay out at the real
    // viewport size and refit the view so the diagram stays centred instead of
    // jumping around a fixed 1200x700 canvas.
    setDoc((d) =>
      relayout(
        setMode(d, mode, {
          central: t('canvas.centralTopic'),
          effect: t('canvas.effect'),
          category: t('canvas.category'),
        }),
        Math.max(800, window.innerWidth),
        Math.max(500, window.innerHeight - 120),
      ),
    )
    setZoom(1)
    setViewResetKey((k) => k + 1)
  }

  // Window close: prompt if there are unsaved changes, otherwise close directly.
  const requestClose = () => {
    if (doc.dirty) setClosePromptOpen(true)
    else window.mymind?.close()
  }
  const closePromptSave = async () => {
    const saved = await saveDoc()
    if (!saved) return // user cancelled the save dialog — keep the app open
    setClosePromptOpen(false)
    window.mymind?.confirmClose()
  }
  const closePromptDiscard = () => {
    setClosePromptOpen(false)
    window.mymind?.confirmClose()
  }
  const closePromptCancel = () => setClosePromptOpen(false)

  const showContext = (x: number, y: number, nodeId: string | null, canvasX = 0, canvasY = 0) => {
    setContextMenu({ x, y, canvasX, canvasY, nodeId, visible: true })
    // Keep the current multi-selection if the right-clicked node is part of it;
    // otherwise select just that node.
    if (nodeId && !doc.selectedIds.includes(nodeId)) selectNode(nodeId)
  }

  const hideContext = () => setContextMenu((c) => ({ ...c, visible: false }))

  const editText = (id: string, text: string) => setDoc((d) => updateNodeText(d, id, text))

  const addTextAtContext = () => {
    const text = window.prompt(t('context.addTextPrompt'), t('canvas.centralTopic'))?.trim()
    if (!text) return
    setDoc((d) => addFreeNode(d, text, contextMenu.canvasX, contextMenu.canvasY))
  }

  const duplicateAtContext = () => {
    const id = contextMenu.nodeId ?? doc.selectedId
    if (!id) return
    setDoc((d) => duplicateNode(d, id))
  }

  const copyAtContext = () => {
    const id = contextMenu.nodeId ?? doc.selectedId
    if (!id) return
    setClipboard(collectSubtree(doc.nodes, id))
  }

  const pasteAtContext = () => {
    if (!clipboard || clipboard.length === 0) return
    const target = contextMenu.nodeId ?? doc.selectedId
    if (target) {
      // Paste as a child of the target node.
      setDoc((d) => insertSubtree(d, clipboard, target, 24, 24))
    } else {
      // Paste as a free subtree, anchored where the menu was opened.
      const root = clipboard[0]
      setDoc((d) =>
        insertSubtree(d, clipboard, null, contextMenu.canvasX - root.x, contextMenu.canvasY - root.y),
      )
    }
  }

  const canPaste = Boolean(clipboard && clipboard.length > 0)

  return {
    doc,
    setDoc,
    settings,
    setTheme,
    setLocale,
    toggleGrid,
    zoom,
    setZoom,
    viewResetKey,
    resetView,
    autoAlign,
    undo,
    redo,
    canUndo,
    canRedo,
    aboutOpen,
    setAboutOpen,
    exportOpen,
    setExportOpen,
    runExport,
    closePromptOpen,
    requestClose,
    closePromptSave,
    closePromptDiscard,
    closePromptCancel,
    editingId,
    setEditingId,
    contextMenu,
    showContext,
    hideContext,
    statusText,
    newDoc,
    openDoc,
    saveDoc,
    exportImage,
    selectNode,
    selectNodes,
    selectEdgeById,
    onMoveNode,
    onMoveNodes,
    onAddChild,
    onAddSibling,
    onDelete,
    onLayout,
    onShape,
    onColor,
    onNote,
    onLine,
    onLinePattern,
    onLineColor,
    onLineStartCap,
    onLineEndCap,
    onLineFromSide,
    onLineToSide,
    onTextStyle,
    switchMode,
    editText,
    addTextAtContext,
    duplicateAtContext,
    copyAtContext,
    pasteAtContext,
    canPaste,
  }
}
