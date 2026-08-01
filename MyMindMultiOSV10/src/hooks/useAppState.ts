import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { exportPngDataUrl } from '../utils/exportImage'
import type {
  AppSettings,
  ContextMenuState,
  DiagramDocument,
  EndCap,
  LayoutDirection,
  LinePattern,
  LineType,
  Locale,
  ShapeType,
  TextStyle,
  ThemeMode,
} from '../types'
import {
  addFreeNode,
  addChild,
  addSibling,
  createMindmapDoc,
  deleteNodes,
  deserialize,
  moveNode,
  moveNodesBy,
  relayout,
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
  const [editingId, setEditingId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    x: 0,
    y: 0,
    canvasX: 0,
    canvasY: 0,
    nodeId: null,
    visible: false,
  })

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
    setDoc(relayout(createMindmapDoc(t('canvas.centralTopic'))))
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
        setDoc(deserialize(content, file.name))
      }
      input.click()
      return
    }
    const result = await window.mymind.openDialog()
    if (!result) return
    setDoc(deserialize(result.content, result.filePath))
  }, [])

  const saveDoc = useCallback(async () => {
    const content = serialize(doc)
    if (!window.mymind) {
      const blob = new Blob([content], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'diagram.mmap'
      a.click()
      URL.revokeObjectURL(a.href)
      setDoc((d) => ({ ...d, dirty: false }))
      return
    }
    let filePath = doc.filePath
    if (!filePath) {
      filePath = await window.mymind.saveDialog('diagram.mmap')
      if (!filePath) return
    }
    await window.mymind.writeFile(filePath, content)
    setDoc((d) => ({ ...d, filePath, dirty: false }))
  }, [doc])

  const exportImage = useCallback(async () => {
    const svg = document.querySelector('.canvas-svg') as SVGSVGElement | null
    if (!svg) return
    const dataUrl = await exportPngDataUrl(svg, doc.nodes, settings.theme)
    const base = doc.filePath ? doc.filePath.replace(/\.[^.]+$/, '').split(/[\\/]/).pop() : 'diagram'
    const name = `${base || 'diagram'}.png`
    if (window.mymind) {
      const path = await window.mymind.saveImageDialog(name)
      if (!path) return
      await window.mymind.writeBinaryFile(path, dataUrl.split(',')[1])
    } else {
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = name
      a.click()
    }
  }, [doc.nodes, doc.filePath, settings.theme])

  const selectNode = (id: string | null) =>
    setDoc((d) => ({ ...d, selectedId: id, selectedIds: id ? [id] : [] }))

  const selectNodes = (ids: string[]) =>
    setDoc((d) => ({ ...d, selectedId: ids[0] ?? null, selectedIds: ids }))

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
  const onLine = (line: LineType) => {
    if (!doc.selectedId) return
    setDoc((d) => setEdgeLine(d, d.selectedId!, line))
  }
  const onLinePattern = (pattern: LinePattern) => {
    if (!doc.selectedId) return
    setDoc((d) => setEdgePattern(d, d.selectedId!, pattern))
  }
  const onLineColor = (color: string) => {
    if (!doc.selectedId) return
    setDoc((d) => setEdgeColor(d, d.selectedId!, color))
  }
  const onLineStartCap = (cap: EndCap) => {
    if (!doc.selectedId) return
    setDoc((d) => setEdgeStartCap(d, d.selectedId!, cap))
  }
  const onLineEndCap = (cap: EndCap) => {
    if (!doc.selectedId) return
    setDoc((d) => setEdgeEndCap(d, d.selectedId!, cap))
  }
  const onTextStyle = (style: Partial<TextStyle>) => {
    if (!doc.selectedId) return
    setDoc((d) => setNodeTextStyle(d, d.selectedId!, style))
  }

  const switchMode = (mode: 'mindmap' | 'fishbone') => {
    if (doc.dirty && !window.confirm(t('dialog.confirmNew'))) return
    setDoc(
      setMode(doc, mode, {
        central: t('canvas.centralTopic'),
        effect: t('canvas.effect'),
        category: t('canvas.category'),
      }),
    )
  }

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
    aboutOpen,
    setAboutOpen,
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
    onTextStyle,
    switchMode,
    editText,
    addTextAtContext,
  }
}
