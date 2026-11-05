import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { focusPopout } from '../popout'
import { host, isDesktop, type SampleItem } from '../host'
import { addRecent, removeRecent, type AppSettings, type GeneralSettings, type StartSettings } from '../settings'
import { applyTheme, setCustomThemes, type CustomTheme } from '../themes'
import { exportDiagram, type ExportFormat } from '../utils/exportImage'
import type {
  ContextMenuState,
  DiagramMode,
  DiagramDocument,
  EdgeSide,
  EndCap,
  LayoutDirection,
  LinePattern,
  LineType,
  Locale,
  ShapeType,
  TextStyle,
} from '../types'
import type { DiagramNode } from '../types'
import {
  addFreeNode,
  addChild,
  createFishboneDoc,
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

const IMAGE_NAMES: Record<string, string> = { png: 'PNG Image', jpg: 'JPEG Image', webp: 'WebP Image', svg: 'SVG Image' }
const viewportWidth = () => Math.max(800, window.innerWidth)
const viewportHeight = () => Math.max(500, window.innerHeight - 120)
const fileNameOf = (path: string) => path.split(/[/\\]/).pop() ?? path

export function useAppState(initialSettings: AppSettings) {
  const { t, i18n } = useTranslation()
  const [settings, setSettings] = useState<AppSettings>(initialSettings)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  // A new diagram as the settings say; the mode can be asked for directly.
  const blankDoc = (wanted?: DiagramMode): DiagramDocument => {
    const general = settingsRef.current.general
    const mode = wanted ?? general.newMode
    const base =
      mode === 'fishbone'
        ? { ...createFishboneDoc(t('canvas.effect'), t('canvas.category')), layout: general.fishboneLayout }
        : { ...createMindmapDoc(t('canvas.centralTopic')), layout: general.mindmapLayout }
    return relayout(
      { ...base, defaultShape: general.newShape, defaultLine: general.newLine, defaultLinePattern: general.newLinePattern },
      viewportWidth(),
      viewportHeight(),
    )
  }
  const [doc, setDoc] = useState<DiagramDocument>(() => blankDoc())
  const [showStart, setShowStart] = useState(initialSettings.startScreen.showOnStartup)
  const showStartRef = useRef(showStart)
  showStartRef.current = showStart
  const [prefsTab, setPrefsTab] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [addingText, setAddingText] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [unsavedOpen, setUnsavedOpen] = useState(false)
  // What to do once unsaved work has been saved or given up.
  const afterUnsaved = useRef<(() => void) | null>(null)
  const [zoom, setZoom] = useState(1)
  const [viewResetKey, setViewResetKey] = useState(0)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
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
      if (isTyping || showStartRef.current || !(event.ctrlKey || event.metaKey)) return
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
      if (isTyping || showStartRef.current || (event.key !== 'Delete' && event.key !== 'Backspace')) return
      if (!doc.selectedId) return
      event.preventDefault()
      setDoc((d) => deleteNodes(d, d.selectedIds.length ? d.selectedIds : [d.selectedId!]))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [doc.selectedId])

  /* ---------------------------------------------------------- settings */

  const changeSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((current) => ({ ...current, ...patch }))
    void host.saveSettings(patch as Record<string, unknown>).catch(() => {})
  }, [])

  useEffect(() => {
    applyTheme(settings.theme)
  }, [settings.theme, settings.customThemes])

  useEffect(() => {
    document.documentElement.lang = settings.language
    void i18n.changeLanguage(settings.language)
  }, [settings.language, i18n])

  const setTheme = (theme: string) => changeSettings({ theme })
  const setLanguage = (language: Locale) => changeSettings({ language })
  const toggleGrid = () => changeSettings({ showGrid: !settingsRef.current.showGrid })
  const setGeneral = (patch: Partial<GeneralSettings>) => changeSettings({ general: { ...settingsRef.current.general, ...patch } })
  const setStart = useCallback(
    (patch: Partial<StartSettings>) => changeSettings({ startScreen: { ...settingsRef.current.startScreen, ...patch } }),
    [changeSettings],
  )
  const setCustomThemeList = (list: CustomTheme[], selected: string) => {
    // The list first: a theme must be registered before it can be applied.
    setCustomThemes(list)
    changeSettings({ customThemes: list, theme: selected })
  }
  const rememberRecent = (file: string) => changeSettings({ recent: addRecent(settingsRef.current.recent, file) })
  const forgetRecent = (file: string) => changeSettings({ recent: removeRecent(settingsRef.current.recent, file) })
  const clearRecent = () => changeSettings({ recent: [] })

  /* ------------------------------------------------------------- files */

  const docName = doc.filePath ? fileNameOf(doc.filePath) : t('dialog.untitled')

  const titleText = `${docName}${doc.dirty ? ' *' : ''}`

  const statusText = useMemo(
    () => `${docName} · ${doc.dirty ? t('status.unsaved') : t('status.saved')}`,
    [doc.dirty, docName, t],
  )

  const showDoc = (next: DiagramDocument) => {
    resetHistory()
    setDoc(next)
    setEditingId(null)
    setZoom(1)
    setViewResetKey((k) => k + 1)
    setShowStart(false)
  }

  const closeStart = () => {
    setShowStart(false)
    // It may have been opened while the window had another size.
    setViewResetKey((k) => k + 1)
  }
  const toggleStart = () => (showStart ? closeStart() : setShowStart(true))

  // Unsaved work is asked about before anything replaces it.
  const docRef = useRef(doc)
  docRef.current = doc
  const guardUnsaved = (next: () => void) => {
    if (!docRef.current.dirty) {
      next()
      return
    }
    afterUnsaved.current = next
    setUnsavedOpen(true)
  }

  const newDoc = (mode?: DiagramMode) => guardUnsaved(() => showDoc(blankDoc(mode)))

  /** Reads a diagram from disk. A file that cannot be read is said so, and leaves the recent list. */
  const loadPath = async (path: string) => {
    let content: string
    try {
      content = await host.readText(path)
    } catch (error) {
      forgetRecent(path)
      setMessage(t('dialog.openFailed', { name: fileNameOf(path), reason: String(error) }))
      return
    }
    try {
      showDoc(deserialize(content, path))
      rememberRecent(path)
    } catch {
      setMessage(t('dialog.badFile', { name: fileNameOf(path) }))
    }
  }

  const openRecent = (path: string) => guardUnsaved(() => void loadPath(path))

  const openDialogFolder = async () => {
    const current = docRef.current.filePath ?? settingsRef.current.recent[0]
    if (current) return current.replace(/[/\\][^/\\]*$/, '')
    return host.samplesList().then((list) => list.dir || undefined).catch(() => undefined)
  }

  const openDoc = () =>
    guardUnsaved(() => {
      if (!isDesktop) {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.mmap,.mymind,application/json'
        input.onchange = async () => {
          const file = input.files?.[0]
          if (!file) return
          try {
            showDoc(deserialize(await file.text(), file.name))
          } catch {
            setMessage(t('dialog.badFile', { name: file.name }))
          }
        }
        input.click()
        return
      }
      void (async () => {
        const path = await host.openDiagramDialog(await openDialogFolder())
        if (path) await loadPath(path)
      })()
    })

  /** A sample opens as a new, unnamed diagram, so saving cannot overwrite the shipped file. */
  const openSample = (sample: SampleItem, dir: string) =>
    guardUnsaved(() => {
      void (async () => {
        try {
          const content = await host.readText(`${dir}/${sample.file}`)
          showDoc(deserialize(content, null))
        } catch (error) {
          setMessage(t('dialog.openFailed', { name: sample.file, reason: String(error) }))
        }
      })()
    })

  // Returns true if the document was written, false if the user cancelled.
  const writeDoc = async (askName: boolean): Promise<boolean> => {
    const current = docRef.current
    const content = serialize(current)
    if (!isDesktop) {
      const blob = new Blob([content], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'diagram.mmap'
      a.click()
      URL.revokeObjectURL(a.href)
      setDoc((d) => ({ ...d, dirty: false }))
      return true
    }
    let filePath = current.filePath
    if (askName || !filePath) {
      filePath = await host.saveDiagramDialog(filePath ?? 'diagram.mmap')
      if (!filePath) return false
    }
    try {
      await host.writeText(filePath, content)
    } catch (error) {
      setMessage(t('dialog.saveFailed', { name: fileNameOf(filePath), reason: String(error) }))
      return false
    }
    const saved = filePath
    setDoc((d) => ({ ...d, filePath: saved, dirty: false }))
    rememberRecent(saved)
    return true
  }
  const saveDoc = () => writeDoc(false)
  const saveDocAs = () => writeDoc(true)

  const unsavedSave = async () => {
    const saved = await writeDoc(false)
    if (!saved) return // the save was cancelled: nothing happens yet
    setUnsavedOpen(false)
    const next = afterUnsaved.current
    afterUnsaved.current = null
    next?.()
  }
  const unsavedDiscard = () => {
    setUnsavedOpen(false)
    const next = afterUnsaved.current
    afterUnsaved.current = null
    next?.()
  }
  const unsavedCancel = () => {
    afterUnsaved.current = null
    setUnsavedOpen(false)
  }

  const requestClose = () => guardUnsaved(() => void host.closeMain())

  // These stay current for what arrives from outside React.
  const latest = useRef({ openRecent, requestClose, newDoc, openDoc, saveDoc, saveDocAs })
  latest.current = { openRecent, requestClose, newDoc, openDoc, saveDoc, saveDocAs }

  // The window's close (Alt+F4, the taskbar) asks here first; a diagram can arrive from the system.
  useEffect(() => {
    const offClose = host.on('close-requested', () => latest.current.requestClose())
    const offOpen = host.on<string>('open-file', (file) => latest.current.openRecent(file))
    void host.closeGuardReady()
    return () => {
      offClose()
      offOpen()
    }
  }, [])

  // What the program was started with: a file from the system, else the last file if so set.
  useEffect(() => {
    void (async () => {
      const file = await host.startupFile().catch(() => null)
      const last = initialSettings.general.reopenLast ? initialSettings.recent[0] : undefined
      const first = file ?? last
      if (first) await loadPath(first)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Web fallback: the browser's native "leave site?" prompt on unsaved changes.
  useEffect(() => {
    if (isDesktop) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!doc.dirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [doc.dirty])

  // File and help shortcuts work wherever the keyboard is.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'F1') {
        event.preventDefault()
        setGuideOpen(true)
        return
      }
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 'n') {
        event.preventDefault()
        latest.current.newDoc()
      } else if (key === 'o') {
        event.preventDefault()
        latest.current.openDoc()
      } else if (key === 's') {
        event.preventDefault()
        void (event.shiftKey ? latest.current.saveDocAs() : latest.current.saveDoc())
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const openPreferences = (tab?: string) => setPrefsTab(tab ?? 'general')
  const openGuide = () => {
    if (!focusPopout('guide')) setGuideOpen(true)
  }
  const closeGuide = () => setGuideOpen(false)

  // Open the export dialog (format + transparent background choices).
  const exportImage = useCallback(() => setExportOpen(true), [])

  const runExport = useCallback(
    async (format: ExportFormat, transparent: boolean) => {
      const svg = document.querySelector('.canvas-svg') as SVGSVGElement | null
      if (!svg) return
      const out = await exportDiagram(svg, doc.nodes, { format, transparent })
      const base = doc.filePath ? doc.filePath.replace(/\.[^.]+$/, '').split(/[\\/]/).pop() : 'diagram'
      const name = `${base || 'diagram'}.${out.ext}`
      if (isDesktop) {
        const path = await host.saveImageDialog(name, out.ext, IMAGE_NAMES[out.ext] ?? 'Image')
        if (!path) return
        try {
          if (out.kind === 'svg') await host.writeText(path, out.text)
          else await host.writeBase64(path, out.dataUrl.split(',')[1])
        } catch (error) {
          setMessage(t('dialog.saveFailed', { name: fileNameOf(path), reason: String(error) }))
          return
        }
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
    [doc.nodes, doc.filePath, t],
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

  const showContext = (x: number, y: number, nodeId: string | null, canvasX = 0, canvasY = 0) => {
    setContextMenu({ x, y, canvasX, canvasY, nodeId, visible: true })
    // Keep the current multi-selection if the right-clicked node is part of it;
    // otherwise select just that node.
    if (nodeId && !doc.selectedIds.includes(nodeId)) selectNode(nodeId)
  }

  const hideContext = () => setContextMenu((c) => ({ ...c, visible: false }))

  const editText = (id: string, text: string) => setDoc((d) => updateNodeText(d, id, text))

  const askTextAtContext = () => setAddingText(true)
  const addTextAtContext = (text: string) => {
    setAddingText(false)
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
    setLanguage,
    setGeneral,
    setStart,
    setCustomThemeList,
    toggleGrid,
    showStart,
    toggleStart,
    closeStart,
    prefsTab,
    setPrefsTab,
    openPreferences,
    guideOpen,
    openGuide,
    closeGuide,
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
    unsavedOpen,
    unsavedSave,
    unsavedDiscard,
    unsavedCancel,
    docName,
    message,
    setMessage,
    requestClose,
    editingId,
    setEditingId,
    contextMenu,
    showContext,
    hideContext,
    statusText,
    titleText,
    newDoc,
    openDoc,
    openRecent,
    openSample,
    forgetRecent,
    clearRecent,
    saveDoc,
    saveDocAs,
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
    addingText,
    setAddingText,
    askTextAtContext,
    addTextAtContext,
    duplicateAtContext,
    copyAtContext,
    pasteAtContext,
    canPaste,
  }
}
