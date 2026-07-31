import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  AppSettings,
  ContextMenuState,
  DiagramDocument,
  LayoutDirection,
  LineType,
  Locale,
  ShapeType,
  ThemeMode,
} from '../types'
import {
  addChild,
  addSibling,
  createMindmapDoc,
  deleteNode,
  deserialize,
  moveNode,
  relayout,
  serialize,
  setEdgeLine,
  setLayout,
  setMode,
  setNodeColor,
  setNodeShape,
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
    nodeId: null,
    visible: false,
  })

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
      input.accept = '.mymind,application/json'
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
      a.download = 'diagram.mymind'
      a.click()
      URL.revokeObjectURL(a.href)
      setDoc((d) => ({ ...d, dirty: false }))
      return
    }
    let filePath = doc.filePath
    if (!filePath) {
      filePath = await window.mymind.saveDialog('diagram.mymind')
      if (!filePath) return
    }
    await window.mymind.writeFile(filePath, content)
    setDoc((d) => ({ ...d, filePath, dirty: false }))
  }, [doc])

  const selectNode = (id: string | null) => setDoc((d) => ({ ...d, selectedId: id }))

  const onMoveNode = (id: string, x: number, y: number) => {
    setDoc((d) => moveNode(d, id, x, y))
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
    if (!doc.selectedId) return
    setDoc((d) => deleteNode(d, d.selectedId!))
  }

  const onLayout = (layout: LayoutDirection) => setDoc((d) => setLayout(d, layout))

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
  const onLine = (line: LineType) => {
    if (!doc.selectedId) return
    setDoc((d) => setEdgeLine(d, d.selectedId!, line))
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

  const showContext = (x: number, y: number, nodeId: string | null) => {
    setContextMenu({ x, y, nodeId, visible: true })
    if (nodeId) selectNode(nodeId)
  }

  const hideContext = () => setContextMenu((c) => ({ ...c, visible: false }))

  const editText = (id: string, text: string) => setDoc((d) => updateNodeText(d, id, text))

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
    selectNode,
    onMoveNode,
    onAddChild,
    onAddSibling,
    onDelete,
    onLayout,
    onShape,
    onColor,
    onLine,
    switchMode,
    editText,
  }
}
