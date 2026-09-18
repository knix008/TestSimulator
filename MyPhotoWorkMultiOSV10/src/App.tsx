import { createElement, Fragment, useCallback, useEffect, useMemo, useReducer, useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  Aperture,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Blend,
  Camera,
  Circle,
  ChevronDown,
  CircleDashed,

  Clock,
  Download,
  Play,
  Save,
  Contrast,
  Copy,
  Crop,
  Droplets,
  Eraser,
  Eye,
  EyeOff,
  Frame,
  FlipHorizontal,
  FlipVertical,
  Grid3x3,
  Info,
  Layers,
  Layers2,
  LayoutGrid,
  Lock,
  LockOpen,
  Minus,
  PaintBucket,
  Palette,
  PenTool,
  Plus,
  Redo2,
  ScanSearch,
  Scissors,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Square,
  SquareDashed,
  Sun,
  Trash,
  Undo2,
  WandSparkles,
  WavesHorizontal,
  X,
} from 'lucide-react'
import { blendLabel, t, toolLabel } from './i18n'
import { aspectRatio, formatBytes, formatName, imageStatistics, type MetaRow, type MetaSection } from './lib/metadata'
import { adjustmentTypes, iconForTool, toolGroups } from './catalog'
import { canvasToDataUrl, cloneCanvas, compositeDocument, context2d, createBlankDocument, createCanvas, createId, createLayerMeta, padCanvas, resizeCanvasContent, sampleComposite, setSmartFilterRunner, smartSourceKey } from './lib/canvas'
import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from './lib/color'
import { adjustBrightnessContrast, adjustHueSaturation, clearSelectionPixels, gaussianBlur, grayscale, histogram, invertColors, sharpen } from './lib/filters'
import { applyGalleryFilter } from './lib/gallery'
import { applyAdjustmentCanvas, levelsStretch } from './lib/adjustments'
import { cloneDocument, pushHistory, takeSnapshot, type HistorySnapshot } from './lib/history'
import { decodeImageSource, downloadDataUrl, encodeExport, extensionFor, fileToOpenItem, flattenOnto, naturalOrientation, previewSheet, printDataUrl, printableDocument, restoreProject, serializeProject } from './lib/imageIO'
import { borderSelection, clipCanvasToSelection, colSelection, colorRangeSelection, contractSelection, drawSelectionOverlay, ellipseSelection, expandSelection, featherSelection, growSelection, invertSelection, maskBounds, maskFromLasso, paintBucket, rectSelection, rowSelection, selectionBounds, selectionToMask, similarSelection, smoothSelection, wandSelection } from './lib/selection'
import { autoColor, channelMixer, equalize, gradientMap, replaceColor, selectiveColor, type ChannelMix, type ColorFamily, type InkShift } from './lib/colorTools'
import { channelCanvas, combineMasks, selectionToChannel, type ChannelCombine } from './lib/channels'
import { builtInProfiles, convertProfile } from './lib/colorModes'
import { contentAwareScaleLayers, cornerTransform, perspective as perspectiveCanvas, puppetWarp, skew as skewCanvas, warpCanvas, type Pin } from './lib/warp'
import { definePattern, makePatternTile, patternKey, tileOnto } from './lib/patterns'
import { gifDataUrl } from './lib/gif'
import { extractVideoFrames, recordFrames } from './lib/video'
import { loadSettings, saveSettings } from './lib/settings'
import { colorReplace, dodgeBurn, healStamp, paintGradient, paintStroke, redEyeFix, smudge, spongeDesaturate } from './lib/tools'
import { contentAwareFill, findDistractions, generativeExpand, generativeUpscale, harmonize, selectSubject } from './lib/ai'
import { cloneStamp } from './lib/tools'
import { createPath, drawPathOverlay, fillPathOnto, hitTestPaths, movePathPoint, pathFromPoints, pathNode, pathToSelection, smoothNode, smoothPath, strokePathOnto, translatePath, type PathHit } from './lib/paths'
import { applyCurves, applyLevels, autoLevels } from './lib/curves'
import { applyTransform, dragTransform, drawTransformOverlay, flipCanvas, hitTestTransform, identityTransform } from './lib/transform'
import { clipToFrame, contentMove, createFrame, createSlice, cropToRect, drawRegionOverlay, measureInfo, patchSelection, perspectiveCrop, perspectiveSize, rectAt, snapToEdge } from './lib/regions'
import { optionsForTool } from './toolOptions'
import { firstTick, rulerSize, tickStep, visibleRange } from './lib/view'
import { buildErrorReport } from './lib/errors'
import { commands, commandsInMenu, menuColumns, menuIcons, menuOrder, toolbarGroups, type AppCommand, type MenuId as CommandMenuId } from './commands'
import { DialogBody, DialogFrame, type DialogName, type DialogPayload, type DialogResult } from './dialogs'
import { defaultAdjustment, defaultCurves, blendModes, rightPanelMaxWidth, rightPanelMinWidth, shapeKindForTool, type AdjustmentType, type AppSettings, type BlendMode, type ErrorDetails, type ExportFormat, type CurveData, type Language, type LevelsData, type PageOrientation, type PathShape, type PhotoDocument, type Point, type Selection, type SliceRect, type ActionScript, type ActionStep, type AnimationFrame, type LayerComp, type LayerMeta, type SmartFilter, type TextData, type TextWarpStyle, type ThreeDData, type Tool, type TransformBox, type TransformHandle, type UnsavedChoice } from './lib/types'
import { applyTheme, themeLabel, themes } from './themes'
import './App.css'

const minRight = rightPanelMinWidth
const maxRight = rightPanelMaxWidth
const presets = ['#1d4ed8', '#0f766e', '#b45309', '#be123c', '#7c3aed', '#111827', '#ffffff', '#94a3b8', '#22c55e', '#eab308', '#06b6d4', '#f97316', '#ec4899', '#84cc16', '#6366f1', '#64748b']

/** Which popup is open, if any. The catalog in dialogMeta.ts is the one list:
 *  a second copy here only ever drifted out of step with it. */
type Dialog = DialogName | null

type MenuId = CommandMenuId | 'theme' | null

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

const panelTabIcons = {
  layers: Layers,
  adjust: SlidersHorizontal,
  history: Clock,
  channels: LayoutGrid,
  actions: Play,
  timeline: Clock,
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
  channelMixer: Blend,
  selectiveColor: Droplets,
  gradientMap: Blend,
  equalize: SlidersHorizontal,
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  active,
  accel,
}: {
  icon: ComponentType<{ size?: number }>
  label: string
  onClick: () => void
  active?: boolean
  accel?: string
}) {
  return (
    <button className={active ? 'active' : ''} data-tooltip={label} onClick={onClick}>
      <Icon size={16} />
      <span>{label}</span>
      {accel && <kbd>{accel}</kbd>}
    </button>
  )
}

function MenuDrop({
  anchor,
  align = 'start',
  className,
  rows,
  children,
}: {
  anchor: HTMLElement | null
  align?: 'start' | 'end'
  className?: string
  /** Column layout for a long list; the theme picker lays itself out. */
  rows?: { separatorBefore?: boolean }[]
  children: React.ReactNode
}) {
  // The dropdown hangs off a button, so it has to know where that button is.
  // Measuring while rendering puts it in the right place on its first paint;
  // holding the rectangle in state instead cost a second render, and setting
  // that state from an effect is what React warns about. The button cannot move
  // while the menu is open except when the window resizes, which is the one
  // thing worth re-measuring for.
  const [, remeasure] = useReducer((tick: number) => tick + 1, 0)

  useEffect(() => {
    window.addEventListener('resize', remeasure)
    return () => window.removeEventListener('resize', remeasure)
  }, [])

  const box = anchor?.getBoundingClientRect() ?? null
  if (!box) return null

  const layout = rows ? menuColumns(rows) : { columns: 1, rowCount: 0 }
  const minWidth = (className?.includes('theme-menu') ? 420 : 220) * layout.columns
  const preferred = align === 'end' ? box.right - minWidth : box.left
  const left = Math.max(8, Math.min(preferred, window.innerWidth - minWidth - 8))

  const names = ['menu-drop', className, layout.columns > 1 ? 'menu-columns' : null].filter(Boolean)
  return createPortal(
    <div
      className={names.join(' ')}
      style={{
        top: box.bottom + 6,
        left,
        ...(layout.columns > 1 ? ({ '--menu-rows': layout.rowCount } as React.CSSProperties) : null),
      }}
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

/**
 * Everything the image information window lists, grouped into its four blocks:
 * the file it came from, the document it became, what the pixels measure, and
 * whatever the file's own header had to say (EXIF, a PNG header, DICOM tags).
 */
function imageInfoSections(document: PhotoDocument, canvases: Map<string, HTMLCanvasElement>, language: Language): MetaSection[] {
  const tr = (key: string) => t(language, key)
  const source = document.source
  const composite = compositeDocument(document, canvases)
  const sections: MetaSection[] = []

  const file: MetaRow[] = [{ key: 'infoFileName', value: source?.name ?? `${document.name}.mpw` }]
  if (source?.path ?? document.filePath) file.push({ key: 'infoFilePath', value: source?.path ?? document.filePath ?? '' })
  file.push({ key: 'infoFormat', value: formatName(source?.name ?? document.name, source?.mime) })
  if (source?.byteSize) file.push({ key: 'infoFileSize', value: formatBytes(source.byteSize) })
  sections.push({ key: 'infoFile', rows: file })

  sections.push({
    key: 'infoImage',
    rows: [
      { key: 'infoDimensions', value: `${document.width} × ${document.height} px` },
      { key: 'infoMegapixels', value: `${((document.width * document.height) / 1_000_000).toFixed(2)} MP` },
      { key: 'infoAspect', value: aspectRatio(document.width, document.height) },
      { key: 'infoColorMode', value: document.colorMode === 'gray' ? tr('grayscale') : 'RGB' },
      { key: 'infoLayers', value: String(document.layers.length) },
      { key: 'infoBackground', value: document.background === 'transparent' ? tr('transparent') : document.background },
    ],
  })

  sections.push({ key: 'infoPixels', rows: imageStatistics(composite) })

  sections.push({
    key: 'infoDetails',
    rows: source?.details?.length ? source.details : [{ key: 'infoNoDetails', value: '—' }],
  })
  return sections
}

/**
 * The compositor re-runs a smart layer's filter stack itself, but knows nothing
 * about filters. This hands it the gallery, once, when the module loads —
 * before any document can be composited.
 */
setSmartFilterRunner((canvas, filter) => {
  applyGalleryFilter(canvas, filter.filter, { radius: filter.radius, amount: filter.amount }, null)
})

/**
 * True while an action is replaying. It lives outside the component because it
 * is not state anything renders from — it only tells `openDialog` that nobody
 * is watching, so a window would stop the run rather than serve it.
 */
let replayingAction = false

/** What the print preview window is handed: a small opaque copy of the page. */
function printPreview(document: PhotoDocument, canvases: Map<string, HTMLCanvasElement>) {
  const composite = compositeDocument(document, canvases)
  return {
    dataUrl: previewSheet(composite),
    orientation: naturalOrientation(composite),
    width: composite.width,
    height: composite.height,
  }
}

function readTooltip(target: EventTarget | null) {
  const node = (target as HTMLElement | null)?.closest?.('button, select, [data-tooltip]') as HTMLElement | null
  if (!node || node.closest('.app-tooltip')) return null
  const labelled = node.getAttribute('data-tooltip')?.trim()
  if (labelled) return { node, text: labelled }
  if (node.tagName === 'SELECT' || node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') return null
  const text = node.innerText.replace(/\s+/g, ' ').trim()
  return text ? { node, text } : null
}



/** Ruler strips along the top and left edges, labelled in document pixels. */
function drawRulers(
  ctx: CanvasRenderingContext2D,
  view: { width: number; height: number },
  document: { width: number; height: number },
  pan: { x: number; y: number },
  zoom: number,
  colors: { bg: string; line: string; text: string; accent: string },
) {
  const step = tickStep(zoom, 64)
  ctx.save()
  ctx.font = '10px system-ui, sans-serif'
  ctx.textBaseline = 'top'

  ctx.fillStyle = colors.bg
  ctx.fillRect(0, 0, view.width, rulerSize)
  ctx.fillRect(0, 0, rulerSize, view.height)

  ctx.strokeStyle = colors.line
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, rulerSize + 0.5)
  ctx.lineTo(view.width, rulerSize + 0.5)
  ctx.moveTo(rulerSize + 0.5, 0)
  ctx.lineTo(rulerSize + 0.5, view.height)
  ctx.stroke()

  // Three tick depths, so a number's exact position is unmistakable: a full
  // rule at each labelled value, a half-height mark between two of them, and
  // short marks every tenth.
  const minor = step / 10
  const spanX = visibleRange(view.width, pan.x, zoom)
  const spanY = visibleRange(view.height, pan.y, zoom)

  const tickDepth = (value: number) => {
    const index = Math.round(value / minor)
    if (index % 10 === 0) return rulerSize - 2
    if (index % 5 === 0) return 8
    return 4
  }

  ctx.fillStyle = colors.text
  ctx.strokeStyle = colors.line
  ctx.beginPath()
  for (let value = firstTick(spanX.from, minor); value <= spanX.to; value += minor) {
    const x = Math.round(pan.x + value * zoom) + 0.5
    if (x < rulerSize) continue
    const depth = tickDepth(value)
    ctx.moveTo(x, rulerSize - depth)
    ctx.lineTo(x, rulerSize)
  }
  for (let value = firstTick(spanY.from, minor); value <= spanY.to; value += minor) {
    const y = Math.round(pan.y + value * zoom) + 0.5
    if (y < rulerSize) continue
    const depth = tickDepth(value)
    ctx.moveTo(rulerSize - depth, y)
    ctx.lineTo(rulerSize, y)
  }
  ctx.stroke()

  // The labels sit just past their own full-height rule.
  for (let value = firstTick(spanX.from, step); value <= spanX.to; value += step) {
    const x = Math.round(pan.x + value * zoom) + 0.5
    if (x < rulerSize) continue
    ctx.textBaseline = 'top'
    ctx.fillText(String(Math.round(value)), x + 3, 3)
  }
  for (let value = firstTick(spanY.from, step); value <= spanY.to; value += step) {
    const y = Math.round(pan.y + value * zoom) + 0.5
    if (y < rulerSize) continue
    ctx.save()
    ctx.translate(3, y + 3)
    ctx.rotate(-Math.PI / 2)
    ctx.textBaseline = 'bottom'
    ctx.fillText(String(Math.round(value)), -24, 10)
    ctx.restore()
  }

  // The document's own extent, marked on both rulers.
  ctx.strokeStyle = colors.accent
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(pan.x, rulerSize - 1)
  ctx.lineTo(pan.x + document.width * zoom, rulerSize - 1)
  ctx.moveTo(rulerSize - 1, pan.y)
  ctx.lineTo(rulerSize - 1, pan.y + document.height * zoom)
  ctx.stroke()
  ctx.restore()
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
  /**
   * The menu-bar button the open dropdown hangs off.
   *
   * Only one menu is open at a time, and the button that opened it is right
   * there on the event, so it is captured when the menu opens rather than
   * collected from a ref on every button. Render then reads plain state, which
   * is what positioning a dropdown honestly depends on.
   */
  const [menuAnchor, setMenuAnchor] = useState<HTMLButtonElement | null>(null)
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
  /**
   * Pristine pixels per layer, kept for the move tool.
   *
   * A layer canvas is document-sized, so shifting it crops whatever leaves the
   * edge. Every move is therefore replayed from this untouched copy at the
   * accumulated offset, which keeps dragging a layer out of frame and back
   * lossless across as many separate drags as the user makes. The entry is
   * dropped as soon as the layer is edited any other way.
   */
  const moveOriginRef = useRef(new Map<string, { canvas: HTMLCanvasElement; dx: number; dy: number }>())
  const [activePathId, setActivePathId] = useState<string | null>(null)
  // The pen tools build a path click by click before it joins doc.paths.
  const [draftPath, setDraftPath] = useState<PathShape | null>(null)
  const [polyPoints, setPolyPoints] = useState<Point[]>([])
  /** Names typed into the Actions panel before the thing they name exists. */
  const [actionName, setActionName] = useState('')
  const [compName, setCompName] = useState('')
  /** The pins the puppet tool is holding the picture with. */
  const [pins, setPins] = useState<Pin[]>([])
  const pinsRef = useRef<Pin[]>([])
  /** The name of the ICC profile the opened file carried, if it had one. */
  const embeddedProfileRef = useRef<string | null>(null)
  /** The printer list, for the print window's payload. */
  const printersRef = useRef<{ name: string; displayName: string; isDefault: boolean }[]>([])
  const [cropCorners, setCropCorners] = useState<Point[]>([])
  const [shapeDraft, setShapeDraft] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const [activeSliceId, setActiveSliceId] = useState<string | null>(null)
  const [viewAngle, setViewAngle] = useState(0)
  const [quickMask, setQuickMask] = useState(false)
  const [dropActive, setDropActive] = useState(false)
  const [tooltip, setTooltip] = useState<HoverTip | null>(null)
  const tooltipTimer = useRef(0)
  const viewRef = useRef<HTMLCanvasElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const placeRef = useRef<HTMLInputElement | null>(null)
  const videoRef = useRef<HTMLInputElement | null>(null)
  const dragRef = useRef<{
    mode:
      | 'paint' | 'erase' | 'select' | 'lasso' | 'crop' | 'pan' | 'move' | 'gradient' | 'none'
      | 'magnetic' | 'shape' | 'path' | 'freeformPen' | 'transform' | 'slice' | 'frame'
      | 'ruler' | 'patch' | 'contentMove' | 'rotateView' | 'pathMove' | 'puppet'
    handle?: TransformHandle
    /** Which puppet pin the drag has hold of. */
    pin?: number
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
  const adjustRef = useRef({ brightness: 0, contrast: 0, hue: 0, saturation: 0, lightness: 0, radius: 4, amount: 60, width: 1280, height: 720 })
  const textValueRef = useRef('Photo')
  const textPointRef = useRef<Point>({ x: 40, y: 40 })
  const errorRef = useRef<ErrorDetails | null>(null)
  const dirtyRef = useRef(false)
  const runPendingRef = useRef<((choice: UnsavedChoice) => Promise<void>) | null>(null)

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
    pinsRef.current = pins
    transformRef.current = transformBox
    cloneSourceRef.current = cloneSource
    cropCornersRef.current = cropCorners
    adjustRef.current = adjust
    textValueRef.current = textValue
    textPointRef.current = textPoint
    errorRef.current = error
    dirtyRef.current = dirty
  }, [adjust, cloneSource, cropCorners, dirty, doc, draftPath, error, pins, polyPoints, selection, settings, shapeDraft, textPoint, textValue, tool, transformBox])


  /* ------------------------------------------------------ popup windows */

  /** True when popups can be real OS windows, i.e. under the desktop shell. */
  const windowedDialogs = Boolean(window.electronDialogApi)

  /** The seed values a popup needs, resolved at the moment it opens. */
  const dialogPayload = useCallback((name: DialogName): DialogPayload => {
    const current = docRef.current
    const canvas = current ? canvasesRef.current.get(current.activeLayerId) : null
    return {
      language: settingsRef.current.language,
      theme: settingsRef.current.theme,
      settings: settingsRef.current,
      adjust: { ...adjustRef.current, width: current?.width ?? 1280, height: current?.height ?? 720 },
      curves: name === 'curves' ? defaultCurves() : undefined,
      levels: name === 'levels' && canvas ? { ...autoLevels(canvas), gamma: 1 } : undefined,
      autoLevels: canvas ? autoLevels(canvas) : undefined,
      text: textValueRef.current,
      error: errorRef.current ?? undefined,
      print: name === 'print' && current ? printPreview(current, canvasesRef.current) : undefined,
      printers: name === 'print' ? printersRef.current : undefined,
      info: name === 'imageInfo' && current ? imageInfoSections(current, canvasesRef.current, settingsRef.current.language) : undefined,
      channels: current?.channels?.map(({ id, name: label }) => ({ id, name: label })),
      paths: current?.paths.map(({ id, name: label }) => ({ id, name: label })),
      patterns: current?.patterns?.map(({ id, name: label }) => ({ id, name: label })),
      textData: current?.layers.find((layer) => layer.id === current.activeLayerId && layer.kind === 'text')?.text,
      profile: { current: current?.profile ?? 'srgb', embedded: embeddedProfileRef.current ?? undefined },
      threeD: current?.layers.find((layer) => layer.id === current.activeLayerId)?.threeD,
      version: '1.0.0',
      creator: 'SHKWON (knix008@naver.com)',
    }
  }, [])

  /**
   * The browser build renders the popup in place. Its seeds are captured at the
   * moment it opens: rebuilding them on every settings change would reset the
   * editors' drafts mid-edit.
   */
  const [inPagePayload, setInPagePayload] = useState<DialogPayload | null>(null)

  /**
   * Opens a popup. On the desktop it becomes its own movable window; asking for
   * one that is already open raises that window instead of making a second.
   * The browser build has no second window, so it renders in place.
   */
  /** `extra` carries the one or two facts a shared window needs to know which
   *  command opened it — there is no ref to reach for at that point. */
  const openDialog = useCallback((name: DialogName, extra?: Partial<DialogPayload>) => {
    // An action replays the answer a window was given, so opening the window
    // would only stop and wait for someone who is not there.
    if (replayingAction) {
      return
    }
    const payload = { ...dialogPayload(name), ...extra }
    if (window.electronDialogApi) {
      // Never swallow a failure: if the window cannot be created the popup must
      // still appear in page rather than the button doing nothing at all.
      window.electronDialogApi.open(name, payload).then((opened) => {
        if (!opened) {
          setInPagePayload(payload)
          setDialog(name)
        }
      }).catch(() => {
        setInPagePayload(payload)
        setDialog(name)
      })
      return
    }
    setInPagePayload(payload)
    setDialog(name)
  }, [dialogPayload])

  /** Popups seeded from the old document would show stale values. */
  const openDialogRef = useRef<(name: DialogName) => void>(() => {})
  useEffect(() => { openDialogRef.current = openDialog }, [openDialog])

  const closeAllDialogs = useCallback(() => {
    if (window.electronDialogApi) {
      void window.electronDialogApi.closeAll()
      return
    }
    setDialog(null)
  }, [])

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
    closeAllDialogs()
    moveOriginRef.current.clear()
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
  }, [bump, closeAllDialogs])

  const updateDoc = useCallback((updater: (current: PhotoDocument) => PhotoDocument) => {
    setDoc((current) => (current ? updater(current) : current))
    markDirty()
  }, [markDirty])


  /* -------------------------------------------------------- error reports */

  /**
   * The single entry point for anything that went wrong. Builds a report the
   * user can read and paste, and shows it in the error popup — silent failures
   * left nothing to act on.
   */
  const reportError = useCallback((action: string, error: unknown, source = 'main') => {
    const current = docRef.current
    const report = buildErrorReport(error, {
      action,
      source,
      extra: {
        Document: current ? `${current.name} ${current.width}x${current.height}` : 'none',
        Layers: current?.layers.length,
        Tool: toolRef.current,
        Zoom: settingsRef.current.zoom,
      },
    })
    setError(report)
    errorRef.current = report
    openDialogRef.current('error')
  }, [])

  const reportErrorRef = useRef(reportError)
  useEffect(() => { reportErrorRef.current = reportError }, [reportError])

  /** Runs `fn`, reporting anything it throws (or rejects with) as `action`. */
  const guard = useCallback(<T,>(action: string, fn: () => T): T | undefined => {
    try {
      const value = fn()
      if (value && typeof (value as { catch?: unknown }).catch === 'function') {
        void (value as unknown as Promise<unknown>).catch((error) => reportErrorRef.current(action, error))
      }
      return value
    } catch (error) {
      reportErrorRef.current(action, error)
      return undefined
    }
  }, [])

  // Anything that escapes a handler entirely — a bug in a filter, a broken
  // image decode — still reaches the user instead of only the dev console.
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      reportErrorRef.current(t(settingsRef.current.language, 'errorUnexpected'), event.error ?? event.message)
    }
    const onRejection = (event: PromiseRejectionEvent) => {
      reportErrorRef.current(t(settingsRef.current.language, 'errorUnexpected'), event.reason)
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  // Failures inside a popup window are in another renderer; the main window
  // shows them so they are not lost with the window that produced them.
  useEffect(() => window.electronDialogApi?.onError?.(({ source, message, details }) => {
    const report = { title: t(settingsRef.current.language, 'errorInWindow'), message, details }
    setError(report)
    errorRef.current = report
    openDialogRef.current('error')
    void source
  }), [])

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
    if (pins.length > 0) {
      // Puppet pins: a ring where the pin was put down, and a line to where it
      // has been dragged, so the pull is visible before it is applied.
      ctx.save()
      ctx.setLineDash([])
      ctx.lineWidth = 1.5 / zoom
      for (const pin of pins) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)'
        ctx.beginPath()
        ctx.moveTo(pin.from.x, pin.from.y)
        ctx.lineTo(pin.to.x, pin.to.y)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(pin.to.x, pin.to.y, 5 / zoom, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(56, 189, 248, 0.35)'
        ctx.fill()
        ctx.stroke()
      }
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

    if (settings.showGrid) {
      // Drawn onto the viewport, not as a CSS background: the canvas is opaque
      // and would hide anything painted behind it.
      const step = tickStep(zoom, 48)
      ctx.save()
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid-line') || 'rgba(255,255,255,0.12)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let value = 0; value <= documentModel.width; value += step) {
        const x = Math.round(left + value * zoom) + 0.5
        ctx.moveTo(x, top)
        ctx.lineTo(x, top + dh)
      }
      for (let value = 0; value <= documentModel.height; value += step) {
        const y = Math.round(top + value * zoom) + 0.5
        ctx.moveTo(left, y)
        ctx.lineTo(left + dw, y)
      }
      ctx.stroke()
      ctx.restore()
    }

    if (settings.showRulers) {
      const style = getComputedStyle(document.documentElement)
      drawRulers(ctx, { width, height }, documentModel, { x: left, y: top }, zoom, {
        bg: style.getPropertyValue('--toolbar-bg') || '#151b22',
        line: style.getPropertyValue('--border') || 'rgba(255,255,255,0.18)',
        text: style.getPropertyValue('--muted') || '#94a3b8',
        accent: style.getPropertyValue('--accent') || '#38bdf8',
      })
    }

  }, [activePathId, crop, cropCorners, dash, doc, draftPath, frame, pan.x, pan.y, pins, polyPoints, selection, settings.showGrid, settings.showPaths, settings.showRulers, settings.theme, settings.zoom, shapeDraft, transformBox, viewAngle])

  /** The four thumbnails in the channels panel, in the order they are shown. */
  const channelPreviews = [
    { key: 'rgb', label: 'channelRgb' },
    { key: 'r', label: 'channelRed' },
    { key: 'g', label: 'channelGreen' },
    { key: 'b', label: 'channelBlue' },
  ] as const

  useEffect(() => {
    if (settings.rightTab !== 'channels') {
      return
    }
    const composite = compositeDocument(doc, canvasesRef.current)
    const width = 96
    const height = Math.max(1, Math.round((width * composite.height) / composite.width))
    const small = resizeCanvasContent(composite, width, height)
    for (const preview of channelPreviews) {
      const target = document.getElementById(`channel-canvas-${preview.key}`) as HTMLCanvasElement | null
      if (!target) continue
      target.width = width
      target.height = height
      const ctx = context2d(target)
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(preview.key === 'rgb' ? small : channelCanvas(small, preview.key), 0, 0)
    }
  })

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
    reportErrorRef.current(`${title} — ${message}`, details)
  }, [])

  const guardUnsaved = useCallback((action: 'new' | 'open' | 'close' | 'quit') => {
    if (dirty) {
      setPendingAction(action)
      openDialog('unsaved')
      return false
    }
    return true
  }, [dirty, openDialog])

  const openFiles = useCallback(async (files: { name: string; mime?: string; text?: string; dataUrl?: string; arrayBuffer?: ArrayBuffer; path?: string; size?: number }[], mode: 'open' | 'place') => {
    try {
      for (const file of files) {
        const decoded = await decodeImageSource(file)
        // The profile the file was tagged with, for the profile window to show.
        embeddedProfileRef.current = decoded.kind === 'canvas'
          ? decoded.details?.find((row) => row.label === 'Colour profile')?.value ?? null
          : null
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
            source: {
              name: file.name,
              path: file.path,
              mime: file.mime,
              byteSize: file.size,
              details: decoded.details ?? [],
            },
            profile: 'srgb',
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
      const dataUrl = await encodeExport(composite, format, undefined, settingsRef.current.exportTransparent, doc.depth ?? 8)
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


  /**
   * Hands the flattened document to the platform's print dialog. Transparency
   * has no meaning on paper, so the image goes onto white first — the same
   * sheet the preview shows.
   */
  /**
   * Prints the flattened document.
   *
   * On the desktop the print window has already asked for the printer, the
   * orientation and the number of copies, so the job goes straight out — there
   * is no second dialog asking the same questions again. In a browser there is
   * no way to print except through the system dialog, so that one is opened,
   * and it carries its own preview.
   */
  const printDocument = useCallback(async (orientation: PageOrientation, deviceName?: string, copies = 1) => {
    const current = docRef.current
    if (!current) {
      return
    }
    try {
      const composite = flattenOnto(compositeDocument(current, canvasesRef.current))
      const title = current.name || tr('untitled')
      const html = printableDocument(canvasToDataUrl(composite), title, orientation)
      if (window.electronPrintApi) {
        const result = await window.electronPrintApi.print({
          html,
          deviceName,
          landscape: orientation === 'landscape',
          copies,
        })
        if (!result.ok) {
          throw new Error(result.message ?? tr('printFailed'))
        }
        setSavedNote(true)
        window.setTimeout(() => setSavedNote(false), 1600)
        return
      }
      await printDataUrl(canvasToDataUrl(composite), title, orientation)
    } catch (cause) {
      showError(tr('print'), tr('printFailed'), cause)
    }
  }, [showError, tr])

  /** The printers the desktop shell can see, read once when the app starts. */
  useEffect(() => {
    let live = true
    void window.electronPrintApi?.printers().then((list) => {
      if (live) printersRef.current = list
    }).catch(() => {})
    return () => { live = false }
  }, [])

  const exportSlice = useCallback(async (slice: SliceRect) => {
    const current = docRef.current
    if (!current) return
    try {
      const flat = compositeDocument(current, canvasesRef.current)
      const dataUrl = await encodeExport(cropToRect(flat, slice), settingsRef.current.exportFormat, undefined, settingsRef.current.exportTransparent)
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
    moveOriginRef.current.clear()
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
    moveOriginRef.current.clear()
    setDoc(next.document)
    markDirty()
  }, [markDirty])

  const withLayer = useCallback((fn: (canvas: HTMLCanvasElement, layer: NonNullable<typeof activeLayer>) => void, record = true) => {
    const current = docRef.current
    const layer = current?.layers.find((item) => item.id === current.activeLayerId)
    const canvas = current ? canvasesRef.current.get(current.activeLayerId) : null
    const language = settingsRef.current.language
    if (!current || !layer || !canvas) {
      setStatus('noLayer')
      reportErrorRef.current(t(language, 'noLayerTitle'), new Error(t(language, 'noLayerBody')))
      return false
    }
    if (layer.locked) {
      setStatus('lockedLayer')
      reportErrorRef.current(t(language, 'lockedLayerTitle'), new Error(t(language, 'lockedLayerBody')))
      return false
    }
    if (record) {
      snapshot()
    }
    fn(canvas, layer)
    // The pristine copy the move tool replays from is no longer pristine.
    moveOriginRef.current.delete(layer.id)
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
    moveOriginRef.current.clear()
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
    moveOriginRef.current.delete(current.activeLayerId)
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

  // The drafts now live inside the popup itself; dialogPayload() seeds them.
  const openCurves = useCallback(() => openDialog('curves'), [openDialog])
  const openLevels = useCallback(() => openDialog('levels'), [openDialog])

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
          shape: {
            spacing: options.brushSpacing,
            angle: options.brushAngle,
            roundness: options.brushRoundness,
            scatter: options.brushScatter,
          },
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

    if (currentTool === 'puppet') {
      // Near an existing pin, this drag moves it; anywhere else it puts a new
      // pin down, which is what holds that part of the picture still.
      const near = pinsRef.current.findIndex((pin) => Math.hypot(pin.to.x - point.x, pin.to.y - point.y) < 12 / options.zoom)
      if (near < 0) {
        setPins((current) => [...current, { from: point, to: point }])
        return
      }
      dragRef.current = { mode: 'puppet', pin: near, start: point, last: point, points: [], layerX: 0, layerY: 0 }
      return
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
      openDialog('text')
      return
    }

    /* ------------------------------------------------------------- paths */
    if (currentTool === 'pen' || currentTool === 'curvaturePen') {
      // Clicking the first anchor again closes the path, as pen tools do.
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
      const layerId = doc.activeLayerId
      if (!moveOriginRef.current.has(layerId)) {
        const source = canvasesRef.current.get(layerId)
        if (source) moveOriginRef.current.set(layerId, { canvas: cloneCanvas(source), dx: 0, dy: 0 })
      }
      const origin = moveOriginRef.current.get(layerId)
      dragRef.current = {
        mode: 'move', start: point, last: point, points: [],
        layerX: origin?.dx ?? 0, layerY: origin?.dy ?? 0,
      }
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

    if (drag.mode === 'puppet') {
      const index = drag.pin ?? -1
      setPins((current) => current.map((pin, at) => (at === index ? { ...pin, to: point } : pin)))
      return
    }
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
      // Replayed from the pristine copy at the total offset, so pixels pushed
      // off the canvas come back whenever the layer is dragged back — however
      // many separate drags that takes.
      const origin = moveOriginRef.current.get(doc.activeLayerId)
      if (!origin) return
      const dx = Math.round(point.x - drag.start.x) + drag.layerX
      const dy = Math.round(point.y - drag.start.y) + drag.layerY
      if (dx !== origin.dx || dy !== origin.dy) {
        canvasesRef.current.set(doc.activeLayerId, padCanvas(origin.canvas, origin.canvas.width, origin.canvas.height, dx, dy))
        origin.dx = dx
        origin.dy = dy
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

  /* --------------------------------------------------------- puppet warp */

  const commitPuppet = useCallback(() => {
    const placed = pinsRef.current
    setPins([])
    if (placed.length < 2 || !placed.some((pin) => pin.from.x !== pin.to.x || pin.from.y !== pin.to.y)) {
      return
    }
    withLayer((canvas) => {
      const warped = puppetWarp(cloneCanvas(canvas), placed)
      const ctx = context2d(canvas)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(warped, 0, 0)
    })
  }, [withLayer])

  const cancelPuppet = useCallback(() => setPins([]), [])

  /* --------------------------------------------------------------- actions */

  /**
   * Recording and replaying commands.
   *
   * Every menu and toolbar click already funnels through `runCommand`, and
   * every window answer through `applyDialogResult`, so recording is a matter
   * of noting what went past. Replaying pushes the same things back through,
   * with the windows suppressed: the recorded answer is applied in place of
   * opening one, which is what makes an action run without anyone watching.
   */
  const [recording, setRecording] = useState<ActionStep[] | null>(null)
  const recordingRef = useRef<ActionStep[] | null>(null)
  useEffect(() => { recordingRef.current = recording }, [recording])

  const noteCommand = (command: string) => {
    if (!recordingRef.current || replayingAction) return
    // The recorder's own controls would otherwise record themselves.
    if (command.startsWith('action.')) return
    setRecording((steps) => (steps ? [...steps, { command }] : steps))
  }

  const noteDialogResult = (dialog: DialogName, result: DialogResult) => {
    if (!recordingRef.current || replayingAction) return
    setRecording((steps) => (steps ? [...steps, { command: '', dialog, result: result as Record<string, unknown> }] : steps))
  }

  const saveRecording = (name: string) => {
    const steps = recordingRef.current ?? []
    setRecording(null)
    if (!steps.length) return
    const action: ActionScript = { id: createId('action'), name, steps }
    setSettings((current) => ({ ...current, actions: [...current.actions, action] }))
  }

  const playAction = useCallback((action: ActionScript) => {
    replayingAction = true
    try {
      for (const step of action.steps) {
        if (step.dialog) {
          applyDialogResultRef.current(step.dialog as DialogName, (step.result ?? {}) as DialogResult)
        } else if (step.command) {
          runCommandRef.current(step.command)
        }
      }
    } finally {
      replayingAction = false
    }
  }, [])

  const deleteAction = (id: string) => {
    setSettings((current) => ({ ...current, actions: current.actions.filter((action) => action.id !== id) }))
  }

  /**
   * Runs an action over a folder of files: each is opened, put through the
   * steps and exported in the current format. The files are handled one at a
   * time so a failure names the file it happened on.
   */
  const runBatch = useCallback(async (action: ActionScript) => {
    const picker = window.electronFileApi
    if (!picker) {
      showError(tr('batch'), tr('batchDesktopOnly'), new Error(tr('batchDesktopOnly')))
      return
    }
    const chosen = await picker.openFiles()
    if (chosen.canceled || !chosen.files.length) {
      return
    }
    setStatus('working')
    for (const file of chosen.files) {
      try {
        await openFiles([file], 'open')
        playAction(action)
        await exportImage(settingsRef.current.exportFormat)
      } catch (cause) {
        showError(tr('batch'), file.name, cause)
        break
      }
    }
    setStatus('ready')
  }, [exportImage, openFiles, playAction, showError, tr])

  /* ------------------------------------------------------- layer comps */

  /** Remembers which layers are showing, and how, so it can be put back. */
  const captureComp = (name: string) => {
    const current = docRef.current
    if (!current) return
    snapshot()
    const comp: LayerComp = {
      id: createId('comp'),
      name,
      states: current.layers.map((layer) => ({
        layerId: layer.id,
        visible: layer.visible,
        opacity: layer.opacity,
        blendMode: layer.blendMode,
      })),
    }
    updateDoc((document) => ({ ...document, comps: [...(document.comps ?? []), comp] }))
  }

  const applyComp = (id: string) => {
    const current = docRef.current
    const comp = current?.comps?.find((item) => item.id === id)
    if (!current || !comp) return
    snapshot()
    updateDoc((document) => ({
      ...document,
      layers: document.layers.map((layer) => {
        const state = comp.states.find((item) => item.layerId === layer.id)
        // A layer added after the comp was taken is left as it is.
        return state ? { ...layer, visible: state.visible, opacity: state.opacity, blendMode: state.blendMode } : layer
      }),
    }))
  }

  const deleteComp = (id: string) => {
    snapshot()
    updateDoc((document) => ({ ...document, comps: (document.comps ?? []).filter((item) => item.id !== id) }))
  }

  /* ------------------------------------------------------------ transforms */

  /**
   * Runs a transform that hands back a new canvas, and puts the result into the
   * layer. The transforms themselves never work in place, so this is the one
   * place that decides a preview has been accepted.
   */
  const replaceLayerWith = (make: (source: HTMLCanvasElement) => HTMLCanvasElement) => {
    withLayer((canvas) => {
      const result = make(cloneCanvas(canvas))
      const ctx = context2d(canvas)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(result, 0, 0)
    })
  }

  /**
   * Seam carving resizes the document, so every layer has to be carved with the
   * same seams — which are chosen from the flattened image, not from one layer.
   */
  const applyContentAwareScale = (width: number, height: number, protectSkin = true) => {
    const current = docRef.current
    if (!current || width < 8 || height < 8) return
    snapshot()
    const order = current.layers.map((layer) => layer.id)
    const sources = order.map((id) => canvasesRef.current.get(id) ?? createCanvas(current.width, current.height))
    const carved = contentAwareScaleLayers(sources, compositeDocument(current, canvasesRef.current), width, height, protectSkin)
    const next = new Map<string, HTMLCanvasElement>()
    order.forEach((id, index) => next.set(id, carved[index]))
    canvasesRef.current = next
    moveOriginRef.current.clear()
    setDoc({ ...cloneDocument(current), width: carved[0]?.width ?? width, height: carved[0]?.height ?? height })
    markDirty()
  }

  /* ------------------------------------------------------------- channels */

  /** Keeps the current selection as an alpha channel on the document. */
  const saveSelectionAs = (name: string) => {
    const current = docRef.current
    if (!current) return
    snapshot()
    const channel = selectionToChannel(createId('channel'), name, selectionRef.current, current.width, current.height)
    updateDoc((document) => ({ ...document, channels: [...(document.channels ?? []), channel] }))
  }

  /** Brings a saved channel back, on its own or combined with what is selected. */
  const loadSelectionFrom = (channelId: string, mode: ChannelCombine) => {
    const current = docRef.current
    const channel = current?.channels?.find((item) => item.id === channelId)
    if (!current || !channel) return
    const existing = selectionToMask(selectionRef.current, current.width, current.height)
    const mask = combineMasks(existing, channel.mask, mode)
    setSelection({ kind: 'mask', ...maskBounds(mask, current.width, current.height), mask })
  }

  const deleteChannel = (channelId: string) => {
    snapshot()
    updateDoc((document) => ({ ...document, channels: (document.channels ?? []).filter((item) => item.id !== channelId) }))
  }

  /* ---------------------------------------------------- smart objects and filters */

  /**
   * Freezes what the layer draws now as an untouched original, which the
   * compositor then places into the document on every render. Scaling the layer
   * after this only changes how the original is placed, so the pixels never
   * lose anything.
   */
  const convertToSmartObject = () => {
    const current = docRef.current
    const layer = current?.layers.find((item) => item.id === current.activeLayerId)
    if (!current || !layer || layer.smart || layer.kind === 'group' || layer.kind === 'adjustment') {
      return
    }
    snapshot()
    const alone = { ...layer, opacity: 1, blendMode: 'source-over' as const, clipped: false, maskEnabled: false, smartFilters: [] }
    const original = compositeDocument({ ...current, background: 'transparent', layers: [alone] }, canvasesRef.current)
    canvasesRef.current.set(smartSourceKey(layer.id), original)
    updateDoc((document) => ({
      ...document,
      layers: document.layers.map((item) => (
        item.id === layer.id
          ? {
            ...item,
            kind: 'raster' as const,
            smart: true,
            smartTransform: { scaleX: 1, scaleY: 1, rotate: 0, x: 0, y: 0 },
            smartFilters: item.smartFilters ?? [],
            text: undefined,
            shape: undefined,
            fill: undefined,
          }
          : item
      )),
    }))
  }

  /** Puts a gallery filter on the active smart layer instead of into its pixels. */
  const addSmartFilter = (filterId: string) => {
    const current = docRef.current
    if (!current) return
    snapshot()
    const entry: SmartFilter = {
      id: createId('smart'),
      filter: filterId,
      enabled: true,
      radius: adjustRef.current.radius,
      amount: adjustRef.current.amount,
    }
    updateDoc((document) => ({
      ...document,
      layers: document.layers.map((layer) => (
        layer.id === document.activeLayerId
          ? { ...layer, smartFilters: [...(layer.smartFilters ?? []), entry] }
          : layer
      )),
    }))
  }

  const patchSmartFilter = (filterId: string, patch: Partial<SmartFilter>) => {
    updateDoc((document) => ({
      ...document,
      layers: document.layers.map((layer) => (
        layer.id === document.activeLayerId
          ? { ...layer, smartFilters: (layer.smartFilters ?? []).map((item) => (item.id === filterId ? { ...item, ...patch } : item)) }
          : layer
      )),
    }))
  }

  const removeSmartFilter = (filterId: string) => {
    snapshot()
    updateDoc((document) => ({
      ...document,
      layers: document.layers.map((layer) => (
        layer.id === document.activeLayerId
          ? { ...layer, smartFilters: (layer.smartFilters ?? []).filter((item) => item.id !== filterId) }
          : layer
      )),
    }))
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

  /* --------------------------------------------------------------- clipboard */

  /** What the last copy took. Kept here so a paste works with no OS permission. */
  const clipboardRef = useRef<HTMLCanvasElement | null>(null)
  /** The selection Deselect threw away, so Reselect can put it back. */
  const lastSelectionRef = useRef<Selection | null>(null)
  /** Deselect keeps what it dropped, so Reselect has something to restore. */
  const deselect = () => {
    if (selectionRef.current) lastSelectionRef.current = selectionRef.current
    setSelection(null)
  }

  /** What the selection commands read: the active layer, or the flat image. */
  const selectionSource = () => {
    const current = docRef.current
    if (!current) return null
    return canvasesRef.current.get(current.activeLayerId) ?? compositeDocument(current, canvasesRef.current)
  }

  /** Just the selected pixels, cropped to the selection's own bounds. */
  const selectedPixels = (merged: boolean) => {
    const current = docRef.current
    if (!current) return null
    const source = merged
      ? compositeDocument(current, canvasesRef.current)
      : canvasesRef.current.get(current.activeLayerId)
    if (!source) return null
    const bounds = selectionBounds(selectionRef.current, current)
    const clipped = clipCanvasToSelection(cloneCanvas(source), selectionRef.current)
    const cut = createCanvas(bounds.width, bounds.height)
    context2d(cut).drawImage(clipped, -bounds.x, -bounds.y)
    return cut
  }

  /**
   * Copies to the editor's own clipboard, and to the system's where the browser
   * allows it — so the pixels can be pasted into another program too. A refusal
   * there is not a reason to lose the copy, so it is deliberately swallowed.
   */
  const copySelection = useCallback((merged: boolean) => {
    const pixels = selectedPixels(merged)
    if (!pixels) return
    clipboardRef.current = pixels
    try {
      if (navigator.clipboard?.write && typeof ClipboardItem === 'function') {
        pixels.toBlob((blob) => {
          if (blob) void navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(() => {})
        })
      }
    } catch {
      // No system clipboard here; the in-app one still has the pixels.
    }
  }, [])

  /** Opaque white where the selection is: what a layer mask reads. */
  const maskCanvasFromSelection = (selection: Selection | null, width: number, height: number) => {
    const canvas = createCanvas(width, height)
    const ctx = context2d(canvas)
    const mask = selectionToMask(selection, width, height)
    if (!mask) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      return canvas
    }
    const image = ctx.createImageData(width, height)
    for (let i = 0; i < mask.length; i += 1) {
      image.data[i * 4] = 255
      image.data[i * 4 + 1] = 255
      image.data[i * 4 + 2] = 255
      image.data[i * 4 + 3] = mask[i]
    }
    ctx.putImageData(image, 0, 0)
    return canvas
  }

  /** Drops the clipboard in as a new layer; `into` masks it with the selection. */
  const pasteClipboard = useCallback((into: boolean) => {
    const current = docRef.current
    const pixels = clipboardRef.current
    if (!current) return
    if (!pixels) {
      showError(tr('paste'), tr('clipboardEmpty'), new Error(tr('clipboardEmpty')))
      return
    }
    snapshot()
    const selection = selectionRef.current
    const bounds = selectionBounds(selection, current)
    const layer = createLayerMeta(tr('paste'))
    const canvas = createCanvas(current.width, current.height)
    // Into a selection it lands there; otherwise in the middle of the document.
    const x = selection ? bounds.x : Math.round((current.width - pixels.width) / 2)
    const y = selection ? bounds.y : Math.round((current.height - pixels.height) / 2)
    context2d(canvas).drawImage(pixels, x, y)
    canvasesRef.current.set(layer.id, canvas)
    if (into && selection) {
      canvasesRef.current.set(`${layer.id}:mask`, maskCanvasFromSelection(selection, current.width, current.height))
      layer.maskEnabled = true
    }
    updateDoc((document) => ({ ...document, layers: [...document.layers, layer], activeLayerId: layer.id }))
  }, [showError, snapshot, tr, updateDoc])

  /* ------------------------------------------------------------ animation */

  /** Which frame the preview is showing, or null when it is not running. */
  const [playingFrame, setPlayingFrame] = useState<number | null>(null)
  const playTimerRef = useRef<number | null>(null)

  /** Keeps what is showing now as a frame of the animation. */
  const captureAnimationFrame = () => {
    const current = docRef.current
    if (!current) return
    snapshot()
    const visible: Record<string, boolean> = {}
    for (const layer of current.layers) {
      visible[layer.id] = layer.visible
    }
    const frame: AnimationFrame = { id: createId('frame'), delayMs: 120, visible }
    updateDoc((document) => ({ ...document, animation: [...(document.animation ?? []), frame] }))
  }

  /** Shows one frame by switching the layers to what it recorded. */
  const showAnimationFrame = useCallback((id: string) => {
    const current = docRef.current
    const frame = current?.animation?.find((item) => item.id === id)
    if (!current || !frame) return
    updateDoc((document) => ({
      ...document,
      layers: document.layers.map((layer) => ({ ...layer, visible: frame.visible[layer.id] ?? layer.visible })),
    }))
  }, [updateDoc])

  const patchAnimationFrame = (id: string, patch: Partial<AnimationFrame>) => {
    updateDoc((document) => ({
      ...document,
      animation: (document.animation ?? []).map((frame) => (frame.id === id ? { ...frame, ...patch } : frame)),
    }))
  }

  const deleteAnimationFrame = (id: string) => {
    snapshot()
    updateDoc((document) => ({ ...document, animation: (document.animation ?? []).filter((frame) => frame.id !== id) }))
  }

  const stopPlayback = useCallback(() => {
    if (playTimerRef.current !== null) {
      window.clearTimeout(playTimerRef.current)
      playTimerRef.current = null
    }
    setPlayingFrame(null)
  }, [])

  /**
   * Runs the animation in the document itself, one frame at a time. Each frame
   * schedules the next from its own delay, so frames of different lengths play
   * at the lengths they were given.
   */
  const startPlayback = useCallback(() => {
    const frames = docRef.current?.animation ?? []
    if (frames.length < 2) return
    let index = 0
    const step = () => {
      const list = docRef.current?.animation ?? []
      if (!list.length) {
        stopPlayback()
        return
      }
      const frame = list[index % list.length]
      setPlayingFrame(index % list.length)
      showAnimationFrame(frame.id)
      index += 1
      playTimerRef.current = window.setTimeout(step, Math.max(20, frame.delayMs))
    }
    step()
  }, [showAnimationFrame, stopPlayback])

  useEffect(() => () => {
    if (playTimerRef.current !== null) window.clearTimeout(playTimerRef.current)
  }, [])

  /** Each frame composited on its own, which is what an encoder is handed. */
  const animationFrameCanvases = () => {
    const current = docRef.current
    if (!current?.animation?.length) return []
    return current.animation.map((frame) => ({
      canvas: compositeDocument(
        { ...current, layers: current.layers.map((layer) => ({ ...layer, visible: frame.visible[layer.id] ?? layer.visible })) },
        canvasesRef.current,
      ),
      delayMs: frame.delayMs,
    }))
  }

  const exportAnimatedGif = async () => {
    const frames = animationFrameCanvases()
    if (!frames.length) return
    try {
      const dataUrl = gifDataUrl(frames)
      const fileName = `${docRef.current?.name || tr('untitled')}.gif`
      if (window.electronFileApi) {
        await window.electronFileApi.saveFile({ fileName, filters: [{ name: 'GIF', extensions: ['gif'] }], dataUrl })
      } else {
        downloadDataUrl(dataUrl, fileName)
      }
      setSavedNote(true)
    } catch (cause) {
      showError(tr('exportGif'), tr('exportFailed'), cause)
    }
  }

  /* ---------------------------------------------------------------- video */

  /** Samples a video file and drops each frame in as a layer and a frame. */
  const importVideo = async (file: Blob, name: string) => {
    try {
      setStatus('working')
      const frames = await extractVideoFrames(file, 12)
      if (!frames.length) return
      snapshot()
      const first = frames[0].canvas
      const layers: LayerMeta[] = []
      const canvases = new Map<string, HTMLCanvasElement>()
      const animation: AnimationFrame[] = []
      frames.forEach((frame, index) => {
        const layer = createLayerMeta(`${name} ${index + 1}`)
        layer.visible = index === 0
        canvases.set(layer.id, frame.canvas)
        layers.push(layer)
      })
      // One animation frame per layer, each showing only its own.
      layers.forEach((layer) => {
        const visible: Record<string, boolean> = {}
        for (const other of layers) visible[other.id] = other.id === layer.id
        animation.push({ id: createId('frame'), delayMs: 120, visible })
      })
      const next: PhotoDocument = {
        name: name.replace(/\.[^.]+$/, ''),
        width: first.width,
        height: first.height,
        background: 'transparent',
        layers,
        activeLayerId: layers[0].id,
        guides: [],
        notes: [],
        samplers: [],
        counts: [],
        paths: [],
        slices: [],
        frames: [],
        measure: null,
        colorMode: 'rgb',
        animation,
      }
      replaceDocument(next, canvases)
      requestAnimationFrame(() => fitZoom(next))
      setSettings((current) => ({ ...current, rightTab: 'timeline' }))
    } catch (cause) {
      showError(tr('importVideo'), tr('openFailed'), cause)
    } finally {
      setStatus('ready')
    }
  }

  const exportVideo = async () => {
    const frames = animationFrameCanvases()
    if (!frames.length) return
    try {
      setStatus('working')
      const blob = await recordFrames(frames)
      const reader = new FileReader()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('The recording could not be read back'))
        reader.readAsDataURL(blob)
      })
      const fileName = `${docRef.current?.name || tr('untitled')}.webm`
      if (window.electronFileApi) {
        await window.electronFileApi.saveFile({ fileName, filters: [{ name: 'WebM', extensions: ['webm'] }], dataUrl })
      } else {
        downloadDataUrl(dataUrl, fileName)
      }
      setSavedNote(true)
    } catch (cause) {
      showError(tr('exportVideo'), tr('exportFailed'), cause)
    } finally {
      setStatus('ready')
    }
  }

  /* ------------------------------------------------------------- patterns */

  /** Takes the selection (or the whole layer) and keeps it as a tile. */
  const definePatternFromSelection = () => {
    const current = docRef.current
    const source = current ? canvasesRef.current.get(current.activeLayerId) : null
    if (!current || !source) return
    snapshot()
    const tile = makePatternTile(source, selectionRef.current)
    const pattern = definePattern(createId('pattern'), `${tr('pattern')} ${(current.patterns?.length ?? 0) + 1}`, tile)
    canvasesRef.current.set(patternKey(pattern.id), tile)
    updateDoc((document) => ({ ...document, patterns: [...(document.patterns ?? []), pattern] }))
  }

  /* ------------------------------------------------------------ fill / stroke */

  const fillSelection = (color: string, opacity: number, patternId?: string) => {
    const tile = patternId ? canvasesRef.current.get(patternKey(patternId)) : undefined
    withLayer((canvas) => {
      const paint = createCanvas(canvas.width, canvas.height)
      const pctx = context2d(paint)
      if (tile) {
        tileOnto(paint, tile, null)
      } else {
        pctx.fillStyle = color
        pctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      clipCanvasToSelection(paint, selectionRef.current)
      const ctx = context2d(canvas)
      ctx.save()
      ctx.globalAlpha = opacity
      ctx.drawImage(paint, 0, 0)
      ctx.restore()
    })
  }

  /**
   * Draws a line along the edge of the selection. The band of pixels it covers
   * is worked out from the selection itself, so it follows a lasso as readily
   * as a rectangle, and `where` picks the side of the edge it sits on.
   */
  const strokeSelection = (color: string, thickness: number, where: 'inside' | 'center' | 'outside') => {
    const current = docRef.current
    if (!current) return
    const selection = selectionRef.current
    if (!selection) {
      showError(tr('strokeCommand'), tr('noSelection'), new Error(tr('noSelection')))
      return
    }
    const { width, height } = current
    // Centred, the band is the whole width; on one side it is half of a band
    // twice as wide, with the other half dropped below.
    const band = borderSelection(selection, width, height, where === 'center' ? thickness : thickness * 2)
    const bandMask = selectionToMask(band, width, height)
    const inside = selectionToMask(selection, width, height)
    if (!bandMask) return
    const keep = new Uint8Array(bandMask.length)
    for (let i = 0; i < keep.length; i += 1) {
      if (!bandMask[i]) continue
      const isInside = inside ? inside[i] > 0 : true
      keep[i] = where === 'center' || (where === 'inside') === isInside ? 255 : 0
    }
    const rgb = hexToRgb(color)
    withLayer((canvas) => {
      const paint = createCanvas(width, height)
      const pctx = context2d(paint)
      const image = pctx.createImageData(width, height)
      for (let i = 0; i < keep.length; i += 1) {
        image.data[i * 4] = rgb.r
        image.data[i * 4 + 1] = rgb.g
        image.data[i * 4 + 2] = rgb.b
        image.data[i * 4 + 3] = keep[i]
      }
      pctx.putImageData(image, 0, 0)
      context2d(canvas).drawImage(paint, 0, 0)
    })
  }

  /* ----------------------------------------------------------- image / layers */

  /** Crops away the fully transparent border around everything visible. */
  const trimTransparent = () => {
    const current = docRef.current
    if (!current) return
    const composite = compositeDocument(current, canvasesRef.current)
    const data = context2d(composite).getImageData(0, 0, composite.width, composite.height).data
    let minX = composite.width
    let minY = composite.height
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < composite.height; y += 1) {
      for (let x = 0; x < composite.width; x += 1) {
        if (data[(y * composite.width + x) * 4 + 3] === 0) continue
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
    // Nothing visible, or nothing to cut away: leave the document alone.
    if (maxX < 0 || (minX === 0 && minY === 0 && maxX === composite.width - 1 && maxY === composite.height - 1)) {
      return
    }
    applyCrop({ kind: 'rect', x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
  }

  /** Flattens the visible layers into one, leaving the hidden ones alone. */
  const mergeVisible = () => {
    const current = docRef.current
    if (!current) return
    const visible = current.layers.filter((layer) => layer.visible && layer.kind !== 'group')
    if (visible.length < 2) return
    snapshot()
    const flat = compositeDocument({ ...current, background: 'transparent', layers: visible }, canvasesRef.current)
    const merged = createLayerMeta(tr('mergeVisible'))
    canvasesRef.current.set(merged.id, flat)
    const lowest = current.layers.findIndex((layer) => layer.id === visible[0].id)
    const kept = current.layers.filter((layer) => !visible.includes(layer))
    const layers = [...kept]
    layers.splice(Math.max(0, Math.min(lowest, kept.length)), 0, merged)
    updateDoc((document) => ({ ...document, layers, activeLayerId: merged.id }))
  }

  /**
   * Bakes what the layer draws into plain pixels: a text, shape or fill layer,
   * or a smart layer with its placement and filter stack applied for good.
   */
  const rasterizeLayer = () => {
    const current = docRef.current
    const layer = current?.layers.find((item) => item.id === current.activeLayerId)
    const alreadyFlat = layer?.kind === 'raster' && !layer.smart && !(layer.smartFilters ?? []).length
    if (!current || !layer || alreadyFlat || layer.kind === 'group' || layer.kind === 'adjustment') {
      return
    }
    snapshot()
    const alone = { ...layer, opacity: 1, blendMode: 'source-over' as const, clipped: false, maskEnabled: false }
    const flat = compositeDocument({ ...current, background: 'transparent', layers: [alone] }, canvasesRef.current)
    canvasesRef.current.delete(smartSourceKey(layer.id))
    canvasesRef.current.set(layer.id, flat)
    updateDoc((document) => ({
      ...document,
      layers: document.layers.map((item) => (
        item.id === layer.id
          ? {
            ...item,
            kind: 'raster' as const,
            smart: false,
            smartFilters: [],
            smartTransform: undefined,
            text: undefined,
            shape: undefined,
            fill: undefined,
          }
          : item
      )),
    }))
  }

  /** Clips the layer to the one below it, or lets it go again. */
  const toggleClipMask = () => {
    const current = docRef.current
    if (!current) return
    const index = current.layers.findIndex((layer) => layer.id === current.activeLayerId)
    // The bottom layer has nothing under it to be clipped to.
    if (index < 1) return
    snapshot()
    updateDoc((document) => ({
      ...document,
      layers: document.layers.map((layer, at) => (at === index ? { ...layer, clipped: !layer.clipped } : layer)),
    }))
  }

  const moveLayerToEdge = (edge: 'front' | 'back') => {
    const current = docRef.current
    if (!current) return
    const index = current.layers.findIndex((layer) => layer.id === current.activeLayerId)
    if (index < 0) return
    snapshot()
    updateDoc((document) => {
      const layers = [...document.layers]
      const [item] = layers.splice(index, 1)
      if (edge === 'front') layers.push(item)
      else layers.unshift(item)
      return { ...document, layers }
    })
  }

  const applyNamedFilter = (id: string) => {
    guard(`${tr('errorWhileFilter')}: ${tr(id)}`, () => applyNamedFilterUnguarded(id))
  }

  const applyNamedFilterUnguarded = (id: string) => {
    if (id === 'cameraRaw') {
      openDialog('cameraRaw')
      return
    }
    if (id === 'liquify') {
      setTool('smudge')
      return
    }
    // A smart layer takes the filter onto its stack instead of into its pixels.
    const layer = docRef.current?.layers.find((item) => item.id === docRef.current?.activeLayerId)
    if (layer?.smart) {
      addSmartFilter(id)
      return
    }
    withLayer((canvas) => {
      applyGalleryFilter(canvas, id, { radius: adjust.radius, amount: adjust.amount }, selectionRef.current)
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
    moveOriginRef.current.clear()
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
    moveOriginRef.current.clear()
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
    moveOriginRef.current.clear()
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
    if (action === 'new') openDialog('new')
    if (action === 'open') void pickFiles('open')
    if (action === 'close') closeDocument()
    if (action === 'quit') {
      await window.electronWindowApi?.forceClose()
    }
  }

  useEffect(() => {
    runPendingRef.current = runPending
  })

  useEffect(() => {
    return window.electronWindowApi?.onCloseRequest(() => {
      if (dirty) {
        setPendingAction('quit')
        openDialog('unsaved')
      } else {
        void window.electronWindowApi?.forceClose()
      }
    })
  }, [dirty, openDialog])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const accel = event.ctrlKey || event.metaKey
      const target = event.target as HTMLElement | null
      const typing = Boolean(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable))
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
      if (accel && key === 'p') {
        // Chromium would otherwise print the editor window itself.
        event.preventDefault()
        if (!doc) return
        if (window.electronPrintApi) openDialog('print')
        else void printDocument(naturalOrientation(compositeDocument(doc, canvasesRef.current)))
      }
      if (accel && key === 'n') {
        event.preventDefault()
        if (guardUnsaved('new')) openDialog('new')
      }
      if (accel && key === 'a' && doc) {
        event.preventDefault()
        setSelection(rectSelection(0, 0, doc.width, doc.height))
      }
      if (accel && key === 'd') {
        event.preventDefault()
        // Shift restores what the last Deselect dropped.
        if (event.shiftKey) {
          if (lastSelectionRef.current) setSelection(lastSelectionRef.current)
        } else {
          if (selectionRef.current) lastSelectionRef.current = selectionRef.current
          setSelection(null)
        }
      }
      // The clipboard keys, but never while the caret is in a field: there the
      // browser's own cut and paste is the one the user means.
      if (accel && (key === 'x' || key === 'c' || key === 'v') && !typing) {
        event.preventDefault()
        if (key === 'v') pasteClipboard(false)
        else {
          copySelection(key === 'c' && event.shiftKey)
          if (key === 'x') withLayer((canvas) => clearSelectionPixels(canvas, selectionRef.current))
        }
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
        if (pinsRef.current.length) {
          event.preventDefault()
          commitPuppet()
          return
        }
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
        cancelPuppet()
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
  }, [applyCrop, applyPerspectiveCrop, beginTransform, cancelPuppet, cancelTransform, closePolySelection, commitDraftPath, commitPuppet, commitTransform, copySelection, crop, dialog, dirty, doc, guardUnsaved, openDialog, pasteClipboard, pickFiles, printDocument, redo, saveProject, undo, withLayer])


  /**
   * Every menu-bar and toolbar entry funnels through here, so a command behaves
   * identically wherever it is invoked from and `commands.ts` stays pure data.
   */
  // A plain function, not a useCallback: it is only ever called from a click
  // handler, and memoising it would pull every layer command into a dependency
  // array that changes on every render anyway.
  const runCommand = (id: string) => {
    noteCommand(id)
    guard(`${tr('errorWhileCommand')}: ${id}`, () => runCommandUnguarded(id))
  }

  const runCommandUnguarded = (id: string) => {
    setMenu(null)
    setContextMenu(null)
    const current = docRef.current
    if (!current) return

    if (id.startsWith('adjLayer.')) {
      addAdjustment(id.slice('adjLayer.'.length) as AdjustmentType)
      return
    }

    switch (id) {
      /* file */
      case 'file.new': if (guardUnsaved('new')) openDialog('new'); return
      case 'file.open': if (guardUnsaved('open')) void pickFiles('open'); return
      case 'file.place': void pickFiles('place'); return
      case 'file.save': void saveProject(false); return
      case 'file.saveAs': void saveProject(true); return
      case 'file.export': openDialog('export'); return
      // The desktop print window prints for itself; a browser can only reach
      // the system dialog, so going through ours first would ask twice.
      case 'file.print':
        if (window.electronPrintApi) openDialog('print')
        else void printDocument(naturalOrientation(current))
        return
      case 'file.importVideo': videoRef.current?.click(); return
      case 'file.exportGif': void exportAnimatedGif(); return
      case 'file.exportVideo': void exportVideo(); return
      case 'file.close': if (guardUnsaved('close')) closeDocument(); return

      /* edit */
      case 'edit.undo': undo(); return
      case 'edit.redo': redo(); return
      case 'edit.freeTransform': beginTransform(); return
      case 'edit.deletePixels': withLayer((canvas) => clearSelectionPixels(canvas, selectionRef.current)); return
      case 'edit.cut': copySelection(false); withLayer((canvas) => clearSelectionPixels(canvas, selectionRef.current)); return
      case 'edit.copy': copySelection(false); return
      case 'edit.copyMerged': copySelection(true); return
      case 'edit.paste': pasteClipboard(false); return
      case 'edit.pasteInto': pasteClipboard(true); return
      case 'edit.fill': openDialog('fill'); return
      case 'edit.definePattern': definePatternFromSelection(); return
      case 'edit.skew': openDialog('skew'); return
      case 'edit.distort': openDialog('distort'); return
      case 'edit.perspective': openDialog('perspective'); return
      case 'edit.warp': openDialog('warp'); return
      case 'edit.puppet': setTool('puppet'); return
      case 'edit.contentScale': openDialog('contentScale'); return
      case 'edit.stroke': openDialog('stroke'); return
      case 'edit.contentAware':
      case 'edit.genFill': withLayer((canvas) => contentAwareFill(canvas, selectionRef.current)); return
      case 'edit.genExpand': {
        const layer = current.layers.find((item) => item.id === current.activeLayerId)
        const source = layer ? canvasesRef.current.get(layer.id) : null
        if (!source) return
        snapshot()
        const expanded = generativeExpand(source, current.width + 160, current.height + 160, 80, 80)
        canvasesRef.current.set(layer!.id, expanded)
        setDoc({ ...current, width: expanded.width, height: expanded.height })
        markDirty()
        return
      }
      case 'edit.genUpscale': {
        const layer = current.layers.find((item) => item.id === current.activeLayerId)
        const source = layer ? canvasesRef.current.get(layer.id) : null
        if (!source) return
        snapshot()
        const up = generativeUpscale(source, 2)
        canvasesRef.current.set(layer!.id, up)
        setDoc({ ...current, width: up.width, height: up.height })
        markDirty()
        return
      }
      case 'edit.harmonize': withLayer((canvas) => harmonize(canvas, selectionRef.current)); return

      /* image */
      case 'image.size': setAdjust((c) => ({ ...c, width: current.width, height: current.height })); openDialog('imageSize'); return
      case 'image.canvasSize': setAdjust((c) => ({ ...c, width: current.width, height: current.height })); openDialog('canvasSize'); return
      case 'image.rotateCW': rotateDoc(1); return
      case 'image.rotateCCW': rotateDoc(3); return
      case 'image.flipH': flipDocument('x'); return
      case 'image.flipV': flipDocument('y'); return
      case 'image.modeRgb': updateDoc((document) => ({ ...document, colorMode: 'rgb' })); return
      case 'image.modeGray': updateDoc((document) => ({ ...document, colorMode: 'gray' })); return
      case 'image.modeCmyk': updateDoc((document) => ({ ...document, colorMode: 'cmyk' })); return
      case 'image.modeLab': updateDoc((document) => ({ ...document, colorMode: 'lab' })); return
      case 'image.depth8': updateDoc((document) => ({ ...document, depth: 8 })); return
      case 'image.depth16': updateDoc((document) => ({ ...document, depth: 16 })); return
      case 'image.profile': openDialog('colorProfile'); return
      case 'image.brightness': openDialog('brightness'); return
      case 'image.hueSat': openDialog('hue'); return
      case 'image.cameraRaw': openDialog('cameraRaw'); return
      case 'image.curves': openCurves(); return
      case 'image.levels': openLevels(); return
      case 'image.autoLevels': withLayer((canvas) => levelsStretch(canvas)); return
      case 'image.invert': withLayer((canvas) => invertColors(canvas, selectionRef.current)); return
      case 'image.info': openDialog('imageInfo'); return
      case 'image.rotate180': rotateDoc(2); return
      case 'image.trim': trimTransparent(); return
      case 'image.autoColor': withLayer((canvas) => autoColor(canvas)); return
      case 'image.equalize': withLayer((canvas) => equalize(canvas, selectionRef.current)); return
      case 'image.channelMixer': openDialog('channelMixer'); return
      case 'image.selectiveColor': openDialog('selectiveColor'); return
      case 'image.gradientMap': openDialog('gradientMap'); return
      case 'image.replaceColor': openDialog('replaceColor'); return
      case 'image.grayscale': withLayer((canvas) => grayscale(canvas, selectionRef.current)); return

      /* layer */
      case 'layer.new': addLayer(); return
      case 'layer.duplicate': duplicateLayer(); return
      case 'layer.delete': deleteLayer(); return
      case 'layer.mergeDown': mergeDown(); return
      case 'layer.flatten': flatten(); return
      case 'layer.group': groupActiveLayer(); return
      case 'layer.ungroup': ungroupActiveLayer(); return
      case 'layer.flipH': flipLayer('x'); return
      case 'layer.flipV': flipLayer('y'); return
      case 'layer.fillLayer': addFillLayer(); return
      case 'layer.mask': addMask(); return
      case 'layer.mergeVisible': mergeVisible(); return
      case 'layer.rasterize': rasterizeLayer(); return
      case 'layer.toSmart': convertToSmartObject(); return
      case 'layer.clipMask': toggleClipMask(); return
      case 'layer.bringForward': moveLayer(1); return
      case 'layer.sendBackward': moveLayer(-1); return
      case 'layer.bringToFront': moveLayerToEdge('front'); return
      case 'layer.sendToBack': moveLayerToEdge('back'); return

      /* type */
      case 'type.horizontal': setTool('text'); return
      case 'type.vertical': setTool('vtext'); return
      case 'type.enter': openDialog('text'); return

      /* select */
      case 'select.all': setSelection(rectSelection(0, 0, current.width, current.height)); return
      case 'select.none': deselect(); return
      case 'select.invert': setSelection(invertSelection(selectionRef.current, current.width, current.height)); return
      case 'select.reselect': if (lastSelectionRef.current) setSelection(lastSelectionRef.current); return
      case 'select.grow': {
        const source = selectionSource()
        if (source) setSelection(growSelection(source, selectionRef.current, settingsRef.current.fillTolerance))
        return
      }
      case 'select.similar': {
        const source = selectionSource()
        if (source) setSelection(similarSelection(source, selectionRef.current, settingsRef.current.fillTolerance))
        return
      }
      case 'select.expand': openDialog('selectModify', { modify: 'expand' }); return
      case 'select.contract': openDialog('selectModify', { modify: 'contract' }); return
      case 'select.border': openDialog('selectModify', { modify: 'border' }); return
      case 'select.smooth': openDialog('selectModify', { modify: 'smooth' }); return
      case 'select.feather': openDialog('feather'); return
      case 'select.colorRange': openDialog('colorRange'); return
      case 'select.save': openDialog('saveSelection'); return
      case 'select.load': openDialog('loadSelection'); return
      case 'select.subject': setSelection(selectSubject(canvasesRef.current.get(current.activeLayerId) ?? compositeDocument(current, canvasesRef.current))); return
      case 'select.distractions': setSelection(findDistractions(canvasesRef.current.get(current.activeLayerId) ?? compositeDocument(current, canvasesRef.current))); return
      case 'select.removeBg': withLayer((canvas) => { const subject = selectSubject(canvas); clearSelectionPixels(canvas, invertSelection(subject, canvas.width, canvas.height)) }); return

      /* filter */
      case 'filter.gallery': openDialog('filterGallery'); return
      case 'filter.blur': openDialog('blur'); return
      case 'filter.sharpen': openDialog('sharpen'); return
      case 'filter.neural': applyNamedFilter('oil'); return
      case 'filter.liquify': applyNamedFilter('liquify'); return
      case 'filter.cameraRaw': applyNamedFilter('cameraRaw'); return

      /* 3D */
      case 'threeD.extrude': openDialog('threeD'); return
      case 'threeD.remove':
        updateDoc((value) => ({
          ...value,
          layers: value.layers.map((layer) => (layer.id === value.activeLayerId ? { ...layer, threeD: undefined } : layer)),
        }))
        return
      case 'threeD.effects':
        updateDoc((value) => ({
          ...value,
          layers: value.layers.map((layer) => (layer.id === value.activeLayerId
            ? { ...layer, effects: { ...layer.effects, bevel: true, dropShadow: true } }
            : layer)),
        }))
        return

      /* view */
      case 'view.zoomIn': setSettings((c) => ({ ...c, zoom: Math.min(8, c.zoom * 1.2) })); return
      case 'view.zoomOut': setSettings((c) => ({ ...c, zoom: Math.max(0.05, c.zoom / 1.2) })); return
      case 'view.zoomFit': fitZoom(current); return
      case 'view.actualPixels': setSettings((c) => ({ ...c, zoom: 1 })); return
      case 'view.grid': setSettings((c) => ({ ...c, showGrid: !c.showGrid })); return
      case 'view.rulers': setSettings((c) => ({ ...c, showRulers: !c.showRulers })); return
      case 'view.quickMask': setQuickMask((value) => !value); return
      case 'view.rotateView': setViewAngle((value) => value + 15); return

      /* window */
      case 'window.layers': setSettings((c) => ({ ...c, rightTab: 'layers' })); return
      case 'window.adjust': setSettings((c) => ({ ...c, rightTab: 'adjust' })); return
      case 'window.history': setSettings((c) => ({ ...c, rightTab: 'history' })); return
      case 'window.channels': setSettings((c) => ({ ...c, rightTab: 'channels' })); return
      case 'window.actions': setSettings((c) => ({ ...c, rightTab: 'actions' })); return
      case 'window.timeline': setSettings((c) => ({ ...c, rightTab: 'timeline' })); return
      case 'window.info': setSettings((c) => ({ ...c, rightTab: 'info' })); return
      case 'window.guide': openDialog('helpGuide'); return

      default:
        setStatus('ready')
    }
  }

  /** Toggle commands that should read as pressed in the menu and on the toolbar. */
  const isCommandActive = useCallback((id: string) => {
    switch (id) {
      case 'view.grid': return settings.showGrid
      case 'view.rulers': return settings.showRulers
      case 'view.quickMask': return quickMask
      case 'window.layers': return settings.rightTab === 'layers'
      case 'window.adjust': return settings.rightTab === 'adjust'
      case 'window.history': return settings.rightTab === 'history'
      case 'window.channels': return settings.rightTab === 'channels'
      case 'window.actions': return settings.rightTab === 'actions'
      case 'window.timeline': return settings.rightTab === 'timeline'
      case 'window.info': return settings.rightTab === 'info'
      case 'image.modeRgb': return doc.colorMode === 'rgb'
      case 'image.modeGray': return doc.colorMode === 'gray'
      case 'image.modeCmyk': return doc.colorMode === 'cmyk'
      case 'image.modeLab': return doc.colorMode === 'lab'
      case 'image.depth8': return (doc.depth ?? 8) === 8
      case 'image.depth16': return doc.depth === 16
      default: return false
    }
  }, [doc.colorMode, doc.depth, quickMask, settings.rightTab, settings.showGrid, settings.showRulers])

  const commandLabel = useCallback((command: AppCommand) => {
    if (command.menu === 'layer' && command.id.startsWith('adjLayer.')) {
      return `${tr('adjLayer')} · ${tr(command.label)}`
    }
    return tr(command.label)
  }, [tr])


  /* --------------------------------------------- popup window plumbing */

  /**
   * Applies whatever a popup sends back, from either rendering. A plain
   * function: it is only ever reached from an event or an IPC message, and
   * memoising it would pull every document command into its dependency array.
   */
  const applyDialogResult = (name: DialogName, result: DialogResult) => {
    noteDialogResult(name, result)
    guard(`${tr('errorWhileDialog')}: ${name}`, () => applyDialogResultUnguarded(name, result))
  }

  const applyDialogResultUnguarded = (name: DialogName, result: DialogResult) => {
    if (result.action === 'settings') {
      setSettings((value) => ({ ...value, ...(result.patch as Partial<AppSettings>) }))
      return
    }
    const current = docRef.current
    if (!current) return
    switch (name) {
      case 'new':
        createDocument(tr('untitled'), Number(result.width), Number(result.height), result.background as PhotoDocument['background'])
        return
      case 'export':
        void exportImage(settingsRef.current.exportFormat)
        return
      case 'print':
        void printDocument(
          result.orientation as PageOrientation,
          result.deviceName ? String(result.deviceName) : undefined,
          Number(result.copies ?? 1),
        )
        return
      case 'fill':
        fillSelection(String(result.color), Number(result.opacity), result.patternId ? String(result.patternId) : undefined)
        return
      case 'stroke':
        strokeSelection(String(result.color), Number(result.width), result.where as 'inside' | 'center' | 'outside')
        return
      case 'selectModify': {
        const radius = Number(result.radius)
        const { width, height } = current
        // The window says which command opened it, so nothing has to be
        // remembered between opening it and getting an answer back.
        const operation = String(result.modify ?? 'expand')
        if (operation === 'expand') setSelection(expandSelection(selectionRef.current, width, height, radius))
        else if (operation === 'contract') setSelection(contractSelection(selectionRef.current, width, height, radius))
        else if (operation === 'border') setSelection(borderSelection(selectionRef.current, width, height, radius))
        else setSelection(smoothSelection(selectionRef.current, width, height, radius))
        return
      }
      case 'colorRange': {
        const source = selectionSource()
        if (source) setSelection(colorRangeSelection(source, hexToRgb(settingsRef.current.foreground), Number(result.tolerance)))
        return
      }
      case 'skew':
        replaceLayerWith((source) => skewCanvas(source, Number(result.horizontal), Number(result.vertical)))
        return
      case 'perspective':
        replaceLayerWith((source) => perspectiveCanvas(source, Number(result.amount)))
        return
      case 'distort': {
        const offsets = result.corners as Point[]
        replaceLayerWith((source) => cornerTransform(source, [
          { x: offsets[0].x, y: offsets[0].y },
          { x: source.width + offsets[1].x, y: offsets[1].y },
          { x: source.width + offsets[2].x, y: source.height + offsets[2].y },
          { x: offsets[3].x, y: source.height + offsets[3].y },
        ]))
        return
      }
      case 'warp':
        replaceLayerWith((source) => warpCanvas(
          source,
          result.style as TextWarpStyle,
          Number(result.bend),
          Number(result.horizontal),
          Number(result.vertical),
        ))
        return
      case 'contentScale':
        applyContentAwareScale(Number(result.width), Number(result.height), result.protectSkin !== false)
        return
      case 'threeD':
        snapshot()
        updateDoc((document) => ({
          ...document,
          layers: document.layers.map((layer) => (
            layer.id === document.activeLayerId ? { ...layer, threeD: result.threeD as ThreeDData } : layer
          )),
        }))
        return
      case 'colorProfile': {
        const chosen = builtInProfiles[String(result.profile)] ?? builtInProfiles.srgb
        if (result.action === 'convert') {
          // Keep the colours looking the same: the numbers are rewritten.
          const from = builtInProfiles[current.profile ?? 'srgb'] ?? builtInProfiles.srgb
          snapshot()
          for (const layer of current.layers) {
            const canvas = canvasesRef.current.get(layer.id)
            if (canvas) convertProfile(canvas, from, chosen)
          }
        }
        // Assigning only records which space the numbers are to be read in.
        updateDoc((document) => ({ ...document, profile: String(result.profile) }))
        return
      }
      case 'saveSelection':
        saveSelectionAs(String(result.name))
        return
      case 'loadSelection':
        loadSelectionFrom(String(result.channelId), result.combine as ChannelCombine)
        return
      case 'channelMixer':
        withLayer((canvas) => channelMixer(canvas, result.mix as ChannelMix, selectionRef.current))
        return
      case 'selectiveColor':
        withLayer((canvas) => selectiveColor(canvas, result.family as ColorFamily, result.shift as InkShift, selectionRef.current))
        return
      case 'gradientMap':
        withLayer((canvas) => gradientMap(canvas, String(result.from), String(result.to), selectionRef.current))
        return
      case 'replaceColor':
        withLayer((canvas) => replaceColor(canvas, hexToRgb(settingsRef.current.foreground), String(result.to), Number(result.tolerance), selectionRef.current))
        return
      case 'brightness':
        withLayer((canvas) => adjustBrightnessContrast(canvas, Number(result.brightness), Number(result.contrast), selectionRef.current))
        return
      case 'hue':
        withLayer((canvas) => adjustHueSaturation(canvas, Number(result.hue), Number(result.saturation), Number(result.lightness), selectionRef.current))
        return
      case 'blur':
        withLayer((canvas) => gaussianBlur(canvas, Number(result.radius), selectionRef.current))
        return
      case 'feather':
        setSelection(featherSelection(selectionRef.current, current.width, current.height, Number(result.radius)))
        return
      case 'sharpen':
        withLayer((canvas) => sharpen(canvas, Number(result.amount), selectionRef.current))
        return
      case 'cameraRaw':
        withLayer((canvas) => applyAdjustmentCanvas(canvas, {
          ...defaultAdjustment('exposure'),
          brightness: Number(result.brightness),
          contrast: Number(result.contrast),
          saturation: Number(result.saturation),
          clarity: 20,
          dehaze: 10,
        }))
        return
      case 'curves':
        if (result.action === 'layer') addAdjustment('curves', { curves: result.curves as CurveData })
        else withLayer((canvas) => applyCurves(canvas, result.curves as CurveData, selectionRef.current))
        return
      case 'levels':
        if (result.action === 'layer') addAdjustment('levels', { levels: result.levels as LevelsData })
        else withLayer((canvas) => applyLevels(canvas, result.levels as LevelsData, selectionRef.current))
        return
      case 'filterGallery':
        applyNamedFilter(String(result.id))
        return
      case 'imageSize':
        resizeImage(Number(result.width), Number(result.height))
        return
      case 'canvasSize':
        resizeCanvas(Number(result.width), Number(result.height))
        return
      case 'text': {
        const value = String(result.text ?? '')
        setTextValue(value)
        snapshot()
        const active = current.layers.find((layer) => layer.id === current.activeLayerId)
        const editing = active?.kind === 'text' ? active.text : undefined
        const data: TextData = {
          text: value,
          // Editing a layer keeps it where it is; a new one lands where the
          // type tool was last clicked.
          x: editing?.x ?? textPointRef.current.x,
          y: editing?.y ?? textPointRef.current.y,
          fontFamily,
          fontSize: Number(result.fontSize ?? fontSize),
          color: settingsRef.current.foreground,
          bold: Boolean(result.bold),
          italic: Boolean(result.italic),
          align: (result.align as TextData['align']) ?? 'left',
          vertical: editing?.vertical ?? toolRef.current === 'vtext',
          lineHeight: Number(result.lineHeight ?? 1.2),
          letterSpacing: Number(result.letterSpacing ?? 0),
          indent: Number(result.indent ?? 0),
          paragraphSpacing: Number(result.paragraphSpacing ?? 0),
          pathId: String(result.pathId ?? '') || undefined,
          pathOffset: editing?.pathOffset ?? 0,
          warp: {
            style: (result.warpStyle as TextWarpStyle) ?? 'none',
            bend: Number(result.warpBend ?? 0),
            horizontal: 0,
            vertical: 0,
          },
        }
        if (active?.kind === 'text') {
          updateDoc((document) => ({
            ...document,
            layers: document.layers.map((layer) => (layer.id === active.id ? { ...layer, text: data } : layer)),
          }))
          return
        }
        const layer = createLayerMeta(tr('text'), 'text')
        layer.text = data
        updateDoc((document) => ({ ...document, layers: [...document.layers, layer], activeLayerId: layer.id }))
        return
      }
      case 'unsaved':
        void runPendingRef.current?.(result.action as UnsavedChoice)
        return
      default:
    }
  }

  const applyDialogResultRef = useRef(applyDialogResult)
  const runCommandRef = useRef<(id: string) => void>(() => {})
  const isCommandActiveRef = useRef<(id: string) => boolean>(() => false)
  const commandLabelRef = useRef<(command: AppCommand) => string>(() => '')

  useEffect(() => {
    applyDialogResultRef.current = applyDialogResult
    runCommandRef.current = runCommand
    isCommandActiveRef.current = isCommandActive
    commandLabelRef.current = commandLabel
  })

  // Results arriving from the separate popup windows.
  useEffect(() => window.electronDialogApi?.onResult(({ name, result }) => {
    applyDialogResultRef.current(name as DialogName, result as DialogResult)
  }), [])

  useEffect(() => window.electronMenuApi?.onChosen((commandId) => {
    runCommandRef.current(commandId)
  }), [])

  /**
   * Opens a menu in its own always-on-top window. That is the only way a long
   * menu can overhang the app: a frameless window clips its own HTML, so the
   * Layer menu used to be cut off at the window edge.
   */
  const openMenuWindow = async (id: CommandMenuId, anchor: HTMLElement | null) => {
    if (!window.electronMenuApi || !anchor) return false
    const box = anchor.getBoundingClientRect()
    const active = commands.filter((command) => isCommandActive(command.id)).map((command) => command.id)
    const overrides: Record<string, string> = {}
    for (const command of commandsInMenu(id)) {
      const label = commandLabel(command)
      if (label !== tr(command.label)) overrides[command.id] = label
    }
    try {
      // Awaited: a rejected invoke used to leave the button doing nothing,
      // because the in-page dropdown had already been suppressed.
      return await window.electronMenuApi.open(
        { menu: id, language, theme: settings.theme, active, overrides },
        { x: window.screenX + box.left, y: window.screenY + box.bottom + 2, width: box.width, height: box.height },
      )
    } catch {
      return false
    }
  }

  /* --------------------------------------------------- external drag & drop */

  /** Accepts images and .mpw projects dropped onto the window from the desktop. */
  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    setDropActive(false)
    const files = [...(event.dataTransfer?.files ?? [])]
      .filter((file) => file.type.startsWith('image/') || /\.(mpw|tiff?|bmp|avif|webp|heic|heif|hif|dcm|dicom)$/i.test(file.name))
    if (files.length === 0) return
    try {
      const items = await Promise.all(files.map(fileToOpenItem))
      // Dropping onto an edited document places the images as new layers;
      // dropping onto an untouched one opens them instead.
      await openFiles(items, dirtyRef.current ? 'place' : 'open')
    } catch (error) {
      showError(tr('open'), tr('openFailed'), error)
    }
  }

  const handleDragOver = (event: React.DragEvent) => {
    if (![...(event.dataTransfer?.types ?? [])].includes('Files')) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    if (!dropActive) setDropActive(true)
  }

  /** The theme the button would move to, which is also what its tooltip says. */
  const nextThemeId = themes[(themes.findIndex((item) => item.id === settings.theme) + 1) % themes.length].id

  /** Clicking the theme button takes the next one in the list, and wraps. */
  const stepTheme = () => setSettings((current) => {
    const index = themes.findIndex((item) => item.id === current.theme)
    return { ...current, theme: themes[(index + 1) % themes.length].id }
  })

  const desktop = Boolean(window.electronWindowApi)

  return (
    <div
      className={`app-shell${dropActive ? ' drop-active' : ''}`}
      style={{ '--right-width': `${settings.rightWidth}px`, '--right-min-width': `${minRight}px` } as React.CSSProperties}
      onDragOver={handleDragOver}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDropActive(false) }}
      onDrop={(event) => void handleDrop(event)}
      onPointerDown={() => { setMenu(null); setContextMenu(null); hideTooltip() }}
      onPointerOver={showTooltip}
      onPointerOut={(event) => {
        const current = readTooltip(event.target)
        const next = readTooltip(event.relatedTarget)
        if (current && next && current.node === next.node) return
        hideTooltip()
      }}
    >
      <header className="title-bar">
        <div className="brand" data-tooltip={tr('appName')}>
          <img src="./app-icon.svg" alt="" />
          <span>{tr('appName')}</span>
        </div>
        <div className="title-doc">
          {doc.name}
          {dirty && <em className="title-dirty" aria-label={tr('unsavedTitle')}>*</em>}
          <span className="title-size">{doc.width} × {doc.height}</span>
        </div>
        {desktop && (
          <div className="window-controls">
            {/* No tooltips here: the three window buttons are universal, and a
                hint following the pointer to the corner only gets in the way.
                The accessible name stays, for readers that need it. */}
            <button aria-label={tr('minimize')} onClick={() => void window.electronWindowApi?.minimize()}><Minus size={16} /></button>
            <button aria-label={tr('maximize')} onClick={() => void window.electronWindowApi?.toggleMaximize()}><Square size={14} /></button>
            <button className="window-close" aria-label={tr('closeWindow')} onClick={() => void window.electronWindowApi?.close()}><X size={16} /></button>
          </div>
        )}
      </header>

      <nav className="menu-bar">
        {menuOrder.map((id) => {
          const MenuIcon = menuIcons[id]
          return (
            <div className="menu-group" key={id}>
              <button
                className={menu === id ? 'active' : ''}
                data-tooltip={tr(id)}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  hideTooltip()
                  if (menu === id) {
                    setMenu(null)
                    void window.electronMenuApi?.close()
                    return
                  }
                  // A real window first, so a long menu can overhang the app;
                  // the in-page dropdown covers the browser build and any
                  // failure to create that window.
                  const anchor = event.currentTarget
                  setMenuAnchor(anchor)
                  void openMenuWindow(id, anchor).then((opened) => {
                    if (!opened) setMenu(id)
                  })
                }}
              >
                <MenuIcon size={15} />
                <span>{tr(id)}</span>
              </button>
              {menu === id && (
                <MenuDrop anchor={menuAnchor} rows={commandsInMenu(id)}>
                  {commandsInMenu(id).map((command) => (
                    // A fragment, so the separators and the rows are the grid's
                    // own cells and the columns stay in step with each other.
                    <Fragment key={command.id}>
                      {command.separatorBefore && <div className="menu-separator" />}
                      <MenuItem
                        icon={command.icon}
                        label={commandLabel(command)}
                        accel={command.accel}
                        active={isCommandActive(command.id)}
                        onClick={() => runCommand(command.id)}
                      />
                    </Fragment>
                  ))}
                </MenuDrop>
              )}
            </div>
          )
        })}

        <div className="menu-spacer" />

        {/* A split button: the wide half steps to the next theme, the arrow
            opens the full list. */}
        <div className="menu-group theme-menu-group">
          <button
            className="theme-step"
            data-tooltip={`${tr('nextTheme')}: ${themeLabel(language, nextThemeId)}`}
            onPointerDown={(event) => { event.stopPropagation(); hideTooltip(); stepTheme() }}
          >
            <Palette size={15} />
            <span>{themeLabel(language, settings.theme)}</span>
          </button>
          <button
            className={`theme-pick${menu === 'theme' ? ' active' : ''}`}
            data-tooltip={tr('chooseTheme')}
            aria-label={tr('chooseTheme')}
            onPointerDown={(event) => { event.stopPropagation(); hideTooltip(); setMenuAnchor(event.currentTarget); setMenu(menu === 'theme' ? null : 'theme') }}
          >
            <ChevronDown size={13} />
          </button>
          {menu === 'theme' && (
            <MenuDrop className="theme-menu" align="end" anchor={menuAnchor}>
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
        <button data-tooltip={tr('settings')} onClick={() => openDialog('settings')}><Settings2 size={15} /><span>{tr('settings')}</span></button>
        <button data-tooltip={tr('about')} onClick={() => openDialog('about')}><Info size={15} /><span>{tr('about')}</span></button>
      </nav>

      <div className="tool-bar">
        {toolbarGroups().map((group, index) => (
          <div className="tool-bar-group" key={group.menu} data-menu={group.menu}>
            {index > 0 && <span className="tool-bar-divider" aria-hidden="true" />}
            {group.commands.map((command) => {
              const CommandIcon = command.icon
              const button = (
                <button
                  key={command.id}
                  className={isCommandActive(command.id) ? 'active' : ''}
                  data-tooltip={command.accel ? `${commandLabel(command)} (${command.accel})` : commandLabel(command)}
                  aria-label={commandLabel(command)}
                  aria-pressed={isCommandActive(command.id)}
                  onClick={() => runCommand(command.id)}
                >
                  <CommandIcon size={16} />
                </button>
              )
              if (command.id !== 'view.zoomIn') return button
              // The percentage sits between the two zoom buttons, where it
              // reads as the value those buttons are changing. Clicking it
              // goes back to 100%, which is what the number invites.
              return (
                <Fragment key={command.id}>
                  {button}
                  <button
                    className="zoom-readout"
                    data-tooltip={tr('zoomLevel')}
                    aria-label={`${tr('zoomLevel')} ${Math.round(settings.zoom * 100)}%`}
                    onClick={() => runCommand('view.actualPixels')}
                  >
                    {Math.round(settings.zoom * 100)}%
                  </button>
                </Fragment>
              )
            })}
          </div>
        ))}

          <div className="tool-bar-group tool-bar-tasks">
            <span className="tool-bar-divider" aria-hidden="true" />
            <button
              data-tooltip={tr('selectSubject')}
              aria-label={tr('selectSubject')}
              onClick={() => { const source = canvasesRef.current.get(doc.activeLayerId) ?? compositeDocument(doc, canvasesRef.current); setSelection(selectSubject(source)) }}
            ><Sparkles size={16} /></button>
            <button
              data-tooltip={tr('removeBg')}
              aria-label={tr('removeBg')}
              onClick={() => withLayer((canvas) => { const sub = selectSubject(canvas); clearSelectionPixels(canvas, invertSelection(sub, canvas.width, canvas.height)) })}
            ><Eraser size={16} /></button>
            <button
              data-tooltip={tr('genFill')}
              aria-label={tr('genFill')}
              onClick={() => withLayer((canvas) => contentAwareFill(canvas, selectionRef.current))}
            ><WandSparkles size={16} /></button>
            <button
              data-tooltip={tr('harmonize')}
              aria-label={tr('harmonize')}
              onClick={() => withLayer((canvas) => harmonize(canvas, selectionRef.current))}
            ><Blend size={16} /></button>
          </div>

          <div className="tool-bar-group tool-bar-colors">
            <span className="tool-bar-divider" aria-hidden="true" />
            <button
              className="swatch-button"
              data-tooltip={tr('foreground')}
              aria-label={tr('foreground')}
              onClick={(event) => setColorPick({ target: 'fg', x: event.clientX, y: event.clientY })}
            >
              <span className="swatch-chip" style={{ background: settings.foreground }} />
            </button>
            <button
              data-tooltip={tr('swap')}
              aria-label={tr('swap')}
              onClick={() => setSettings((c) => ({ ...c, foreground: c.background, background: c.foreground }))}
            ><ArrowLeftRight size={16} /></button>
            <button
              className="swatch-button"
              data-tooltip={tr('backgroundColor')}
              aria-label={tr('backgroundColor')}
              onClick={(event) => setColorPick({ target: 'bg', x: event.clientX, y: event.clientY })}
            >
              <span className="swatch-chip" style={{ background: settings.background }} />
            </button>
          </div>
      </div>

      <div className="options-bar">
        <strong className="current-tool" data-tooltip={toolLabel(language, tool)}>
          {/* Built with createElement: naming the looked-up icon as a component
              reads to React as a component declared inside render. */}
          {createElement(iconForTool(tool), { size: 16 })}
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

        <div ref={stageRef} className="canvas-stage" onContextMenu={(event) => { event.preventDefault(); setContextMenu({ x: event.clientX, y: event.clientY }) }}>
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
            {(['layers', 'adjust', 'history', 'channels', 'actions', 'timeline', 'info'] as const).map((tab) => {
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
          {settings.rightTab === 'timeline' && (
            <>
              <h2>{tr('timeline')}</h2>
              <div className="channel-row">
                <button data-tooltip={tr('addFrame')} onClick={captureAnimationFrame}>
                  <Plus size={13} /><span>{tr('addFrame')}</span>
                </button>
                <button
                  data-tooltip={playingFrame === null ? tr('playAnimation') : tr('stopAnimation')}
                  aria-label={playingFrame === null ? tr('playAnimation') : tr('stopAnimation')}
                  onClick={() => (playingFrame === null ? startPlayback() : stopPlayback())}
                >
                  {playingFrame === null ? <Play size={13} /> : <Square size={13} />}
                </button>
              </div>
              {(doc.animation ?? []).length === 0
                ? <p className="panel-hint">{tr('noFrames')}</p>
                : (doc.animation ?? []).map((frame, index) => (
                  <div className="frame-row" key={frame.id}>
                    <button
                      className={playingFrame === index ? 'active' : ''}
                      onClick={() => showAnimationFrame(frame.id)}
                    >
                      {index + 1}
                    </button>
                    {/* The delay is in milliseconds, which is what the GIF and
                        the preview both work in. */}
                    <input
                      type="number"
                      min={20}
                      max={5000}
                      step={20}
                      value={frame.delayMs}
                      onChange={(event) => patchAnimationFrame(frame.id, { delayMs: Number(event.target.value) })}
                    />
                    <button data-tooltip={tr('deleteLayer')} aria-label={tr('deleteLayer')} onClick={() => deleteAnimationFrame(frame.id)}>
                      <Trash size={13} />
                    </button>
                  </div>
                ))}
              <button data-tooltip={tr('exportGif')} onClick={() => void exportAnimatedGif()}>
                <Download size={13} /><span>{tr('exportGif')}</span>
              </button>
              <button data-tooltip={tr('exportVideo')} onClick={() => void exportVideo()}>
                <Download size={13} /><span>{tr('exportVideo')}</span>
              </button>
            </>
          )}
          {settings.rightTab === 'actions' && (
            <>
              <h2>{tr('actions')}</h2>
              {/* Recording is deliberately plain: start, do the work in the
                  menus as usual, then give what was recorded a name. */}
              {recording
                ? (
                  <>
                    <p className="panel-hint">{`${tr('recording')} · ${recording.length}`}</p>
                    <div className="channel-row">
                      <input
                        value={actionName}
                        placeholder={tr('actionName')}
                        onChange={(event) => setActionName(event.target.value)}
                      />
                      <button data-tooltip={tr('stopRecording')} onClick={() => { saveRecording(actionName.trim() || tr('action')); setActionName('') }}>
                        <Save size={13} />
                      </button>
                    </div>
                    <button onClick={() => setRecording(null)}>{tr('cancel')}</button>
                  </>
                )
                : <button data-tooltip={tr('startRecording')} onClick={() => setRecording([])}><Circle size={13} /><span>{tr('startRecording')}</span></button>}

              {settings.actions.length === 0
                ? <p className="panel-hint">{tr('noActions')}</p>
                : settings.actions.map((action) => (
                  <div className="action-row" key={action.id}>
                    <span>{`${action.name} · ${action.steps.length}`}</span>
                    <button data-tooltip={tr('playAction')} aria-label={tr('playAction')} onClick={() => playAction(action)}><Play size={13} /></button>
                    <button data-tooltip={tr('batch')} aria-label={tr('batch')} onClick={() => void runBatch(action)}><Layers size={13} /></button>
                    <button data-tooltip={tr('deleteLayer')} aria-label={tr('deleteLayer')} onClick={() => deleteAction(action.id)}><Trash size={13} /></button>
                  </div>
                ))}

              <h3>{tr('layerComps')}</h3>
              <div className="channel-row">
                <input value={compName} placeholder={tr('compName')} onChange={(event) => setCompName(event.target.value)} />
                <button data-tooltip={tr('captureComp')} onClick={() => { captureComp(compName.trim() || tr('comp')); setCompName('') }}>
                  <Camera size={13} />
                </button>
              </div>
              {(doc.comps ?? []).length === 0
                ? <p className="panel-hint">{tr('noComps')}</p>
                : (doc.comps ?? []).map((comp) => (
                  <div className="channel-row" key={comp.id}>
                    <button onClick={() => applyComp(comp.id)}>{comp.name}</button>
                    <button data-tooltip={tr('deleteLayer')} aria-label={tr('deleteLayer')} onClick={() => deleteComp(comp.id)}><Trash size={13} /></button>
                  </div>
                ))}
            </>
          )}
          {settings.rightTab === 'channels' && (
            <>
              <h2>{tr('channels')}</h2>
              <h3>{tr('colorChannels')}</h3>
              {/* Drawn into by the effect below, the way the histogram is: the
                  pixels live in a ref, which render may not read. */}
              <div className="channel-grid">
                {channelPreviews.map((item) => (
                  <figure key={item.key}>
                    <canvas id={`channel-canvas-${item.key}`} width={96} height={64} />
                    <figcaption>{tr(item.label)}</figcaption>
                  </figure>
                ))}
              </div>
              <h3>{tr('savedSelections')}</h3>
              {(doc.channels ?? []).length === 0
                ? <p className="panel-hint">{tr('noChannels')}</p>
                : (doc.channels ?? []).map((channel) => (
                  <div className="channel-row" key={channel.id}>
                    {/* Clicking the name loads it; the combine modes are in the
                        Select menu's own window. */}
                    <button onClick={() => loadSelectionFrom(channel.id, 'replace')}>{channel.name}</button>
                    <button data-tooltip={tr('deleteLayer')} aria-label={tr('deleteLayer')} onClick={() => deleteChannel(channel.id)}>
                      <Trash size={13} />
                    </button>
                  </div>
                ))}
              <button data-tooltip={tr('saveSelection')} onClick={() => openDialog('saveSelection')}>
                <SquareDashed size={14} /><span>{tr('saveSelection')}</span>
              </button>
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
              {/* A smart layer's filter stack: each one can be switched off,
                  re-tuned or thrown away without the pixels ever changing. */}
              {activeLayer.smart && (
                <>
                  <h3>{tr('smartFilters')}</h3>
                  {(activeLayer.smartFilters ?? []).length === 0
                    ? <p className="panel-hint">{tr('smartFilterHint')}</p>
                    : (activeLayer.smartFilters ?? []).map((filter) => (
                      <div className="smart-filter" key={filter.id}>
                        <label className="check-row">
                          <input
                            type="checkbox"
                            checked={filter.enabled}
                            onChange={(event) => patchSmartFilter(filter.id, { enabled: event.target.checked })}
                          />
                          {tr(filter.filter)}
                        </label>
                        <div className="range-field">
                          <input
                            type="range"
                            min={1}
                            max={100}
                            value={Math.round(filter.amount)}
                            onChange={(event) => patchSmartFilter(filter.id, { amount: Number(event.target.value) })}
                          />
                          <span className="range-value">{Math.round(filter.amount)}</span>
                        </div>
                        <button data-tooltip={tr('deleteLayer')} aria-label={tr('deleteLayer')} onClick={() => removeSmartFilter(filter.id)}>
                          <Trash size={13} />
                        </button>
                      </div>
                    ))}
                </>
              )}
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

      {dialog && !windowedDialogs && (
        <DialogFrame
          name={dialog as DialogName}
          language={language}
          payload={inPagePayload ?? undefined}
          onClose={() => setDialog(null)}
        >
          {inPagePayload && (
            <DialogBody
              name={dialog as DialogName}
              payload={inPagePayload}
              onResult={(result) => {
                applyDialogResult(dialog as DialogName, result)
                if (result.action !== 'settings' && result.action !== 'filter') setDialog(null)
              }}
              onClose={() => setDialog(null)}
            />
          )}
        </DialogFrame>
      )}

      {/* Purely a marker: the frameless window has no visible corner, but the
          OS still resizes from the edge underneath, so this must not take the
          pointer. */}
      {desktop && <div className="resize-grip" aria-hidden="true" />}

      <input className="hidden-input" ref={fileRef} type="file" accept=".mpw,.heic,.heif,.hif,.dcm,.dicom,image/*" multiple onChange={(event) => { const files = event.target.files; if (files) void Promise.all([...files].map(fileToOpenItem)).then((items) => openFiles(items, 'open')); event.target.value = '' }} />
      <input
        className="hidden-input"
        ref={videoRef}
        type="file"
        accept="video/*"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void importVideo(file, file.name)
          event.target.value = ''
        }}
      />
      <input className="hidden-input" ref={placeRef} type="file" accept=".heic,.heif,.hif,.dcm,.dicom,image/*" multiple onChange={(event) => { const files = event.target.files; if (files) void Promise.all([...files].map(fileToOpenItem)).then((items) => openFiles(items, 'place')); event.target.value = '' }} />
    </div>
  )
}
