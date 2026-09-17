import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  Aperture,
  AppWindow,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Blend,
  BookOpen,
  Box,
  Camera,
  CircleDashed,
  CircleQuestionMark,
  Clock,
  Contrast,
  Copy,
  Crop,
  Download,
  Droplets,
  Eraser,
  Eye,
  EyeOff,
  FilePlus,
  FileX,
  FolderOpen,
  Frame,
  FlipHorizontal,
  FlipVertical,
  Grid3x3,
  Image as ImageIcon,
  ImagePlus,
  Info,
  Lasso,
  Layers,
  Layers2,
  LayoutGrid,
  Lock,
  LockOpen,
  Maximize2,
  Minus,
  PaintBucket,
  Palette,
  PenTool,
  Pencil,
  Plus,
  Ratio,
  Redo2,
  RotateCcw,
  RotateCw,
  Ruler,
  Save,
  SaveAll,
  ScanSearch,
  Scissors,
  Search,
  Settings2,
  SlidersHorizontal,
  Spline,
  Sparkles,
  Square,
  SquareDashed,
  Sun,
  Trash,
  Type,
  Ungroup,
  Undo2,
  WandSparkles,
  WavesHorizontal,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { blendLabel, t, toolLabel } from './i18n'
import { adjustmentTypes, filterCatalog, iconForTool, toolGroups } from './catalog'
import { cloneCanvas, compositeDocument, context2d, createBlankDocument, createCanvas, createLayerMeta, padCanvas, resizeCanvasContent, sampleComposite } from './lib/canvas'
import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from './lib/color'
import { addNoise, adjustBrightnessContrast, adjustHueSaturation, clearSelectionPixels, clouds, emboss, findEdges, gaussianBlur, grayscale, highPass, histogram, invertColors, mosaic, motionBlur, offset, oilPaint, sharpen, solarize, vignette } from './lib/filters'
import { applyAdjustmentCanvas, levelsStretch } from './lib/adjustments'
import { cloneDocument, pushHistory, takeSnapshot, type HistorySnapshot } from './lib/history'
import { decodeImageSource, downloadDataUrl, encodeExport, extensionFor, fileToOpenItem, restoreProject, serializeProject } from './lib/imageIO'
import { colSelection, drawSelectionOverlay, ellipseSelection, invertSelection, maskFromLasso, paintBucket, rectSelection, rowSelection, selectionToMask, wandSelection } from './lib/selection'
import { loadSettings, saveSettings } from './lib/settings'
import { colorReplace, dodgeBurn, healStamp, paintGradient, paintStroke, redEyeFix, smudge, spongeDesaturate } from './lib/tools'
import { contentAwareFill, findDistractions, generativeExpand, generativeUpscale, harmonize, selectSubject, skinSmooth } from './lib/ai'
import { cloneStamp } from './lib/tools'
import { createPath, drawPathOverlay, fillPathOnto, hitTestPaths, movePathPoint, pathFromPoints, pathNode, pathToSelection, smoothNode, smoothPath, strokePathOnto, translatePath, type PathHit } from './lib/paths'
import { addCurvePoint, applyCurves, applyLevels, autoLevels, curveLut, removeCurvePoint } from './lib/curves'
import { applyTransform, dragTransform, drawTransformOverlay, flipCanvas, hitTestTransform, identityTransform } from './lib/transform'
import { clipToFrame, contentMove, createFrame, createSlice, cropToRect, drawRegionOverlay, measureInfo, patchSelection, perspectiveCrop, perspectiveSize, rectAt, snapToEdge } from './lib/regions'
import { optionsForTool } from './toolOptions'
import { defaultAdjustment, defaultCurves, defaultLevels, blendModes, documentPresets, rightPanelMaxWidth, rightPanelMinWidth, shapeKindForTool, type AdjustmentType, type AppSettings, type BlendMode, type ErrorDetails, type ExportFormat, type CurveChannel, type CurveData, type Language, type LevelsData, type PathShape, type PhotoDocument, type Point, type Selection, type SliceRect, type Tool, type TransformBox, type TransformHandle, type UnsavedChoice } from './lib/types'
import { applyTheme, themeLabel, themes } from './themes'
import './App.css'

const minRight = rightPanelMinWidth
const maxRight = rightPanelMaxWidth
const presets = ['#1d4ed8', '#0f766e', '#b45309', '#be123c', '#7c3aed', '#111827', '#ffffff', '#94a3b8', '#22c55e', '#eab308', '#06b6d4', '#f97316', '#ec4899', '#84cc16', '#6366f1', '#64748b']

type Dialog =
  | null
  | 'new'
  | 'about'
  | 'settings'
  | 'unsaved'
  | 'error'
  | 'brightness'
  | 'hue'
  | 'blur'
  | 'sharpen'
  | 'imageSize'
  | 'canvasSize'
  | 'text'
  | 'export'
  | 'cameraRaw'
  | 'filterGallery'
  | 'feather'
  | 'curves'
  | 'levels'
  | 'helpGuide'

type MenuId = 'file' | 'edit' | 'image' | 'layer' | 'typeMenu' | 'selectMenu' | 'filter' | 'threeD' | 'view' | 'windowMenu' | 'help' | 'theme' | null

function ColorPopover({ color, x, y, onChange, onClose }: { color: string; x: number; y: number; onChange: (hex: string) => void; onClose: () => void }) {
  const rgb = hexToRgb(color)
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b)
  const hueRgb = hsvToRgb(hsv.h, 1, 1)
  const hueColor = rgbToHex(hueRgb.r, hueRgb.g, hueRgb.b)
  return createPortal(
    <div className="color-popover" style={{ left: Math.min(x, window.innerWidth - 240), top: Math.min(y, window.innerHeight - 280) }} onPointerDown={(event) => event.stopPropagation()}>
      <div
        className="sv-area"
        style={{ background: hueColor }}
        onPointerDown={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          const update = (clientX: number, clientY: number) => {
            const s = Math.min(1, Math.max(0, (clientX - box.left) / box.width))
            const v = 1 - Math.min(1, Math.max(0, (clientY - box.top) / box.height))
            const next = hsvToRgb(hsv.h, s, v)
            onChange(rgbToHex(next.r, next.g, next.b))
          }
          update(event.clientX, event.clientY)
          const move = (ev: PointerEvent) => update(ev.clientX, ev.clientY)
          const up = () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
          }
          window.addEventListener('pointermove', move)
          window.addEventListener('pointerup', up)
        }}
      >
        <div className="sv-white" />
        <div className="sv-black" />
        <div className="sv-thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
      </div>
      <div
        className="hue-slider"
        onPointerDown={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          const update = (clientX: number) => {
            const h = Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * 360
            const next = hsvToRgb(h, hsv.s, hsv.v)
            onChange(rgbToHex(next.r, next.g, next.b))
          }
          update(event.clientX)
          const move = (ev: PointerEvent) => update(ev.clientX)
          const up = () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
          }
          window.addEventListener('pointermove', move)
          window.addEventListener('pointerup', up)
        }}
      >
        <div className="hue-thumb" style={{ left: `${(hsv.h / 360) * 100}%` }} />
      </div>
      <input className="hex-input" value={color} onChange={(event) => onChange(event.target.value)} />
      <div className="preset-row">
        {presets.map((swatch) => (
          <button key={swatch} className="preset-swatch" style={{ background: swatch }} onClick={() => onChange(swatch)} />
        ))}
      </div>
      <button onClick={onClose}>Close</button>
    </div>,
    document.body,
  )
}

const menuIcons = {
  file: FolderOpen,
  edit: Pencil,
  image: ImageIcon,
  layer: Layers,
  typeMenu: Type,
  selectMenu: Lasso,
  filter: WandSparkles,
  threeD: Box,
  view: Eye,
  windowMenu: AppWindow,
  help: CircleQuestionMark,
} as const

const panelTabIcons = {
  layers: Layers,
  adjust: SlidersHorizontal,
  history: Clock,
  channels: LayoutGrid,
  info: Info,
} as const

const adjustmentIcons: Record<AdjustmentType, ComponentType<{ size?: number }>> = {
  brightness: Sun,
  levels: SlidersHorizontal,
  curves: WavesHorizontal,
  hue: Palette,
  colorBalance: Blend,
  vibrance: Aperture,
  bw: Contrast,
  invert: CircleDashed,
  posterize: LayoutGrid,
  threshold: SquareDashed,
  exposure: Sun,
  photoFilter: Camera,
  clarity: ScanSearch,
  dehaze: Droplets,
  grain: Grid3x3,
  colorLookup: Palette,
  shadowsHighlights: Contrast,
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  active,
}: {
  icon: ComponentType<{ size?: number }>
  label: string
  onClick: () => void
  active?: boolean
}) {
  return (
    <button className={active ? 'active' : ''} data-tooltip={label} onClick={onClick}>
      <Icon size={16} />
      <span>{label}</span>
    </button>
  )
}

function MenuDrop({
  anchor,
  align = 'start',
  className,
  children,
}: {
  anchor: HTMLElement | null
  align?: 'start' | 'end'
  className?: string
  children: React.ReactNode
}) {
  const [box, setBox] = useState<DOMRect | null>(() => anchor?.getBoundingClientRect() ?? null)

  useLayoutEffect(() => {
    if (!anchor) {
      setBox(null)
      return
    }
    const update = () => setBox(anchor.getBoundingClientRect())
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [anchor])

  if (!box) return null

  const minWidth = className?.includes('theme-menu') ? 420 : 220
  const preferred = align === 'end' ? box.right - minWidth : box.left
  const left = Math.max(8, Math.min(preferred, window.innerWidth - minWidth - 8))

  return createPortal(
    <div
      className={className ? `menu-drop ${className}` : 'menu-drop'}
      style={{ top: box.bottom + 6, left }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  )
}

function FlagKo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="1.5" fill="#fff" />
      <g fill="none" stroke="#111" strokeWidth="0.9" strokeLinecap="butt">
        <g transform="translate(5.8 8.6) rotate(-56)"><path d="M-1.6-1h3.2M-1.6 0h3.2M-1.6 1h3.2" /></g>
        <g transform="translate(18.2 8.6) rotate(56)"><path d="M-1.6-1h3.2M-1.6 0h3.2M-1.6 1h3.2" /></g>
        <g transform="translate(5.8 15.4) rotate(56)"><path d="M-1.6-1h3.2M-1.6 0h3.2M-1.6 1h3.2" /></g>
        <g transform="translate(18.2 15.4) rotate(-56)"><path d="M-1.6-1h3.2M-1.6 0h3.2M-1.6 1h3.2" /></g>
      </g>
      <g transform="rotate(-34 12 12)">
        <circle cx="12" cy="12" r="3.8" fill="#0047a0" />
        <path d="M8.2 12a3.8 3.8 0 0 1 7.6 0a1.9 1.9 0 0 1-3.8 0a1.9 1.9 0 0 0-3.8 0z" fill="#cd2e3a" />
      </g>
      <rect x="2" y="5" width="20" height="14" rx="1.5" fill="none" stroke="currentColor" strokeOpacity="0.35" />
    </svg>
  )
}

function FlagEn({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <clipPath id="mpw-flag-en-clip"><rect x="2" y="5" width="20" height="14" rx="1.5" /></clipPath>
      <g clipPath="url(#mpw-flag-en-clip)">
        <rect x="2" y="5" width="20" height="14" fill="#012169" />
        <path d="M2 5l20 14M22 5L2 19" stroke="#fff" strokeWidth="3.4" />
        <path d="M2 5l20 14M22 5L2 19" stroke="#c8102e" strokeWidth="1.2" />
        <path d="M12 5v14M2 12h20" stroke="#fff" strokeWidth="4.6" />
        <path d="M12 5v14M2 12h20" stroke="#c8102e" strokeWidth="2.6" />
      </g>
      <rect x="2" y="5" width="20" height="14" rx="1.5" fill="none" stroke="currentColor" strokeOpacity="0.35" />
    </svg>
  )
}

type HoverTip = { text: string; x: number; y: number; place: 'bottom' | 'right' }

function readTooltip(target: EventTarget | null) {
  const node = (target as HTMLElement | null)?.closest?.('button, select, [data-tooltip]') as HTMLElement | null
  if (!node || node.closest('.app-tooltip')) return null
  const labelled = node.getAttribute('data-tooltip')?.trim()
  if (labelled) return { node, text: labelled }
  if (node.tagName === 'SELECT' || node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') return null
  const text = node.innerText.replace(/\s+/g, ' ').trim()
  return text ? { node, text } : null
}


/** The 256x256 curve grid. Click to add a point, drag to move, double-click to remove. */
function CurveEditor({ points, onChange, accent }: { points: { x: number; y: number }[]; onChange: (next: { x: number; y: number }[]) => void; accent: string }) {
  const size = 236
  const toView = (p: { x: number; y: number }) => ({ x: (p.x / 255) * size, y: size - (p.y / 255) * size })
  const toData = (x: number, y: number) => ({ x: (x / size) * 255, y: ((size - y) / size) * 255 })
  const dragIndex = useRef(-1)

  const nearest = (x: number, y: number) => {
    let best = -1
    let bestDistance = 12
    points.forEach((point, index) => {
      const at = toView(point)
      const distance = Math.hypot(at.x - x, at.y - y)
      if (distance < bestDistance) {
        bestDistance = distance
        best = index
      }
    })
    return best
  }

  const localPoint = (event: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - box.left, y: event.clientY - box.top }
  }

  const path = useMemo(() => {
    const lut = curveLut(points)
    let d = ''
    for (let i = 0; i < 256; i += 1) {
      const x = (i / 255) * size
      const y = size - (lut[i] / 255) * size
      d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)} `
    }
    return d
  }, [points])

  return (
    <svg
      className="curve-editor"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      onPointerDown={(event) => {
        const at = localPoint(event)
        const index = nearest(at.x, at.y)
        if (index >= 0) {
          dragIndex.current = index
          return
        }
        const added = addCurvePoint(points, toData(at.x, at.y))
        onChange(added)
        dragIndex.current = added.findIndex((p) => Math.abs(p.x - toData(at.x, at.y).x) < 5)
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (dragIndex.current < 0) return
        const at = localPoint(event)
        const data = toData(at.x, at.y)
        const index = dragIndex.current
        const next = points.map((point, i) => {
          if (i !== index) return point
          // The two endpoints stay pinned to their input value.
          const locked = i === 0 || i === points.length - 1
          return { x: locked ? point.x : Math.max(0, Math.min(255, Math.round(data.x))), y: Math.max(0, Math.min(255, Math.round(data.y))) }
        })
        onChange([...next].sort((a, b) => a.x - b.x))
      }}
      onPointerUp={() => { dragIndex.current = -1 }}
      onDoubleClick={(event) => {
        const at = localPoint(event)
        const index = nearest(at.x, at.y)
        if (index >= 0) onChange(removeCurvePoint(points, index))
      }}
    >
      <rect x={0} y={0} width={size} height={size} className="curve-bg" />
      {[1, 2, 3].map((n) => (
        <g key={n}>
          <line x1={(size / 4) * n} y1={0} x2={(size / 4) * n} y2={size} className="curve-grid" />
          <line x1={0} y1={(size / 4) * n} x2={size} y2={(size / 4) * n} className="curve-grid" />
        </g>
      ))}
      <line x1={0} y1={size} x2={size} y2={0} className="curve-diagonal" />
      <path d={path} className="curve-line" style={{ stroke: accent }} />
      {points.map((point, index) => {
        const at = toView(point)
        return <circle key={index} cx={at.x} cy={at.y} r={4} className="curve-point" />
      })}
    </svg>
  )
}

export default function App() {
  const startup = useMemo(() => createBlankDocument('Untitled', 1280, 720, 'transparent', 'Layer'), [])
  const [settings, setSettings] = useState<AppSettings>(loadSettings)
  const [doc, setDoc] = useState<PhotoDocument>(startup.document)
  const canvasesRef = useRef(startup.canvases)
  const [frame, setFrame] = useState(0)
  const [tool, setTool] = useState<Tool>('move')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [dirty, setDirty] = useState(false)
  const [menu, setMenu] = useState<MenuId>(null)
  const menuAnchorRefs = useRef<Partial<Record<Exclude<MenuId, null>, HTMLButtonElement | null>>>({})
  const [status, setStatus] = useState('ready')
  const [savedNote, setSavedNote] = useState(false)
  const [pan, setPan] = useState({ x: 72, y: 56 })
  const [dialog, setDialog] = useState<Dialog>(null)
  const [pendingAction, setPendingAction] = useState<null | 'new' | 'open' | 'close' | 'quit'>(null)
  const [error, setError] = useState<ErrorDetails | null>(null)
  const [crop, setCrop] = useState<Selection | null>(null)
  const [textValue, setTextValue] = useState('Photo')
  const [fontFamily, setFontFamily] = useState('Segoe UI')
  const [fontSize, setFontSize] = useState(48)
  const [textPoint, setTextPoint] = useState<Point>({ x: 40, y: 40 })
  const [adjust, setAdjust] = useState({ brightness: 0, contrast: 0, hue: 0, saturation: 0, lightness: 0, radius: 4, amount: 60, width: 1280, height: 720 })
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [colorPick, setColorPick] = useState<{ target: 'fg' | 'bg'; x: number; y: number } | null>(null)
  const [dash, setDash] = useState(0)
  const [groupTool, setGroupTool] = useState<Record<string, Tool>>(() => Object.fromEntries(toolGroups.map((group) => [group.id, group.tools[0].id])))
  const [cloneSource, setCloneSource] = useState<Point | null>(null)
  // Free transform holds the untouched layer pixels so repeated drags never
  // resample a resampled image.
  const [transformBox, setTransformBox] = useState<TransformBox | null>(null)
  const transformSourceRef = useRef<HTMLCanvasElement | null>(null)
  const [activePathId, setActivePathId] = useState<string | null>(null)
  // The pen tools build a path click by click before it joins doc.paths.
  const [draftPath, setDraftPath] = useState<PathShape | null>(null)
  const [polyPoints, setPolyPoints] = useState<Point[]>([])
  const [cropCorners, setCropCorners] = useState<Point[]>([])
  const [shapeDraft, setShapeDraft] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [activeSliceId, setActiveSliceId] = useState<string | null>(null)
  const [curveDraft, setCurveDraft] = useState<CurveData>(defaultCurves)
  const [curveChannel, setCurveChannel] = useState<CurveChannel>('rgb')
  const [levelDraft, setLevelDraft] = useState<LevelsData>(defaultLevels)
  const [viewAngle, setViewAngle] = useState(0)
  const [quickMask, setQuickMask] = useState(false)
  const [tooltip, setTooltip] = useState<HoverTip | null>(null)
  const tooltipTimer = useRef(0)
  const viewRef = useRef<HTMLCanvasElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const placeRef = useRef<HTMLInputElement | null>(null)
  const dragRef = useRef<{
    mode:
      | 'paint' | 'erase' | 'select' | 'lasso' | 'crop' | 'pan' | 'move' | 'gradient' | 'none'
      | 'magnetic' | 'shape' | 'path' | 'freeformPen' | 'transform' | 'slice' | 'frame'
      | 'ruler' | 'patch' | 'contentMove' | 'rotateView' | 'pathMove'
    handle?: TransformHandle
    hit?: PathHit | null
    shift?: boolean
    alt?: boolean
    start: Point
    last: Point
    points: Point[]
    layerX: number
    layerY: number
  } | null>(null)
  const undoRef = useRef<HistorySnapshot[]>([])
  const redoRef = useRef<HistorySnapshot[]>([])
  const docRef = useRef(doc)
  const toolRef = useRef(tool)
  const selectionRef = useRef(selection)
  const settingsRef = useRef(settings)
  const spaceRef = useRef(false)
  const draftPathRef = useRef<PathShape | null>(null)
  const polyPointsRef = useRef<Point[]>([])
  const transformRef = useRef<TransformBox | null>(null)
  const cloneSourceRef = useRef<Point | null>(null)
  const cropCornersRef = useRef<Point[]>([])

  const language = settings.language
  const tr = useCallback((key: string) => t(language, key), [language])

  const hideTooltip = useCallback(() => {
    window.clearTimeout(tooltipTimer.current)
    setTooltip(null)
  }, [])

  const showTooltip = useCallback((event: ReactPointerEvent) => {
    const found = readTooltip(event.target)
    if (!found) return
    window.clearTimeout(tooltipTimer.current)
    const box = found.node.getBoundingClientRect()
    const inStrip = Boolean(found.node.closest('.tool-strip'))
    tooltipTimer.current = window.setTimeout(() => {
      setTooltip({
        text: found.text,
        x: inStrip ? box.right + 8 : Math.min(window.innerWidth - 12, Math.max(12, box.left + box.width / 2)),
        y: inStrip ? box.top + box.height / 2 : box.bottom + 8,
        place: inStrip ? 'right' : 'bottom',
      })
    }, 220)
  }, [])

  useEffect(() => () => window.clearTimeout(tooltipTimer.current), [])

  useEffect(() => {
    docRef.current = doc
    toolRef.current = tool
    selectionRef.current = selection
    settingsRef.current = settings
    draftPathRef.current = draftPath
    polyPointsRef.current = polyPoints
    transformRef.current = transformBox
    cloneSourceRef.current = cloneSource
    cropCornersRef.current = cropCorners
  }, [cloneSource, cropCorners, doc, draftPath, polyPoints, selection, settings, shapeDraft, tool, transformBox])

  useEffect(() => {
    applyTheme(settings.theme)
    saveSettings(settings)
  }, [settings])

  useEffect(() => {
    const timer = window.setInterval(() => setDash((value) => (value + 1) % 20), 80)
    return () => window.clearInterval(timer)
  }, [])

  const bump = useCallback(() => setFrame((value) => value + 1), [])

  const activeLayer = doc.layers.find((layer) => layer.id === doc.activeLayerId) ?? null

  const markDirty = useCallback(() => {
    setDirty(true)
    setSavedNote(false)
    bump()
  }, [bump])

  const snapshot = useCallback(() => {
    if (!docRef.current) {
      return
    }
    pushHistory(undoRef.current, takeSnapshot(docRef.current, canvasesRef.current))
    redoRef.current = []
  }, [])

  const replaceDocument = useCallback((next: PhotoDocument, canvases: Map<string, HTMLCanvasElement>, resetHistory = true) => {
    canvasesRef.current = canvases
    setDoc(next)
    setSelection(null)
    setCrop(null)
    setDirty(false)
    if (resetHistory) {
      undoRef.current = []
      redoRef.current = []
    }
    bump()
  }, [bump])

  const updateDoc = useCallback((updater: (current: PhotoDocument) => PhotoDocument) => {
    setDoc((current) => (current ? updater(current) : current))
    markDirty()
  }, [markDirty])

  const fitZoom = useCallback((document: PhotoDocument) => {
    const stage = stageRef.current
    if (!stage) {
      return
    }
    const zoom = Math.min(4, Math.max(0.05, Math.min((stage.clientWidth - 80) / document.width, (stage.clientHeight - 80) / document.height)))
    setSettings((current) => ({ ...current, zoom }))
    setPan({ x: Math.max(24, (stage.clientWidth - document.width * zoom) / 2), y: Math.max(24, (stage.clientHeight - document.height * zoom) / 2) })
  }, [])

  const createDocument = useCallback((name: string, width: number, height: number, background: PhotoDocument['background']) => {
    const created = createBlankDocument(name, width, height, background, background === 'transparent' ? tr('layerName') : tr('backgroundLayer'))
    replaceDocument(created.document, created.canvases)
    requestAnimationFrame(() => fitZoom(created.document))
    setStatus('ready')
  }, [fitZoom, replaceDocument, tr])

  const screenToDoc = useCallback((clientX: number, clientY: number): Point => {
    const stage = stageRef.current
    if (!stage) {
      return { x: 0, y: 0 }
    }
    const box = stage.getBoundingClientRect()
    const zoom = settingsRef.current.zoom
    return { x: (clientX - box.left - pan.x) / zoom, y: (clientY - box.top - pan.y) / zoom }
  }, [pan.x, pan.y])

  useEffect(() => {
    const canvas = viewRef.current
    const documentModel = doc
    if (!canvas || !documentModel) {
      return
    }
    const stage = stageRef.current
    const width = stage?.clientWidth ?? canvas.clientWidth
    const height = stage?.clientHeight ?? canvas.clientHeight
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.floor(width * ratio))
    canvas.height = Math.max(1, Math.floor(height * ratio))
    const ctx = context2d(canvas)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--stage-bg') || '#10151a'
    ctx.fillRect(0, 0, width, height)

    const zoom = settings.zoom
    const left = pan.x
    const top = pan.y
    const dw = documentModel.width * zoom
    const dh = documentModel.height * zoom
    const check = 8
    for (let y = 0; y < dh; y += check) {
      for (let x = 0; x < dw; x += check) {
        ctx.fillStyle = ((Math.floor(x / check) + Math.floor(y / check)) % 2 === 0)
          ? getComputedStyle(document.documentElement).getPropertyValue('--stage-check-a') || '#1b232c'
          : getComputedStyle(document.documentElement).getPropertyValue('--stage-check-b') || '#151b22'
        ctx.fillRect(left + x, top + y, Math.min(check, dw - x), Math.min(check, dh - y))
      }
    }

    // While a transform is live, preview it by swapping the layer's pixels for the
    // warped original without touching the stored canvas.
    let previewCanvases = canvasesRef.current
    if (transformBox && transformSourceRef.current) {
      previewCanvases = new Map(canvasesRef.current)
      previewCanvases.set(documentModel.activeLayerId, applyTransform(transformSourceRef.current, transformBox, documentModel.width, documentModel.height))
    }
    const composite = compositeDocument(documentModel, previewCanvases)
    ctx.save()
    ctx.translate(left + dw / 2, top + dh / 2)
    ctx.rotate((viewAngle * Math.PI) / 180)
    ctx.translate(-dw / 2, -dh / 2)
    ctx.imageSmoothingEnabled = zoom < 1
    ctx.drawImage(composite, 0, 0, dw, dh)
    ctx.save()
    ctx.scale(zoom, zoom)
    drawSelectionOverlay(ctx, crop ?? selection, documentModel.width, documentModel.height, dash)
    drawRegionOverlay(ctx, documentModel.slices, documentModel.frames, documentModel.measure, zoom)
    if (settings.showPaths) {
      const livePaths = draftPath ? [...documentModel.paths, draftPath] : documentModel.paths
      drawPathOverlay(ctx, livePaths, draftPath?.id ?? activePathId, zoom)
    }
    if (polyPoints.length > 0) {
      // The in-progress polygonal / magnetic lasso, before it closes.
      ctx.save()
      ctx.setLineDash([4 / zoom, 3 / zoom])
      ctx.lineWidth = 1 / zoom
      ctx.strokeStyle = '#38bdf8'
      ctx.beginPath()
      ctx.moveTo(polyPoints[0].x, polyPoints[0].y)
      for (const item of polyPoints.slice(1)) ctx.lineTo(item.x, item.y)
      ctx.stroke()
      ctx.restore()
    }
    if (cropCorners.length > 0) {
      ctx.save()
      ctx.setLineDash([])
      ctx.lineWidth = 1 / zoom
      ctx.strokeStyle = '#f472b6'
      ctx.beginPath()
      ctx.moveTo(cropCorners[0].x, cropCorners[0].y)
      for (const corner of cropCorners.slice(1)) ctx.lineTo(corner.x, corner.y)
      if (cropCorners.length === 4) ctx.closePath()
      ctx.stroke()
      for (const corner of cropCorners) {
        ctx.beginPath()
        ctx.arc(corner.x, corner.y, 4 / zoom, 0, Math.PI * 2)
        ctx.fillStyle = '#f472b6'
        ctx.fill()
      }
      ctx.restore()
    }
    if (shapeDraft) {
      ctx.save()
      ctx.setLineDash([4 / zoom, 3 / zoom])
      ctx.lineWidth = 1 / zoom
      ctx.strokeStyle = '#38bdf8'
      ctx.strokeRect(shapeDraft.x, shapeDraft.y, shapeDraft.width, shapeDraft.height)
      ctx.restore()
    }
    if (transformBox) {
      drawTransformOverlay(ctx, transformBox, zoom)
    }
    if (dragRef.current?.mode === 'gradient') {
      ctx.strokeStyle = '#ffffff'
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(dragRef.current.start.x, dragRef.current.start.y)
      ctx.lineTo(dragRef.current.last.x, dragRef.current.last.y)
      ctx.stroke()
    }
    ctx.restore()
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.strokeRect(0.5, 0.5, dw - 1, dh - 1)
    ctx.restore()
  }, [activePathId, crop, cropCorners, dash, doc, draftPath, frame, pan.x, pan.y, polyPoints, selection, settings.showPaths, settings.theme, settings.zoom, shapeDraft, transformBox, viewAngle])

  useEffect(() => {
    const canvas = document.getElementById('histogram-canvas') as HTMLCanvasElement | null
    const layerCanvas = canvasesRef.current.get(doc.activeLayerId)
    if (!canvas || !layerCanvas) {
      return
    }
    const hist = histogram(layerCanvas)
    const ctx = context2d(canvas)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const max = Math.max(1, ...hist.r, ...hist.g, ...hist.b)
    const draw = (values: Uint32Array, color: string) => {
      ctx.beginPath()
      ctx.strokeStyle = color
      for (let i = 0; i < 256; i += 1) {
        const x = (i / 255) * canvas.width
        const y = canvas.height - (values[i] / max) * canvas.height
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    draw(hist.r, '#f87171')
    draw(hist.g, '#4ade80')
    draw(hist.b, '#60a5fa')
  }, [doc.activeLayerId, frame])

  const showError = useCallback((title: string, message: string, details: unknown) => {
    setError({ title, message, details: details instanceof Error ? `${details.message}\n${details.stack ?? ''}` : String(details) })
    setDialog('error')
  }, [])

  const guardUnsaved = useCallback((action: 'new' | 'open' | 'close' | 'quit') => {
    if (dirty) {
      setPendingAction(action)
      setDialog('unsaved')
      return false
    }
    return true
  }, [dirty])

  const openFiles = useCallback(async (files: { name: string; mime?: string; text?: string; dataUrl?: string; path?: string }[], mode: 'open' | 'place') => {
    try {
      for (const file of files) {
        const decoded = await decodeImageSource(file)
        if (decoded.kind === 'project') {
          const restored = await restoreProject(decoded.project)
          if (file.path) {
            restored.document.filePath = file.path
          }
          restored.document.name = file.name.replace(/\.mpw$/i, '')
          replaceDocument(restored.document, restored.canvases)
          requestAnimationFrame(() => fitZoom(restored.document))
          continue
        }
        if (mode === 'place' && docRef.current) {
          snapshot()
          const layer = createLayerMeta(file.name)
          const canvas = createCanvas(docRef.current.width, docRef.current.height)
          context2d(canvas).drawImage(decoded.canvas, 0, 0)
          canvasesRef.current.set(layer.id, canvas)
          updateDoc((current) => ({ ...current, layers: [...current.layers, layer], activeLayerId: layer.id }))
        } else {
          const layer = createLayerMeta(file.name)
          const canvas = cloneCanvas(decoded.canvas)
          const next: PhotoDocument = {
            name: file.name.replace(/\.[^.]+$/, ''),
            width: canvas.width,
            height: canvas.height,
            background: 'transparent',
            layers: [layer],
            activeLayerId: layer.id,
            filePath: file.path,
            guides: [],
            notes: [],
            samplers: [],
            counts: [],
            paths: [],
            slices: [],
            frames: [],
            measure: null,
            colorMode: 'rgb',
          }
          replaceDocument(next, new Map([[layer.id, canvas]]))
          requestAnimationFrame(() => fitZoom(next))
        }
      }
      setStatus('ready')
    } catch (cause) {
      showError(tr('errorTitle'), tr('open'), cause)
    }
  }, [fitZoom, replaceDocument, showError, snapshot, tr, updateDoc])

  const pickFiles = useCallback(async (mode: 'open' | 'place') => {
    if (window.electronFileApi) {
      const result = await window.electronFileApi.openFiles()
      if (!result.canceled) {
        await openFiles(result.files, mode)
      }
      return
    }
    if (mode === 'place') {
      placeRef.current?.click()
    } else {
      fileRef.current?.click()
    }
  }, [openFiles])

  const saveProject = useCallback(async (saveAs = false) => {
    if (!doc) {
      return false
    }
    try {
      const project = JSON.stringify(serializeProject(doc, canvasesRef.current), null, 2)
      const fileName = `${doc.name || tr('untitled')}.mpw`
      if (window.electronFileApi) {
        if (!saveAs && doc.filePath) {
          await window.electronFileApi.writeFile({ filePath: doc.filePath, text: project })
        } else {
          const result = await window.electronFileApi.saveFile({
            fileName,
            filters: [{ name: 'Photo Work Project', extensions: ['mpw'] }],
            text: project,
          })
          if (result.canceled || !result.filePath) {
            return false
          }
          const savedPath = result.filePath
          setDoc((current) => current ? { ...current, filePath: savedPath, name: savedPath.split(/[/\\]/).pop()?.replace(/\.mpw$/i, '') ?? current.name } : current)
        }
      } else {
        downloadDataUrl(`data:application/json;charset=utf-8,${encodeURIComponent(project)}`, fileName)
      }
      setDirty(false)
      setSavedNote(true)
      window.setTimeout(() => setSavedNote(false), 1600)
      return true
    } catch (cause) {
      showError(tr('errorTitle'), tr('save'), cause)
      return false
    }
  }, [doc, showError, tr])

  const exportImage = useCallback(async (format: ExportFormat) => {
    if (!doc) {
      return
    }
    try {
      const composite = compositeDocument(doc, canvasesRef.current)
      const dataUrl = await encodeExport(composite, format)
      const fileName = `${doc.name || tr('untitled')}.${extensionFor(format)}`
      if (window.electronFileApi) {
        const result = await window.electronFileApi.saveFile({
          fileName,
          filters: [{ name: format.toUpperCase(), extensions: [extensionFor(format)] }],
          dataUrl,
        })
        if (result.canceled) {
          return
        }
      } else {
        downloadDataUrl(dataUrl, fileName)
      }
      setStatus('saved')
    } catch (cause) {
      showError(tr('errorTitle'), tr('export'), cause)
    }
  }, [doc, showError, tr])


  const exportSlice = useCallback(async (slice: SliceRect) => {
    const current = docRef.current
    if (!current) return
    try {
      const flat = compositeDocument(current, canvasesRef.current)
      const dataUrl = await encodeExport(cropToRect(flat, slice), settingsRef.current.exportFormat)
      downloadDataUrl(dataUrl, `${current.name}-${slice.name}.${extensionFor(settingsRef.current.exportFormat)}`)
      setSavedNote(true)
    } catch (error) {
      showError(tr('exportSlice'), tr('exportFailed'), error)
    }
  }, [showError, tr])

  const undo = useCallback(() => {
    const previous = undoRef.current.pop()
    if (!previous || !docRef.current) {
      return
    }
    pushHistory(redoRef.current, takeSnapshot(docRef.current, canvasesRef.current))
    canvasesRef.current = previous.canvases
    setDoc(previous.document)
    markDirty()
  }, [markDirty])

  const redo = useCallback(() => {
    const next = redoRef.current.pop()
    if (!next || !docRef.current) {
      return
    }
    pushHistory(undoRef.current, takeSnapshot(docRef.current, canvasesRef.current))
    canvasesRef.current = next.canvases
    setDoc(next.document)
    markDirty()
  }, [markDirty])

  const withLayer = useCallback((fn: (canvas: HTMLCanvasElement, layer: NonNullable<typeof activeLayer>) => void, record = true) => {
    const current = docRef.current
    const layer = current?.layers.find((item) => item.id === current.activeLayerId)
    const canvas = current ? canvasesRef.current.get(current.activeLayerId) : null
    if (!current || !layer || !canvas) {
      setStatus('noLayer')
      return false
    }
    if (layer.locked) {
      setStatus('lockedLayer')
      return false
    }
    if (record) {
      snapshot()
    }
    fn(canvas, layer)
    markDirty()
    return true
  }, [markDirty, snapshot])

  const applyCrop = useCallback((box: Selection) => {
    const current = docRef.current
    if (!current || box.width < 2 || box.height < 2) {
      return
    }
    snapshot()
    const x = Math.max(0, Math.floor(box.x))
    const y = Math.max(0, Math.floor(box.y))
    const width = Math.min(current.width - x, Math.round(box.width))
    const height = Math.min(current.height - y, Math.round(box.height))
    const nextCanvases = new Map<string, HTMLCanvasElement>()
    for (const layer of current.layers) {
      const source = canvasesRef.current.get(layer.id)
      const canvas = createCanvas(width, height)
      if (source) {
        context2d(canvas).drawImage(source, x, y, width, height, 0, 0, width, height)
      }
      nextCanvases.set(layer.id, canvas)
    }
    canvasesRef.current = nextCanvases
    setDoc({ ...cloneDocument(current), width, height })
    setCrop(null)
    setSelection(null)
    markDirty()
  }, [markDirty, snapshot])


  /* ---------------------------------------------------------------- paths */

  const updatePaths = useCallback((fn: (paths: PathShape[]) => PathShape[]) => {
    updateDoc((current) => ({ ...current, paths: fn(current.paths) }))
  }, [updateDoc])

  /** Moves the pen's in-progress path into the document. */
  const commitDraftPath = useCallback((closed: boolean) => {
    const draft = draftPathRef.current
    setDraftPath(null)
    if (!draft || draft.nodes.length < 2) {
      return
    }
    const path = { ...draft, closed }
    updatePaths((paths) => [...paths, path])
    setActivePathId(path.id)
  }, [updatePaths])

  const activePath = doc.paths.find((path) => path.id === activePathId) ?? doc.paths[doc.paths.length - 1] ?? null

  /* ------------------------------------------------------------ transform */

  const beginTransform = useCallback(() => {
    const current = docRef.current
    const canvas = current ? canvasesRef.current.get(current.activeLayerId) : null
    if (!current || !canvas) {
      setStatus('noLayer')
      return
    }
    transformSourceRef.current = cloneCanvas(canvas)
    setTransformBox(identityTransform(current.width, current.height))
    setStatus('transforming')
  }, [])

  const commitTransform = useCallback(() => {
    const box = transformRef.current
    const source = transformSourceRef.current
    const current = docRef.current
    if (!box || !source || !current) {
      setTransformBox(null)
      transformSourceRef.current = null
      return
    }
    snapshot()
    canvasesRef.current.set(current.activeLayerId, applyTransform(source, box, current.width, current.height))
    transformSourceRef.current = null
    setTransformBox(null)
    setStatus('ready')
    markDirty()
  }, [markDirty, snapshot])

  const cancelTransform = useCallback(() => {
    const source = transformSourceRef.current
    const current = docRef.current
    if (source && current) {
      canvasesRef.current.set(current.activeLayerId, source)
    }
    transformSourceRef.current = null
    setTransformBox(null)
    setStatus('ready')
    bump()
  }, [bump])

  const flipLayer = useCallback((axis: 'x' | 'y') => {
    withLayer((canvas, layer) => {
      canvasesRef.current.set(layer.id, flipCanvas(canvas, axis))
    })
  }, [withLayer])

  const flipDocument = useCallback((axis: 'x' | 'y') => {
    const current = docRef.current
    if (!current) return
    snapshot()
    for (const layer of current.layers) {
      const source = canvasesRef.current.get(layer.id)
      if (source) canvasesRef.current.set(layer.id, flipCanvas(source, axis))
    }
    markDirty()
  }, [markDirty, snapshot])


  /* --------------------------------------------------------- layer groups */

  const groupActiveLayer = useCallback(() => {
    const current = docRef.current
    if (!current) return
    snapshot()
    const folder = createLayerMeta(tr('layerGroup'), 'group')
    updateDoc((value) => {
      const index = value.layers.findIndex((layer) => layer.id === value.activeLayerId)
      if (index < 0) return value
      const layers = value.layers.map((layer, i) => (i === index ? { ...layer, parentId: folder.id } : layer))
      // The folder is inserted directly beneath its child so panel order matches.
      layers.splice(index, 0, folder)
      return { ...value, layers }
    })
  }, [snapshot, tr, updateDoc])

  const ungroupActiveLayer = useCallback(() => {
    const current = docRef.current
    const layer = current?.layers.find((item) => item.id === current.activeLayerId)
    if (!current || !layer) return
    snapshot()
    const folderId = layer.kind === 'group' ? layer.id : layer.parentId
    if (!folderId) return
    updateDoc((value) => ({
      ...value,
      layers: value.layers
        .filter((item) => item.id !== folderId)
        .map((item) => (item.parentId === folderId ? { ...item, parentId: undefined } : item)),
    }))
  }, [snapshot, updateDoc])

  /* ------------------------------------------------------ curves & levels */

  const openCurves = useCallback(() => {
    setCurveDraft(defaultCurves())
    setCurveChannel('rgb')
    setDialog('curves')
  }, [])

  const openLevels = useCallback(() => {
    const canvas = canvasesRef.current.get(docRef.current?.activeLayerId ?? '')
    setLevelDraft(canvas ? { ...autoLevels(canvas), gamma: 1 } : defaultLevels())
    setDialog('levels')
  }, [])

  /* --------------------------------------------------------------- shapes */

  const addShapeLayer = useCallback((currentTool: Tool, box: { x: number; y: number; width: number; height: number }) => {
    const kind = shapeKindForTool[currentTool] ?? 'rect'
    const options = settingsRef.current
    snapshot()
    const layer = createLayerMeta(toolLabel(settingsRef.current.language, currentTool), 'shape')
    layer.shape = {
      kind,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      fill: options.shapeFilled ? options.foreground : 'rgba(0,0,0,0)',
      stroke: options.background,
      strokeWidth: currentTool === 'line' ? Math.max(1, options.shapeStroke) : options.shapeStroke,
      sides: options.shapeSides,
      radius: options.shapeCorner,
    }
    updateDoc((current) => ({ ...current, layers: [...current.layers, layer], activeLayerId: layer.id }))
  }, [snapshot, updateDoc])

  /* ------------------------------------------------------------ selection */

  const closePolySelection = useCallback(() => {
    const points = polyPointsRef.current
    setPolyPoints([])
    const current = docRef.current
    if (!current || points.length < 3) {
      return
    }
    setSelection(maskFromLasso(points, current.width, current.height))
  }, [])

  /* ----------------------------------------------------------- perspective */

  const applyPerspectiveCrop = useCallback(() => {
    const current = docRef.current
    const corners = cropCornersRef.current
    if (!current || corners.length !== 4) {
      return
    }
    const size = perspectiveSize(corners)
    snapshot()
    const next = new Map<string, HTMLCanvasElement>()
    for (const layer of current.layers) {
      const source = canvasesRef.current.get(layer.id)
      next.set(layer.id, source ? perspectiveCrop(source, corners, size.width, size.height) : createCanvas(size.width, size.height))
    }
    canvasesRef.current = next
    setCropCorners([])
    setDoc({ ...cloneDocument(current), width: size.width, height: size.height })
    markDirty()
  }, [markDirty, snapshot])

  /** Restricts a whole-canvas filter to the brush footprint, intersected with the selection. */
  const brushArea = useCallback((at: Point, size: number, selection: Selection | null): Selection => {
    const current = docRef.current
    const width = current?.width ?? 1
    const height = current?.height ?? 1
    const radius = Math.max(1, size / 2)
    const mask = new Uint8Array(width * height)
    const limit = selection ? selectionToMask(selection, width, height) : null
    for (let y = Math.max(0, Math.floor(at.y - radius)); y < Math.min(height, at.y + radius); y += 1) {
      for (let x = Math.max(0, Math.floor(at.x - radius)); x < Math.min(width, at.x + radius); x += 1) {
        if (Math.hypot(x - at.x, y - at.y) > radius) continue
        if (limit && !limit[y * width + x]) continue
        mask[y * width + x] = 255
      }
    }
    return { kind: 'mask', x: 0, y: 0, width, height, mask }
  }, [])

  /** The wand result, trimmed to the brush footprint — used by the background eraser. */
  const intersectWithBrush = useCallback((wand: Selection, at: Point, size: number): Selection => {
    const current = docRef.current
    const width = current?.width ?? 1
    const height = current?.height ?? 1
    const area = brushArea(at, size, null)
    const source = selectionToMask(wand, width, height)
    const mask = new Uint8Array(width * height)
    for (let i = 0; i < mask.length; i += 1) {
      mask[i] = source && source[i] && area.mask && area.mask[i] ? 255 : 0
    }
    return { kind: 'mask', x: 0, y: 0, width, height, mask }
  }, [brushArea])

  /**
   * One stroke segment for every brush-family tool. `from === to` is the initial
   * dab. Keeping this in one place is why the blur, sharpen and clone tools can
   * no longer silently fall through to a plain paint stroke.
   */
  const paintDab = useCallback((canvas: HTMLCanvasElement, currentTool: Tool, from: Point, to: Point, alt: boolean) => {
    const options = settingsRef.current
    const selection = selectionRef.current
    const size = options.brushSize
    switch (currentTool) {
      case 'smudge':
        if (from !== to) smudge(canvas, from, to, size, selection)
        return
      case 'dodge':
      case 'burn':
        dodgeBurn(canvas, to, size, options.brushOpacity, currentTool === 'burn', selection)
        return
      case 'sponge':
        spongeDesaturate(canvas, to, size, alt)
        return
      case 'colorReplace':
        colorReplace(canvas, to, size, options.foreground, options.fillTolerance)
        return
      case 'blurTool':
        gaussianBlur(canvas, Math.max(0.6, size / 20), brushArea(to, size, selection))
        return
      case 'sharpenTool':
        sharpen(canvas, 40, brushArea(to, size, selection))
        return
      case 'heal':
      case 'spotHeal':
        healStamp(canvas, to, size, selection)
        return
      case 'clone':
      case 'patternStamp': {
        const source = cloneSourceRef.current
        if (!source) {
          setStatus('cloneNeedsSource')
          return
        }
        cloneStamp(canvas, from, to, dragRef.current?.start ?? to, source, size, selection)
        return
      }
      case 'bgEraser': {
        // Erase only pixels close to the colour first touched.
        const wand = wandSelection(canvas, to, options.fillTolerance)
        clearSelectionPixels(canvas, intersectWithBrush(wand, to, size))
        return
      }
      default:
        paintStroke(canvas, from, to, {
          size,
          hardness: currentTool === 'pencil' ? 1 : options.brushHardness,
          color: options.foreground,
          opacity: currentTool === 'mixer' ? options.brushOpacity * 0.6 : options.brushOpacity,
          erase: currentTool === 'eraser',
          pencil: currentTool === 'pencil',
          selection,
        })
    }
  }, [brushArea, intersectWithBrush])

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!doc || event.button !== 0) {
      return
    }
    const point = screenToDoc(event.clientX, event.clientY)
    const currentTool = spaceRef.current ? 'hand' : toolRef.current
    const options = settingsRef.current
    event.currentTarget.setPointerCapture(event.pointerId)

    // A live transform owns the canvas until it is applied or cancelled.
    if (transformRef.current) {
      const handle = hitTestTransform(transformRef.current, point, 8 / options.zoom)
      if (handle) {
        dragRef.current = { mode: 'transform', handle, start: point, last: point, points: [], layerX: 0, layerY: 0, shift: event.shiftKey, alt: event.altKey }
        return
      }
    }

    if (currentTool === 'hand') {
      dragRef.current = { mode: 'pan', start: { x: event.clientX, y: event.clientY }, last: point, points: [], layerX: pan.x, layerY: pan.y }
      return
    }
    if (currentTool === 'rotateView') {
      if (event.detail >= 2) {
        setViewAngle(0)
        return
      }
      dragRef.current = { mode: 'rotateView', start: { x: event.clientX, y: event.clientY }, last: point, points: [], layerX: viewAngle, layerY: 0 }
      return
    }
    if (currentTool === 'zoom') {
      const factor = event.altKey ? 1 / 1.2 : 1.2
      setSettings((current) => ({ ...current, zoom: Math.min(8, Math.max(0.05, current.zoom * factor)) }))
      return
    }
    if (currentTool === 'eyedropper' || currentTool === 'sampler') {
      const sample = sampleComposite(doc, canvasesRef.current, point)
      if (currentTool === 'sampler') {
        updateDoc((current) => ({ ...current, samplers: [...current.samplers, { id: `s-${current.samplers.length + 1}`, x: point.x, y: point.y }] }))
      }
      setSettings((current) => ({ ...current, foreground: rgbToHex(sample.r, sample.g, sample.b) }))
      return
    }
    if (currentTool === 'ruler') {
      dragRef.current = { mode: 'ruler', start: point, last: point, points: [], layerX: 0, layerY: 0 }
      updateDoc((current) => ({ ...current, measure: { x1: point.x, y1: point.y, x2: point.x, y2: point.y } }))
      return
    }
    if (currentTool === 'note') {
      updateDoc((current) => ({ ...current, notes: [...current.notes, { id: `n-${current.notes.length + 1}`, x: point.x, y: point.y, text: 'Note' }] }))
      return
    }
    if (currentTool === 'count') {
      updateDoc((current) => ({ ...current, counts: [...current.counts, { id: `c-${current.counts.length + 1}`, x: point.x, y: point.y, n: current.counts.length + 1 }] }))
      return
    }
    if (currentTool === 'text' || currentTool === 'vtext' || currentTool === 'textMask') {
      setTextPoint(point)
      setDialog('text')
      return
    }

    /* ------------------------------------------------------------- paths */
    if (currentTool === 'pen' || currentTool === 'curvaturePen') {
      // Clicking the first anchor again closes the path, as in Photoshop.
      const draft = draftPathRef.current
      if (draft && draft.nodes.length > 1) {
        const first = draft.nodes[0]
        if (Math.hypot(point.x - first.x, point.y - first.y) <= 8 / options.zoom) {
          commitDraftPath(true)
          return
        }
      }
      const nodes = [...(draft?.nodes ?? []), pathNode(point.x, point.y)]
      const next = createPath(`${tr('pathName')} ${doc.paths.length + 1}`, nodes, false)
      const shaped = currentTool === 'curvaturePen' ? smoothPath({ ...next, id: draft?.id ?? next.id }) : { ...next, id: draft?.id ?? next.id }
      setDraftPath(shaped)
      draftPathRef.current = shaped
      if (currentTool === 'pen') {
        dragRef.current = { mode: 'path', start: point, last: point, points: [], layerX: 0, layerY: 0 }
      }
      return
    }
    if (currentTool === 'freeformPen') {
      dragRef.current = { mode: 'freeformPen', start: point, last: point, points: [point], layerX: 0, layerY: 0 }
      return
    }
    if (currentTool === 'pathSelect' || currentTool === 'directSelect') {
      const hit = hitTestPaths(doc.paths, point, 8 / options.zoom)
      if (hit) {
        setActivePathId(hit.pathId)
        dragRef.current = {
          mode: currentTool === 'pathSelect' ? 'pathMove' : 'path',
          hit: currentTool === 'pathSelect' ? { ...hit, part: 'anchor' } : hit,
          start: point, last: point, points: [], layerX: 0, layerY: 0,
        }
        snapshot()
      }
      return
    }

    /* ------------------------------------------------------------ shapes */
    if (shapeKindForTool[currentTool]) {
      dragRef.current = { mode: 'shape', start: point, last: point, points: [], layerX: 0, layerY: 0, shift: event.shiftKey }
      setShapeDraft({ x: point.x, y: point.y, width: 0, height: 0 })
      return
    }

    /* ------------------------------------------------- crop, slice, frame */
    if (currentTool === 'perspectiveCrop') {
      const corners = [...cropCornersRef.current, point]
      setCropCorners(corners.length > 4 ? [point] : corners)
      return
    }
    if (currentTool === 'slice') {
      dragRef.current = { mode: 'slice', start: point, last: point, points: [], layerX: 0, layerY: 0 }
      return
    }
    if (currentTool === 'sliceSelect') {
      setActiveSliceId(rectAt(doc.slices, point)?.id ?? null)
      return
    }
    if (currentTool === 'frame') {
      dragRef.current = { mode: 'frame', start: point, last: point, points: [], layerX: 0, layerY: 0 }
      return
    }

    /* --------------------------------------------------------- selections */
    if (currentTool === 'polyLasso') {
      if (event.detail >= 2) {
        closePolySelection()
        return
      }
      const points = [...polyPointsRef.current, point]
      setPolyPoints(points)
      polyPointsRef.current = points
      setSelection(points.length > 2 ? maskFromLasso(points, doc.width, doc.height) : null)
      return
    }
    if (currentTool === 'magneticLasso') {
      if (event.detail >= 2) {
        closePolySelection()
        return
      }
      const source = canvasesRef.current.get(doc.activeLayerId) ?? compositeDocument(doc, canvasesRef.current)
      const snapped = snapToEdge(source, point, options.magneticWidth)
      const points = [...polyPointsRef.current, snapped]
      setPolyPoints(points)
      polyPointsRef.current = points
      dragRef.current = { mode: 'magnetic', start: snapped, last: snapped, points, layerX: 0, layerY: 0 }
      return
    }
    if (currentTool === 'fill' || currentTool === 'magicEraser') {
      withLayer((canvas) => {
        if (currentTool === 'magicEraser') {
          const wand = wandSelection(canvas, point, options.fillTolerance)
          clearSelectionPixels(canvas, wand)
          return
        }
        paintBucket(canvas, point, hexToRgb(options.foreground), options.fillTolerance, selectionRef.current)
      })
      return
    }
    if (currentTool === 'wand' || currentTool === 'quickSelect' || currentTool === 'objectSelect') {
      const source = canvasesRef.current.get(doc.activeLayerId) ?? compositeDocument(doc, canvasesRef.current)
      setSelection(currentTool === 'objectSelect' ? selectSubject(source) : wandSelection(source, point, options.fillTolerance))
      return
    }
    if (currentTool === 'rowMarquee') {
      setSelection(rowSelection(point.y, doc.width))
      return
    }
    if (currentTool === 'colMarquee') {
      setSelection(colSelection(point.x, doc.height))
      return
    }

    /* ------------------------------------------------------------ retouch */
    if (currentTool === 'redEye') {
      withLayer((canvas) => redEyeFix(canvas, point, options.brushSize))
      return
    }
    if (currentTool === 'patch') {
      dragRef.current = { mode: 'patch', start: point, last: point, points: [], layerX: 0, layerY: 0 }
      snapshot()
      return
    }
    if (currentTool === 'contentMove') {
      dragRef.current = { mode: 'contentMove', start: point, last: point, points: [], layerX: 0, layerY: 0 }
      snapshot()
      return
    }
    if ((currentTool === 'clone' || currentTool === 'patternStamp' || currentTool === 'heal') && event.altKey) {
      setCloneSource(point)
      cloneSourceRef.current = point
      setStatus('ready')
      return
    }
    if (currentTool === 'spotHeal' || currentTool === 'remove') {
      withLayer((canvas) => {
        if (selectionRef.current && currentTool === 'remove') contentAwareFill(canvas, selectionRef.current)
        else healStamp(canvas, point, options.brushSize, selectionRef.current)
      })
      return
    }
    if (currentTool === 'move' || currentTool === 'artboard') {
      dragRef.current = { mode: 'move', start: point, last: point, points: [], layerX: 0, layerY: 0 }
      snapshot()
      return
    }

    /* ----------------------------------------------------------- painting */
    if (['brush', 'eraser', 'pencil', 'bgEraser', 'mixer', 'historyBrush', 'artHistory', 'colorReplace', 'clone', 'patternStamp', 'heal', 'dodge', 'burn', 'sponge', 'blurTool', 'sharpenTool', 'smudge'].includes(currentTool)) {
      dragRef.current = {
        mode: currentTool === 'eraser' || currentTool === 'bgEraser' ? 'erase' : 'paint',
        start: point, last: point, points: [point], layerX: 0, layerY: 0, alt: event.altKey,
      }
      withLayer((canvas) => paintDab(canvas, currentTool, point, point, event.altKey))
      setStatus('painting')
      return
    }

    if (currentTool === 'marquee' || currentTool === 'ellipseMarquee') {
      dragRef.current = { mode: 'select', start: point, last: point, points: [], layerX: 0, layerY: 0 }
      return
    }
    if (currentTool === 'lasso') {
      dragRef.current = { mode: 'lasso', start: point, last: point, points: [point], layerX: 0, layerY: 0 }
      return
    }
    if (currentTool === 'crop') {
      dragRef.current = { mode: 'crop', start: point, last: point, points: [], layerX: 0, layerY: 0 }
      return
    }
    if (currentTool === 'gradient') {
      dragRef.current = { mode: 'gradient', start: point, last: point, points: [], layerX: 0, layerY: 0 }
    }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag || !doc) {
      return
    }
    const point = screenToDoc(event.clientX, event.clientY)
    const options = settingsRef.current

    if (drag.mode === 'pan') {
      setPan({ x: drag.layerX + (event.clientX - drag.start.x), y: drag.layerY + (event.clientY - drag.start.y) })
      return
    }
    if (drag.mode === 'rotateView') {
      setViewAngle(drag.layerX + (event.clientX - drag.start.x) * 0.4)
      return
    }
    if (drag.mode === 'transform') {
      const box = transformRef.current
      if (box && drag.handle) {
        const next = dragTransform(box, drag.handle, drag.last, point, { shift: event.shiftKey, fromCenter: event.altKey })
        setTransformBox(next)
        transformRef.current = next
        drag.last = point
      }
      return
    }
    if (drag.mode === 'path' && drag.hit) {
      updatePaths((paths) => paths.map((path) => (path.id === drag.hit!.pathId ? movePathPoint(path, drag.hit!, point) : path)))
      return
    }
    if (drag.mode === 'path') {
      // Dragging straight after placing an anchor pulls its bezier handle out.
      const draft = draftPathRef.current
      if (draft && draft.nodes.length) {
        const nodes = [...draft.nodes]
        nodes[nodes.length - 1] = smoothNode(nodes[nodes.length - 1], point)
        const next = { ...draft, nodes }
        setDraftPath(next)
        draftPathRef.current = next
      }
      return
    }
    if (drag.mode === 'pathMove' && drag.hit) {
      const dx = point.x - drag.last.x
      const dy = point.y - drag.last.y
      updatePaths((paths) => paths.map((path) => (path.id === drag.hit!.pathId ? translatePath(path, dx, dy) : path)))
      drag.last = point
      return
    }
    if (drag.mode === 'freeformPen') {
      drag.points.push(point)
      drag.last = point
      const draft = pathFromPoints(`${tr('pathName')} ${doc.paths.length + 1}`, drag.points, false, 4)
      setDraftPath(draft)
      draftPathRef.current = draft
      return
    }
    if (drag.mode === 'shape') {
      let width = point.x - drag.start.x
      let height = point.y - drag.start.y
      if (event.shiftKey) {
        const side = Math.max(Math.abs(width), Math.abs(height))
        width = Math.sign(width || 1) * side
        height = Math.sign(height || 1) * side
      }
      setShapeDraft({ x: drag.start.x, y: drag.start.y, width, height })
      drag.last = point
      return
    }
    if (drag.mode === 'slice' || drag.mode === 'frame' || drag.mode === 'crop') {
      const box = rectSelection(drag.start.x, drag.start.y, point.x - drag.start.x, point.y - drag.start.y)
      setCrop(box)
      drag.last = point
      return
    }
    if (drag.mode === 'ruler') {
      updateDoc((current) => ({ ...current, measure: { x1: drag.start.x, y1: drag.start.y, x2: point.x, y2: point.y } }))
      drag.last = point
      return
    }
    if (drag.mode === 'patch' || drag.mode === 'contentMove') {
      drag.last = point
      bump()
      return
    }
    if (drag.mode === 'magnetic') {
      const source = canvasesRef.current.get(doc.activeLayerId) ?? compositeDocument(doc, canvasesRef.current)
      const snapped = snapToEdge(source, point, options.magneticWidth)
      const last = drag.points[drag.points.length - 1]
      if (!last || Math.hypot(snapped.x - last.x, snapped.y - last.y) >= 3) {
        drag.points.push(snapped)
        setPolyPoints([...drag.points])
        polyPointsRef.current = [...drag.points]
        if (drag.points.length > 2) {
          setSelection(maskFromLasso(drag.points, doc.width, doc.height))
        }
      }
      drag.last = snapped
      return
    }
    if (drag.mode === 'move') {
      const dx = Math.round(point.x - drag.last.x)
      const dy = Math.round(point.y - drag.last.y)
      const canvas = canvasesRef.current.get(doc.activeLayerId)
      if (canvas && (dx || dy)) {
        const shifted = padCanvas(canvas, canvas.width, canvas.height, dx, dy)
        canvasesRef.current.set(doc.activeLayerId, shifted)
        drag.last = point
        bump()
      }
      return
    }
    if (drag.mode === 'paint' || drag.mode === 'erase') {
      const currentTool = toolRef.current
      withLayer((canvas) => paintDab(canvas, currentTool, drag.last, point, Boolean(drag.alt)), false)
      drag.last = point
      return
    }
    if (drag.mode === 'select') {
      const currentTool = toolRef.current
      const box = currentTool === 'ellipseMarquee'
        ? ellipseSelection(drag.start.x, drag.start.y, point.x - drag.start.x, point.y - drag.start.y)
        : rectSelection(drag.start.x, drag.start.y, point.x - drag.start.x, point.y - drag.start.y)
      setSelection(box)
      drag.last = point
      return
    }
    if (drag.mode === 'lasso') {
      drag.points.push(point)
      drag.last = point
      setSelection(maskFromLasso(drag.points, doc.width, doc.height))
      return
    }
    if (drag.mode === 'gradient') {
      drag.last = point
      bump()
    }
  }

  const handlePointerUp = () => {
    const drag = dragRef.current
    const current = docRef.current
    if (drag && current) {
      if (drag.mode === 'gradient') {
        withLayer((canvas) => paintGradient(canvas, drag.start, drag.last, settingsRef.current.foreground, settingsRef.current.background, settingsRef.current.gradientKind, selectionRef.current))
      }
      if (drag.mode === 'shape') {
        // Derived from the drag itself, not from the preview state: a gesture can
        // finish before React has flushed the preview into its ref.
        const box = { x: drag.start.x, y: drag.start.y, width: drag.last.x - drag.start.x, height: drag.last.y - drag.start.y }
        if (Math.abs(box.width) > 1 && Math.abs(box.height) > 1) {
          addShapeLayer(toolRef.current, box)
        }
        setShapeDraft(null)
      }
      if (drag.mode === 'slice') {
        const box = rectSelection(drag.start.x, drag.start.y, drag.last.x - drag.start.x, drag.last.y - drag.start.y)
        if (box.width > 2 && box.height > 2) {
          const slice = createSlice(`${tr('sliceName')} ${current.slices.length + 1}`, box.x, box.y, box.width, box.height)
          updateDoc((value) => ({ ...value, slices: [...value.slices, slice] }))
          setActiveSliceId(slice.id)
        }
        setCrop(null)
      }
      if (drag.mode === 'frame') {
        const box = rectSelection(drag.start.x, drag.start.y, drag.last.x - drag.start.x, drag.last.y - drag.start.y)
        if (box.width > 2 && box.height > 2) {
          const frameRect = createFrame(`${tr('frameName')} ${current.frames.length + 1}`, box.x, box.y, box.width, box.height)
          frameRect.layerId = current.activeLayerId
          updateDoc((value) => ({ ...value, frames: [...value.frames, frameRect] }))
          withLayer((canvas, layer) => canvasesRef.current.set(layer.id, clipToFrame(canvas, frameRect)))
        }
        setCrop(null)
      }
      if (drag.mode === 'patch') {
        withLayer((canvas) => patchSelection(canvas, selectionRef.current, drag.last.x - drag.start.x, drag.last.y - drag.start.y), false)
      }
      if (drag.mode === 'contentMove') {
        withLayer((canvas) => contentMove(canvas, selectionRef.current, drag.last.x - drag.start.x, drag.last.y - drag.start.y), false)
      }
      if (drag.mode === 'freeformPen') {
        commitDraftPath(false)
      }
    }
    dragRef.current = null
    setStatus('ready')
  }

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    if (event.ctrlKey || event.metaKey) {
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1
      setSettings((current) => ({ ...current, zoom: Math.min(8, Math.max(0.05, current.zoom * factor)) }))
      return
    }
    setPan((current) => ({ x: current.x - event.deltaX, y: current.y - event.deltaY }))
  }

  const addLayer = () => {
    if (!doc) return
    snapshot()
    const layer = createLayerMeta(`${tr('layerName')} ${doc.layers.length + 1}`)
    canvasesRef.current.set(layer.id, createCanvas(doc.width, doc.height))
    updateDoc((current) => ({ ...current, layers: [...current.layers, layer], activeLayerId: layer.id }))
  }

  const duplicateLayer = () => {
    if (!activeLayer) return
    const source = canvasesRef.current.get(activeLayer.id)
    if (!source) return
    snapshot()
    const layer = { ...createLayerMeta(`${activeLayer.name} copy`) }
    canvasesRef.current.set(layer.id, cloneCanvas(source))
    updateDoc((current) => ({ ...current, layers: [...current.layers, layer], activeLayerId: layer.id }))
  }

  const deleteLayer = () => {
    if (!doc || doc.layers.length <= 1 || !activeLayer) return
    snapshot()
    canvasesRef.current.delete(activeLayer.id)
    updateDoc((current) => {
      const layers = current.layers.filter((layer) => layer.id !== current.activeLayerId)
      return { ...current, layers, activeLayerId: layers[layers.length - 1]?.id ?? '' }
    })
  }

  const mergeDown = () => {
    if (!doc || !activeLayer) return
    const index = doc.layers.findIndex((layer) => layer.id === activeLayer.id)
    if (index <= 0) return
    snapshot()
    const below = doc.layers[index - 1]
    const top = canvasesRef.current.get(activeLayer.id)
    const bottom = canvasesRef.current.get(below.id)
    if (!top || !bottom) return
    const ctx = context2d(bottom)
    ctx.save()
    ctx.globalAlpha = activeLayer.opacity
    ctx.globalCompositeOperation = activeLayer.blendMode
    ctx.drawImage(top, 0, 0)
    ctx.restore()
    canvasesRef.current.delete(activeLayer.id)
    updateDoc((current) => ({
      ...current,
      layers: current.layers.filter((layer) => layer.id !== activeLayer.id),
      activeLayerId: below.id,
    }))
  }

  const flatten = () => {
    if (!doc) return
    snapshot()
    const flat = compositeDocument(doc, canvasesRef.current)
    const layer = createLayerMeta(tr('backgroundLayer'))
    replaceDocument({ ...doc, layers: [layer], activeLayerId: layer.id }, new Map([[layer.id, flat]]), false)
    markDirty()
  }

  const addAdjustment = (type: AdjustmentType, payload?: { curves?: CurveData; levels?: LevelsData }) => {
    snapshot()
    const layer = createLayerMeta(tr('adjLayer'), 'adjustment')
    layer.adjustment = defaultAdjustment(type)
    if (payload?.curves) layer.curves = payload.curves
    if (payload?.levels) layer.levels = payload.levels
    updateDoc((current) => ({ ...current, layers: [...current.layers, layer], activeLayerId: layer.id }))
  }

  const addFillLayer = () => {
    snapshot()
    const layer = createLayerMeta(tr('fillLayer'), 'fill')
    layer.fill = { kind: 'solid', color: settings.foreground, gradientKind: settings.gradientKind, start: { x: 0, y: 0 }, end: { x: doc.width, y: 0 }, endColor: settings.background }
    updateDoc((current) => ({ ...current, layers: [...current.layers, layer], activeLayerId: layer.id }))
  }

  const addMask = () => {
    if (!activeLayer) return
    snapshot()
    const mask = createCanvas(doc.width, doc.height)
    context2d(mask).fillStyle = '#ffffff'
    context2d(mask).fillRect(0, 0, doc.width, doc.height)
    canvasesRef.current.set(`${activeLayer.id}:mask`, mask)
    updateDoc((current) => ({ ...current, layers: current.layers.map((layer) => layer.id === current.activeLayerId ? { ...layer, maskEnabled: true } : layer) }))
  }

  const applyNamedFilter = (id: string) => {
    if (id === 'cameraRaw') {
      setDialog('cameraRaw')
      return
    }
    if (id === 'liquify') {
      setTool('smudge')
      return
    }
    withLayer((canvas) => {
      if (id === 'gaussian') gaussianBlur(canvas, adjust.radius, selectionRef.current)
      else if (id === 'motion') motionBlur(canvas, adjust.radius * 3, selectionRef.current)
      else if (id === 'sharpen') sharpen(canvas, adjust.amount, selectionRef.current)
      else if (id === 'highPass') highPass(canvas, adjust.radius, selectionRef.current)
      else if (id === 'addNoise') addNoise(canvas, adjust.amount, selectionRef.current)
      else if (id === 'mosaic') mosaic(canvas, 12, selectionRef.current)
      else if (id === 'findEdges') findEdges(canvas, selectionRef.current)
      else if (id === 'emboss') emboss(canvas, selectionRef.current)
      else if (id === 'oil') oilPaint(canvas, selectionRef.current)
      else if (id === 'solarize') solarize(canvas, selectionRef.current)
      else if (id === 'clouds') clouds(canvas, selectionRef.current)
      else if (id === 'vignette') vignette(canvas, 0.65, selectionRef.current)
      else if (id === 'offset') offset(canvas, 40, 40)
      else if (id === 'skinSmooth') skinSmooth(canvas, 2.4)
    })
  }

  const rotateDoc = (quarter: number) => {
    snapshot()
    const width = quarter % 2 ? doc.height : doc.width
    const height = quarter % 2 ? doc.width : doc.height
    const next = new Map<string, HTMLCanvasElement>()
    for (const layer of doc.layers) {
      const source = canvasesRef.current.get(layer.id)
      if (!source) continue
      const canvas = createCanvas(width, height)
      const ctx = context2d(canvas)
      ctx.translate(width / 2, height / 2)
      ctx.rotate((quarter * Math.PI) / 2)
      ctx.drawImage(source, -source.width / 2, -source.height / 2)
      next.set(layer.id, canvas)
    }
    canvasesRef.current = next
    setDoc({ ...doc, width, height })
    markDirty()
  }

  const moveLayer = (direction: 1 | -1) => {
    if (!doc) return
    const index = doc.layers.findIndex((layer) => layer.id === doc.activeLayerId)
    const next = index + direction
    if (index < 0 || next < 0 || next >= doc.layers.length) return
    snapshot()
    updateDoc((current) => {
      const layers = [...current.layers]
      const [item] = layers.splice(index, 1)
      layers.splice(next, 0, item)
      return { ...current, layers }
    })
  }

  const resizeImage = (width: number, height: number) => {
    if (!doc) return
    snapshot()
    const next = new Map<string, HTMLCanvasElement>()
    for (const layer of doc.layers) {
      const source = canvasesRef.current.get(layer.id) ?? createCanvas(doc.width, doc.height)
      next.set(layer.id, resizeCanvasContent(source, width, height))
    }
    canvasesRef.current = next
    setDoc({ ...doc, width, height })
    markDirty()
  }

  const resizeCanvas = (width: number, height: number) => {
    if (!doc) return
    snapshot()
    const next = new Map<string, HTMLCanvasElement>()
    for (const layer of doc.layers) {
      const source = canvasesRef.current.get(layer.id) ?? createCanvas(doc.width, doc.height)
      next.set(layer.id, padCanvas(source, width, height, 0, 0))
    }
    canvasesRef.current = next
    setDoc({ ...doc, width, height })
    markDirty()
  }

  const closeDocument = () => {
    createDocument(tr('untitled'), 1280, 720, 'transparent')
  }

  const runPending = async (choice: UnsavedChoice) => {
    if (choice === 'cancel') {
      setDialog(null)
      setPendingAction(null)
      return
    }
    if (choice === 'save') {
      const ok = await saveProject(false)
      if (!ok) {
        return
      }
    }
    const action = pendingAction
    setDialog(null)
    setPendingAction(null)
    if (action === 'new') setDialog('new')
    if (action === 'open') void pickFiles('open')
    if (action === 'close') closeDocument()
    if (action === 'quit') {
      await window.electronWindowApi?.forceClose()
    }
  }

  useEffect(() => {
    return window.electronWindowApi?.onCloseRequest(() => {
      if (dirty) {
        setPendingAction('quit')
        setDialog('unsaved')
      } else {
        void window.electronWindowApi?.forceClose()
      }
    })
  }, [dirty])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const accel = event.ctrlKey || event.metaKey
      if (event.code === 'Space') {
        spaceRef.current = true
      }
      if (accel && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      }
      if (accel && key === 'y') {
        event.preventDefault()
        redo()
      }
      if (accel && key === 's') {
        event.preventDefault()
        void saveProject(event.shiftKey)
      }
      if (accel && key === 'o') {
        event.preventDefault()
        if (guardUnsaved('open')) void pickFiles('open')
      }
      if (accel && key === 'n') {
        event.preventDefault()
        if (guardUnsaved('new')) setDialog('new')
      }
      if (accel && key === 'a' && doc) {
        event.preventDefault()
        setSelection(rectSelection(0, 0, doc.width, doc.height))
      }
      if (accel && key === 'd') {
        event.preventDefault()
        setSelection(null)
      }
      if (key === 'delete' || key === 'backspace') {
        if (dialog) return
        withLayer((canvas) => clearSelectionPixels(canvas, selectionRef.current))
      }
      if (key === 'enter' && crop) {
        event.preventDefault()
        applyCrop(crop)
      }
      if (accel && key === 't' && doc) {
        event.preventDefault()
        beginTransform()
      }
      if (key === 'enter') {
        if (transformRef.current) {
          event.preventDefault()
          commitTransform()
          return
        }
        if (draftPathRef.current) {
          event.preventDefault()
          commitDraftPath(true)
          return
        }
        if (polyPointsRef.current.length > 2) {
          event.preventDefault()
          closePolySelection()
          return
        }
        if (cropCornersRef.current.length === 4) {
          event.preventDefault()
          applyPerspectiveCrop()
          return
        }
      }
      if (key === 'escape') {
        setCrop(null)
        setCropCorners([])
        setPolyPoints([])
        setDraftPath(null)
        setShapeDraft(null)
        if (transformRef.current) cancelTransform()
        setMenu(null)
        setContextMenu(null)
        setColorPick(null)
        if (dialog && dialog !== 'unsaved') setDialog(null)
      }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }
      if (!accel) {
        if (key === 'v') setTool('move')
        if (key === 'm') setTool(event.shiftKey ? 'ellipseMarquee' : 'marquee')
        if (key === 'l') setTool(event.shiftKey ? 'polyLasso' : 'lasso')
        if (key === 'w') setTool('wand')
        if (key === 'c') setTool(event.shiftKey ? 'perspectiveCrop' : 'crop')
        if (key === 'b') setTool('brush')
        if (key === 'e') setTool('eraser')
        if (key === 'g') setTool(event.shiftKey ? 'gradient' : 'fill')
        if (key === 't') setTool(event.shiftKey ? 'vtext' : 'text')
        if (key === 'i') setTool('eyedropper')
        if (key === 'h') setTool('hand')
        if (key === 'z') setTool('zoom')
        if (key === 'p') setTool(event.shiftKey ? 'curvaturePen' : 'pen')
        if (key === 'u') setTool(event.shiftKey ? 'ellipse' : 'rect')
        if (key === 'a') setTool(event.shiftKey ? 'directSelect' : 'pathSelect')
        if (key === 'k') setTool('frame')
        if (key === 'j') setTool(event.shiftKey ? 'patch' : 'spotHeal')
        if (key === 's') setTool('clone')
        if (key === 'o') setTool(event.shiftKey ? 'burn' : 'dodge')
        if (key === 'y') setTool('historyBrush')
        if (key === 'r') setTool('rotateView')
        if (key === '[') setSettings((current) => ({ ...current, brushSize: Math.max(1, current.brushSize - 4) }))
        if (key === ']') setSettings((current) => ({ ...current, brushSize: Math.min(400, current.brushSize + 4) }))
        if (key === 'x') setSettings((current) => ({ ...current, foreground: current.background, background: current.foreground }))
      }
    }
    const onUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') spaceRef.current = false
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onUp)
    }
  }, [applyCrop, applyPerspectiveCrop, beginTransform, cancelTransform, closePolySelection, commitDraftPath, commitTransform, crop, dialog, dirty, doc, guardUnsaved, pickFiles, redo, saveProject, undo, withLayer])

  const desktop = Boolean(window.electronWindowApi)
  const CurrentToolIcon = iconForTool(tool)

  return (
    <div
      className="app-shell"
      style={{ '--right-width': `${settings.rightWidth}px`, '--right-min-width': `${minRight}px` } as React.CSSProperties}
      onPointerDown={() => { setMenu(null); setContextMenu(null); hideTooltip() }}
      onPointerOver={showTooltip}
      onPointerOut={(event) => {
        const current = readTooltip(event.target)
        const next = readTooltip(event.relatedTarget)
        if (current && next && current.node === next.node) return
        hideTooltip()
      }}
    >
      <header className="toolbar">
        <div className="brand" data-tooltip={tr('appName')}>
          <img src="./app-icon.svg" alt="" />
          <span>{tr('appName')}</span>
        </div>
        {(['file', 'edit', 'image', 'layer', 'typeMenu', 'selectMenu', 'filter', 'threeD', 'view', 'windowMenu', 'help'] as const).map((id) => {
          const MenuIcon = menuIcons[id]
          return (
          <div className="menu-group" key={id}>
            <button
              ref={(node) => { menuAnchorRefs.current[id] = node }}
              className={menu === id ? 'active' : ''}
              data-tooltip={tr(id)}
              onPointerDown={(event) => {
                event.stopPropagation()
                hideTooltip()
                if (id === 'help') {
                  setMenu(null)
                  setDialog('helpGuide')
                  return
                }
                setMenu(menu === id ? null : id)
              }}
            >
              <MenuIcon size={16} />
              <span>{tr(id)}</span>
            </button>
            {menu === id && id !== 'help' && (
              <MenuDrop anchor={menuAnchorRefs.current[id] ?? null}>
                {id === 'file' && (
                  <>
                    <MenuItem icon={FilePlus} label={tr('new')} onClick={() => { setMenu(null); if (guardUnsaved('new')) setDialog('new') }} />
                    <MenuItem icon={FolderOpen} label={tr('open')} onClick={() => { setMenu(null); if (guardUnsaved('open')) void pickFiles('open') }} />
                    <MenuItem icon={ImagePlus} label={tr('place')} onClick={() => { setMenu(null); void pickFiles('place') }} />
                    <div className="menu-separator" />
                    <MenuItem icon={Save} label={tr('save')} onClick={() => { setMenu(null); void saveProject(false) }} />
                    <MenuItem icon={SaveAll} label={tr('saveAs')} onClick={() => { setMenu(null); void saveProject(true) }} />
                    <MenuItem icon={Download} label={tr('export')} onClick={() => { setMenu(null); setDialog('export') }} />
                    <div className="menu-separator" />
                    <MenuItem icon={FileX} label={tr('closeDoc')} onClick={() => { setMenu(null); if (guardUnsaved('close')) closeDocument() }} />
                  </>
                )}
                {id === 'edit' && (
                  <>
                    <MenuItem icon={Undo2} label={tr('undo')} onClick={() => { setMenu(null); undo() }} />
                    <MenuItem icon={Redo2} label={tr('redo')} onClick={() => { setMenu(null); redo() }} />
                    <div className="menu-separator" />
                    <MenuItem icon={Trash} label={tr('deletePixels')} onClick={() => { setMenu(null); withLayer((canvas) => clearSelectionPixels(canvas, selectionRef.current)) }} />
                    <MenuItem icon={Sparkles} label={tr('contentAware')} onClick={() => { setMenu(null); withLayer((canvas) => contentAwareFill(canvas, selectionRef.current)) }} />
                    <MenuItem icon={WandSparkles} label={tr('genFill')} onClick={() => { setMenu(null); withLayer((canvas) => contentAwareFill(canvas, selectionRef.current)) }} />
                    <MenuItem icon={Maximize2} label={tr('genExpand')} onClick={() => { setMenu(null); if (activeLayer) { const source = canvasesRef.current.get(activeLayer.id); if (source) { snapshot(); const expanded = generativeExpand(source, doc.width + 160, doc.height + 160, 80, 80); canvasesRef.current.set(activeLayer.id, expanded); setDoc({ ...doc, width: expanded.width, height: expanded.height }); markDirty() } } }} />
                    <MenuItem icon={ScanSearch} label={tr('genUpscale')} onClick={() => { setMenu(null); if (activeLayer) { const source = canvasesRef.current.get(activeLayer.id); if (source) { snapshot(); const up = generativeUpscale(source, 2); canvasesRef.current.set(activeLayer.id, up); setDoc({ ...doc, width: up.width, height: up.height }); markDirty() } } }} />
                    <MenuItem icon={Blend} label={tr('harmonize')} onClick={() => { setMenu(null); withLayer((canvas) => harmonize(canvas, selectionRef.current)) }} />
                  </>
                )}
                {id === 'image' && (
                  <>
                    <MenuItem icon={Ratio} label={tr('imageSize')} onClick={() => { setMenu(null); if (doc) { setAdjust((c) => ({ ...c, width: doc.width, height: doc.height })); setDialog('imageSize') } }} />
                    <MenuItem icon={Frame} label={tr('canvasSize')} onClick={() => { setMenu(null); if (doc) { setAdjust((c) => ({ ...c, width: doc.width, height: doc.height })); setDialog('canvasSize') } }} />
                    <MenuItem icon={RotateCw} label={tr('rotateCW')} onClick={() => { setMenu(null); rotateDoc(1) }} />
                    <MenuItem icon={RotateCcw} label={tr('rotateCCW')} onClick={() => { setMenu(null); rotateDoc(3) }} />
                    <MenuItem icon={FlipHorizontal} label={tr('flipH')} onClick={() => { setMenu(null); flipDocument('x') }} />
                    <MenuItem icon={FlipVertical} label={tr('flipV')} onClick={() => { setMenu(null); flipDocument('y') }} />
                    <MenuItem icon={Contrast} label={doc.colorMode === 'gray' ? tr('modeRgb') : tr('modeGray')} onClick={() => { setMenu(null); setDoc({ ...doc, colorMode: doc.colorMode === 'gray' ? 'rgb' : 'gray' }); markDirty() }} />
                    <div className="menu-separator" />
                    <MenuItem icon={Sun} label={tr('brightness')} onClick={() => { setMenu(null); setDialog('brightness') }} />
                    <MenuItem icon={Palette} label={tr('hueSat')} onClick={() => { setMenu(null); setDialog('hue') }} />
                    <MenuItem icon={Camera} label={tr('cameraRaw')} onClick={() => { setMenu(null); setDialog('cameraRaw') }} />
                    <MenuItem icon={Spline} label={tr('curves')} onClick={() => { setMenu(null); openCurves() }} />
                    <MenuItem icon={SlidersHorizontal} label={tr('levels')} onClick={() => { setMenu(null); openLevels() }} />
                    <MenuItem icon={SlidersHorizontal} label={tr('autoLevels')} onClick={() => { setMenu(null); withLayer((canvas) => levelsStretch(canvas)) }} />
                    <MenuItem icon={CircleDashed} label={tr('invert')} onClick={() => { setMenu(null); withLayer((canvas) => invertColors(canvas, selectionRef.current)) }} />
                    <MenuItem icon={Contrast} label={tr('grayscale')} onClick={() => { setMenu(null); withLayer((canvas) => grayscale(canvas, selectionRef.current)) }} />
                  </>
                )}
                {id === 'layer' && (
                  <>
                    <MenuItem icon={Plus} label={tr('newLayer')} onClick={() => { setMenu(null); addLayer() }} />
                    <MenuItem icon={Copy} label={tr('duplicateLayer')} onClick={() => { setMenu(null); duplicateLayer() }} />
                    <MenuItem icon={Trash} label={tr('deleteLayer')} onClick={() => { setMenu(null); deleteLayer() }} />
                    <MenuItem icon={Layers2} label={tr('mergeDown')} onClick={() => { setMenu(null); mergeDown() }} />
                    <MenuItem icon={LayoutGrid} label={tr('groupLayers')} onClick={() => { setMenu(null); groupActiveLayer() }} />
                    <MenuItem icon={Ungroup} label={tr('ungroupLayers')} onClick={() => { setMenu(null); ungroupActiveLayer() }} />
                    <MenuItem icon={FlipHorizontal} label={tr('flipLayerH')} onClick={() => { setMenu(null); flipLayer('x') }} />
                    <MenuItem icon={FlipVertical} label={tr('flipLayerV')} onClick={() => { setMenu(null); flipLayer('y') }} />
                    <MenuItem icon={Layers} label={tr('flatten')} onClick={() => { setMenu(null); flatten() }} />
                    <div className="menu-separator" />
                    <MenuItem icon={PaintBucket} label={tr('fillLayer')} onClick={() => { setMenu(null); addFillLayer() }} />
                    <MenuItem icon={SquareDashed} label={tr('layerMask')} onClick={() => { setMenu(null); addMask() }} />
                    {adjustmentTypes.map((type) => {
                      const AdjIcon = adjustmentIcons[type]
                      return (
                        <MenuItem
                          key={type}
                          icon={AdjIcon}
                          label={`${tr('adjLayer')} · ${type}`}
                          onClick={() => { setMenu(null); addAdjustment(type) }}
                        />
                      )
                    })}
                  </>
                )}
                {id === 'typeMenu' && (
                  <>
                    <MenuItem icon={Type} label={tr('text')} onClick={() => { setMenu(null); setTool('text') }} />
                    <MenuItem icon={Type} label={toolLabel(language, 'vtext')} onClick={() => { setMenu(null); setTool('vtext') }} />
                    <MenuItem icon={Pencil} label={tr('enterText')} onClick={() => { setMenu(null); setDialog('text') }} />
                  </>
                )}
                {id === 'selectMenu' && (
                  <>
                    <MenuItem icon={Maximize2} label={tr('freeTransform')} onClick={() => { setMenu(null); beginTransform() }} />
                    <MenuItem icon={SquareDashed} label={tr('selectAll')} onClick={() => { setMenu(null); setSelection(rectSelection(0, 0, doc.width, doc.height)) }} />
                    <MenuItem icon={Square} label={tr('deselect')} onClick={() => { setMenu(null); setSelection(null) }} />
                    <MenuItem icon={CircleDashed} label={tr('invertSel')} onClick={() => { setMenu(null); setSelection(invertSelection(selection, doc.width, doc.height)) }} />
                    <MenuItem icon={ScanSearch} label={tr('selectSubject')} onClick={() => { setMenu(null); const source = canvasesRef.current.get(doc.activeLayerId) ?? compositeDocument(doc, canvasesRef.current); setSelection(selectSubject(source)) }} />
                    <MenuItem icon={Search} label={tr('findDistractions')} onClick={() => { setMenu(null); const source = canvasesRef.current.get(doc.activeLayerId) ?? compositeDocument(doc, canvasesRef.current); setSelection(findDistractions(source)) }} />
                    <MenuItem icon={Eraser} label={tr('removeBg')} onClick={() => { setMenu(null); withLayer((canvas) => { const sub = selectSubject(canvas); clearSelectionPixels(canvas, invertSelection(sub, canvas.width, canvas.height)) }) }} />
                  </>
                )}
                {id === 'filter' && (
                  <>
                    <MenuItem icon={LayoutGrid} label={tr('filterGallery')} onClick={() => { setMenu(null); setDialog('filterGallery') }} />
                    <MenuItem icon={Aperture} label={tr('blur')} onClick={() => { setMenu(null); setDialog('blur') }} />
                    <MenuItem icon={Search} label={tr('sharpen')} onClick={() => { setMenu(null); setDialog('sharpen') }} />
                    <MenuItem icon={Sparkles} label={tr('neural')} onClick={() => { setMenu(null); applyNamedFilter('oil') }} />
                    <MenuItem icon={WavesHorizontal} label={tr('liquify')} onClick={() => { setMenu(null); applyNamedFilter('liquify') }} />
                    <MenuItem icon={Camera} label={tr('cameraRaw')} onClick={() => { setMenu(null); applyNamedFilter('cameraRaw') }} />
                  </>
                )}
                {id === 'threeD' && (
                  <>
                    <MenuItem icon={Box} label={tr('effects')} onClick={() => { setMenu(null); if (activeLayer) updateDoc((current) => ({ ...current, layers: current.layers.map((layer) => layer.id === current.activeLayerId ? { ...layer, effects: { ...layer.effects, bevel: true, dropShadow: true } } : layer) })) }} />
                  </>
                )}
                {id === 'view' && (
                  <>
                    <MenuItem icon={ZoomIn} label={tr('zoomIn')} onClick={() => { setMenu(null); setSettings((c) => ({ ...c, zoom: Math.min(8, c.zoom * 1.2) })) }} />
                    <MenuItem icon={ZoomOut} label={tr('zoomOut')} onClick={() => { setMenu(null); setSettings((c) => ({ ...c, zoom: Math.max(0.05, c.zoom / 1.2) })) }} />
                    <MenuItem icon={Maximize2} label={tr('zoomFit')} onClick={() => { setMenu(null); if (doc) fitZoom(doc) }} />
                    <MenuItem icon={Ratio} label={tr('actualPixels')} onClick={() => { setMenu(null); setSettings((c) => ({ ...c, zoom: 1 })) }} />
                    <MenuItem icon={Grid3x3} label={tr('grid')} active={settings.showGrid} onClick={() => { setMenu(null); setSettings((c) => ({ ...c, showGrid: !c.showGrid })) }} />
                    <MenuItem icon={Ruler} label={tr('rulers')} active={settings.showRulers} onClick={() => { setMenu(null); setSettings((c) => ({ ...c, showRulers: !c.showRulers })) }} />
                    <MenuItem icon={CircleDashed} label={tr('quickMask')} active={quickMask} onClick={() => { setMenu(null); setQuickMask((value) => !value) }} />
                    <MenuItem icon={RotateCw} label={tr('rotateView')} onClick={() => { setMenu(null); setViewAngle((value) => value + 15) }} />
                  </>
                )}
                {id === 'windowMenu' && (
                  <>
                    <MenuItem icon={Layers} label={tr('layers')} active={settings.rightTab === 'layers'} onClick={() => { setMenu(null); setSettings((c) => ({ ...c, rightTab: 'layers' })) }} />
                    <MenuItem icon={SlidersHorizontal} label={tr('adjustments')} active={settings.rightTab === 'adjust'} onClick={() => { setMenu(null); setSettings((c) => ({ ...c, rightTab: 'adjust' })) }} />
                    <MenuItem icon={Clock} label={tr('history')} active={settings.rightTab === 'history'} onClick={() => { setMenu(null); setSettings((c) => ({ ...c, rightTab: 'history' })) }} />
                    <MenuItem icon={LayoutGrid} label={tr('channels')} active={settings.rightTab === 'channels'} onClick={() => { setMenu(null); setSettings((c) => ({ ...c, rightTab: 'channels' })) }} />
                    <MenuItem icon={Info} label={tr('info')} active={settings.rightTab === 'info'} onClick={() => { setMenu(null); setSettings((c) => ({ ...c, rightTab: 'info' })) }} />
                  </>
                )}
              </MenuDrop>
            )}
          </div>
          )
        })}
        <button data-tooltip={tr('undo')} onClick={undo}><Undo2 size={16} /><span>{tr('undo')}</span></button>
        <button data-tooltip={tr('redo')} onClick={redo}><Redo2 size={16} /><span>{tr('redo')}</span></button>
        <div className="toolbar-spacer" />
        <div className="menu-group theme-menu-group">
          <button
            ref={(node) => { menuAnchorRefs.current.theme = node }}
            className={menu === 'theme' ? 'active' : ''}
            data-tooltip={`${tr('theme')}: ${themeLabel(language, settings.theme)}`}
            onPointerDown={(event) => { event.stopPropagation(); hideTooltip(); setMenu(menu === 'theme' ? null : 'theme') }}
          >
            <Palette size={16} />
            <span>{themeLabel(language, settings.theme)}</span>
          </button>
          {menu === 'theme' && (
            <MenuDrop className="theme-menu" align="end" anchor={menuAnchorRefs.current.theme ?? null}>
              {themes.map((item) => (
                <button
                  key={item.id}
                  className={settings.theme === item.id ? 'active' : ''}
                  data-tooltip={themeLabel(language, item.id)}
                  onClick={() => { setSettings((current) => ({ ...current, theme: item.id })); setMenu(null) }}
                >
                  <span className="theme-swatch" style={{ background: `linear-gradient(135deg, ${item.appA}, ${item.accent})` }} />
                  <span>{themeLabel(language, item.id)}</span>
                </button>
              ))}
            </MenuDrop>
          )}
        </div>
        <button
          className="lang-toggle"
          data-tooltip={language === 'ko' ? 'English' : '한국어'}
          aria-label={language === 'ko' ? 'English' : '한국어'}
          onClick={() => setSettings((c) => ({ ...c, language: c.language === 'ko' ? 'en' : 'ko' }))}
        >
          {language === 'ko' ? <FlagEn size={18} /> : <FlagKo size={18} />}
        </button>
        <button data-tooltip={tr('settings')} onClick={() => setDialog('settings')}><Settings2 size={16} /><span>{tr('settings')}</span></button>
        <button data-tooltip={tr('about')} onClick={() => setDialog('about')}><Info size={16} /><span>{tr('about')}</span></button>
        {desktop && (
          <div className="window-controls">
            <button data-tooltip={tr('minimize')} aria-label={tr('minimize')} onClick={() => void window.electronWindowApi?.minimize()}><Minus size={16} /></button>
            <button data-tooltip={tr('maximize')} aria-label={tr('maximize')} onClick={() => void window.electronWindowApi?.toggleMaximize()}><Square size={14} /></button>
            <button className="window-close" data-tooltip={tr('closeWindow')} aria-label={tr('closeWindow')} onClick={() => void window.electronWindowApi?.close()}><X size={16} /></button>
          </div>
        )}
      </header>

      <div className="options-bar">
        <strong className="current-tool" data-tooltip={toolLabel(language, tool)}>
          <CurrentToolIcon size={16} />
          <span>{toolLabel(language, tool)}</span>
        </strong>
        <div className="tool-options">
          {optionsForTool(tool).map((control, index) => {
            if (control.kind === 'hint') {
              return <span key={`hint-${index}`} className="option-hint">{tr(control.label)}</span>
            }
            if (control.kind === 'range') {
              const scale = control.scale ?? 1
              const value = (settings[control.key] as number) * scale
              return (
                <label key={control.key} data-tooltip={tr(control.label)}>
                  {tr(control.label)}
                  <input
                    type="range"
                    min={control.min}
                    max={control.max}
                    step={control.step ?? 1}
                    value={Math.round(value)}
                    onChange={(event) => setSettings((c) => ({ ...c, [control.key]: Number(event.target.value) / scale }))}
                  />
                  <span className="option-value">{Math.round(value)}</span>
                </label>
              )
            }
            if (control.kind === 'number') {
              return (
                <label key={control.key} data-tooltip={tr(control.label)}>
                  {tr(control.label)}
                  <input
                    type="number"
                    min={control.min}
                    max={control.max}
                    value={settings[control.key] as number}
                    onChange={(event) => setSettings((c) => ({ ...c, [control.key]: Number(event.target.value) }))}
                  />
                </label>
              )
            }
            if (control.kind === 'toggle') {
              return (
                <label key={control.key} className="option-toggle" data-tooltip={tr(control.label)}>
                  <input
                    type="checkbox"
                    checked={Boolean(settings[control.key])}
                    onChange={(event) => setSettings((c) => ({ ...c, [control.key]: event.target.checked }))}
                  />
                  {tr(control.label)}
                </label>
              )
            }
            if (control.kind === 'select') {
              return (
                <label key={control.key} data-tooltip={tr(control.label)}>
                  {tr(control.label)}
                  <select
                    value={String(settings[control.key])}
                    onChange={(event) => setSettings((c) => ({ ...c, [control.key]: event.target.value }))}
                  >
                    {control.choices.map((choice) => (
                      <option key={choice.value} value={choice.value}>{tr(choice.label)}</option>
                    ))}
                  </select>
                </label>
              )
            }
            if (control.id === 'font') {
              return (
                <span key="font" className="option-pair">
                  <label>{tr('font')}<input type="text" value={fontFamily} onChange={(event) => setFontFamily(event.target.value)} /></label>
                  <label>{tr('fontSize')}<input type="number" min={8} max={400} value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></label>
                </span>
              )
            }
            if (control.id === 'pathActions') {
              return (
                <span key="pathActions" className="option-pair">
                  <button data-tooltip={tr('strokePath')} disabled={!activePath} onClick={() => activePath && withLayer((canvas) => strokePathOnto(canvas, activePath, settings.foreground, settings.pathWidth))}><PenTool size={15} /><span>{tr('strokePath')}</span></button>
                  <button data-tooltip={tr('fillPath')} disabled={!activePath} onClick={() => activePath && withLayer((canvas) => fillPathOnto(canvas, activePath, settings.foreground))}><PaintBucket size={15} /><span>{tr('fillPath')}</span></button>
                  <button data-tooltip={tr('pathToSelection')} disabled={!activePath} onClick={() => activePath && setSelection(pathToSelection(activePath, doc.width, doc.height))}><SquareDashed size={15} /><span>{tr('pathToSelection')}</span></button>
                  <button data-tooltip={tr('deletePath')} disabled={!activePath} onClick={() => activePath && updatePaths((paths) => paths.filter((path) => path.id !== activePath.id))}><Trash size={15} /><span>{tr('deletePath')}</span></button>
                </span>
              )
            }
            if (control.id === 'cropActions') {
              const ready = tool === 'perspectiveCrop' ? cropCorners.length === 4 : Boolean(crop)
              return (
                <span key="cropActions" className="option-pair">
                  <button data-tooltip={tr('applyCropAction')} disabled={!ready} onClick={() => (tool === 'perspectiveCrop' ? applyPerspectiveCrop() : crop && applyCrop(crop))}><Crop size={15} /><span>{tr('applyCropAction')}</span></button>
                  <button data-tooltip={tr('cancelCrop')} onClick={() => { setCrop(null); setCropCorners([]) }}><X size={15} /><span>{tr('cancelCrop')}</span></button>
                </span>
              )
            }
            if (control.id === 'sliceActions') {
              const slice = doc.slices.find((item) => item.id === activeSliceId) ?? null
              return (
                <span key="sliceActions" className="option-pair">
                  <button data-tooltip={tr('exportSlice')} disabled={!slice} onClick={() => slice && void exportSlice(slice)}><Scissors size={15} /><span>{tr('exportSlice')}</span></button>
                  <button data-tooltip={tr('deleteSlice')} disabled={!slice} onClick={() => slice && updateDoc((current) => ({ ...current, slices: current.slices.filter((item) => item.id !== slice.id) }))}><Trash size={15} /><span>{tr('deleteSlice')}</span></button>
                </span>
              )
            }
            return null
          })}
          {transformBox && (
            <span className="option-pair transform-actions">
              <label>{tr('transformW')}<input type="number" value={Math.round(transformBox.width)} onChange={(event) => setTransformBox((box) => (box ? { ...box, width: Number(event.target.value) } : box))} /></label>
              <label>{tr('transformH')}<input type="number" value={Math.round(transformBox.height)} onChange={(event) => setTransformBox((box) => (box ? { ...box, height: Number(event.target.value) } : box))} /></label>
              <label>{tr('transformAngle')}<input type="number" value={Math.round(transformBox.angle)} onChange={(event) => setTransformBox((box) => (box ? { ...box, angle: Number(event.target.value) } : box))} /></label>
              <button data-tooltip={tr('flipH')} onClick={() => setTransformBox((box) => (box ? { ...box, flipX: !box.flipX } : box))}><FlipHorizontal size={15} /></button>
              <button data-tooltip={tr('flipV')} onClick={() => setTransformBox((box) => (box ? { ...box, flipY: !box.flipY } : box))}><FlipVertical size={15} /></button>
              <button className="primary" data-tooltip={tr('applyTransformAction')} onClick={commitTransform}><Sparkles size={15} /><span>{tr('applyTransformAction')}</span></button>
              <button data-tooltip={tr('cancelTransform')} onClick={cancelTransform}><X size={15} /><span>{tr('cancelTransform')}</span></button>
            </span>
          )}
        </div>
        <div className="task-bar">
          <button data-tooltip={tr('selectSubject')} onClick={() => { const source = canvasesRef.current.get(doc.activeLayerId) ?? compositeDocument(doc, canvasesRef.current); setSelection(selectSubject(source)) }}><Sparkles size={16} /><span>{tr('selectSubject')}</span></button>
          <button data-tooltip={tr('removeBg')} onClick={() => withLayer((canvas) => { const sub = selectSubject(canvas); clearSelectionPixels(canvas, invertSelection(sub, canvas.width, canvas.height)) })}><Eraser size={16} /><span>{tr('removeBg')}</span></button>
          <button data-tooltip={tr('genFill')} onClick={() => withLayer((canvas) => contentAwareFill(canvas, selectionRef.current))}><WandSparkles size={16} /><span>{tr('genFill')}</span></button>
          <button data-tooltip={tr('harmonize')} onClick={() => withLayer((canvas) => harmonize(canvas, selectionRef.current))}><Blend size={16} /><span>{tr('harmonize')}</span></button>
        </div>
        <label data-tooltip={tr('foreground')}><Droplets size={14} />{tr('foreground')}
          <button className="swatch" data-tooltip={tr('foreground')} style={{ background: settings.foreground, position: 'static', width: 28, height: 18 }} onClick={(event) => setColorPick({ target: 'fg', x: event.clientX, y: event.clientY })} />
        </label>
        <label data-tooltip={tr('backgroundColor')}><Droplets size={14} />{tr('backgroundColor')}
          <button className="swatch" data-tooltip={tr('backgroundColor')} style={{ background: settings.background, position: 'static', width: 28, height: 18 }} onClick={(event) => setColorPick({ target: 'bg', x: event.clientX, y: event.clientY })} />
        </label>
        <button data-tooltip={tr('swap')} onClick={() => setSettings((c) => ({ ...c, foreground: c.background, background: c.foreground }))}><ArrowLeftRight size={16} /><span>{tr('swap')}</span></button>
      </div>

      <div className="workspace">
        <aside className="tool-strip">
          {toolGroups.map((group) => {
            const current = groupTool[group.id] ?? group.tools[0].id
            const item = group.tools.find((entry) => entry.id === current) ?? group.tools[0]
            const Icon = item.icon
            return (
              <button
                key={group.id}
                className={tool === item.id ? 'active' : ''}
                data-tooltip={`${toolLabel(language, item.id)} (${item.key || group.id})`}
                onClick={() => {
                  if (tool === item.id && group.tools.length > 1) {
                    const index = group.tools.findIndex((entry) => entry.id === item.id)
                    const next = group.tools[(index + 1) % group.tools.length]
                    setGroupTool((value) => ({ ...value, [group.id]: next.id }))
                    setTool(next.id)
                  } else {
                    setTool(item.id)
                  }
                }}
              >
                <Icon size={15} />
              </button>
            )
          })}
          <div className="swatches">
            <div className="swatch-stack">
              <button className="swatch fg" data-tooltip={tr('foreground')} style={{ background: settings.foreground }} onClick={(event) => setColorPick({ target: 'fg', x: event.clientX, y: event.clientY })} />
              <button className="swatch bg" data-tooltip={tr('backgroundColor')} style={{ background: settings.background }} onClick={(event) => setColorPick({ target: 'bg', x: event.clientX, y: event.clientY })} />
            </div>
          </div>
        </aside>

        <div ref={stageRef} className={`canvas-stage${settings.showGrid ? ' show-grid' : ''}`} onContextMenu={(event) => { event.preventDefault(); setContextMenu({ x: event.clientX, y: event.clientY }) }}>
          <canvas
            ref={viewRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
          />
        </div>

        <div
          className="resize-handle"
          onPointerDown={(event) => {
            const startX = event.clientX
            const startWidth = settings.rightWidth
            const move = (ev: PointerEvent) => {
              setSettings((current) => ({ ...current, rightWidth: Math.min(maxRight, Math.max(minRight, startWidth - (ev.clientX - startX))) }))
            }
            const up = () => {
              window.removeEventListener('pointermove', move)
              window.removeEventListener('pointerup', up)
            }
            window.addEventListener('pointermove', move)
            window.addEventListener('pointerup', up)
          }}
        />

        <aside className="panel">
          <div className="panel-tabs">
            {(['layers', 'adjust', 'history', 'channels', 'info'] as const).map((tab) => {
              const TabIcon = panelTabIcons[tab]
              const label = tr(tab === 'adjust' ? 'adjustments' : tab)
              return (
                <button
                  key={tab}
                  className={settings.rightTab === tab ? 'active' : ''}
                  data-tooltip={label}
                  onClick={() => setSettings((c) => ({ ...c, rightTab: tab }))}
                >
                  <TabIcon size={14} />
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
          {settings.rightTab === 'adjust' && (
            <>
              <h2>{tr('adjustments')}</h2>
              {adjustmentTypes.map((type) => {
                const AdjIcon = adjustmentIcons[type]
                return (
                  <button key={type} data-tooltip={tr(type)} onClick={() => addAdjustment(type)}>
                    <AdjIcon size={14} />
                    <span>{tr(type)}</span>
                  </button>
                )
              })}
            </>
          )}
          {settings.rightTab === 'history' && (
            <>
              <h2>{tr('history')}</h2>
              <p>Undo / Redo</p>
              <button data-tooltip={tr('undo')} onClick={undo}><Undo2 size={14} /><span>{tr('undo')}</span></button>
              <button data-tooltip={tr('redo')} onClick={redo}><Redo2 size={14} /><span>{tr('redo')}</span></button>
            </>
          )}
          {settings.rightTab === 'channels' && (
            <>
              <h2>{tr('channels')}</h2>
              <p>RGB · R · G · B{activeLayer?.maskEnabled ? ' · Mask' : ''}</p>
            </>
          )}
          {settings.rightTab === 'info' && (
            <>
              <h2>{tr('info')}</h2>
              <p>{doc.name} {doc.width}×{doc.height} · {doc.colorMode.toUpperCase()}</p>
              <p>{tr('tool')}: {toolLabel(language, tool)}</p>
              {doc.samplers.map((item) => <p key={item.id}># {Math.round(item.x)},{Math.round(item.y)}</p>)}
              {doc.measure && (
                <div className="info-block">
                  <strong>{tr('measurePanel')}</strong>
                  <div><span>{tr('distance')}</span><span>{measureInfo(doc.measure).distance.toFixed(1)} px</span></div>
                  <div><span>{tr('angleLabel')}</span><span>{measureInfo(doc.measure).angle.toFixed(1)}&deg;</span></div>
                </div>
              )}
              <div className="info-block">
                <strong>{tr('pathsPanel')}</strong>
                {doc.paths.length === 0 && <div className="info-empty">{tr('noPaths')}</div>}
                {doc.paths.map((path) => (
                  <button
                    key={path.id}
                    className={`region-row${path.id === activePathId ? ' active' : ''}`}
                    onClick={() => setActivePathId(path.id)}
                  >
                    <PenTool size={14} /><span>{path.name}</span><span className="region-meta">{path.nodes.length}</span>
                  </button>
                ))}
              </div>
              {doc.slices.length > 0 && (
                <div className="info-block">
                  <strong>{tr('slicesPanel')}</strong>
                  {doc.slices.map((slice) => (
                    <button
                      key={slice.id}
                      className={`region-row${slice.id === activeSliceId ? ' active' : ''}`}
                      onClick={() => setActiveSliceId(slice.id)}
                    >
                      <Scissors size={14} /><span>{slice.name}</span><span className="region-meta">{slice.width}&times;{slice.height}</span>
                    </button>
                  ))}
                </div>
              )}
              {doc.frames.length > 0 && (
                <div className="info-block">
                  <strong>{tr('framesPanel')}</strong>
                  {doc.frames.map((item) => (
                    <div key={item.id} className="region-row">
                      <Frame size={14} /><span>{item.name}</span><span className="region-meta">{item.width}&times;{item.height}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {settings.rightTab === 'layers' && (
          <>
          <h2>{tr('layers')}</h2>
          <div className="layer-list">
            {[...(doc?.layers ?? [])].slice().reverse().map((layer) => (
              <div key={layer.id} className={`layer-row${layer.id === doc?.activeLayerId ? ' active' : ''}`} onClick={() => setDoc((current) => current ? { ...current, activeLayerId: layer.id } : current)}>
                <button data-tooltip={tr('visible')} onClick={(event) => { event.stopPropagation(); updateDoc((current) => ({ ...current, layers: current.layers.map((item) => item.id === layer.id ? { ...item, visible: !item.visible } : item) })) }}>
                  {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button data-tooltip={tr('locked')} onClick={(event) => { event.stopPropagation(); updateDoc((current) => ({ ...current, layers: current.layers.map((item) => item.id === layer.id ? { ...item, locked: !item.locked } : item) })) }}>
                  {layer.locked ? <Lock size={14} /> : <LockOpen size={14} />}
                </button>
                <input value={layer.name} onChange={(event) => updateDoc((current) => ({ ...current, layers: current.layers.map((item) => item.id === layer.id ? { ...item, name: event.target.value } : item) }))} />
              </div>
            ))}
          </div>
          <div className="layer-actions">
            <button data-tooltip={tr('newLayer')} onClick={addLayer}><Plus size={14} /><span>{tr('newLayer')}</span></button>
            <button data-tooltip={tr('deleteLayer')} onClick={deleteLayer}><Trash size={14} /><span>{tr('deleteLayer')}</span></button>
            <button data-tooltip={tr('moveUp')} onClick={() => moveLayer(1)}><ArrowUp size={14} /><span>{tr('moveUp')}</span></button>
            <button data-tooltip={tr('moveDown')} onClick={() => moveLayer(-1)}><ArrowDown size={14} /><span>{tr('moveDown')}</span></button>
            <button data-tooltip={tr('duplicateLayer')} onClick={duplicateLayer}><Copy size={14} /><span>{tr('duplicateLayer')}</span></button>
            <button data-tooltip={tr('mergeDown')} onClick={mergeDown}><Layers2 size={14} /><span>{tr('mergeDown')}</span></button>
          </div>
          {activeLayer && (
            <>
              <h3>{tr('properties')}</h3>
              <label>{tr('opacity')}
                <div className="range-field">
                  <input type="range" min={0} max={100} value={Math.round(activeLayer.opacity * 100)} onChange={(event) => updateDoc((current) => ({ ...current, layers: current.layers.map((layer) => layer.id === current.activeLayerId ? { ...layer, opacity: Number(event.target.value) / 100 } : layer) }))} />
                  <span className="range-value">{Math.round(activeLayer.opacity * 100)}</span>
                </div>
              </label>
              <label>{tr('blend')}
                <select value={activeLayer.blendMode} onChange={(event) => updateDoc((current) => ({ ...current, layers: current.layers.map((layer) => layer.id === current.activeLayerId ? { ...layer, blendMode: event.target.value as BlendMode } : layer) }))}>
                  {blendModes.map((mode) => <option key={mode} value={mode}>{blendLabel(language, mode)}</option>)}
                </select>
              </label>
              <h3>{tr('effects')}</h3>
              <label className="check-row"><input type="checkbox" checked={activeLayer.effects.dropShadow} onChange={(event) => updateDoc((current) => ({ ...current, layers: current.layers.map((layer) => layer.id === current.activeLayerId ? { ...layer, effects: { ...layer.effects, dropShadow: event.target.checked } } : layer) }))} />{tr('dropShadow')}</label>
              <label className="check-row"><input type="checkbox" checked={activeLayer.effects.stroke} onChange={(event) => updateDoc((current) => ({ ...current, layers: current.layers.map((layer) => layer.id === current.activeLayerId ? { ...layer, effects: { ...layer.effects, stroke: event.target.checked } } : layer) }))} />{tr('strokeFx')}</label>
              <label className="check-row"><input type="checkbox" checked={activeLayer.effects.colorOverlay} onChange={(event) => updateDoc((current) => ({ ...current, layers: current.layers.map((layer) => layer.id === current.activeLayerId ? { ...layer, effects: { ...layer.effects, colorOverlay: event.target.checked } } : layer) }))} />{tr('overlayFx')}</label>
              <button data-tooltip={tr('layerMask')} onClick={addMask}><SquareDashed size={14} /><span>{tr('layerMask')}</span></button>
            </>
          )}
          <h3>{tr('histogram')}</h3>
          <canvas id="histogram-canvas" className="histogram" width={280} height={88} />
          </>
          )}
        </aside>
      </div>

      <footer className="status-bar">
        <span>{doc ? `${doc.name} ${doc.width}×${doc.height}` : tr('document')}</span>
        <span>{tr('tool')}: {toolLabel(language, tool)}</span>
        <span>{Math.round(settings.zoom * 100)}%</span>
        <span>{cloneSource ? 'Clone' : tr('selection')}: {selection ? `${Math.round(selection.width)}×${Math.round(selection.height)}` : tr('none')}</span>
        <span className={savedNote ? 'status-saved' : ''}>{savedNote ? tr('saved') : tr(status)}</span>
      </footer>

      {tooltip && createPortal(
        <div className={`app-tooltip place-${tooltip.place}`} style={{ left: tooltip.x, top: tooltip.y }} role="tooltip">
          {tooltip.text}
        </div>,
        document.body,
      )}

      {contextMenu && (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
          <MenuItem icon={Plus} label={tr('newLayer')} onClick={() => { addLayer(); setContextMenu(null) }} />
          <MenuItem icon={Copy} label={tr('duplicateLayer')} onClick={() => { duplicateLayer(); setContextMenu(null) }} />
          <MenuItem icon={Trash} label={tr('deleteLayer')} onClick={() => { deleteLayer(); setContextMenu(null) }} />
          <MenuItem icon={Square} label={tr('deselect')} onClick={() => { setSelection(null); setContextMenu(null) }} />
        </div>
      )}

      {colorPick && (
        <ColorPopover
          color={colorPick.target === 'fg' ? settings.foreground : settings.background}
          x={colorPick.x}
          y={colorPick.y}
          onChange={(hex) => setSettings((current) => colorPick.target === 'fg' ? { ...current, foreground: hex } : { ...current, background: hex })}
          onClose={() => setColorPick(null)}
        />
      )}

      {dialog && <div className="dialog-backdrop" onClick={() => { if (dialog !== 'unsaved') setDialog(null) }} />}

      {dialog === 'new' && (
        <div className="dialog">
          <h2>{tr('newDocument')}</h2>
          <label>{tr('preset')}
            <select defaultValue="webHd" onChange={(event) => {
              const preset = documentPresets.find((item) => item.id === event.target.value)
              if (preset) setAdjust((current) => ({ ...current, width: preset.width, height: preset.height }))
            }}>
              {documentPresets.map((preset) => <option key={preset.id} value={preset.id}>{tr(preset.id)}</option>)}
            </select>
          </label>
          <div className="dialog-grid">
            <label>{tr('width')}<input type="number" value={adjust.width} onChange={(event) => setAdjust((c) => ({ ...c, width: Number(event.target.value) }))} /></label>
            <label>{tr('height')}<input type="number" value={adjust.height} onChange={(event) => setAdjust((c) => ({ ...c, height: Number(event.target.value) }))} /></label>
          </div>
          <label>{tr('background')}
            <select id="bg-choice" defaultValue="transparent">
              <option value="transparent">{tr('transparent')}</option>
              <option value="#ffffff">{tr('white')}</option>
              <option value="#000000">{tr('black')}</option>
            </select>
          </label>
          <div className="dialog-actions">
            <button onClick={() => setDialog(null)}>{tr('cancel')}</button>
            <button onClick={() => {
              const background = (document.getElementById('bg-choice') as HTMLSelectElement).value as PhotoDocument['background']
              createDocument(tr('untitled'), Math.max(1, adjust.width), Math.max(1, adjust.height), background)
              setDialog(null)
            }}>{tr('ok')}</button>
          </div>
        </div>
      )}

      {dialog === 'export' && (
        <div className="dialog">
          <h2>{tr('export')}</h2>
          <label>{tr('exportFormat')}
            <select value={settings.exportFormat} onChange={(event) => setSettings((c) => ({ ...c, exportFormat: event.target.value as ExportFormat }))}>
              {(['png', 'jpg', 'webp', 'avif', 'gif', 'tiff'] as ExportFormat[]).map((format) => <option key={format} value={format}>{format.toUpperCase()}</option>)}
            </select>
          </label>
          <div className="dialog-actions">
            <button onClick={() => setDialog(null)}>{tr('cancel')}</button>
            <button onClick={() => { void exportImage(settings.exportFormat); setDialog(null) }}>{tr('export')}</button>
          </div>
        </div>
      )}

      {dialog === 'brightness' && (
        <div className="dialog">
          <h2>{tr('brightness')}</h2>
          <label>{tr('brightness')}<input type="range" min={-100} max={100} value={adjust.brightness} onChange={(event) => setAdjust((c) => ({ ...c, brightness: Number(event.target.value) }))} /></label>
          <label>{tr('contrast')}<input type="range" min={-100} max={100} value={adjust.contrast} onChange={(event) => setAdjust((c) => ({ ...c, contrast: Number(event.target.value) }))} /></label>
          <div className="dialog-actions">
            <button onClick={() => setDialog(null)}>{tr('cancel')}</button>
            <button onClick={() => { withLayer((canvas) => adjustBrightnessContrast(canvas, adjust.brightness, adjust.contrast, selectionRef.current)); setDialog(null) }}>{tr('apply')}</button>
          </div>
        </div>
      )}

      {dialog === 'hue' && (
        <div className="dialog">
          <h2>{tr('hueSat')}</h2>
          <label>{tr('hue')}<input type="range" min={-180} max={180} value={adjust.hue} onChange={(event) => setAdjust((c) => ({ ...c, hue: Number(event.target.value) }))} /></label>
          <label>{tr('saturation')}<input type="range" min={-100} max={100} value={adjust.saturation} onChange={(event) => setAdjust((c) => ({ ...c, saturation: Number(event.target.value) }))} /></label>
          <label>{tr('lightness')}<input type="range" min={-100} max={100} value={adjust.lightness} onChange={(event) => setAdjust((c) => ({ ...c, lightness: Number(event.target.value) }))} /></label>
          <div className="dialog-actions">
            <button onClick={() => setDialog(null)}>{tr('cancel')}</button>
            <button onClick={() => { withLayer((canvas) => adjustHueSaturation(canvas, adjust.hue, adjust.saturation, adjust.lightness, selectionRef.current)); setDialog(null) }}>{tr('apply')}</button>
          </div>
        </div>
      )}

      {dialog === 'blur' && (
        <div className="dialog">
          <h2>{tr('blur')}</h2>
          <label>{tr('radius')}<input type="range" min={0.5} max={20} step={0.5} value={adjust.radius} onChange={(event) => setAdjust((c) => ({ ...c, radius: Number(event.target.value) }))} /></label>
          <div className="dialog-actions">
            <button onClick={() => setDialog(null)}>{tr('cancel')}</button>
            <button onClick={() => { withLayer((canvas) => gaussianBlur(canvas, adjust.radius, selectionRef.current)); setDialog(null) }}>{tr('apply')}</button>
          </div>
        </div>
      )}

      {dialog === 'sharpen' && (
        <div className="dialog">
          <h2>{tr('sharpen')}</h2>
          <label>{tr('amount')}<input type="range" min={10} max={150} value={adjust.amount} onChange={(event) => setAdjust((c) => ({ ...c, amount: Number(event.target.value) }))} /></label>
          <div className="dialog-actions">
            <button onClick={() => setDialog(null)}>{tr('cancel')}</button>
            <button onClick={() => { withLayer((canvas) => sharpen(canvas, adjust.amount, selectionRef.current)); setDialog(null) }}>{tr('apply')}</button>
          </div>
        </div>
      )}

      {dialog === 'cameraRaw' && (
        <div className="dialog">
          <h2>{tr('cameraRaw')}</h2>
          <label>{tr('brightness')}<input type="range" min={-100} max={100} value={adjust.brightness} onChange={(event) => setAdjust((c) => ({ ...c, brightness: Number(event.target.value) }))} /></label>
          <label>{tr('contrast')}<input type="range" min={-100} max={100} value={adjust.contrast} onChange={(event) => setAdjust((c) => ({ ...c, contrast: Number(event.target.value) }))} /></label>
          <label>{tr('saturation')}<input type="range" min={-100} max={100} value={adjust.saturation} onChange={(event) => setAdjust((c) => ({ ...c, saturation: Number(event.target.value) }))} /></label>
          <div className="dialog-actions">
            <button onClick={() => setDialog(null)}>{tr('cancel')}</button>
            <button onClick={() => { withLayer((canvas) => applyAdjustmentCanvas(canvas, { ...defaultAdjustment('exposure'), brightness: adjust.brightness, contrast: adjust.contrast, saturation: adjust.saturation, clarity: 20, dehaze: 10 })); setDialog(null) }}>{tr('apply')}</button>
          </div>
        </div>
      )}

      {dialog === 'curves' && (
        <div className="dialog curves-dialog">
          <h2>{tr('curves')}</h2>
          <label className="dialog-row">{tr('channel')}
            <select value={curveChannel} onChange={(event) => setCurveChannel(event.target.value as CurveChannel)}>
              <option value="rgb">{tr('channelRgb')}</option>
              <option value="r">{tr('channelRed')}</option>
              <option value="g">{tr('channelGreen')}</option>
              <option value="b">{tr('channelBlue')}</option>
            </select>
          </label>
          <CurveEditor
            points={curveDraft[curveChannel]}
            accent={curveChannel === 'r' ? '#f87171' : curveChannel === 'g' ? '#4ade80' : curveChannel === 'b' ? '#60a5fa' : '#e2e8f0'}
            onChange={(next) => setCurveDraft((current) => ({ ...current, [curveChannel]: next }))}
          />
          <p className="dialog-hint">{tr('curveHint')}</p>
          <div className="dialog-actions">
            <button onClick={() => setCurveDraft((current) => ({ ...current, [curveChannel]: defaultCurves()[curveChannel] }))}><RotateCcw size={15} /><span>{tr('resetCurve')}</span></button>
            <button onClick={() => { addAdjustment('curves', { curves: curveDraft }); setDialog(null) }}><Layers2 size={15} /><span>{tr('adjLayer')}</span></button>
            <button className="primary" onClick={() => { withLayer((canvas) => applyCurves(canvas, curveDraft, selectionRef.current)); setDialog(null) }}>{tr('apply')}</button>
            <button onClick={() => setDialog(null)}>{tr('cancel')}</button>
          </div>
        </div>
      )}

      {dialog === 'levels' && (
        <div className="dialog levels-dialog">
          <h2>{tr('levels')}</h2>
          <fieldset>
            <legend>{tr('inputLevels')}</legend>
            <label>{tr('blackPoint')}<input type="range" min={0} max={254} value={levelDraft.black} onChange={(event) => setLevelDraft((c) => ({ ...c, black: Number(event.target.value) }))} /><span>{levelDraft.black}</span></label>
            <label>{tr('gammaLabel')}<input type="range" min={10} max={300} value={Math.round(levelDraft.gamma * 100)} onChange={(event) => setLevelDraft((c) => ({ ...c, gamma: Number(event.target.value) / 100 }))} /><span>{levelDraft.gamma.toFixed(2)}</span></label>
            <label>{tr('whitePoint')}<input type="range" min={1} max={255} value={levelDraft.white} onChange={(event) => setLevelDraft((c) => ({ ...c, white: Number(event.target.value) }))} /><span>{levelDraft.white}</span></label>
          </fieldset>
          <fieldset>
            <legend>{tr('outputLevels')}</legend>
            <label>{tr('blackPoint')}<input type="range" min={0} max={255} value={levelDraft.outBlack} onChange={(event) => setLevelDraft((c) => ({ ...c, outBlack: Number(event.target.value) }))} /><span>{levelDraft.outBlack}</span></label>
            <label>{tr('whitePoint')}<input type="range" min={0} max={255} value={levelDraft.outWhite} onChange={(event) => setLevelDraft((c) => ({ ...c, outWhite: Number(event.target.value) }))} /><span>{levelDraft.outWhite}</span></label>
          </fieldset>
          <div className="dialog-actions">
            <button onClick={() => { const canvas = canvasesRef.current.get(doc.activeLayerId); if (canvas) setLevelDraft({ ...autoLevels(canvas), gamma: 1 }) }}><Sparkles size={15} /><span>{tr('autoAction')}</span></button>
            <button onClick={() => { addAdjustment('levels', { levels: levelDraft }); setDialog(null) }}><Layers2 size={15} /><span>{tr('adjLayer')}</span></button>
            <button className="primary" onClick={() => { withLayer((canvas) => applyLevels(canvas, levelDraft, selectionRef.current)); setDialog(null) }}>{tr('apply')}</button>
            <button onClick={() => setDialog(null)}>{tr('cancel')}</button>
          </div>
        </div>
      )}

      {dialog === 'filterGallery' && (
        <div className="dialog filter-gallery-dialog">
          <h2>{tr('filterGallery')}</h2>
          {filterCatalog.map((item) => (
            <button key={item.id} onClick={() => { applyNamedFilter(item.id); setDialog(null) }}>{tr(`group${item.group.charAt(0).toUpperCase()}${item.group.slice(1)}`)} · {tr(item.id)}</button>
          ))}
          <div className="dialog-actions">
            <button onClick={() => setDialog(null)}>{tr('close')}</button>
          </div>
        </div>
      )}

      {(dialog === 'imageSize' || dialog === 'canvasSize') && (
        <div className="dialog">
          <h2>{tr(dialog)}</h2>
          <div className="dialog-grid">
            <label>{tr('width')}<input type="number" value={adjust.width} onChange={(event) => setAdjust((c) => ({ ...c, width: Number(event.target.value) }))} /></label>
            <label>{tr('height')}<input type="number" value={adjust.height} onChange={(event) => setAdjust((c) => ({ ...c, height: Number(event.target.value) }))} /></label>
          </div>
          <div className="dialog-actions">
            <button onClick={() => setDialog(null)}>{tr('cancel')}</button>
            <button onClick={() => {
              if (dialog === 'imageSize') {
                resizeImage(adjust.width, adjust.height)
              } else {
                resizeCanvas(adjust.width, adjust.height)
              }
              setDialog(null)
            }}>{tr('apply')}</button>
          </div>
        </div>
      )}

      {dialog === 'text' && (
        <div className="dialog">
          <h2>{tr('text')}</h2>
          <label>{tr('enterText')}<input value={textValue} onChange={(event) => setTextValue(event.target.value)} /></label>
          <div className="dialog-actions">
            <button onClick={() => setDialog(null)}>{tr('cancel')}</button>
            <button onClick={() => {
              snapshot()
              const layer = createLayerMeta(tr('text'), 'text')
              layer.text = { text: textValue, x: textPoint.x, y: textPoint.y, fontFamily, fontSize, color: settings.foreground, bold: true, italic: false, align: 'left', vertical: tool === 'vtext' }
              updateDoc((current) => ({ ...current, layers: [...current.layers, layer], activeLayerId: layer.id }))
              setDialog(null)
            }}>{tr('ok')}</button>
          </div>
        </div>
      )}

      {dialog === 'unsaved' && (
        <div className="dialog">
          <h2>{tr('unsavedTitle')}</h2>
          <p>{tr('unsavedMessage')}</p>
          <div className="dialog-actions">
            <button onClick={() => void runPending('discard')}>{tr('discard')}</button>
            <button onClick={() => void runPending('cancel')}>{tr('cancel')}</button>
            <button onClick={() => void runPending('save')}>{tr('saveChanges')}</button>
          </div>
        </div>
      )}

      {dialog === 'settings' && (
        <div className="dialog settings-dialog">
          <h2>{tr('settings')}</h2>
          <label>{tr('language')}
            <select value={language} onChange={(event) => setSettings((current) => ({ ...current, language: event.target.value as Language }))}>
              <option value="ko">한국어</option>
              <option value="en">English</option>
            </select>
          </label>
          <div className="settings-theme-block">
            <span>{tr('theme')}</span>
            <div className="settings-themes">
              {themes.map((item) => (
                <button
                  key={item.id}
                  className={settings.theme === item.id ? 'active' : ''}
                  data-tooltip={themeLabel(language, item.id)}
                  onClick={() => setSettings((current) => ({ ...current, theme: item.id }))}
                >
                  <span className="theme-swatch" style={{ background: `linear-gradient(135deg, ${item.appA}, ${item.accent})` }} />
                  <span>{themeLabel(language, item.id)}</span>
                </button>
              ))}
            </div>
          </div>
          <label className="check-row">
            <input type="checkbox" checked={settings.showGrid} onChange={(event) => setSettings((current) => ({ ...current, showGrid: event.target.checked }))} />
            {tr('grid')}
          </label>
          <label className="check-row">
            <input type="checkbox" checked={settings.showRulers} onChange={(event) => setSettings((current) => ({ ...current, showRulers: event.target.checked }))} />
            {tr('rulers')}
          </label>
          <label>{tr('exportFormat')}
            <select value={settings.exportFormat} onChange={(event) => setSettings((current) => ({ ...current, exportFormat: event.target.value as ExportFormat }))}>
              {(['png', 'jpg', 'webp', 'avif', 'gif', 'tiff'] as ExportFormat[]).map((format) => <option key={format} value={format}>{format.toUpperCase()}</option>)}
            </select>
          </label>
          <div className="dialog-grid">
            <label>{tr('size')}
              <input type="number" min={1} max={400} value={settings.brushSize} onChange={(event) => setSettings((current) => ({ ...current, brushSize: Number(event.target.value) }))} />
            </label>
            <label>{tr('tolerance')}
              <input type="number" min={0} max={255} value={settings.fillTolerance} onChange={(event) => setSettings((current) => ({ ...current, fillTolerance: Number(event.target.value) }))} />
            </label>
          </div>
          <div className="dialog-actions">
            <button onClick={() => setDialog(null)}>{tr('close')}</button>
          </div>
        </div>
      )}

      {dialog === 'helpGuide' && (
        <div className="dialog help-dialog">
          <h2><BookOpen size={18} /> {tr('helpGuide')}</h2>
          <div className="help-body">
            <p>{tr('helpIntro')}</p>
            <section>
              <h3>{tr('helpToolsTitle')}</h3>
              <p>{tr('helpToolsBody')}</p>
            </section>
            <section>
              <h3>{tr('helpFilesTitle')}</h3>
              <p>{tr('helpFilesBody')}</p>
            </section>
            <section>
              <h3>{tr('helpLayersTitle')}</h3>
              <p>{tr('helpLayersBody')}</p>
            </section>
            <section>
              <h3>{tr('helpAdjustTitle')}</h3>
              <p>{tr('helpAdjustBody')}</p>
            </section>
            <section>
              <h3>{tr('helpViewTitle')}</h3>
              <p>{tr('helpViewBody')}</p>
            </section>
          </div>
          <div className="dialog-actions">
            <button onClick={() => setDialog(null)}>{tr('close')}</button>
          </div>
        </div>
      )}

      {dialog === 'about' && (
        <div className="dialog about-dialog">
          <img src="./app-icon.svg" alt="" />
          <h2>{tr('appName')}</h2>
          <p>{tr('aboutBody')}</p>
          <p>{tr('version')}: 1.0.0<br />{tr('creator')}: SHKWON (knix008@naver.com)</p>
          <div className="dialog-actions">
            <button onClick={() => { void navigator.clipboard.writeText('My Photo Work V1.0\nSHKWON <knix008@naver.com>') }}>{tr('copy')}</button>
            <button onClick={() => setDialog(null)}>{tr('close')}</button>
          </div>
        </div>
      )}

      {dialog === 'error' && error && (
        <div className="dialog error-dialog">
          <h2>{error.title}</h2>
          <p>{error.message}</p>
          <textarea readOnly value={error.details} />
          <div className="dialog-actions">
            <button onClick={() => { void navigator.clipboard.writeText(error.details) }}>{tr('copy')}</button>
            <button onClick={() => setDialog(null)}>{tr('close')}</button>
          </div>
        </div>
      )}

      <input className="hidden-input" ref={fileRef} type="file" accept=".mpw,image/*" multiple onChange={(event) => { const files = event.target.files; if (files) void Promise.all([...files].map(fileToOpenItem)).then((items) => openFiles(items, 'open')); event.target.value = '' }} />
      <input className="hidden-input" ref={placeRef} type="file" accept="image/*" multiple onChange={(event) => { const files = event.target.files; if (files) void Promise.all([...files].map(fileToOpenItem)).then((items) => openFiles(items, 'place')); event.target.value = '' }} />
    </div>
  )
}
