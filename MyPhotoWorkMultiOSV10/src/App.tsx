import { createElement, Fragment, useCallback, useEffect, useMemo, useReducer, useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeftRight, Blend, ChevronDown, Copy, Crop, Eraser, FlipHorizontal, FlipVertical, Info, Minus, PaintBucket, Palette, PenTool, Plus,
  Scissors, Settings2, Sparkles, Square, SquareDashed, Trash, WandSparkles, X, Check, Frame, Wand,
} from 'lucide-react'
import { t, toolLabel } from './i18n'
import { aspectRatio, formatBytes, formatName, imageStatistics, type MetaRow, type MetaSection } from './lib/metadata'
import { adjustmentTypes, iconForTool, toolGroups } from './catalog'
import { canvasToDataUrl, cloneCanvas, compositeDocument, context2d, createBlankDocument, createCanvas, createId, createLayerMeta, padCanvas, resizeCanvasContent, sampleComposite, setSmartFilterRunner, smartSourceKey } from './lib/canvas'
import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from './lib/color'
import { adjustBrightnessContrast, adjustHueSaturation, clearSelectionPixels, gaussianBlur, grayscale, histogram, invertColors, sharpen } from './lib/filters'
import { applyGalleryFilter } from './lib/gallery'
import { applyAdjustmentCanvas, levelsStretch } from './lib/adjustments'
import { cloneDocument, pushHistory, setHistoryLimit, takeSnapshot, type HistorySnapshot, type NamedSnapshot } from './lib/history'
import { decodeImageSource, downloadDataUrl, encodeExport, extensionFor, fileToOpenItem, flattenOnto, naturalOrientation, previewSheet, printDataUrl, printableDocument, restoreProject, serializeProject } from './lib/imageIO'
import { borderSelection, clipCanvasToSelection, colSelection, colorRangeSelection, contractSelection, drawSelectionOverlay, ellipseSelection, expandSelection, featherSelection, growSelection, invertSelection, maskBounds, maskFromLasso, paintBucket, rectSelection, rowSelection, selectionBounds, selectionToMask, similarSelection, smoothSelection, wandSelection } from './lib/selection'
import { autoColor, channelMixer, equalize, gradientMap, replaceColor, selectiveColor, type ChannelMix, type ColorFamily, type InkShift } from './lib/colorTools'
import { channelCanvas, combineMasks, maskToGreyCanvas, selectionToChannel, type ChannelCombine } from './lib/channels'
import { builtInProfiles, convertProfile } from './lib/colorModes'
import { contentAwareScaleLayers, cornerTransform, perspective as perspectiveCanvas, puppetWarp, skew as skewCanvas, warpCanvas, type Pin } from './lib/warp'
import { definePattern, makePatternTile, patternKey, tileOnto } from './lib/patterns'
import { gifDataUrl } from './lib/gif'
import { extractVideoFrames, recordFrames } from './lib/video'
import { loadSettings, saveSettings } from './lib/settings'
import { cloneStamp, colorReplace, dodgeBurn, healStamp, paintStroke, redEyeFix, smudge, spongeDesaturate } from './lib/tools'
import { contentAwareFill, findDistractions, generativeExpand, generativeUpscale, harmonize, skinSmooth } from './lib/ai'
import { artHistoryDab, healingBrushDab, historyBrushDab, liquifyDab, loadMixer, mixerDab, patternStampDab, perspectiveCloneDab, quickSelectDab, type MixerReservoir } from './lib/brushes'
import { alignChain, applyHomography, blendAligned, exposureFusion, findPhotosOnScan, grabCutSelection, inpaintCanvas, stitchCanvases, warpCanvas as warpByHomography } from './lib/cv'
import { patchFill, poissonBlend } from './lib/inpaint'
import { decontaminateEdge, objectSelectRect, refineMask, selectFocusArea, selectSky, selectSubjectAuto } from './lib/segment'
import { applyImage, applyLut, autoContrast, autoTone, calculations, desaturate, fadeTo, hdrToning, lutById, lutChoices, matchColor, parseCube, registerLut, rotateArbitrary, rotatedSize } from './lib/adjustExtra'
import { gradientPresets, paintGradientDef, resolveGradient, type GradientDef } from './lib/gradients'
import { extraFilters } from './lib/moreFilters'
import { alignOffsets, autoAlignLayers, bitmapMode, checkSpelling, contactSheet, defringe, distributeOffsets, duotone, fitImage, gamutWarning, indexedColor, layerBounds, mergeToHdr, normaliseOutline, photomerge, proofCmyk, removeMatte, rotateLayerCanvas, shiftCanvas, traceCanvasToPaths } from './lib/documentOps'
import { writePsd } from './lib/psd'
import { createPath, drawPathOverlay, fillPathOnto, hitTestPaths, movePathPoint, pathFromPoints, pathNode, pathToSelection, smoothNode, smoothPath, strokePathOnto, translatePath, type PathHit } from './lib/paths'
import { applyCurves, applyLevels, autoLevels } from './lib/curves'
import { applyTransform, dragTransform, drawTransformOverlay, flipCanvas, hitTestTransform, identityTransform } from './lib/transform'
import { clipToFrame, contentMove, createFrame, createSlice, cropToRect, drawRegionOverlay, measureInfo, patchSelection, perspectiveCrop, perspectiveSize, rectAt, snapToEdge } from './lib/regions'
import { optionsForTool } from './toolOptions'
import { firstTick, rulerSize, tickStep, visibleRange } from './lib/view'
import { buildErrorReport } from './lib/errors'
import { commands, commandsInMenu, menuIcons, menuOrder, toolbarGroups, type AppCommand, type MenuId as CommandMenuId } from './commands'
import { MenuTree } from './MenuTree'
import { DialogBody, DialogFrame, type DialogName, type DialogPayload, type DialogResult } from './dialogs'
import { keepsWindowOpen } from './dialogMeta'
import { defaultAdjustment, defaultCurves, defaultEffects, defaultSettings, panelTabs, shapeKindForTool, type Adjustment, type AdjustmentType, type AppSettings, type BlendMode, type ErrorDetails, type ExportFormat, type CurveData, type Language, type LayerEffects, type LevelsData, type PageOrientation, type PanelTab, type PathShape, type PhotoDocument, type Point, type Selection, type SliceRect, type ActionScript, type ActionStep, type AnimationFrame, type LayerComp, type LayerMeta, type SmartFilter, type TextData, type TextWarpStyle, type ThreeDData, type Tool, type TransformBox, type TransformHandle, type UnsavedChoice } from './lib/types'
import { applyTheme, themeLabel, themes } from './themes'
import { DocumentTabs, PanelSwitch, type PanelContext } from './panels'
import { panelLabelKey } from './panelMeta'
import './App.css'

const minRight = 280
const maxRight = 480
const presets = ['#1d4ed8', '#0f766e', '#b45309', '#be123c', '#7c3aed', '#111827', '#ffffff', '#94a3b8', '#22c55e', '#eab308', '#06b6d4', '#f97316', '#ec4899', '#84cc16', '#6366f1', '#64748b']

/** Which popup is open, if any. The catalog in dialogMeta.ts is the one list:
 *  a second copy here only ever drifted out of step with it. */
type Dialog = DialogName | null

type MenuId = CommandMenuId | 'theme' | null

/** One open document: its model, pixels, history and file, parked while another is shown. */
type DocumentSlot = {
  id: string
  document: PhotoDocument
  canvases: Map<string, HTMLCanvasElement>
  undo: HistorySnapshot[]
  redo: HistorySnapshot[]
  dirty: boolean
  /** Set when this document is a smart object's contents, opened for editing. */
  smartParent?: { docId: string; layerId: string }
  opened?: HistorySnapshot
  namedSnapshots: NamedSnapshot[]
}

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
  children,
}: {
  anchor: HTMLElement | null
  align?: 'start' | 'end'
  className?: string
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

  const minWidth = className?.includes('theme-menu') ? 420 : 220
  const preferred = align === 'end' ? box.right - minWidth : box.left
  const left = Math.max(8, Math.min(preferred, window.innerWidth - minWidth - 8))

  const names = ['menu-drop', className].filter(Boolean)
  return createPortal(
    <div
      className={names.join(' ')}
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
      { key: 'infoColorMode', value: document.colorMode === 'gray' ? tr('grayscale') : document.colorMode.toUpperCase() },
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
  applyGalleryFilter(canvas, filter.filter, { radius: filter.radius, amount: filter.amount, extra: filter.extra }, null)
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

/**
 * Ruler strips along the top and left edges, graduated like a tape measure:
 * a numbered tick every `step`, a half-height tick between, and fine ticks
 * between those for as long as they stay a few pixels apart. The document's
 * extent is shaded so the picture's edges can be read off the ruler.
 */
function drawRulers(
  ctx: CanvasRenderingContext2D,
  view: { width: number; height: number },
  document: { width: number; height: number },
  pan: { x: number; y: number },
  zoom: number,
  colors: { bg: string; line: string; text: string; accent: string },
  unit = 1,
) {
  const step = tickStep(zoom * unit, 64) / unit
  // The finest graduation that still leaves daylight between the ticks.
  const minor = step * zoom >= 50 ? step / 10 : step * zoom >= 25 ? step / 5 : step / 2
  const perStep = Math.round(step / minor)
  ctx.save()
  ctx.font = '10px system-ui, sans-serif'

  ctx.fillStyle = colors.bg
  ctx.fillRect(0, 0, view.width, rulerSize)
  ctx.fillRect(0, 0, rulerSize, view.height)

  // The stretch of each ruler that lies over the document.
  ctx.fillStyle = colors.accent
  ctx.globalAlpha = 0.16
  ctx.fillRect(Math.max(rulerSize, pan.x), 0, Math.max(0, Math.min(view.width, pan.x + document.width * zoom) - Math.max(rulerSize, pan.x)), rulerSize)
  ctx.fillRect(0, Math.max(rulerSize, pan.y), rulerSize, Math.max(0, Math.min(view.height, pan.y + document.height * zoom) - Math.max(rulerSize, pan.y)))
  ctx.globalAlpha = 1

  const spanX = visibleRange(view.width, pan.x, zoom)
  const spanY = visibleRange(view.height, pan.y, zoom)
  const depthOf = (index: number) => {
    if (index % perStep === 0) return rulerSize - 6
    if (perStep % 2 === 0 && index % (perStep / 2) === 0) return 8
    return 4
  }

  // Ticks hang from the inner edge; the text colour keeps them legible.
  ctx.strokeStyle = colors.text
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let value = firstTick(spanX.from, minor), index = Math.round(value / minor); value <= spanX.to; value += minor, index += 1) {
    const x = Math.round(pan.x + value * zoom) + 0.5
    if (x < rulerSize) continue
    const depth = depthOf(index)
    ctx.moveTo(x, rulerSize - depth)
    ctx.lineTo(x, rulerSize)
  }
  for (let value = firstTick(spanY.from, minor), index = Math.round(value / minor); value <= spanY.to; value += minor, index += 1) {
    const y = Math.round(pan.y + value * zoom) + 0.5
    if (y < rulerSize) continue
    const depth = depthOf(index)
    ctx.moveTo(rulerSize - depth, y)
    ctx.lineTo(rulerSize, y)
  }
  ctx.stroke()

  // Numbers sit just past their tick, the vertical ones reading upwards.
  ctx.fillStyle = colors.text
  const label = (value: number) => String(Math.round(value * unit * 100) / 100)
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  for (let value = firstTick(spanX.from, step); value <= spanX.to; value += step) {
    const x = Math.round(pan.x + value * zoom) + 0.5
    if (x < rulerSize) continue
    ctx.fillText(label(value), x + 3, 2)
  }
  ctx.textAlign = 'right'
  for (let value = firstTick(spanY.from, step); value <= spanY.to; value += step) {
    const y = Math.round(pan.y + value * zoom) + 0.5
    if (y < rulerSize) continue
    ctx.save()
    ctx.translate(2, y + 3)
    ctx.rotate(-Math.PI / 2)
    ctx.fillText(label(value), 0, 0)
    ctx.restore()
  }

  // The inner edges, and the corner square where the two rulers meet.
  ctx.strokeStyle = colors.line
  ctx.beginPath()
  ctx.moveTo(0, rulerSize + 0.5)
  ctx.lineTo(view.width, rulerSize + 0.5)
  ctx.moveTo(rulerSize + 0.5, 0)
  ctx.lineTo(rulerSize + 0.5, view.height)
  ctx.stroke()
  ctx.fillStyle = colors.bg
  ctx.fillRect(0, 0, rulerSize, rulerSize)
  ctx.strokeStyle = colors.accent
  ctx.beginPath()
  ctx.moveTo(pan.x, rulerSize - 0.5)
  ctx.lineTo(pan.x + document.width * zoom, rulerSize - 0.5)
  ctx.moveTo(rulerSize - 0.5, pan.y)
  ctx.lineTo(rulerSize - 0.5, pan.y + document.height * zoom)
  ctx.stroke()
  ctx.restore()
}

/** Pixels per unit for the ruler labels: how many of the unit one pixel is. */
function unitScale(unit: AppSettings['rulerUnits']) {
  switch (unit) {
    case 'in': return 1 / 72
    case 'cm': return 2.54 / 72
    case 'mm': return 25.4 / 72
    case 'pt': return 1
    default: return 1
  }
}

/** The single-letter tool keys, as Photoshop binds them; the user can rebind them. */
const defaultToolKeys: Record<string, Tool> = {
  v: 'move', m: 'marquee', l: 'lasso', w: 'wand', c: 'crop', b: 'brush', e: 'eraser', g: 'fill', t: 'text', i: 'eyedropper',
  h: 'hand', z: 'zoom', p: 'pen', u: 'rect', a: 'pathSelect', k: 'frame', j: 'spotHeal', s: 'clone', o: 'dodge', y: 'historyBrush', r: 'rotateView', n: 'note',
}

const cropRatios: Record<AppSettings['cropRatio'], number | null> = { free: null, original: 0, '1:1': 1, '4:3': 4 / 3, '3:2': 3 / 2, '16:9': 16 / 9 }

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
  const [menuAnchor, setMenuAnchor] = useState<HTMLButtonElement | null>(null)
  const [status, setStatus] = useState('ready')
  const [savedNote, setSavedNote] = useState(false)
  const [pan, setPan] = useState({ x: 72, y: 56 })
  const [dialog, setDialog] = useState<Dialog>(null)
  const [pendingAction, setPendingAction] = useState<null | 'new' | 'open' | 'close' | 'quit' | 'closeAll'>(null)
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
  const [transformBox, setTransformBox] = useState<TransformBox | null>(null)
  const transformSourceRef = useRef<HTMLCanvasElement | null>(null)
  /** Set while the transform box is moving a selection outline rather than pixels. */
  const transformSelectionRef = useRef<HTMLCanvasElement | null>(null)
  const moveOriginRef = useRef(new Map<string, { canvas: HTMLCanvasElement; dx: number; dy: number }>())
  const moveStartRef = useRef(new Map<string, { dx: number; dy: number }>())
  const [activePathId, setActivePathId] = useState<string | null>(null)
  const [draftPath, setDraftPath] = useState<PathShape | null>(null)
  const [polyPoints, setPolyPoints] = useState<Point[]>([])
  const [pins, setPins] = useState<Pin[]>([])
  const pinsRef = useRef<Pin[]>([])
  const embeddedProfileRef = useRef<string | null>(null)
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
  const lutFileRef = useRef<HTMLInputElement | null>(null)
  const multiRef = useRef<HTMLInputElement | null>(null)
  /** What a multi-file pick in the browser build is for. */
  const multiPurposeRef = useRef<string>('')
  const dragRef = useRef<{
    mode:
      | 'paint' | 'erase' | 'select' | 'lasso' | 'crop' | 'pan' | 'move' | 'gradient' | 'none'
      | 'magnetic' | 'shape' | 'path' | 'freeformPen' | 'transform' | 'slice' | 'frame'
      | 'ruler' | 'patch' | 'contentMove' | 'rotateView' | 'pathMove' | 'puppet'
      | 'quickSelect' | 'objectSelect' | 'liquify' | 'artboard' | 'guide' | 'straighten' | 'moveGuide'
    handle?: TransformHandle
    pin?: number
    hit?: PathHit | null
    shift?: boolean
    alt?: boolean
    start: Point
    last: Point
    points: Point[]
    layerX: number
    layerY: number
    /** The guide being dragged, or the axis of one being created. */
    guideId?: string
    guideAxis?: 'x' | 'y'
    /** The selection before an add/subtract/intersect drag began. */
    base?: Selection | null
    /** The quick-selection mask growing under the pointer. */
    mask?: Uint8Array | null
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

  /* ---- state added for Photoshop parity ---- */
  /** The label the next snapshot is filed under in the History panel. */
  const historyLabelRef = useRef<string | null>(null)
  /** The state the document had when it was opened: the History panel's first row and Revert's target. */
  const openedRef = useRef<HistorySnapshot | null>(null)
  const [namedSnapshots, setNamedSnapshots] = useState<NamedSnapshot[]>([])
  const [historySourceIndex, setHistorySourceIndex] = useState<number | null>(null)
  const historySourceRef = useRef<number | null>(null)
  /** A live preview: the active layer as a window's sliders would leave it. */
  const previewRef = useRef<{ layerId: string; canvas: HTMLCanvasElement; dialog: DialogName } | null>(null)
  const previewSourceRef = useRef<HTMLCanvasElement | null>(null)
  /** A preview that shows a mask rather than pixels (Select and Mask). */
  const previewMaskRef = useRef<{ mask: Uint8Array; view: string } | null>(null)
  /** The layer's styles before the Layer Style window began editing them. */
  const styleBackupRef = useRef<{ layerId: string; effects: LayerEffects } | null>(null)
  const styleClipboardRef = useRef<LayerEffects | null>(null)
  const lastFilterRef = useRef<{ id: string; radius: number; amount: number; extra: number } | null>(null)
  const mixerRef = useRef<MixerReservoir | null>(null)
  const liquifyRef = useRef<{ original: HTMLCanvasElement; frozen: Uint8Array; layerId: string } | null>(null)
  const quickMaskRef = useRef<HTMLCanvasElement | null>(null)
  const clipboardRef = useRef<{ canvas: HTMLCanvasElement; x: number; y: number } | null>(null)
  const isolateRef = useRef<Record<string, boolean> | null>(null)
  const [isolated, setIsolated] = useState(false)
  /** What the History panel lists: labels only, the pixels stay in the refs. */
  const [historyMeta, setHistoryMeta] = useState<{ undo: { label?: string; at?: number }[]; redo: { label?: string; at?: number }[] }>({ undo: [], redo: [] })
  const samplerTimerRef = useRef(0)
  /** The last composite drawn, with what it was drawn from. */
  const compositeCacheRef = useRef<{ doc: PhotoDocument; frame: number; preview: HTMLCanvasElement | null; proof: boolean; gamut: boolean; composite: HTMLCanvasElement } | null>(null)
  const vanishingRef = useRef(false)
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([])
  const [screenMode, setScreenMode] = useState<'normal' | 'full'>('normal')
  const [samplerValues, setSamplerValues] = useState<{ id: string; x: number; y: number; r: number; g: number; b: number }[]>([])
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })
  /** Every open document, parked; the active one lives in the state above. */
  const slotsRef = useRef<Map<string, DocumentSlot>>(new Map())
  const [activeDocId, setActiveDocId] = useState(() => createId('doc'))
  const activeDocIdRef = useRef(activeDocId)
  const [docList, setDocList] = useState<{ id: string; name: string; dirty: boolean }[]>([])
  const loadedLutsRef = useRef<{ id: string; name: string }[]>([])

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
    historySourceRef.current = historySourceIndex
    activeDocIdRef.current = activeDocId
  }, [activeDocId, adjust, cloneSource, cropCorners, dirty, doc, draftPath, error, historySourceIndex, pins, polyPoints, selection, settings, shapeDraft, textPoint, textValue, tool, transformBox])

  useEffect(() => { setHistoryLimit(settings.historyStates) }, [settings.historyStates])

  /* ------------------------------------------------------ popup windows */

  const windowedDialogs = Boolean(window.electronDialogApi)

  const layerChoices = useCallback(() => {
    const current = docRef.current
    return current.layers.filter((layer) => layer.kind !== 'group').map((layer) => ({ id: layer.id, name: layer.name, active: layer.id === current.activeLayerId }))
  }, [])

  /** The seed values a popup needs, resolved at the moment it opens. */
  const dialogPayload = useCallback((name: DialogName): DialogPayload => {
    const current = docRef.current
    const canvas = current ? canvasesRef.current.get(current.activeLayerId) : null
    const active = current?.layers.find((layer) => layer.id === current.activeLayerId)
    const sel = selectionRef.current
    return {
      language: settingsRef.current.language,
      theme: settingsRef.current.theme,
      settings: settingsRef.current,
      adjust: { ...adjustRef.current, width: current?.width ?? 1280, height: current?.height ?? 720 },
      curves: name === 'curves' ? (active?.curves ?? defaultCurves()) : undefined,
      levels: name === 'levels' ? (active?.levels ?? (canvas ? { ...autoLevels(canvas), gamma: 1 } : undefined)) : undefined,
      autoLevels: canvas ? autoLevels(canvas) : undefined,
      text: textValueRef.current,
      error: errorRef.current ?? undefined,
      print: name === 'print' && current ? printPreview(current, canvasesRef.current) : undefined,
      printers: name === 'print' ? printersRef.current : undefined,
      info: name === 'imageInfo' && current ? imageInfoSections(current, canvasesRef.current, settingsRef.current.language) : undefined,
      channels: current?.channels?.map(({ id, name: label }) => ({ id, name: label })),
      paths: current?.paths.map(({ id, name: label }) => ({ id, name: label })),
      patterns: current?.patterns?.map(({ id, name: label }) => ({ id, name: label })),
      textData: active?.kind === 'text' ? active.text : undefined,
      profile: { current: current?.profile ?? 'srgb', embedded: embeddedProfileRef.current ?? undefined },
      threeD: active?.threeD,
      layers: layerChoices(),
      effects: active?.effects,
      gradients: settingsRef.current.gradients,
      luts: lutChoices(),
      recentFiles: settingsRef.current.recentFiles,
      shortcuts: Object.entries({ ...defaultToolKeys, ...invertShortcuts(settingsRef.current.shortcuts) }).map(([key, toolId]) => ({ tool: toolId, key, label: toolId })),
      hasSelection: Boolean(sel),
      docSize: { width: current.width, height: current.height },
      selectionBox: sel ? { x: sel.x, y: sel.y, width: sel.width, height: sel.height } : undefined,
      stats: { layers: current.layers.filter((layer) => layer.visible && layer.kind !== 'group').length },
      version: '1.0.0',
      creator: 'SHKWON (knix008@naver.com)',
    }
  }, [layerChoices])

  const [inPagePayload, setInPagePayload] = useState<DialogPayload | null>(null)

  const openDialog = useCallback((name: DialogName, extra?: Partial<DialogPayload>) => {
    if (replayingAction) {
      return
    }
    const payload = { ...dialogPayload(name), ...extra }
    if (window.electronDialogApi) {
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

  const openDialogRef = useRef<(name: DialogName, extra?: Partial<DialogPayload>) => void>(() => {})
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

  const bump = useCallback(() => {
    setFrame((value) => value + 1)
    // The History panel's rows, and the colour sampler's readouts, follow the pixels.
    setHistoryMeta({ undo: undoRef.current.map((item) => ({ label: item.label, at: item.at })), redo: redoRef.current.map((item) => ({ label: item.label, at: item.at })) })
    if (!docRef.current.samplers.length) setSamplerValues((value) => (value.length ? [] : value))
    if (docRef.current.samplers.length && !samplerTimerRef.current) {
      samplerTimerRef.current = window.setTimeout(() => {
        samplerTimerRef.current = 0
        const current = docRef.current
        const composite = compositeDocument(current, canvasesRef.current)
        const ctx = context2d(composite)
        setSamplerValues(current.samplers.map((item) => {
          const data = ctx.getImageData(Math.max(0, Math.min(current.width - 1, Math.floor(item.x))), Math.max(0, Math.min(current.height - 1, Math.floor(item.y))), 1, 1).data
          return { id: item.id, x: item.x, y: item.y, r: data[0], g: data[1], b: data[2] }
        }))
      }, 200)
    }
  }, [])

  const activeLayer = doc.layers.find((layer) => layer.id === doc.activeLayerId) ?? null

  const markDirty = useCallback(() => {
    setDirty(true)
    setSavedNote(false)
    bump()
  }, [bump])

  /** Files the state under the pending label (a command, a tool, a window) and clears it. */
  const snapshot = useCallback((label?: string) => {
    if (!docRef.current) {
      return
    }
    const chosen = label ?? historyLabelRef.current ?? undefined
    historyLabelRef.current = null
    pushHistory(undoRef.current, takeSnapshot(docRef.current, canvasesRef.current, chosen))
    redoRef.current = []
    bump()
  }, [bump])

  const replaceDocument = useCallback((next: PhotoDocument, canvases: Map<string, HTMLCanvasElement>, resetHistory = true) => {
    closeAllDialogs()
    moveOriginRef.current.clear()
    previewRef.current = null
    previewMaskRef.current = null
    liquifyRef.current = null
    quickMaskRef.current = null
    setQuickMask(false)
    canvasesRef.current = canvases
    setDoc(next)
    setSelection(null)
    setCrop(null)
    setDirty(false)
    setSelectedLayerIds([])
    if (resetHistory) {
      undoRef.current = []
      redoRef.current = []
      openedRef.current = takeSnapshot(next, canvases, t(settingsRef.current.language, 'openState'))
      setNamedSnapshots([])
      setHistorySourceIndex(null)
    }
    bump()
  }, [bump, closeAllDialogs])

  const updateDoc = useCallback((updater: (current: PhotoDocument) => PhotoDocument) => {
    setDoc((current) => (current ? updater(current) : current))
    markDirty()
  }, [markDirty])

  /* -------------------------------------------------------- error reports */

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

  useEffect(() => window.electronDialogApi?.onError?.(({ source, message, details }) => {
    const report = { title: t(settingsRef.current.language, 'errorInWindow'), message, details }
    setError(report)
    errorRef.current = report
    openDialogRef.current('error')
    void source
  }), [])

  const showError = useCallback((title: string, message: string, details: unknown) => {
    reportErrorRef.current(`${title} — ${message}`, details)
  }, [])

  /** A short note in the status bar, for commands that have nothing to show. */
  const note = useCallback((key: string) => {
    setStatus(key)
    window.setTimeout(() => setStatus((current) => (current === key ? 'ready' : current)), 2400)
  }, [])

  const fitZoom = useCallback((document: PhotoDocument) => {
    const stage = stageRef.current
    if (!stage) {
      return
    }
    const zoom = Math.min(4, Math.max(0.05, Math.min((stage.clientWidth - 80) / document.width, (stage.clientHeight - 80) / document.height)))
    setSettings((current) => ({ ...current, zoom }))
    setPan({ x: Math.max(24, (stage.clientWidth - document.width * zoom) / 2), y: Math.max(24, (stage.clientHeight - document.height * zoom) / 2) })
  }, [])

  /* ------------------------------------------------------------- documents */

  /** Parks the document on screen into its slot, so another can be shown. */
  const parkActiveDocument = useCallback(() => {
    const id = activeDocIdRef.current
    const existing = slotsRef.current.get(id)
    slotsRef.current.set(id, {
      id,
      document: docRef.current,
      canvases: canvasesRef.current,
      undo: undoRef.current,
      redo: redoRef.current,
      dirty: dirtyRef.current,
      smartParent: existing?.smartParent,
      opened: openedRef.current ?? undefined,
      namedSnapshots: existing?.namedSnapshots ?? [],
    })
  }, [])

  const refreshDocList = useCallback(() => {
    setDocList([...slotsRef.current.values()].map((slot) => ({ id: slot.id, name: slot.document.name, dirty: slot.dirty })))
  }, [])

  /** Shows a parked document. */
  const showSlot = useCallback((slot: DocumentSlot) => {
    parkActiveDocument()
    closeAllDialogs()
    moveOriginRef.current.clear()
    previewRef.current = null
    previewMaskRef.current = null
    canvasesRef.current = slot.canvases
    undoRef.current = slot.undo
    redoRef.current = slot.redo
    // The refs are what the next park reads, so they change now, not after
    // the render: opening several documents in one go must not let the
    // previous one's state overwrite the slot just made.
    docRef.current = slot.document
    dirtyRef.current = slot.dirty
    openedRef.current = slot.opened ?? null
    setNamedSnapshots(slot.namedSnapshots)
    setDoc(slot.document)
    setDirty(slot.dirty)
    setSelection(null)
    setCrop(null)
    setActiveDocId(slot.id)
    activeDocIdRef.current = slot.id
    setSelectedLayerIds([])
    bump()
    requestAnimationFrame(() => fitZoom(slot.document))
    refreshDocList()
  }, [bump, closeAllDialogs, fitZoom, parkActiveDocument, refreshDocList])

  /** Opens a document in a new tab, keeping the one on screen. */
  const openInNewSlot = useCallback((next: PhotoDocument, canvases: Map<string, HTMLCanvasElement>, smartParent?: DocumentSlot['smartParent']) => {
    parkActiveDocument()
    const id = createId('doc')
    const slot: DocumentSlot = {
      id, document: next, canvases, undo: [], redo: [], dirty: false, smartParent, namedSnapshots: [],
      opened: takeSnapshot(next, canvases, t(settingsRef.current.language, 'openState')),
    }
    slotsRef.current.set(id, slot)
    showSlot(slot)
  }, [parkActiveDocument, showSlot])

  const switchDocument = useCallback((id: string) => {
    if (id === activeDocIdRef.current) return
    const slot = slotsRef.current.get(id)
    if (slot) showSlot(slot)
  }, [showSlot])

  const cycleDocument = useCallback((direction: 1 | -1) => {
    parkActiveDocument()
    const ids = [...slotsRef.current.keys()]
    if (ids.length < 2) return
    const index = ids.indexOf(activeDocIdRef.current)
    const next = ids[(index + direction + ids.length) % ids.length]
    switchDocument(next)
  }, [parkActiveDocument, switchDocument])

  // The startup document is the first slot, so the tab strip and Window menu can see it.
  useEffect(() => {
    if (!slotsRef.current.has(activeDocIdRef.current)) {
      parkActiveDocument()
      openedRef.current = takeSnapshot(docRef.current, canvasesRef.current, t(settingsRef.current.language, 'openState'))
      refreshDocList()
    }
  }, [parkActiveDocument, refreshDocList])

  useEffect(() => {
    // Keep the tab strip's names and dirty marks current.
    const slot = slotsRef.current.get(activeDocId)
    if (slot) {
      slot.document = doc
      slot.dirty = dirty
      slot.namedSnapshots = namedSnapshots
    }
    refreshDocList()
  }, [activeDocId, dirty, doc, namedSnapshots, refreshDocList])

  const createDocument = useCallback((name: string, width: number, height: number, background: PhotoDocument['background']) => {
    const created = createBlankDocument(name, width, height, background, background === 'transparent' ? tr('layerName') : tr('backgroundLayer'))
    if (slotsRef.current.size > 0 && docRef.current) {
      openInNewSlot(created.document, created.canvases)
    } else {
      replaceDocument(created.document, created.canvases)
      requestAnimationFrame(() => fitZoom(created.document))
    }
    setStatus('ready')
  }, [fitZoom, openInNewSlot, replaceDocument, tr])

  const screenToDoc = useCallback((clientX: number, clientY: number): Point => {
    const stage = stageRef.current
    if (!stage) {
      return { x: 0, y: 0 }
    }
    const box = stage.getBoundingClientRect()
    const zoom = settingsRef.current.zoom
    return { x: (clientX - box.left - pan.x) / zoom, y: (clientY - box.top - pan.y) / zoom }
  }, [pan.x, pan.y])

  /** The stage's pixel size, for the navigator and print-size zoom. */
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const measure = () => setStageSize({ width: stage.clientWidth, height: stage.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  const remember = useCallback((path?: string) => {
    if (!path) return
    setSettings((current) => ({ ...current, recentFiles: [path, ...current.recentFiles.filter((item) => item !== path)].slice(0, 20) }))
  }, [])

  /* --------------------------------------------------------------- files */

  const blankDocumentShape = (name: string, width: number, height: number): PhotoDocument => ({
    name, width, height, background: 'transparent', layers: [], activeLayerId: '', guides: [], notes: [], samplers: [], counts: [], paths: [], slices: [], frames: [], measure: null, colorMode: 'rgb', profile: 'srgb',
  })

  const openFiles = useCallback(async (files: { name: string; mime?: string; text?: string; dataUrl?: string; arrayBuffer?: ArrayBuffer; path?: string; size?: number }[], mode: 'open' | 'place' | 'smart' | 'linked') => {
    try {
      for (const file of files) {
        // A colour lookup table is not a picture: it joins the LUT list.
        if (/\.cube$/i.test(file.name)) {
          const text = file.text ?? (file.dataUrl ? atob(file.dataUrl.split(',')[1] ?? '') : '')
          const lut = parseCube(text, file.name.replace(/\.cube$/i, ''))
          const id = `file-${createId('lut')}`
          registerLut(id, lut)
          loadedLutsRef.current.push({ id, name: lut.name })
          note('saved')
          continue
        }
        const decoded = await decodeImageSource(file)
        embeddedProfileRef.current = decoded.kind === 'canvas'
          ? decoded.details?.find((row) => row.label === 'Colour profile')?.value ?? null
          : null
        if (decoded.kind === 'project') {
          const restored = await restoreProject(decoded.project)
          if (file.path) restored.document.filePath = file.path
          restored.document.name = file.name.replace(/\.mpw$/i, '')
          if (mode === 'place' || mode === 'linked') {
            // A project placed into another comes in flattened.
            const flat = compositeDocument(restored.document, restored.canvases)
            const layer = createLayerMeta(file.name)
            layer.sourcePath = file.path
            const canvas = createCanvas(docRef.current.width, docRef.current.height)
            context2d(canvas).drawImage(flat, 0, 0)
            snapshot(tr('place'))
            canvasesRef.current.set(layer.id, canvas)
            updateDoc((current) => ({ ...current, layers: [...current.layers, layer], activeLayerId: layer.id }))
            continue
          }
          replaceDocument(restored.document, restored.canvases)
          requestAnimationFrame(() => fitZoom(restored.document))
          remember(file.path)
          continue
        }
        if (decoded.kind === 'psd') {
          const { psd } = decoded
          if (mode === 'place' || mode === 'linked' || mode === 'smart') {
            const layer = createLayerMeta(file.name)
            layer.sourcePath = file.path
            const canvas = createCanvas(docRef.current.width, docRef.current.height)
            context2d(canvas).drawImage(psd.composite, 0, 0)
            snapshot(tr('place'))
            canvasesRef.current.set(layer.id, canvas)
            updateDoc((current) => ({ ...current, layers: [...current.layers, layer], activeLayerId: layer.id }))
            continue
          }
          const canvases = new Map<string, HTMLCanvasElement>()
          const layers: LayerMeta[] = []
          for (const item of psd.layers) {
            layers.push(item.meta)
            if (item.canvas) canvases.set(item.meta.id, item.canvas)
            if (item.mask) canvases.set(`${item.meta.id}:mask`, item.mask)
          }
          if (!layers.length) {
            const layer = createLayerMeta(tr('backgroundLayer'))
            layers.push(layer)
            canvases.set(layer.id, psd.composite)
          }
          const next: PhotoDocument = {
            ...blankDocumentShape(file.name.replace(/\.[^.]+$/, ''), psd.width, psd.height),
            layers,
            activeLayerId: layers[layers.length - 1].id,
            filePath: undefined,
            colorMode: psd.colorMode,
            depth: psd.depth,
            source: { name: file.name, path: file.path, mime: file.mime, byteSize: file.size, details: decoded.details ?? [] },
          }
          replaceDocument(next, canvases)
          requestAnimationFrame(() => fitZoom(next))
          remember(file.path)
          continue
        }
        if ((mode === 'place' || mode === 'linked' || mode === 'smart') && docRef.current && (mode !== 'smart' || slotsRef.current.size > 0)) {
          snapshot(tr('place'))
          const layer = createLayerMeta(file.name)
          layer.sourcePath = mode === 'linked' ? file.path : undefined
          const canvas = createCanvas(docRef.current.width, docRef.current.height)
          context2d(canvas).drawImage(decoded.canvas, 0, 0)
          canvasesRef.current.set(layer.id, canvas)
          if (mode === 'smart') {
            // Placed as a smart object: the original is kept untouched.
            layer.smart = true
            layer.smartTransform = { scaleX: 1, scaleY: 1, rotate: 0, x: 0, y: 0 }
            layer.smartFilters = []
            canvasesRef.current.set(smartSourceKey(layer.id), cloneCanvas(decoded.canvas))
          }
          updateDoc((current) => ({ ...current, layers: [...current.layers, layer], activeLayerId: layer.id }))
        } else {
          const layer = createLayerMeta(file.name)
          const canvas = cloneCanvas(decoded.canvas)
          const next: PhotoDocument = {
            ...blankDocumentShape(file.name.replace(/\.[^.]+$/, ''), canvas.width, canvas.height),
            layers: [layer],
            activeLayerId: layer.id,
            filePath: file.path,
            source: { name: file.name, path: file.path, mime: file.mime, byteSize: file.size, details: decoded.details ?? [] },
          }
          if (slotsRef.current.size > 0 && dirtyRef.current) {
            openInNewSlot(next, new Map([[layer.id, canvas]]))
          } else {
            replaceDocument(next, new Map([[layer.id, canvas]]))
            requestAnimationFrame(() => fitZoom(next))
          }
          remember(file.path)
        }
      }
      setStatus('ready')
    } catch (cause) {
      showError(tr('errorTitle'), tr('open'), cause)
    }
  }, [fitZoom, note, openInNewSlot, remember, replaceDocument, showError, snapshot, tr, updateDoc])

  const pickFiles = useCallback(async (mode: 'open' | 'place' | 'smart' | 'linked') => {
    if (window.electronFileApi) {
      const result = await window.electronFileApi.openFiles()
      if (!result.canceled) {
        await openFiles(result.files, mode)
      }
      return
    }
    if (mode === 'open') fileRef.current?.click()
    else {
      multiPurposeRef.current = mode
      placeRef.current?.click()
    }
  }, [openFiles])

  /** Several files at once, for the automation commands: decoded to canvases. */
  const pickMany = useCallback(async (purpose: string): Promise<{ name: string; canvas: HTMLCanvasElement }[]> => {
    const decode = async (files: { name: string; mime?: string; text?: string; dataUrl?: string; arrayBuffer?: ArrayBuffer }[]) => {
      const out: { name: string; canvas: HTMLCanvasElement }[] = []
      for (const file of files) {
        const decoded = await decodeImageSource(file)
        if (decoded.kind === 'canvas') out.push({ name: file.name, canvas: decoded.canvas })
        else if (decoded.kind === 'psd') out.push({ name: file.name, canvas: decoded.psd.composite })
        else {
          const restored = await restoreProject(decoded.project)
          out.push({ name: file.name, canvas: compositeDocument(restored.document, restored.canvases) })
        }
      }
      return out
    }
    if (window.electronFileApi) {
      const result = await window.electronFileApi.openFiles()
      if (result.canceled) return []
      return decode(result.files)
    }
    return new Promise((resolve) => {
      multiPurposeRef.current = purpose
      const input = multiRef.current
      if (!input) { resolve([]); return }
      input.onchange = async () => {
        const files = input.files ? [...input.files] : []
        input.value = ''
        resolve(await decode(await Promise.all(files.map(fileToOpenItem))))
      }
      input.click()
    })
  }, [])

  const readPath = useCallback(async (path: string) => {
    if (!window.electronFileApi?.readFile) return
    const result = await window.electronFileApi.readFile({ filePath: path })
    if (result.canceled || !result.files.length) {
      showError(tr('open'), result.message ?? tr('openFailed'), new Error(result.message ?? path))
      return
    }
    await openFiles(result.files, 'open')
  }, [openFiles, showError, tr])

  const saveProject = useCallback(async (saveAs = false, copy = false) => {
    if (!doc) {
      return false
    }
    try {
      // A smart object's contents: saving writes it back into its parent.
      const slot = slotsRef.current.get(activeDocIdRef.current)
      if (slot?.smartParent && !saveAs && !copy) {
        const parent = slotsRef.current.get(slot.smartParent.docId)
        if (parent) {
          const flat = compositeDocument(doc, canvasesRef.current)
          parent.canvases.set(smartSourceKey(slot.smartParent.layerId), flat)
          parent.dirty = true
          setDirty(false)
          setSavedNote(true)
          window.setTimeout(() => setSavedNote(false), 1600)
          return true
        }
      }
      const project = JSON.stringify(serializeProject(doc, canvasesRef.current), null, 2)
      const fileName = `${doc.name || tr('untitled')}.mpw`
      if (window.electronFileApi) {
        if (!saveAs && !copy && doc.filePath && /\.mpw$/i.test(doc.filePath)) {
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
          if (!copy) {
            setDoc((current) => current ? { ...current, filePath: savedPath, name: savedPath.split(/[/\\]/).pop()?.replace(/\.mpw$/i, '') ?? current.name } : current)
            remember(savedPath)
          }
        }
      } else {
        downloadDataUrl(`data:application/json;charset=utf-8,${encodeURIComponent(project)}`, fileName)
      }
      if (!copy) setDirty(false)
      setSavedNote(true)
      window.setTimeout(() => setSavedNote(false), 1600)
      return true
    } catch (cause) {
      showError(tr('errorTitle'), tr('save'), cause)
      return false
    }
  }, [doc, remember, showError, tr])

  /** Every layer rendered to document-sized pixels, for the PSD writer. */
  const renderedLayers = useCallback(() => {
    const current = docRef.current
    return current.layers.map((layer) => {
      if (layer.kind === 'group' || layer.kind === 'adjustment') return { meta: layer, canvas: null, mask: canvasesRef.current.get(`${layer.id}:mask`) ?? null }
      const alone = { ...layer, opacity: 1, blendMode: 'source-over' as const, clipped: false, maskEnabled: false, effects: defaultEffects() }
      const flat = compositeDocument({ ...current, background: 'transparent', layers: [alone], colorMode: 'rgb' }, canvasesRef.current)
      return { meta: layer, canvas: flat, mask: canvasesRef.current.get(`${layer.id}:mask`) ?? null }
    })
  }, [])

  const savePsd = useCallback(async () => {
    const current = docRef.current
    try {
      const bytes = writePsd(current, renderedLayers(), compositeDocument(current, canvasesRef.current))
      let binary = ''
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      const dataUrl = `data:image/vnd.adobe.photoshop;base64,${btoa(binary)}`
      const fileName = `${current.name || tr('untitled')}.psd`
      if (window.electronFileApi) {
        const result = await window.electronFileApi.saveFile({ fileName, filters: [{ name: 'Photoshop', extensions: ['psd'] }], dataUrl })
        if (result.canceled) return
        remember(result.filePath)
      } else {
        downloadDataUrl(dataUrl, fileName)
      }
      setSavedNote(true)
      window.setTimeout(() => setSavedNote(false), 1600)
    } catch (cause) {
      showError(tr('savePsd'), tr('exportFailed'), cause)
    }
  }, [remember, renderedLayers, showError, tr])

  const saveCanvasAs = useCallback(async (canvas: HTMLCanvasElement, baseName: string, format: ExportFormat, quality?: number, transparent?: boolean) => {
    const dataUrl = await encodeExport(canvas, format, quality, transparent ?? settingsRef.current.exportTransparent, docRef.current.depth ?? 8)
    const fileName = `${baseName}.${extensionFor(format)}`
    if (window.electronFileApi) {
      const result = await window.electronFileApi.saveFile({ fileName, filters: [{ name: format.toUpperCase(), extensions: [extensionFor(format)] }], dataUrl })
      return !result.canceled
    }
    downloadDataUrl(dataUrl, fileName)
    return true
  }, [])

  const exportImage = useCallback(async (format: ExportFormat, options?: { quality?: number; scale?: number; transparent?: boolean }) => {
    if (!doc) {
      return
    }
    try {
      let composite = compositeDocument(doc, canvasesRef.current)
      if (options?.scale && options.scale !== 1) {
        composite = resizeCanvasContent(composite, Math.max(1, Math.round(composite.width * options.scale)), Math.max(1, Math.round(composite.height * options.scale)))
      }
      const ok = await saveCanvasAs(composite, doc.name || tr('untitled'), format, options?.quality, options?.transparent)
      if (ok) setStatus('saved')
    } catch (cause) {
      showError(tr('errorTitle'), tr('export'), cause)
    }
  }, [doc, saveCanvasAs, showError, tr])

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
        const result = await window.electronPrintApi.print({ html, deviceName, landscape: orientation === 'landscape', copies })
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
      await saveCanvasAs(cropToRect(flat, slice), `${current.name}-${slice.name}`, settingsRef.current.exportFormat)
      setSavedNote(true)
    } catch (error) {
      showError(tr('exportSlice'), tr('exportFailed'), error)
    }
  }, [saveCanvasAs, showError, tr])

  /* ------------------------------------------------------------- history */

  const undo = useCallback(() => {
    const previous = undoRef.current.pop()
    if (!previous || !docRef.current) {
      return
    }
    pushHistory(redoRef.current, takeSnapshot(docRef.current, canvasesRef.current, previous.label))
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
    pushHistory(undoRef.current, takeSnapshot(docRef.current, canvasesRef.current, next.label))
    canvasesRef.current = next.canvases
    moveOriginRef.current.clear()
    setDoc(next.document)
    markDirty()
  }, [markDirty])

  /** Jumps to a row of the History panel: index counts undo states, then the current one, then redo states. */
  const jumpHistory = useCallback((index: number) => {
    const undoCount = undoRef.current.length
    if (index < undoCount) {
      for (let i = 0; i < undoCount - index; i += 1) undo()
    } else if (index > undoCount) {
      for (let i = 0; i < index - undoCount; i += 1) redo()
    }
  }, [redo, undo])

  const takeNamedSnapshot = useCallback((name: string) => {
    const shot = takeSnapshot(docRef.current, canvasesRef.current, name)
    setNamedSnapshots((current) => [...current, { id: createId('shot'), name, snapshot: shot }])
  }, [])

  const restoreNamedSnapshot = useCallback((id: string) => {
    const item = namedSnapshots.find((entry) => entry.id === id)
    if (!item) return
    snapshot(item.name)
    canvasesRef.current = new Map([...item.snapshot.canvases].map(([key, canvas]) => [key, cloneCanvas(canvas)]))
    moveOriginRef.current.clear()
    setDoc(cloneDocument(item.snapshot.document))
    markDirty()
  }, [markDirty, namedSnapshots, snapshot])

  /** The pixels the history brush paints from: a chosen state, or the opened one. */
  const historySourceCanvas = useCallback((layerId: string) => {
    const index = historySourceRef.current
    const state = index === null ? openedRef.current : undoRef.current[index] ?? openedRef.current
    return state?.canvases.get(layerId) ?? null
  }, [])

  /* ---------------------------------------------------------- withLayer */

  /**
   * Runs an edit on the active layer's pixels — or on its mask, when the mask
   * is the paint target — after the locks have had their say.
   */
  const withLayer = useCallback((fn: (canvas: HTMLCanvasElement, layer: LayerMeta) => void, record = true, forceLayer = false) => {
    const current = docRef.current
    const layer = current?.layers.find((item) => item.id === current.activeLayerId)
    const language = settingsRef.current.language
    if (!current || !layer) {
      setStatus('noLayer')
      reportErrorRef.current(t(language, 'noLayerTitle'), new Error(t(language, 'noLayerBody')))
      return false
    }
    // Quick Mask: paint goes into the selection itself.
    if (quickMaskRef.current && !forceLayer) {
      if (record) snapshot()
      fn(quickMaskRef.current, layer)
      const mask = new Uint8Array(current.width * current.height)
      const data = context2d(quickMaskRef.current).getImageData(0, 0, current.width, current.height).data
      for (let i = 0; i < mask.length; i += 1) mask[i] = data[i * 4 + 3]
      setSelection({ kind: 'mask', ...maskBounds(mask, current.width, current.height), mask })
      bump()
      return true
    }
    const onMask = settingsRef.current.paintTarget === 'mask' && layer.maskEnabled && !forceLayer
    const canvas = onMask ? canvasesRef.current.get(`${layer.id}:mask`) : canvasesRef.current.get(current.activeLayerId)
    if (!canvas) {
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
    if (layer.lockTransparent && !onMask) {
      // Only pixels that already have coverage may change: the edit is
      // clipped back to the layer's own alpha afterwards.
      const before = cloneCanvas(canvas)
      fn(canvas, layer)
      const ctx = context2d(canvas)
      ctx.save()
      ctx.globalCompositeOperation = 'destination-in'
      ctx.drawImage(before, 0, 0)
      ctx.restore()
    } else {
      fn(canvas, layer)
    }
    moveOriginRef.current.delete(layer.id)
    markDirty()
    return true
  }, [bump, markDirty, snapshot])

  const applyCrop = useCallback((box: Selection) => {
    const current = docRef.current
    if (!current || box.width < 2 || box.height < 2) {
      return
    }
    snapshot(tr('crop'))
    const x = Math.max(0, Math.floor(box.x))
    const y = Math.max(0, Math.floor(box.y))
    const width = Math.min(current.width - x, Math.round(box.width))
    const height = Math.min(current.height - y, Math.round(box.height))
    const nextCanvases = new Map<string, HTMLCanvasElement>()
    for (const [key, source] of canvasesRef.current) {
      if (key.startsWith('pattern:')) { nextCanvases.set(key, source); continue }
      const canvas = createCanvas(width, height)
      context2d(canvas).drawImage(source, x, y, width, height, 0, 0, width, height)
      nextCanvases.set(key, canvas)
    }
    canvasesRef.current = nextCanvases
    moveOriginRef.current.clear()
    setDoc({ ...cloneDocument(current), width, height, guides: current.guides.map((guide) => ({ ...guide, position: guide.position - (guide.axis === 'x' ? x : y) })) })
    setCrop(null)
    setSelection(null)
    markDirty()
  }, [markDirty, snapshot, tr])

  /** Replaces every canvas of the document with one made by `make`. */
  const remapAllCanvases = useCallback((make: (source: HTMLCanvasElement, key: string) => HTMLCanvasElement, width: number, height: number, label: string) => {
    const current = docRef.current
    snapshot(label)
    const next = new Map<string, HTMLCanvasElement>()
    for (const [key, source] of canvasesRef.current) {
      next.set(key, key.startsWith('pattern:') ? source : make(source, key))
    }
    canvasesRef.current = next
    moveOriginRef.current.clear()
    setDoc({ ...cloneDocument(current), width, height })
    markDirty()
  }, [markDirty, snapshot])

  /* ---------------------------------------------------------------- paths */

  const updatePaths = useCallback((fn: (paths: PathShape[]) => PathShape[]) => {
    updateDoc((current) => ({ ...current, paths: fn(current.paths) }))
  }, [updateDoc])

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
    transformSelectionRef.current = null
    transformSourceRef.current = cloneCanvas(canvas)
    const bounds = layerBounds(canvas)
    setTransformBox(bounds ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, angle: 0, flipX: false, flipY: false } : identityTransform(current.width, current.height))
    // The source is the content cut to its bounds, so the box hugs the pixels.
    if (bounds) {
      const cut = createCanvas(bounds.width, bounds.height)
      context2d(cut).drawImage(canvas, -bounds.x, -bounds.y)
      transformSourceRef.current = cut
    }
    setStatus('transforming')
  }, [])

  /** Transform Selection: the box moves the selection outline, not the pixels. */
  const beginTransformSelection = useCallback(() => {
    const current = docRef.current
    const sel = selectionRef.current
    if (!current || !sel) return
    const mask = selectionToMask(sel, current.width, current.height)
    if (!mask) return
    const grey = maskToGreyCanvas(mask, current.width, current.height)
    const alpha = createCanvas(current.width, current.height)
    const image = context2d(alpha).createImageData(current.width, current.height)
    for (let i = 0; i < mask.length; i += 1) { image.data[i * 4] = 255; image.data[i * 4 + 1] = 255; image.data[i * 4 + 2] = 255; image.data[i * 4 + 3] = mask[i] }
    context2d(alpha).putImageData(image, 0, 0)
    void grey
    const bounds = selectionBounds(sel, current)
    const cut = createCanvas(bounds.width, bounds.height)
    context2d(cut).drawImage(alpha, -bounds.x, -bounds.y)
    transformSelectionRef.current = cut
    transformSourceRef.current = null
    setTransformBox({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, angle: 0, flipX: false, flipY: false })
    setStatus('freeTransformSel')
  }, [])

  const commitTransform = useCallback(() => {
    const box = transformRef.current
    const current = docRef.current
    if (transformSelectionRef.current && box && current) {
      const moved = applyTransform(transformSelectionRef.current, box, current.width, current.height)
      const data = context2d(moved).getImageData(0, 0, current.width, current.height).data
      const mask = new Uint8Array(current.width * current.height)
      for (let i = 0; i < mask.length; i += 1) mask[i] = data[i * 4 + 3]
      setSelection({ kind: 'mask', ...maskBounds(mask, current.width, current.height), mask })
      transformSelectionRef.current = null
      setTransformBox(null)
      setStatus('ready')
      return
    }
    const source = transformSourceRef.current
    if (!box || !source || !current) {
      setTransformBox(null)
      transformSourceRef.current = null
      return
    }
    snapshot(tr('freeTransform'))
    const layer = current.layers.find((item) => item.id === current.activeLayerId)
    if (layer?.smart && layer.smartTransform) {
      // A smart object only records how its original is placed.
      const original = canvasesRef.current.get(smartSourceKey(layer.id))
      if (original) {
        updateDoc((document) => ({
          ...document,
          layers: document.layers.map((item) => (item.id === layer.id
            ? { ...item, smartTransform: { scaleX: box.width / original.width * (box.flipX ? -1 : 1), scaleY: box.height / original.height * (box.flipY ? -1 : 1), rotate: (box.angle * Math.PI) / 180, x: box.x, y: box.y } }
            : item)),
        }))
      }
    }
    canvasesRef.current.set(current.activeLayerId, applyTransform(source, box, current.width, current.height))
    moveOriginRef.current.delete(current.activeLayerId)
    transformSourceRef.current = null
    setTransformBox(null)
    setStatus('ready')
    markDirty()
  }, [markDirty, snapshot, tr, updateDoc])

  const cancelTransform = useCallback(() => {
    transformSelectionRef.current = null
    transformSourceRef.current = null
    setTransformBox(null)
    setStatus('ready')
    bump()
  }, [bump])

  const flipLayer = useCallback((axis: 'x' | 'y') => {
    withLayer((canvas, layer) => {
      canvasesRef.current.set(layer.id, flipCanvas(canvas, axis))
    }, true, true)
  }, [withLayer])

  const flipDocument = useCallback((axis: 'x' | 'y') => {
    const current = docRef.current
    if (!current) return
    snapshot(tr(axis === 'x' ? 'flipH' : 'flipV'))
    for (const [key, source] of canvasesRef.current) {
      if (key.startsWith('pattern:')) continue
      canvasesRef.current.set(key, flipCanvas(source, axis))
    }
    markDirty()
  }, [markDirty, snapshot, tr])

  /* --------------------------------------------------------- layer groups */

  const groupActiveLayer = useCallback(() => {
    const current = docRef.current
    if (!current) return
    snapshot(tr('groupLayers'))
    const folder = createLayerMeta(tr('layerGroup'), 'group')
    const members = new Set(selectedLayerIds.length ? selectedLayerIds : [current.activeLayerId])
    updateDoc((value) => {
      const index = value.layers.findIndex((layer) => members.has(layer.id))
      if (index < 0) return value
      const layers = value.layers.map((layer) => (members.has(layer.id) ? { ...layer, parentId: folder.id } : layer))
      layers.splice(index, 0, folder)
      return { ...value, layers }
    })
  }, [selectedLayerIds, snapshot, tr, updateDoc])

  const ungroupActiveLayer = useCallback(() => {
    const current = docRef.current
    const layer = current?.layers.find((item) => item.id === current.activeLayerId)
    if (!current || !layer) return
    const folderId = layer.kind === 'group' ? layer.id : layer.parentId
    if (!folderId) return
    snapshot(tr('ungroupLayers'))
    updateDoc((value) => ({
      ...value,
      layers: value.layers
        .filter((item) => item.id !== folderId)
        .map((item) => (item.parentId === folderId ? { ...item, parentId: undefined } : item)),
    }))
  }, [snapshot, tr, updateDoc])

  const openCurves = useCallback(() => openDialog('curves'), [openDialog])
  const openLevels = useCallback(() => openDialog('levels'), [openDialog])

  /* --------------------------------------------------------------- shapes */

  const addShapeLayer = useCallback((currentTool: Tool, box: { x: number; y: number; width: number; height: number }) => {
    const options = settingsRef.current
    let kind = shapeKindForTool[currentTool] ?? 'rect'
    let outline: PathShape['nodes'] | undefined
    if (currentTool === 'customShape') {
      const chosen = options.customShapeKind
      if (['star', 'heart', 'arrow', 'triangle'].includes(chosen)) kind = chosen as typeof kind
      else {
        const custom = options.customShapes.find((item) => item.id === chosen)
        if (custom) { kind = 'custom'; outline = custom.outline }
      }
    }
    snapshot(toolLabel(options.language, currentTool))
    const layer = createLayerMeta(toolLabel(options.language, currentTool), 'shape')
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
      outline,
      outlineClosed: true,
    }
    updateDoc((current) => ({ ...current, layers: [...current.layers, layer], activeLayerId: layer.id }))
  }, [snapshot, updateDoc])

  /* ------------------------------------------------------------ selection */

  /** The selection mode a drag was started with: the option bar, or Shift/Alt over it. */
  const modeFor = useCallback((event: { shiftKey: boolean; altKey: boolean }) => {
    if (event.shiftKey && event.altKey) return 'intersect' as const
    if (event.shiftKey) return 'add' as const
    if (event.altKey) return 'subtract' as const
    return settingsRef.current.selectionMode
  }, [])

  /** Combines a fresh selection with the one that was there, by mode. */
  const combineSelection = useCallback((base: Selection | null, incoming: Selection | null, mode: AppSettings['selectionMode']) => {
    const current = docRef.current
    if (!incoming) return mode === 'new' ? null : base
    if (mode === 'new' || !base) return mode === 'intersect' && !base ? null : mode === 'subtract' && !base ? null : incoming
    const { width, height } = current
    const existing = selectionToMask(base, width, height)
    const next = selectionToMask(incoming, width, height)
    if (!next) return base
    const mask = combineMasks(existing, next, mode)
    const bounds = maskBounds(mask, width, height)
    return bounds.width > 0 && bounds.height > 0 ? { kind: 'mask' as const, ...bounds, mask } : null
  }, [])

  /** Feather and anti-alias from the option bar, applied to what a tool drew. */
  const finishSelection = useCallback((fresh: Selection | null) => {
    const current = docRef.current
    const feather = settingsRef.current.marqueeFeather
    if (!fresh || !feather) return fresh
    return featherSelection(fresh, current.width, current.height, feather)
  }, [])

  const closePolySelection = useCallback(() => {
    const points = polyPointsRef.current
    setPolyPoints([])
    const current = docRef.current
    if (!current || points.length < 3) {
      return
    }
    const drag = dragRef.current
    const base = drag?.base ?? selectionRef.current
    const mode = drag?.mode === 'magnetic' || drag?.shift !== undefined ? (drag?.shift && drag?.alt ? 'intersect' : drag?.shift ? 'add' : drag?.alt ? 'subtract' : settingsRef.current.selectionMode) : settingsRef.current.selectionMode
    setSelection(combineSelection(base, finishSelection(maskFromLasso(points, current.width, current.height)), mode))
  }, [combineSelection, finishSelection])

  /* ----------------------------------------------------------- perspective */

  const applyPerspectiveCrop = useCallback(() => {
    const current = docRef.current
    const corners = cropCornersRef.current
    if (!current || corners.length !== 4) {
      return
    }
    if (vanishingRef.current) {
      // Vanishing Point: the clipboard laid into the plane the corners define.
      const clip = clipboardRef.current
      if (!clip) { note('noClipboardPlane'); return }
      snapshot(tr('vanishingPoint'))
      const placed = cornerTransform(clip.canvas, corners, current.width, current.height)
      const layer = createLayerMeta(tr('vanishingPoint'))
      canvasesRef.current.set(layer.id, placed)
      updateDoc((document) => ({ ...document, layers: [...document.layers, layer], activeLayerId: layer.id }))
      setCropCorners([])
      vanishingRef.current = false
      setTool('move')
      return
    }
    const size = perspectiveSize(corners)
    remapAllCanvases((source) => perspectiveCrop(source, corners, size.width, size.height), size.width, size.height, tr('perspectiveCrop'))
    setCropCorners([])
  }, [note, remapAllCanvases, snapshot, tr, updateDoc])

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

  /** What the wand-like tools read: the layer, or the whole picture when asked. */
  const sampleSource = useCallback(() => {
    const current = docRef.current
    if (settingsRef.current.sampleAllLayers) return compositeDocument(current, canvasesRef.current)
    return canvasesRef.current.get(current.activeLayerId) ?? compositeDocument(current, canvasesRef.current)
  }, [])

  /** The wand, contiguous or not. */
  const wandAt = useCallback((source: HTMLCanvasElement, point: Point) => {
    const tolerance = settingsRef.current.fillTolerance
    if (settingsRef.current.wandContiguous) return wandSelection(source, point, tolerance)
    const x = Math.floor(point.x)
    const y = Math.floor(point.y)
    const data = context2d(source).getImageData(x, y, 1, 1).data
    return colorRangeSelection(source, { r: data[0], g: data[1], b: data[2] }, tolerance)
  }, [])

  /* ------------------------------------------------------- computer vision */

  /** Lets the status bar paint before a long synchronous stretch of work. */
  const paintFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 16))

  /**
   * Runs a slow, asynchronous computation on a copy of the active layer and,
   * when it is done, writes the result back through `withLayer`, so the
   * history entry, locks and mask target are all honoured. Failures land in
   * the error window under `label`.
   */
  const computeOnLayer = useCallback(async (label: string, compute: (copy: HTMLCanvasElement) => Promise<HTMLCanvasElement | null>) => {
    const current = docRef.current
    const source = canvasesRef.current.get(current.activeLayerId)
    if (!source) { setStatus('noLayer'); return }
    setStatus('working')
    await paintFrame()
    try {
      const result = await compute(cloneCanvas(source))
      if (!result) return
      withLayer((canvas) => {
        const ctx = context2d(canvas)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(result, 0, 0)
      }, true, true)
    } catch (cause) {
      showError(label, tr('openFailed'), cause)
    } finally {
      setStatus('ready')
    }
  }, [showError, tr, withLayer])

  /**
   * Content-Aware Fill: Telea inpainting makes the first guess and PatchMatch
   * rebuilds the hole from the texture around it. The old average-of-the-
   * surroundings fill is the fallback should OpenCV fail to load.
   */
  const fillContentAware = useCallback((selection: Selection | null) => computeOnLayer(tr('contentAware'), async (copy) => {
    const mask = selectionToMask(selection, copy.width, copy.height)
    if (!mask) { note('needSelection'); return null }
    let seed: HTMLCanvasElement | undefined
    try {
      seed = cloneCanvas(copy)
      await inpaintCanvas(seed, mask, 6)
    } catch {
      seed = undefined
    }
    if (!seed) { contentAwareFill(copy, selection); return copy }
    patchFill(copy, mask, { seed })
    return copy
  }), [computeOnLayer, note, tr])

  /** Everything below the active layer, composited: what Harmonize matches to. */
  const compositeBelowActive = () => {
    const current = docRef.current
    const index = current.layers.findIndex((layer) => layer.id === current.activeLayerId)
    return compositeDocument({ ...current, layers: current.layers.slice(0, Math.max(0, index)) }, canvasesRef.current)
  }

  /** Harmonize: the layer's colours re-solved so its edge meets what is behind it (Poisson blending). */
  const harmonizeLayer = () => computeOnLayer(tr('harmonize'), async (copy) => {
    const current = docRef.current
    const index = current.layers.findIndex((layer) => layer.id === current.activeLayerId)
    if (index <= 0) { harmonize(copy, selectionRef.current); return copy }
    return poissonBlend(copy, compositeBelowActive(), false)
  })

  /**
   * The GrabCut silhouette of what is in `box` (the whole picture, inset,
   * when there is no box), with the colour-statistics segmenter as the
   * fallback. Runs on what the selection tools sample.
   */
  const segmentInto = async (box: { x: number; y: number; width: number; height: number } | null): Promise<Selection> => {
    const source = sampleSource()
    setStatus('working')
    await paintFrame()
    try {
      const inset = { x: source.width * 0.04, y: source.height * 0.04, width: source.width * 0.92, height: source.height * 0.92 }
      return await grabCutSelection(source, box ?? inset, 5)
    } catch {
      return box ? objectSelectRect(source, box, Math.max(12, settingsRef.current.fillTolerance)) : selectSubjectAuto(source)
    } finally {
      setStatus('ready')
    }
  }

  const removeBackground = () => computeOnLayer(tr('removeBg'), async (copy) => {
    const subject = await grabCutSelection(copy, { x: copy.width * 0.04, y: copy.height * 0.04, width: copy.width * 0.92, height: copy.height * 0.92 }, 5).catch(() => selectSubjectAuto(copy))
    clearSelectionPixels(copy, invertSelection(subject, copy.width, copy.height))
    return copy
  })

  /** Snaps a document point to guides and the grid when snapping is on. */
  const snapPoint = useCallback((point: Point): Point => {
    const options = settingsRef.current
    if (!options.snapEnabled) return point
    const current = docRef.current
    const reach = 6 / options.zoom
    let { x, y } = point
    if (options.snapToGuides && options.showGuides) {
      for (const guide of current.guides) {
        if (guide.axis === 'x' && Math.abs(guide.position - x) < reach) x = guide.position
        if (guide.axis === 'y' && Math.abs(guide.position - y) < reach) y = guide.position
      }
      // The document edges snap like guides do.
      for (const edge of [0, current.width]) if (Math.abs(edge - x) < reach) x = edge
      for (const edge of [0, current.height]) if (Math.abs(edge - y) < reach) y = edge
    }
    if (options.snapToGrid && options.showGrid) {
      const step = tickStep(options.zoom, 48)
      x = Math.round(x / step) * step
      y = Math.round(y / step) * step
    }
    return { x, y }
  }, [])

  /** A brush tip sampled with Define Brush Preset, decoded once when chosen. */
  const tipCanvasRef = useRef<HTMLCanvasElement | null>(null)

  /**
   * One stroke segment for every brush-family tool. `from === to` is the initial
   * dab. Keeping this in one place is why the blur, sharpen and clone tools can
   * no longer silently fall through to a plain paint stroke.
   */
  const paintDab = useCallback((canvas: HTMLCanvasElement, currentTool: Tool, from: Point, to: Point, alt: boolean) => {
    const options = settingsRef.current
    const selection = selectionRef.current
    const size = options.brushSize
    const shape = { spacing: options.brushSpacing, angle: options.brushAngle, roundness: options.brushRoundness, scatter: options.brushScatter }
    const toneAmount = () => {
      // Photoshop's Range: the tool acts on the tones it is set to.
      return options.brushOpacity * (options.toneRange === 'midtones' ? 1 : 0.7)
    }
    switch (currentTool) {
      case 'smudge':
        if (from !== to) smudge(canvas, from, to, size, selection)
        return
      case 'dodge':
      case 'burn':
        dodgeBurn(canvas, to, size, toneAmount(), currentTool === 'burn', selection)
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
      case 'spotHeal':
        healStamp(canvas, to, size, selection)
        return
      case 'heal': {
        // With a source it is the healing brush proper; without, a spot heal.
        const source = cloneSourceRef.current
        if (!source) { healStamp(canvas, to, size, selection); return }
        healingBrushDab(canvas, from, to, source, dragRef.current?.start ?? to, { size, hardness: options.brushHardness, opacity: options.brushOpacity, selection, shape })
        return
      }
      case 'clone': {
        const source = cloneSourceRef.current
        if (!source) {
          setStatus('cloneNeedsSource')
          return
        }
        // Inside a Vanishing Point plane the stamp follows the perspective.
        if (vanishingRef.current && cropCornersRef.current.length === 4) {
          perspectiveCloneDab(canvas, to, source, dragRef.current?.start ?? to, cropCornersRef.current, { size, hardness: options.brushHardness, opacity: options.brushOpacity, selection })
          return
        }
        cloneStamp(canvas, from, to, source, options.cloneAligned ? (dragRef.current?.start ?? to) : to, size, selection)
        return
      }
      case 'patternStamp': {
        const current = docRef.current
        const pattern = current.patterns?.[current.patterns.length - 1]
        const tile = pattern ? canvasesRef.current.get(patternKey(pattern.id)) : undefined
        if (!tile) { setStatus('noPatterns'); return }
        patternStampDab(canvas, tile, from, to, { size, hardness: options.brushHardness, opacity: options.brushOpacity, selection, shape, impressionist: options.patternImpressionist })
        return
      }
      case 'historyBrush': {
        const source = historySourceCanvas(docRef.current.activeLayerId)
        if (!source) return
        historyBrushDab(canvas, source, from, to, { size, hardness: options.brushHardness, opacity: options.brushOpacity, selection, shape })
        return
      }
      case 'artHistory': {
        const source = historySourceCanvas(docRef.current.activeLayerId)
        if (!source) return
        artHistoryDab(canvas, source, to, { size, opacity: options.brushOpacity, style: options.artHistoryStyle, selection })
        return
      }
      case 'mixer': {
        if (!mixerRef.current) mixerRef.current = loadMixer(options.foreground)
        mixerDab(canvas, mixerRef.current, from, to, { size, hardness: options.brushHardness, wet: options.mixerWet, mix: options.mixerMix, flow: options.mixerFlow, selection, shape })
        return
      }
      case 'bgEraser': {
        const wand = wandSelection(canvas, to, options.fillTolerance)
        clearSelectionPixels(canvas, intersectWithBrush(wand, to, size))
        return
      }
      case 'liquify': {
        const state = liquifyRef.current
        if (!state) return
        liquifyDab(canvas, state.original, from, to, { size, pressure: options.liquifyPressure, mode: options.liquifyMode, frozen: state.frozen, selection })
        return
      }
      default: {
        paintStroke(canvas, from, to, {
          size,
          hardness: currentTool === 'pencil' ? 1 : options.brushHardness,
          color: settingsRef.current.paintTarget === 'mask' || quickMaskRef.current ? (currentTool === 'eraser' ? '#000000' : '#ffffff') : options.foreground,
          opacity: options.brushOpacity,
          erase: currentTool === 'eraser',
          pencil: currentTool === 'pencil',
          selection,
          shape: { ...shape, tip: tipCanvasRef.current },
        })
      }
    }
  }, [brushArea, historySourceCanvas, intersectWithBrush])

  /** Starts Liquify on the active layer: the untouched original is kept for Reconstruct. */
  const beginLiquify = useCallback(() => {
    const current = docRef.current
    const canvas = canvasesRef.current.get(current.activeLayerId)
    if (!canvas) return
    snapshot(tr('liquify'))
    liquifyRef.current = { original: cloneCanvas(canvas), frozen: new Uint8Array(current.width * current.height), layerId: current.activeLayerId }
    setTool('liquify')
    setStatus('hintLiquify')
  }, [snapshot, tr])

  const endLiquify = useCallback((keep: boolean) => {
    const state = liquifyRef.current
    liquifyRef.current = null
    if (!state) return
    if (!keep) {
      canvasesRef.current.set(state.layerId, state.original)
    }
    setTool('move')
    markDirty()
  }, [markDirty])

  /** Quick Mask: the selection becomes a red overlay that the brushes edit. */
  const toggleQuickMask = useCallback(() => {
    const current = docRef.current
    if (quickMaskRef.current) {
      quickMaskRef.current = null
      setQuickMask(false)
      bump()
      return
    }
    const mask = createCanvas(current.width, current.height)
    const sel = selectionRef.current
    const bytes = selectionToMask(sel, current.width, current.height)
    const ctx = context2d(mask)
    if (!bytes) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, current.width, current.height)
    } else {
      const image = ctx.createImageData(current.width, current.height)
      for (let i = 0; i < bytes.length; i += 1) { image.data[i * 4] = 255; image.data[i * 4 + 1] = 255; image.data[i * 4 + 2] = 255; image.data[i * 4 + 3] = bytes[i] }
      ctx.putImageData(image, 0, 0)
    }
    quickMaskRef.current = mask
    setQuickMask(true)
    if (!['brush', 'eraser', 'pencil', 'gradient', 'fill'].includes(toolRef.current)) setTool('brush')
    bump()
  }, [bump])

  /** The guide under a document point, when guides can be dragged. */
  const guideAt = useCallback((point: Point) => {
    const options = settingsRef.current
    if (options.lockGuides || !options.showGuides || !options.extras) return null
    const reach = 4 / options.zoom
    return docRef.current.guides.find((guide) => (guide.axis === 'x' ? Math.abs(guide.position - point.x) : Math.abs(guide.position - point.y)) < reach) ?? null
  }, [])

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!doc || event.button !== 0) {
      return
    }
    const rawPoint = screenToDoc(event.clientX, event.clientY)
    const currentTool = spaceRef.current ? 'hand' : toolRef.current
    const options = settingsRef.current
    event.currentTarget.setPointerCapture(event.pointerId)
    historyLabelRef.current = toolLabel(options.language, currentTool)

    // Dragging out of a ruler makes a guide; dragging a guide moves it.
    const stageBox = event.currentTarget.getBoundingClientRect()
    if (options.showRulers && (event.clientX - stageBox.left < rulerSize || event.clientY - stageBox.top < rulerSize)) {
      const axis: 'x' | 'y' = event.clientX - stageBox.left < rulerSize ? 'x' : 'y'
      const id = createId('guide')
      updateDoc((current) => ({ ...current, guides: [...current.guides, { id, axis, position: axis === 'x' ? rawPoint.x : rawPoint.y }] }))
      dragRef.current = { mode: 'moveGuide', guideId: id, guideAxis: axis, start: rawPoint, last: rawPoint, points: [], layerX: 0, layerY: 0 }
      return
    }
    if (currentTool === 'move') {
      const guide = guideAt(rawPoint)
      if (guide) {
        dragRef.current = { mode: 'moveGuide', guideId: guide.id, guideAxis: guide.axis, start: rawPoint, last: rawPoint, points: [], layerX: 0, layerY: 0 }
        return
      }
    }
    const point = ['marquee', 'ellipseMarquee', 'rect', 'roundRect', 'ellipse', 'polygon', 'line', 'customShape', 'move', 'crop', 'slice', 'artboard'].includes(currentTool) ? snapPoint(rawPoint) : rawPoint

    if (transformRef.current) {
      const handle = hitTestTransform(transformRef.current, point, 8 / options.zoom)
      if (handle) {
        dragRef.current = { mode: 'transform', handle, start: point, last: point, points: [], layerX: 0, layerY: 0, shift: event.shiftKey, alt: event.altKey }
        return
      }
    }

    if (currentTool === 'puppet') {
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
      // An averaged sample reads a small square around the click.
      const reach = Math.floor(Number(options.eyedropperSample) / 2)
      const composite = options.sampleAllLayers || currentTool === 'sampler' ? compositeDocument(doc, canvasesRef.current) : (canvasesRef.current.get(doc.activeLayerId) ?? compositeDocument(doc, canvasesRef.current))
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let dy = -reach; dy <= reach; dy += 1) {
        for (let dx = -reach; dx <= reach; dx += 1) {
          const x = Math.floor(point.x) + dx
          const y = Math.floor(point.y) + dy
          if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) continue
          const data = context2d(composite).getImageData(x, y, 1, 1).data
          if (data[3] < 8) continue
          r += data[0]; g += data[1]; b += data[2]; n += 1
        }
      }
      const sample = n ? { r: r / n, g: g / n, b: b / n } : sampleComposite(doc, canvasesRef.current, point)
      if (currentTool === 'sampler') {
        updateDoc((current) => ({ ...current, samplers: [...current.samplers, { id: `s-${current.samplers.length + 1}`, x: point.x, y: point.y }] }))
        setSettings((current) => ({ ...current, rightTab: 'info' }))
        return
      }
      setSettings((current) => (event.altKey
        ? { ...current, background: rgbToHex(Math.round(sample.r), Math.round(sample.g), Math.round(sample.b)) }
        : { ...current, foreground: rgbToHex(Math.round(sample.r), Math.round(sample.g), Math.round(sample.b)) }))
      return
    }
    if (currentTool === 'ruler') {
      dragRef.current = { mode: 'ruler', start: point, last: point, points: [], layerX: 0, layerY: 0 }
      updateDoc((current) => ({ ...current, measure: { x1: point.x, y1: point.y, x2: point.x, y2: point.y } }))
      return
    }
    if (currentTool === 'note') {
      // On an existing note: edit it; elsewhere: a new one, typed in its window.
      const existing = doc.notes.find((item) => Math.hypot(item.x - point.x, item.y - point.y) < 10 / options.zoom)
      if (existing) {
        openDialog('note', { note: { id: existing.id, text: existing.text } })
        return
      }
      const id = `n-${createId('note')}`
      updateDoc((current) => ({ ...current, notes: [...current.notes, { id, x: point.x, y: point.y, text: '' }] }))
      openDialog('note', { note: { id, text: '' } })
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
      const draft = draftPathRef.current
      if (draft && draft.nodes.length > 1) {
        const first = draft.nodes[0]
        if (Math.hypot(point.x - first.x, point.y - first.y) <= 8 / options.zoom) {
          commitDraftPath(true)
          return
        }
      }
      // Alt-click on an anchor of the draft removes it (Delete Anchor Point);
      // Ctrl-click on an existing path anchor inserts one (Add Anchor Point).
      if (event.altKey && draft) {
        const index = draft.nodes.findIndex((node) => Math.hypot(node.x - point.x, node.y - point.y) <= 8 / options.zoom)
        if (index >= 0) {
          const next = { ...draft, nodes: draft.nodes.filter((_, i) => i !== index) }
          setDraftPath(next)
          draftPathRef.current = next
          return
        }
      }
      if (event.ctrlKey || event.metaKey) {
        const hit = hitTestPaths(doc.paths, point, 12 / options.zoom)
        if (hit) {
          updatePaths((paths) => paths.map((path) => {
            if (path.id !== hit.pathId) return path
            const nodes = [...path.nodes]
            nodes.splice(hit.index + 1, 0, pathNode(point.x, point.y))
            return { ...path, nodes }
          }))
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
        // Alt-click on an anchor converts it: smooth to corner or back (Convert Point).
        if (currentTool === 'directSelect' && event.altKey && hit.part === 'anchor') {
          updatePaths((paths) => paths.map((path) => {
            if (path.id !== hit.pathId) return path
            const nodes = path.nodes.map((node, index) => {
              if (index !== hit.index) return node
              const straight = node.inX === node.x && node.inY === node.y && node.outX === node.x && node.outY === node.y
              return straight ? smoothNode(node, { x: node.x + 20, y: node.y }) : pathNode(node.x, node.y)
            })
            return { ...path, nodes }
          }))
          return
        }
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
    if (currentTool === 'artboard') {
      dragRef.current = { mode: 'artboard', start: point, last: point, points: [], layerX: 0, layerY: 0 }
      return
    }
    if (currentTool === 'crop') {
      // With a crop box drawn, dragging outside it straightens the picture.
      const box = crop
      const inside = box && point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height
      if (box && !inside) {
        dragRef.current = { mode: 'straighten', start: point, last: point, points: [], layerX: 0, layerY: 0 }
        return
      }
      dragRef.current = { mode: 'crop', start: point, last: point, points: [], layerX: 0, layerY: 0, shift: event.shiftKey }
      return
    }

    /* --------------------------------------------------------- selections */
    const base = selectionRef.current
    const mode = modeFor(event)
    if (currentTool === 'polyLasso') {
      if (event.detail >= 2) {
        closePolySelection()
        return
      }
      const points = [...polyPointsRef.current, point]
      if (points.length === 1) dragRef.current = { mode: 'none', start: point, last: point, points: [], layerX: 0, layerY: 0, base, shift: event.shiftKey, alt: event.altKey }
      setPolyPoints(points)
      polyPointsRef.current = points
      return
    }
    if (currentTool === 'magneticLasso') {
      if (event.detail >= 2) {
        closePolySelection()
        return
      }
      const source = sampleSource()
      const snapped = snapToEdge(source, point, options.magneticWidth)
      const points = [...polyPointsRef.current, snapped]
      setPolyPoints(points)
      polyPointsRef.current = points
      dragRef.current = { mode: 'magnetic', start: snapped, last: snapped, points, layerX: 0, layerY: 0, base: dragRef.current?.base ?? base, shift: event.shiftKey, alt: event.altKey }
      return
    }
    if (currentTool === 'fill' || currentTool === 'magicEraser') {
      withLayer((canvas) => {
        if (currentTool === 'magicEraser') {
          clearSelectionPixels(canvas, wandAt(canvas, point))
          return
        }
        if (options.wandContiguous) {
          paintBucket(canvas, point, hexToRgb(options.foreground), options.fillTolerance, selectionRef.current)
        } else {
          const region = wandAt(canvas, point)
          const combined = combineSelection(selectionRef.current, region, selectionRef.current ? 'intersect' : 'new')
          const rgb = hexToRgb(options.foreground)
          const paint = createCanvas(canvas.width, canvas.height)
          const pctx = context2d(paint)
          pctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`
          pctx.fillRect(0, 0, canvas.width, canvas.height)
          clipCanvasToSelection(paint, combined)
          context2d(canvas).drawImage(paint, 0, 0)
        }
      })
      return
    }
    if (currentTool === 'wand') {
      setSelection(combineSelection(base, finishSelection(wandAt(sampleSource(), point)), mode))
      return
    }
    if (currentTool === 'quickSelect') {
      const source = sampleSource()
      const subtract = event.altKey || mode === 'subtract'
      const existing = selectionToMask(base, doc.width, doc.height)
      const mask = quickSelectDab(source, point, options.brushSize, options.fillTolerance, mode === 'new' && !subtract ? null : existing, subtract)
      dragRef.current = { mode: 'quickSelect', start: point, last: point, points: [], layerX: 0, layerY: 0, mask, alt: subtract }
      setSelection({ kind: 'mask', ...maskBounds(mask, doc.width, doc.height), mask })
      return
    }
    if (currentTool === 'objectSelect') {
      dragRef.current = { mode: 'objectSelect', start: point, last: point, points: [], layerX: 0, layerY: 0, base, shift: event.shiftKey, alt: event.altKey }
      return
    }
    if (currentTool === 'rowMarquee') {
      setSelection(combineSelection(base, rowSelection(point.y, doc.width), mode))
      return
    }
    if (currentTool === 'colMarquee') {
      setSelection(combineSelection(base, colSelection(point.x, doc.height), mode))
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
    if (currentTool === 'remove') {
      void fillContentAware(selectionRef.current ?? brushArea(point, options.brushSize, null))
      return
    }
    if (currentTool === 'liquify' && !liquifyRef.current) {
      beginLiquify()
    }
    if (currentTool === 'move') {
      const layer = doc.layers.find((item) => item.id === doc.activeLayerId)
      if (layer?.lockPosition) { note('lockPosition'); return }
      // Linked layers move together.
      const movers = layer?.linkId ? doc.layers.filter((item) => item.linkId === layer.linkId && !item.lockPosition).map((item) => item.id) : [doc.activeLayerId]
      for (const layerId of movers) {
        if (!moveOriginRef.current.has(layerId)) {
          const source = canvasesRef.current.get(layerId)
          if (source) moveOriginRef.current.set(layerId, { canvas: cloneCanvas(source), dx: 0, dy: 0 })
        }
      }
      // Where every moving layer stood when the drag began.
      moveStartRef.current = new Map([...moveOriginRef.current].filter(([id]) => movers.includes(id)).map(([id, origin]) => [id, { dx: origin.dx, dy: origin.dy }]))
      const origin = moveOriginRef.current.get(doc.activeLayerId)
      dragRef.current = {
        mode: 'move', start: point, last: point, points: [],
        layerX: origin?.dx ?? 0, layerY: origin?.dy ?? 0,
      }
      snapshot()
      return
    }

    /* ----------------------------------------------------------- painting */
    if (['brush', 'eraser', 'pencil', 'bgEraser', 'mixer', 'historyBrush', 'artHistory', 'colorReplace', 'clone', 'patternStamp', 'heal', 'spotHeal', 'dodge', 'burn', 'sponge', 'blurTool', 'sharpenTool', 'smudge', 'liquify'].includes(currentTool)) {
      if (currentTool === 'mixer' && (!mixerRef.current || !event.shiftKey)) mixerRef.current = loadMixer(options.foreground)
      dragRef.current = {
        mode: currentTool === 'eraser' || currentTool === 'bgEraser' ? 'erase' : 'paint',
        start: point, last: point, points: [point], layerX: 0, layerY: 0, alt: event.altKey,
      }
      withLayer((canvas) => paintDab(canvas, currentTool, point, point, event.altKey), currentTool !== 'liquify')
      setStatus('painting')
      return
    }

    if (currentTool === 'marquee' || currentTool === 'ellipseMarquee') {
      dragRef.current = { mode: 'select', start: point, last: point, points: [], layerX: 0, layerY: 0, base, shift: event.shiftKey, alt: event.altKey }
      return
    }
    if (currentTool === 'lasso') {
      dragRef.current = { mode: 'lasso', start: point, last: point, points: [point], layerX: 0, layerY: 0, base, shift: event.shiftKey, alt: event.altKey }
      return
    }
    if (currentTool === 'gradient') {
      dragRef.current = { mode: 'gradient', start: point, last: point, points: [], layerX: 0, layerY: 0 }
    }
  }

  /** A marquee box from a drag, squared when Shift is down or a ratio is set. */
  const constrainedBox = (start: Point, point: Point, shift: boolean | undefined, ratio: number | null) => {
    let width = point.x - start.x
    let height = point.y - start.y
    if (shift || ratio) {
      const target = ratio && ratio > 0 ? ratio : ratio === 0 ? docRef.current.width / docRef.current.height : 1
      const side = Math.max(Math.abs(width), Math.abs(height) * target)
      width = Math.sign(width || 1) * side
      height = Math.sign(height || 1) * (side / target)
    }
    return { width, height }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag || !doc) {
      return
    }
    const rawPoint = screenToDoc(event.clientX, event.clientY)
    const point = ['select', 'shape', 'move', 'crop', 'slice', 'artboard'].includes(drag.mode) ? snapPoint(rawPoint) : rawPoint
    const options = settingsRef.current

    if (drag.mode === 'moveGuide' && drag.guideId) {
      const position = drag.guideAxis === 'x' ? rawPoint.x : rawPoint.y
      updateDoc((current) => ({ ...current, guides: current.guides.map((guide) => (guide.id === drag.guideId ? { ...guide, position } : guide)) }))
      return
    }
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
      const { width, height } = constrainedBox(drag.start, point, event.shiftKey, null)
      setShapeDraft({ x: drag.start.x, y: drag.start.y, width, height })
      drag.last = point
      return
    }
    if (drag.mode === 'crop') {
      const { width, height } = constrainedBox(drag.start, point, event.shiftKey || drag.shift, cropRatios[options.cropRatio])
      setCrop(rectSelection(drag.start.x, drag.start.y, width, height))
      drag.last = point
      return
    }
    if (drag.mode === 'straighten') {
      drag.last = point
      bump()
      return
    }
    if (drag.mode === 'slice' || drag.mode === 'frame' || drag.mode === 'artboard' || drag.mode === 'objectSelect') {
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
      const source = sampleSource()
      const snapped = snapToEdge(source, point, options.magneticWidth)
      const last = drag.points[drag.points.length - 1]
      if (!last || Math.hypot(snapped.x - last.x, snapped.y - last.y) >= 3) {
        drag.points.push(snapped)
        setPolyPoints([...drag.points])
        polyPointsRef.current = [...drag.points]
      }
      drag.last = snapped
      return
    }
    if (drag.mode === 'quickSelect') {
      const source = sampleSource()
      const mask = quickSelectDab(source, point, options.brushSize, options.fillTolerance, drag.mask ?? null, Boolean(drag.alt))
      drag.mask = mask
      drag.last = point
      setSelection({ kind: 'mask', ...maskBounds(mask, doc.width, doc.height), mask })
      return
    }
    if (drag.mode === 'move') {
      // Replayed from the pristine copy at the total offset, so pixels pushed
      // off the canvas come back whenever the layer is dragged back — however
      // many separate drags that takes. Linked layers follow by the same amount.
      const active = moveOriginRef.current.get(doc.activeLayerId)
      if (!active) return
      const dxTotal = Math.round(point.x - drag.start.x)
      const dyTotal = Math.round(point.y - drag.start.y)
      let changed = false
      for (const [layerId, start] of moveStartRef.current) {
        const origin = moveOriginRef.current.get(layerId)
        if (!origin) continue
        const dx = start.dx + dxTotal
        const dy = start.dy + dyTotal
        if (dx !== origin.dx || dy !== origin.dy) {
          canvasesRef.current.set(layerId, padCanvas(origin.canvas, origin.canvas.width, origin.canvas.height, dx, dy))
          origin.dx = dx
          origin.dy = dy
          changed = true
        }
      }
      if (changed) bump()
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
      const { width, height } = constrainedBox(drag.start, point, event.shiftKey && !drag.shift ? true : (drag.shift && drag.alt) ? false : false, null)
      const fresh = currentTool === 'ellipseMarquee'
        ? ellipseSelection(drag.start.x, drag.start.y, width, height)
        : rectSelection(drag.start.x, drag.start.y, width, height)
      const mode = drag.shift && drag.alt ? 'intersect' : drag.shift ? 'add' : drag.alt ? 'subtract' : options.selectionMode
      setSelection(combineSelection(drag.base ?? null, finishSelection(fresh), mode))
      drag.last = point
      return
    }
    if (drag.mode === 'lasso') {
      drag.points.push(point)
      drag.last = point
      const mode = drag.shift && drag.alt ? 'intersect' : drag.shift ? 'add' : drag.alt ? 'subtract' : options.selectionMode
      setSelection(combineSelection(drag.base ?? null, maskFromLasso(drag.points, doc.width, doc.height), mode))
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
      const options = settingsRef.current
      if (drag.mode === 'moveGuide' && drag.guideId) {
        // Dragged back onto a ruler, or off the document: the guide goes.
        const position = drag.guideAxis === 'x' ? drag.last.x : drag.last.y
        const limit = drag.guideAxis === 'x' ? current.width : current.height
        const guide = current.guides.find((item) => item.id === drag.guideId)
        const at = guide?.position ?? position
        if (at < -2 / options.zoom || at > limit + 2 / options.zoom) {
          updateDoc((value) => ({ ...value, guides: value.guides.filter((item) => item.id !== drag.guideId) }))
        }
      }
      if (drag.mode === 'gradient') {
        const preset = [...gradientPresets, ...options.gradients].find((item) => item.id === options.gradientId) ?? gradientPresets[0]
        const def = resolveGradient(preset, options.foreground, options.background)
        withLayer((canvas) => paintGradientDef(canvas, drag.start, drag.last, def, options.gradientKind, selectionRef.current, { reverse: options.gradientReverse, dither: options.gradientDither }))
      }
      if (drag.mode === 'shape') {
        const box = { x: drag.start.x, y: drag.start.y, width: drag.last.x - drag.start.x, height: drag.last.y - drag.start.y }
        if (drag.shift) {
          const side = Math.max(Math.abs(box.width), Math.abs(box.height))
          box.width = Math.sign(box.width || 1) * side
          box.height = Math.sign(box.height || 1) * side
        }
        if (Math.abs(box.width) > 1 && Math.abs(box.height) > 1) {
          addShapeLayer(toolRef.current, box)
        }
        setShapeDraft(null)
      }
      if (drag.mode === 'lasso' && drag.points.length > 2) {
        const mode = drag.shift && drag.alt ? 'intersect' : drag.shift ? 'add' : drag.alt ? 'subtract' : options.selectionMode
        setSelection(combineSelection(drag.base ?? null, finishSelection(maskFromLasso(drag.points, current.width, current.height)), mode))
      }
      if (drag.mode === 'straighten') {
        const angle = (Math.atan2(drag.last.y - drag.start.y, drag.last.x - drag.start.x) * 180) / Math.PI
        if (Math.abs(angle) > 0.2 && Math.abs(angle) < 45) {
          remapAllCanvases((source) => rotateArbitrary(source, -angle, current.width, current.height), current.width, current.height, tr('straightenHint'))
        }
      }
      if (drag.mode === 'objectSelect') {
        const box = rectSelection(drag.start.x, drag.start.y, drag.last.x - drag.start.x, drag.last.y - drag.start.y)
        const mode = drag.shift && drag.alt ? 'intersect' : drag.shift ? 'add' : drag.alt ? 'subtract' : options.selectionMode
        const base = drag.base ?? null
        void segmentInto(box.width > 4 && box.height > 4 ? box : null).then((fresh) => {
          setSelection(combineSelection(base, finishSelection(fresh), mode))
        })
        setCrop(null)
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
          withLayer((canvas, layer) => canvasesRef.current.set(layer.id, clipToFrame(canvas, frameRect)), true, true)
        }
        setCrop(null)
      }
      if (drag.mode === 'artboard') {
        const box = rectSelection(drag.start.x, drag.start.y, drag.last.x - drag.start.x, drag.last.y - drag.start.y)
        if (box.width > 4 && box.height > 4) {
          const id = createId('artboard')
          const name = `${tr('artboardsPanel')} ${(current.artboards?.length ?? 0) + 1}`
          updateDoc((value) => ({ ...value, artboards: [...(value.artboards ?? []), { id, name, x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) }] }))
          openDialog('namePrompt', { promptKey: 'artboardName', promptFor: `artboard:${id}`, defaultName: name })
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
      if (drag.mode === 'magnetic') {
        // The drag keeps its base so a double-click can close it; nothing to do yet.
        dragRef.current = { ...drag, mode: 'none' }
        setStatus('ready')
        return
      }
    }
    if (drag?.mode === 'none') {
      // A polygonal lasso in progress keeps its base selection between clicks.
      return
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

  /* ---------------------------------------------------------------- layers */

  const addLayer = () => {
    if (!doc) return
    snapshot(tr('newLayer'))
    const layer = createLayerMeta(`${tr('layerName')} ${doc.layers.length + 1}`)
    canvasesRef.current.set(layer.id, createCanvas(doc.width, doc.height))
    updateDoc((current) => ({ ...current, layers: [...current.layers, layer], activeLayerId: layer.id }))
  }

  const duplicateLayer = () => {
    if (!activeLayer) return
    const source = canvasesRef.current.get(activeLayer.id)
    snapshot(tr('duplicateLayer'))
    const layer = { ...activeLayer, id: createId('layer'), name: `${activeLayer.name} ${tr('dupSuffix')}`, effects: { ...activeLayer.effects } }
    if (source) canvasesRef.current.set(layer.id, cloneCanvas(source))
    const mask = canvasesRef.current.get(`${activeLayer.id}:mask`)
    if (mask) canvasesRef.current.set(`${layer.id}:mask`, cloneCanvas(mask))
    const smart = canvasesRef.current.get(smartSourceKey(activeLayer.id))
    if (smart) canvasesRef.current.set(smartSourceKey(layer.id), cloneCanvas(smart))
    updateDoc((current) => {
      const index = current.layers.findIndex((item) => item.id === activeLayer.id)
      const layers = [...current.layers]
      layers.splice(index + 1, 0, layer)
      return { ...current, layers, activeLayerId: layer.id }
    })
  }

  const deleteLayer = () => {
    if (!doc || doc.layers.length <= 1 || !activeLayer) return
    snapshot(tr('deleteLayer'))
    canvasesRef.current.delete(activeLayer.id)
    updateDoc((current) => {
      const layers = current.layers.filter((layer) => layer.id !== current.activeLayerId)
      return { ...current, layers, activeLayerId: layers[layers.length - 1]?.id ?? '' }
    })
  }

  /** New layer via copy or cut: the selected pixels lifted into their own layer, in place. */
  const layerVia = (cut: boolean) => {
    const current = docRef.current
    const source = canvasesRef.current.get(current.activeLayerId)
    if (!source) return
    snapshot(tr(cut ? 'newViaCut' : 'newViaCopy'))
    const lifted = clipCanvasToSelection(cloneCanvas(source), selectionRef.current)
    if (cut) clearSelectionPixels(source, selectionRef.current)
    const layer = createLayerMeta(`${activeLayer?.name ?? tr('layerName')} ${tr('dupSuffix')}`)
    canvasesRef.current.set(layer.id, lifted)
    updateDoc((document) => {
      const index = document.layers.findIndex((item) => item.id === document.activeLayerId)
      const layers = [...document.layers]
      layers.splice(index + 1, 0, layer)
      return { ...document, layers, activeLayerId: layer.id }
    })
  }

  const mergeDown = () => {
    if (!doc || !activeLayer) return
    const index = doc.layers.findIndex((layer) => layer.id === activeLayer.id)
    if (index <= 0) return
    snapshot(tr('mergeDown'))
    const below = doc.layers[index - 1]
    // Both layers are rendered as they show, so masks, styles and type merge as seen.
    const pair = compositeDocument({ ...doc, background: 'transparent', layers: [below, activeLayer].map((layer) => ({ ...layer, clipped: false })) , colorMode: 'rgb' }, canvasesRef.current)
    canvasesRef.current.delete(activeLayer.id)
    canvasesRef.current.delete(`${activeLayer.id}:mask`)
    canvasesRef.current.delete(`${below.id}:mask`)
    canvasesRef.current.set(below.id, pair)
    updateDoc((current) => ({
      ...current,
      layers: current.layers.filter((layer) => layer.id !== activeLayer.id).map((layer) => (layer.id === below.id ? { ...layer, kind: 'raster' as const, maskEnabled: false, text: undefined, shape: undefined, fill: undefined, smart: false, effects: defaultEffects() } : layer)),
      activeLayerId: below.id,
    }))
  }

  const flatten = () => {
    if (!doc) return
    snapshot(tr('flatten'))
    const flat = compositeDocument(doc, canvasesRef.current)
    const layer = createLayerMeta(tr('backgroundLayer'))
    replaceDocument({ ...doc, layers: [layer], activeLayerId: layer.id }, new Map([[layer.id, flat]]), false)
    markDirty()
  }

  const patchLayer = useCallback((id: string, patch: Partial<LayerMeta>) => {
    updateDoc((current) => ({ ...current, layers: current.layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)) }))
  }, [updateDoc])

  const patchActive = useCallback((patch: Partial<LayerMeta> | ((layer: LayerMeta) => Partial<LayerMeta>)) => {
    updateDoc((current) => ({ ...current, layers: current.layers.map((layer) => (layer.id === current.activeLayerId ? { ...layer, ...(typeof patch === 'function' ? patch(layer) : patch) } : layer)) }))
  }, [updateDoc])

  const patchAdjustment = useCallback((id: string, patch: Partial<Adjustment>) => {
    updateDoc((current) => ({ ...current, layers: current.layers.map((layer) => (layer.id === id && layer.adjustment ? { ...layer, adjustment: { ...layer.adjustment, ...patch } } : layer)) }))
  }, [updateDoc])

  const patchText = useCallback((id: string, patch: Partial<TextData>) => {
    updateDoc((current) => ({ ...current, layers: current.layers.map((layer) => (layer.id === id && layer.text ? { ...layer, text: { ...layer.text, ...patch } } : layer)) }))
  }, [updateDoc])

  /** Drops the dragged layer just above `beforeId` in the stack (panel order). */
  const reorderLayer = useCallback((id: string, beforeId: string | null) => {
    snapshot(tr('sectionArrange'))
    updateDoc((current) => {
      const layers = [...current.layers]
      const from = layers.findIndex((layer) => layer.id === id)
      if (from < 0) return current
      const [item] = layers.splice(from, 1)
      const to = beforeId ? layers.findIndex((layer) => layer.id === beforeId) : -1
      layers.splice(to < 0 ? layers.length : to + 1, 0, item)
      return { ...current, layers }
    })
  }, [snapshot, tr, updateDoc])

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

  const [recording, setRecording] = useState<ActionStep[] | null>(null)
  const recordingRef = useRef<ActionStep[] | null>(null)
  useEffect(() => { recordingRef.current = recording }, [recording])

  const noteCommand = (command: string) => {
    if (!recordingRef.current || replayingAction) return
    if (command.startsWith('action.')) return
    setRecording((steps) => (steps ? [...steps, { command }] : steps))
  }

  const noteDialogResult = (dialog: DialogName, result: DialogResult) => {
    if (!recordingRef.current || replayingAction || result.action === 'preview') return
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

  const captureComp = (name: string) => {
    const current = docRef.current
    if (!current) return
    snapshot(tr('captureComp'))
    const comp: LayerComp = {
      id: createId('comp'),
      name,
      states: current.layers.map((layer) => ({ layerId: layer.id, visible: layer.visible, opacity: layer.opacity, blendMode: layer.blendMode })),
    }
    updateDoc((document) => ({ ...document, comps: [...(document.comps ?? []), comp] }))
  }

  const applyComp = (id: string) => {
    const current = docRef.current
    const comp = current?.comps?.find((item) => item.id === id)
    if (!current || !comp) return
    snapshot(tr('layerComps'))
    updateDoc((document) => ({
      ...document,
      layers: document.layers.map((layer) => {
        const state = comp.states.find((item) => item.layerId === layer.id)
        return state ? { ...layer, visible: state.visible, opacity: state.opacity, blendMode: state.blendMode } : layer
      }),
    }))
  }

  const deleteComp = (id: string) => {
    snapshot()
    updateDoc((document) => ({ ...document, comps: (document.comps ?? []).filter((item) => item.id !== id) }))
  }

  /* ------------------------------------------------------------ transforms */

  const applyContentAwareScale = (width: number, height: number, protectSkin = true) => {
    const current = docRef.current
    if (!current || width < 8 || height < 8) return
    snapshot(tr('contentScale'))
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

  const saveSelectionAs = (name: string, maskOverride?: Uint8Array) => {
    const current = docRef.current
    if (!current) return
    snapshot(tr('saveSelection'))
    const channel = maskOverride
      ? { id: createId('channel'), name, mask: maskOverride }
      : selectionToChannel(createId('channel'), name, selectionRef.current, current.width, current.height)
    updateDoc((document) => ({ ...document, channels: [...(document.channels ?? []), channel] }))
  }

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

  const convertToSmartObject = () => {
    const current = docRef.current
    const layer = current?.layers.find((item) => item.id === current.activeLayerId)
    if (!current || !layer || layer.smart || layer.kind === 'group' || layer.kind === 'adjustment') {
      return
    }
    snapshot(tr('toSmartObject'))
    const alone = { ...layer, opacity: 1, blendMode: 'source-over' as const, clipped: false, maskEnabled: false, smartFilters: [] }
    const original = compositeDocument({ ...current, background: 'transparent', layers: [alone] }, canvasesRef.current)
    canvasesRef.current.set(smartSourceKey(layer.id), original)
    updateDoc((document) => ({
      ...document,
      layers: document.layers.map((item) => (
        item.id === layer.id
          ? { ...item, kind: 'raster' as const, smart: true, smartTransform: { scaleX: 1, scaleY: 1, rotate: 0, x: 0, y: 0 }, smartFilters: item.smartFilters ?? [], text: undefined, shape: undefined, fill: undefined }
          : item
      )),
    }))
  }

  /** Edit Contents: the original opens in its own tab; saving there writes it back. */
  const editSmartContents = () => {
    const current = docRef.current
    const layer = current.layers.find((item) => item.id === current.activeLayerId)
    const original = layer ? canvasesRef.current.get(smartSourceKey(layer.id)) : null
    if (!layer || !original) return
    const inner = createLayerMeta(layer.name)
    const canvas = cloneCanvas(original)
    const next: PhotoDocument = { ...blankDocumentShape(`${layer.name} (${tr('smartEdit')})`, canvas.width, canvas.height), layers: [inner], activeLayerId: inner.id }
    openInNewSlot(next, new Map([[inner.id, canvas]]), { docId: activeDocIdRef.current, layerId: layer.id })
  }

  const replaceSmartContents = async () => {
    const current = docRef.current
    const layer = current.layers.find((item) => item.id === current.activeLayerId)
    if (!layer) return
    const picked = await pickMany('smartReplace')
    if (!picked.length) return
    snapshot(tr('smartReplace'))
    if (!layer.smart) {
      convertToSmartObject()
    }
    canvasesRef.current.set(smartSourceKey(layer.id), picked[0].canvas)
    patchLayer(layer.id, { smart: true, smartTransform: layer.smartTransform ?? { scaleX: 1, scaleY: 1, rotate: 0, x: 0, y: 0 }, name: picked[0].name })
  }

  const addSmartFilter = (filterId: string, params?: { radius: number; amount: number; extra: number }) => {
    const current = docRef.current
    if (!current) return
    snapshot(tr(filterId))
    const entry: SmartFilter = {
      id: createId('smart'),
      filter: filterId,
      enabled: true,
      radius: params?.radius ?? adjustRef.current.radius,
      amount: params?.amount ?? adjustRef.current.amount,
      extra: params?.extra ?? 0,
    }
    updateDoc((document) => ({
      ...document,
      layers: document.layers.map((layer) => (layer.id === document.activeLayerId ? { ...layer, smartFilters: [...(layer.smartFilters ?? []), entry] } : layer)),
    }))
  }

  const patchSmartFilter = (filterId: string, patch: Partial<SmartFilter>) => {
    updateDoc((document) => ({
      ...document,
      layers: document.layers.map((layer) => (layer.id === document.activeLayerId ? { ...layer, smartFilters: (layer.smartFilters ?? []).map((item) => (item.id === filterId ? { ...item, ...patch } : item)) } : layer)),
    }))
  }

  const removeSmartFilter = (filterId: string) => {
    snapshot()
    updateDoc((document) => ({
      ...document,
      layers: document.layers.map((layer) => (layer.id === document.activeLayerId ? { ...layer, smartFilters: (layer.smartFilters ?? []).filter((item) => item.id !== filterId) } : layer)),
    }))
  }

  const addAdjustment = (type: AdjustmentType, payload?: { curves?: CurveData; levels?: LevelsData; adjustment?: Adjustment }) => {
    snapshot(`${tr('adjLayer')} · ${tr(type)}`)
    const layer = createLayerMeta(`${tr('adjLayer')} · ${tr(type)}`, 'adjustment')
    layer.adjustment = payload?.adjustment ?? defaultAdjustment(type)
    if (payload?.curves) layer.curves = payload.curves
    if (payload?.levels) layer.levels = payload.levels
    // A selection becomes the adjustment's mask, as Photoshop does.
    if (selectionRef.current) {
      canvasesRef.current.set(`${layer.id}:mask`, maskCanvasFromSelection(selectionRef.current, docRef.current.width, docRef.current.height))
      layer.maskEnabled = true
    }
    updateDoc((current) => {
      const index = current.layers.findIndex((item) => item.id === current.activeLayerId)
      const layers = [...current.layers]
      layers.splice(index < 0 ? layers.length : index + 1, 0, layer)
      return { ...current, layers, activeLayerId: layer.id }
    })
  }

  const addFillLayer = () => {
    snapshot(tr('fillLayer'))
    const layer = createLayerMeta(tr('fillLayer'), 'fill')
    layer.fill = { kind: 'solid', color: settings.foreground, gradientKind: settings.gradientKind, start: { x: 0, y: 0 }, end: { x: doc.width, y: 0 }, endColor: settings.background }
    updateDoc((current) => ({ ...current, layers: [...current.layers, layer], activeLayerId: layer.id }))
  }

  /* ----------------------------------------------------------------- masks */

  /** Opaque white where the selection is: what a layer mask reads. */
  const maskCanvasFromSelection = (selection: Selection | null, width: number, height: number, invert = false) => {
    const canvas = createCanvas(width, height)
    const ctx = context2d(canvas)
    const mask = selectionToMask(selection, width, height)
    if (!mask) {
      ctx.fillStyle = invert ? 'rgba(0,0,0,0)' : '#ffffff'
      if (!invert) ctx.fillRect(0, 0, width, height)
      return canvas
    }
    const image = ctx.createImageData(width, height)
    for (let i = 0; i < mask.length; i += 1) {
      image.data[i * 4] = 255
      image.data[i * 4 + 1] = 255
      image.data[i * 4 + 2] = 255
      image.data[i * 4 + 3] = invert ? 255 - mask[i] : mask[i]
    }
    ctx.putImageData(image, 0, 0)
    return canvas
  }

  const addMask = (kind: 'revealAll' | 'hideAll' | 'revealSelection' | 'hideSelection' | 'transparency' = 'revealAll') => {
    if (!activeLayer) return
    snapshot(tr('layerMask'))
    let mask: HTMLCanvasElement
    if (kind === 'transparency') {
      const source = canvasesRef.current.get(activeLayer.id)
      mask = createCanvas(doc.width, doc.height)
      if (source) {
        const ctx = context2d(mask)
        ctx.drawImage(source, 0, 0)
        ctx.globalCompositeOperation = 'source-in'
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, doc.width, doc.height)
      }
    } else if (kind === 'hideAll') {
      mask = createCanvas(doc.width, doc.height)
    } else {
      mask = maskCanvasFromSelection(kind === 'revealAll' ? null : selectionRef.current, doc.width, doc.height, kind === 'hideSelection')
    }
    canvasesRef.current.set(`${activeLayer.id}:mask`, mask)
    patchLayer(activeLayer.id, { maskEnabled: true })
    setSettings((current) => ({ ...current, paintTarget: 'mask' }))
  }

  const maskCommand = (what: 'disable' | 'invert' | 'apply' | 'delete') => {
    const current = docRef.current
    const layer = current.layers.find((item) => item.id === current.activeLayerId)
    const mask = layer ? canvasesRef.current.get(`${layer.id}:mask`) : null
    if (!layer || !mask) return
    snapshot(tr(what === 'disable' ? 'maskDisable' : what === 'invert' ? 'maskInvert' : what === 'apply' ? 'maskApply' : 'maskDelete'))
    if (what === 'disable') {
      patchLayer(layer.id, { maskEnabled: !layer.maskEnabled })
      return
    }
    if (what === 'invert') {
      const ctx = context2d(mask)
      const image = ctx.getImageData(0, 0, mask.width, mask.height)
      for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255 - image.data[i]
      ctx.putImageData(image, 0, 0)
      markDirty()
      return
    }
    if (what === 'apply') {
      const source = canvasesRef.current.get(layer.id)
      if (source) {
        const ctx = context2d(source)
        ctx.globalCompositeOperation = 'destination-in'
        ctx.drawImage(mask, 0, 0)
        ctx.globalCompositeOperation = 'source-over'
      }
    }
    canvasesRef.current.delete(`${layer.id}:mask`)
    patchLayer(layer.id, { maskEnabled: false })
    setSettings((value) => ({ ...value, paintTarget: 'layer' }))
  }

  /** Vector Mask: the active path becomes the layer's mask. */
  const vectorMaskFromPath = () => {
    const current = docRef.current
    if (!activePath || !activeLayer) return
    snapshot(tr('vectorMask'))
    const sel = pathToSelection(activePath, current.width, current.height)
    canvasesRef.current.set(`${activeLayer.id}:mask`, maskCanvasFromSelection(sel, current.width, current.height))
    patchLayer(activeLayer.id, { maskEnabled: true })
  }

  /* ----------------------------------------------------------- layer styles */

  const applyStylePreset = useCallback((id: string) => {
    const style = settingsRef.current.styles.find((item) => item.id === id)
    if (!style) return
    snapshot(tr('applyStyle'))
    patchActive({ effects: { ...defaultEffects(), ...style.effects } })
  }, [patchActive, snapshot, tr])

  /* --------------------------------------------------------- align and link */

  const targetLayerIds = () => {
    const current = docRef.current
    const chosen = selectedLayerIds.filter((id) => current.layers.some((layer) => layer.id === id))
    return chosen.length ? chosen : [current.activeLayerId]
  }

  const alignLayers = (edge: 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom') => {
    const current = docRef.current
    const ids = targetLayerIds()
    const canvases = ids.map((id) => canvasesRef.current.get(id)).filter((item): item is HTMLCanvasElement => Boolean(item))
    if (!canvases.length) return
    snapshot(tr('sectionAlign'))
    const offsets = alignOffsets(canvases, edge, current.width, current.height)
    canvases.forEach((canvas, index) => {
      const id = ids[index]
      canvasesRef.current.set(id, shiftCanvas(canvas, offsets[index].dx, offsets[index].dy))
    })
    moveOriginRef.current.clear()
    markDirty()
  }

  const distributeLayers = (axis: 'x' | 'y') => {
    const ids = targetLayerIds()
    const canvases = ids.map((id) => canvasesRef.current.get(id)).filter((item): item is HTMLCanvasElement => Boolean(item))
    if (canvases.length < 3) return
    snapshot(tr('sectionAlign'))
    const offsets = distributeOffsets(canvases, axis)
    canvases.forEach((canvas, index) => canvasesRef.current.set(ids[index], shiftCanvas(canvas, offsets[index].dx, offsets[index].dy)))
    moveOriginRef.current.clear()
    markDirty()
  }

  const linkLayers = (link: boolean) => {
    const ids = new Set(targetLayerIds())
    const linkId = link ? createId('link') : undefined
    snapshot(tr(link ? 'linkLayers' : 'unlinkLayers'))
    updateDoc((current) => ({ ...current, layers: current.layers.map((layer) => (ids.has(layer.id) ? { ...layer, linkId } : layer)) }))
  }

  /** Isolate: only the chosen layers stay visible; running it again restores. */
  const toggleIsolate = () => {
    if (isolateRef.current) {
      const saved = isolateRef.current
      isolateRef.current = null
      setIsolated(false)
      updateDoc((current) => ({ ...current, layers: current.layers.map((layer) => ({ ...layer, visible: saved[layer.id] ?? layer.visible })) }))
      setStatus('ready')
      return
    }
    const ids = new Set(targetLayerIds())
    isolateRef.current = Object.fromEntries(docRef.current.layers.map((layer) => [layer.id, layer.visible]))
    setIsolated(true)
    updateDoc((current) => ({ ...current, layers: current.layers.map((layer) => ({ ...layer, visible: ids.has(layer.id) || layer.kind === 'group' })) }))
    note('isolateOn')
  }

  /* ---------------------------------------------------------------- matting */

  const matting = (kind: 'defringe' | 'black' | 'white') => {
    withLayer((canvas) => {
      if (kind === 'defringe') defringe(canvas, 1)
      else removeMatte(canvas, kind)
    }, true, true)
  }

  /* --------------------------------------------------------------- clipboard */

  const lastSelectionRef = useRef<Selection | null>(null)
  const deselect = () => {
    if (selectionRef.current) lastSelectionRef.current = selectionRef.current
    setSelection(null)
  }

  const selectionSource = () => {
    const current = docRef.current
    if (!current) return null
    return canvasesRef.current.get(current.activeLayerId) ?? compositeDocument(current, canvasesRef.current)
  }

  const selectedPixels = (merged: boolean) => {
    const current = docRef.current
    if (!current) return null
    const source = merged ? compositeDocument(current, canvasesRef.current) : canvasesRef.current.get(current.activeLayerId)
    if (!source) return null
    const bounds = selectionBounds(selectionRef.current, current)
    const clipped = clipCanvasToSelection(cloneCanvas(source), selectionRef.current)
    const cut = createCanvas(bounds.width, bounds.height)
    context2d(cut).drawImage(clipped, -bounds.x, -bounds.y)
    return { canvas: cut, x: bounds.x, y: bounds.y }
  }

  const copySelection = useCallback((merged: boolean) => {
    const pixels = selectedPixels(merged)
    if (!pixels) return
    clipboardRef.current = pixels
    try {
      if (navigator.clipboard?.write && typeof ClipboardItem === 'function') {
        pixels.canvas.toBlob((blob) => {
          if (blob) void navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).catch(() => {})
        })
      }
    } catch {
      // No system clipboard here; the in-app one still has the pixels.
    }
  }, [])

  /** Drops the clipboard in as a new layer: centred, in place, into or outside the selection. */
  const pasteClipboard = useCallback((where: 'center' | 'inPlace' | 'into' | 'outside') => {
    const current = docRef.current
    const clip = clipboardRef.current
    if (!current) return
    if (!clip) {
      showError(tr('paste'), tr('clipboardEmpty'), new Error(tr('clipboardEmpty')))
      return
    }
    snapshot(tr('paste'))
    const selection = selectionRef.current
    const bounds = selectionBounds(selection, current)
    const layer = createLayerMeta(tr('paste'))
    const canvas = createCanvas(current.width, current.height)
    const x = where === 'inPlace' ? clip.x : selection && where !== 'center' ? bounds.x + Math.round((bounds.width - clip.canvas.width) / 2) : Math.round((current.width - clip.canvas.width) / 2)
    const y = where === 'inPlace' ? clip.y : selection && where !== 'center' ? bounds.y + Math.round((bounds.height - clip.canvas.height) / 2) : Math.round((current.height - clip.canvas.height) / 2)
    context2d(canvas).drawImage(clip.canvas, x, y)
    canvasesRef.current.set(layer.id, canvas)
    if ((where === 'into' || where === 'outside') && selection) {
      canvasesRef.current.set(`${layer.id}:mask`, maskCanvasFromSelection(selection, current.width, current.height, where === 'outside'))
      layer.maskEnabled = true
    }
    updateDoc((document) => ({ ...document, layers: [...document.layers, layer], activeLayerId: layer.id }))
  }, [showError, snapshot, tr, updateDoc])

  /* ------------------------------------------------------------ animation */

  const [playingFrame, setPlayingFrame] = useState<number | null>(null)
  const playTimerRef = useRef<number | null>(null)

  const captureAnimationFrame = () => {
    const current = docRef.current
    if (!current) return
    snapshot(tr('addFrame'))
    const visible: Record<string, boolean> = {}
    for (const layer of current.layers) visible[layer.id] = layer.visible
    const frameItem: AnimationFrame = { id: createId('frame'), delayMs: 120, visible }
    updateDoc((document) => ({ ...document, animation: [...(document.animation ?? []), frameItem] }))
  }

  const showAnimationFrame = useCallback((id: string) => {
    const current = docRef.current
    const frameItem = current?.animation?.find((item) => item.id === id)
    if (!current || !frameItem) return
    updateDoc((document) => ({ ...document, layers: document.layers.map((layer) => ({ ...layer, visible: frameItem.visible[layer.id] ?? layer.visible })) }))
  }, [updateDoc])

  const patchAnimationFrame = (id: string, patch: Partial<AnimationFrame>) => {
    updateDoc((document) => ({ ...document, animation: (document.animation ?? []).map((item) => (item.id === id ? { ...item, ...patch } : item)) }))
  }

  const deleteAnimationFrame = (id: string) => {
    snapshot()
    updateDoc((document) => ({ ...document, animation: (document.animation ?? []).filter((item) => item.id !== id) }))
  }

  const stopPlayback = useCallback(() => {
    if (playTimerRef.current !== null) {
      window.clearTimeout(playTimerRef.current)
      playTimerRef.current = null
    }
    setPlayingFrame(null)
  }, [])

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
      const frameItem = list[index % list.length]
      setPlayingFrame(index % list.length)
      showAnimationFrame(frameItem.id)
      index += 1
      playTimerRef.current = window.setTimeout(step, Math.max(20, frameItem.delayMs))
    }
    step()
  }, [showAnimationFrame, stopPlayback])

  useEffect(() => () => {
    if (playTimerRef.current !== null) window.clearTimeout(playTimerRef.current)
  }, [])

  const animationFrameCanvases = () => {
    const current = docRef.current
    if (!current?.animation?.length) return []
    return current.animation.map((frameItem) => ({
      canvas: compositeDocument({ ...current, layers: current.layers.map((layer) => ({ ...layer, visible: frameItem.visible[layer.id] ?? layer.visible })) }, canvasesRef.current),
      delayMs: frameItem.delayMs,
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

  const importVideo = async (file: Blob, name: string) => {
    try {
      setStatus('working')
      const frames = await extractVideoFrames(file, 12)
      if (!frames.length) return
      const first = frames[0].canvas
      const layers: LayerMeta[] = []
      const canvases = new Map<string, HTMLCanvasElement>()
      const animation: AnimationFrame[] = []
      frames.forEach((frameItem, index) => {
        const layer = createLayerMeta(`${name} ${index + 1}`)
        layer.visible = index === 0
        canvases.set(layer.id, frameItem.canvas)
        layers.push(layer)
      })
      layers.forEach((layer) => {
        const visible: Record<string, boolean> = {}
        for (const other of layers) visible[other.id] = other.id === layer.id
        animation.push({ id: createId('frame'), delayMs: 120, visible })
      })
      const next: PhotoDocument = { ...blankDocumentShape(name.replace(/\.[^.]+$/, ''), first.width, first.height), layers, activeLayerId: layers[0].id, animation }
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

  const definePatternFromSelection = () => {
    const current = docRef.current
    const source = current ? canvasesRef.current.get(current.activeLayerId) : null
    if (!current || !source) return
    snapshot(tr('definePattern'))
    const tile = makePatternTile(source, selectionRef.current)
    const pattern = definePattern(createId('pattern'), `${tr('pattern')} ${(current.patterns?.length ?? 0) + 1}`, tile)
    canvasesRef.current.set(patternKey(pattern.id), tile)
    updateDoc((document) => ({ ...document, patterns: [...(document.patterns ?? []), pattern] }))
  }

  /** Define Brush Preset: the selected pixels' coverage becomes a tip. */
  const defineBrushFromSelection = () => {
    const pixels = selectedPixels(false)
    if (!pixels) return
    const tip = pixels.canvas
    const preset = {
      id: createId('brush'),
      name: `${tr('brush')} ${settingsRef.current.brushes.length + 1}`,
      size: Math.max(tip.width, tip.height), hardness: 1, opacity: 1, spacing: 0.25, angle: 0, roundness: 1, scatter: 0,
      tipUrl: canvasToDataUrl(tip),
    }
    setSettings((current) => ({ ...current, brushes: [...current.brushes, preset], brushTipId: preset.id }))
    note('saved')
  }

  const defineShapeFromPath = () => {
    if (!activePath) return
    const { outline } = normaliseOutline(activePath)
    const shape = { id: createId('shape'), name: activePath.name, outline, closed: true }
    setSettings((current) => ({ ...current, customShapes: [...current.customShapes, shape], customShapeKind: shape.id }))
    setTool('customShape')
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

  const strokeSelection = (color: string, thickness: number, where: 'inside' | 'center' | 'outside') => {
    const current = docRef.current
    if (!current) return
    const selection = selectionRef.current
    if (!selection) {
      showError(tr('strokeCommand'), tr('noSelection'), new Error(tr('noSelection')))
      return
    }
    const { width, height } = current
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

  const trimTransparent = () => {
    const current = docRef.current
    if (!current) return
    const composite = compositeDocument(current, canvasesRef.current)
    const box = layerBounds(composite)
    if (!box || (box.x === 0 && box.y === 0 && box.width === composite.width && box.height === composite.height)) return
    applyCrop({ kind: 'rect', ...box })
  }

  const mergeVisible = () => {
    const current = docRef.current
    if (!current) return
    const visible = current.layers.filter((layer) => layer.visible && layer.kind !== 'group')
    if (visible.length < 2) return
    snapshot(tr('mergeVisible'))
    const flat = compositeDocument({ ...current, background: 'transparent', layers: visible }, canvasesRef.current)
    const merged = createLayerMeta(tr('mergeVisible'))
    canvasesRef.current.set(merged.id, flat)
    const lowest = current.layers.findIndex((layer) => layer.id === visible[0].id)
    const kept = current.layers.filter((layer) => !visible.includes(layer))
    const layers = [...kept]
    layers.splice(Math.max(0, Math.min(lowest, kept.length)), 0, merged)
    updateDoc((document) => ({ ...document, layers, activeLayerId: merged.id }))
  }

  const rasterizeLayer = () => {
    const current = docRef.current
    const layer = current?.layers.find((item) => item.id === current.activeLayerId)
    const alreadyFlat = layer?.kind === 'raster' && !layer.smart && !(layer.smartFilters ?? []).length && !layer.threeD
    if (!current || !layer || alreadyFlat || layer.kind === 'group' || layer.kind === 'adjustment') {
      return
    }
    snapshot(tr('rasterize'))
    const alone = { ...layer, opacity: 1, blendMode: 'source-over' as const, clipped: false, maskEnabled: false }
    const flat = compositeDocument({ ...current, background: 'transparent', layers: [alone], colorMode: 'rgb' }, canvasesRef.current)
    canvasesRef.current.delete(smartSourceKey(layer.id))
    canvasesRef.current.set(layer.id, flat)
    updateDoc((document) => ({
      ...document,
      layers: document.layers.map((item) => (item.id === layer.id ? { ...item, kind: 'raster' as const, smart: false, smartFilters: [], smartTransform: undefined, text: undefined, shape: undefined, fill: undefined, threeD: undefined } : item)),
    }))
  }

  const toggleClipMask = () => {
    const current = docRef.current
    if (!current) return
    const index = current.layers.findIndex((layer) => layer.id === current.activeLayerId)
    if (index < 1) return
    snapshot(tr('clipMask'))
    updateDoc((document) => ({ ...document, layers: document.layers.map((layer, at) => (at === index ? { ...layer, clipped: !layer.clipped } : layer)) }))
  }

  const moveLayerToEdge = (edge: 'front' | 'back') => {
    const current = docRef.current
    if (!current) return
    const index = current.layers.findIndex((layer) => layer.id === current.activeLayerId)
    if (index < 0) return
    snapshot(tr('sectionArrange'))
    updateDoc((document) => {
      const layers = [...document.layers]
      const [item] = layers.splice(index, 1)
      if (edge === 'front') layers.push(item)
      else layers.unshift(item)
      return { ...document, layers }
    })
  }

  const moveLayer = (direction: 1 | -1) => {
    if (!doc) return
    const index = doc.layers.findIndex((layer) => layer.id === doc.activeLayerId)
    const next = index + direction
    if (index < 0 || next < 0 || next >= doc.layers.length) return
    snapshot(tr('sectionArrange'))
    updateDoc((current) => {
      const layers = [...current.layers]
      const [item] = layers.splice(index, 1)
      layers.splice(next, 0, item)
      return { ...current, layers }
    })
  }

  const rotateDoc = (quarter: number) => {
    const current = docRef.current
    const width = quarter % 2 ? current.height : current.width
    const height = quarter % 2 ? current.width : current.height
    remapAllCanvases((source) => {
      const canvas = createCanvas(width, height)
      const ctx = context2d(canvas)
      ctx.translate(width / 2, height / 2)
      ctx.rotate((quarter * Math.PI) / 2)
      ctx.drawImage(source, -source.width / 2, -source.height / 2)
      return canvas
    }, width, height, tr('sectionRotation'))
  }

  const rotateDocArbitrary = (degrees: number) => {
    const current = docRef.current
    const size = rotatedSize(current.width, current.height, degrees)
    remapAllCanvases((source) => rotateArbitrary(source, degrees, size.width, size.height), size.width, size.height, tr('rotateArbitrary'))
  }

  const resizeImage = (width: number, height: number) => {
    remapAllCanvases((source) => resizeCanvasContent(source, width, height), width, height, tr('imageSize'))
  }

  const resizeCanvas = (width: number, height: number, anchorX = 0, anchorY = 0) => {
    remapAllCanvases((source) => padCanvas(source, width, height, anchorX, anchorY), width, height, tr('canvasSize'))
  }

  /** Reveal All: the canvas grown to hold whatever the move tool pushed off it. */
  const revealAll = () => {
    const current = docRef.current
    let minX = 0
    let minY = 0
    let maxX = current.width
    let maxY = current.height
    for (const origin of moveOriginRef.current.values()) {
      const box = layerBounds(origin.canvas)
      if (!box) continue
      minX = Math.min(minX, box.x + origin.dx)
      minY = Math.min(minY, box.y + origin.dy)
      maxX = Math.max(maxX, box.x + box.width + origin.dx)
      maxY = Math.max(maxY, box.y + box.height + origin.dy)
    }
    if (minX === 0 && minY === 0 && maxX === current.width && maxY === current.height) return
    const origins = new Map(moveOriginRef.current)
    remapAllCanvases((source, key) => {
      const origin = origins.get(key)
      const base = origin ? padCanvas(origin.canvas, origin.canvas.width, origin.canvas.height, origin.dx, origin.dy) : source
      void base
      return padCanvas(origin ? origin.canvas : source, maxX - minX, maxY - minY, (origin?.dx ?? 0) - minX, (origin?.dy ?? 0) - minY)
    }, maxX - minX, maxY - minY, tr('revealAll'))
  }

  const closeDocument = useCallback(() => {
    const id = activeDocIdRef.current
    slotsRef.current.delete(id)
    const remaining = [...slotsRef.current.values()]
    if (remaining.length) {
      const slot = remaining[remaining.length - 1]
      // showSlot parks the current document; it is gone from the map already.
      closeAllDialogs()
      canvasesRef.current = slot.canvases
      undoRef.current = slot.undo
      redoRef.current = slot.redo
      openedRef.current = slot.opened ?? null
      setNamedSnapshots(slot.namedSnapshots)
      setDoc(slot.document)
      setDirty(slot.dirty)
      setSelection(null)
      setCrop(null)
      setActiveDocId(slot.id)
      activeDocIdRef.current = slot.id
      bump()
      requestAnimationFrame(() => fitZoom(slot.document))
      refreshDocList()
      return
    }
    const created = createBlankDocument(tr('untitled'), 1280, 720, 'transparent', tr('layerName'))
    replaceDocument(created.document, created.canvases)
    const newId = createId('doc')
    setActiveDocId(newId)
    activeDocIdRef.current = newId
    requestAnimationFrame(() => fitZoom(created.document))
  }, [bump, closeAllDialogs, fitZoom, refreshDocList, replaceDocument, tr])

  const closeDocumentById = useCallback((id: string) => {
    if (id === activeDocIdRef.current) {
      if (dirtyRef.current) {
        setPendingAction('close')
        openDialog('unsaved')
      } else {
        closeDocument()
      }
      return
    }
    const slot = slotsRef.current.get(id)
    if (slot?.dirty) {
      switchDocument(id)
      setPendingAction('close')
      openDialog('unsaved')
      return
    }
    slotsRef.current.delete(id)
    refreshDocList()
  }, [closeDocument, openDialog, refreshDocList, switchDocument])

  const guardUnsaved = useCallback((action: 'new' | 'open' | 'close' | 'quit' | 'closeAll') => {
    if (dirty) {
      setPendingAction(action)
      openDialog('unsaved')
      return false
    }
    return true
  }, [dirty, openDialog])

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
    if (action === 'closeAll') {
      slotsRef.current.clear()
      closeDocument()
    }
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

  /* ---------------------------------------------------------- live preview */

  /** The untouched layer a preview is computed from: captured when the first preview arrives. */
  const previewSource = () => {
    const current = docRef.current
    if (!previewSourceRef.current || previewRef.current?.layerId !== current.activeLayerId) {
      const canvas = canvasesRef.current.get(current.activeLayerId)
      previewSourceRef.current = canvas ? cloneCanvas(canvas) : null
    }
    return previewSourceRef.current
  }

  const showPreview = (name: DialogName, op: (canvas: HTMLCanvasElement) => void) => {
    const current = docRef.current
    const source = previewSource()
    if (!source) return
    const canvas = cloneCanvas(source)
    op(canvas)
    previewRef.current = { layerId: current.activeLayerId, canvas, dialog: name }
    bump()
  }

  const clearPreview = useCallback(() => {
    const had = previewRef.current || previewMaskRef.current
    previewRef.current = null
    previewSourceRef.current = null
    previewMaskRef.current = null
    if (had) bump()
  }, [bump])

  // A window closed without applying: whatever it was previewing goes away.
  useEffect(() => window.electronDialogApi?.onClosed?.((name) => {
    clearPreview()
    if (name === 'layerStyle' && styleBackupRef.current) {
      const backup = styleBackupRef.current
      styleBackupRef.current = null
      patchLayer(backup.layerId, { effects: backup.effects })
    }
  }), [clearPreview, patchLayer])

  /* --------------------------------------------------------------- filters */

  const filterParams = (result?: DialogResult) => ({
    radius: Number(result?.radius ?? adjustRef.current.radius),
    amount: Number(result?.amount ?? adjustRef.current.amount),
    extra: Number(result?.extra ?? 0),
    foreground: settingsRef.current.foreground,
    background: settingsRef.current.background,
  })

  /** The pixel operation a filter id stands for, with its parameters. */
  const filterOperation = (id: string, params: ReturnType<typeof filterParams>) => (canvas: HTMLCanvasElement) => {
    applyGalleryFilter(canvas, id, params, selectionRef.current)
  }

  const applyNamedFilter = (id: string, result?: DialogResult) => {
    guard(`${tr('errorWhileFilter')}: ${tr(id)}`, () => applyNamedFilterUnguarded(id, result))
  }

  const applyNamedFilterUnguarded = (id: string, result?: DialogResult) => {
    if (id === 'cameraRaw') {
      openDialog('cameraRaw')
      return
    }
    if (id === 'liquify') {
      beginLiquify()
      return
    }
    const params = filterParams(result)
    lastFilterRef.current = { id, ...params }
    setAdjust((current) => ({ ...current, radius: params.radius, amount: params.amount }))
    const layer = docRef.current?.layers.find((item) => item.id === docRef.current?.activeLayerId)
    if (layer?.smart) {
      addSmartFilter(id, params)
      return
    }
    historyLabelRef.current = tr(id)
    withLayer(filterOperation(id, params))
  }

  /** The Neural Filters window's effects, each an ordinary operation on pixels. */
  const neuralOperation = (kind: string, amount: number) => (canvas: HTMLCanvasElement) => {
    const k = amount / 100
    const sel = selectionRef.current
    if (kind === 'skin') { skinSmooth(canvas, 1 + k * 5); return }
    if (kind === 'colorize') {
      // Greys are read into a natural ramp: cool shadows, warm lights.
      const def = resolveGradient({ id: 'colorize', name: '', stops: [{ position: 0, color: '#1f2a44' }, { position: 0.45, color: '#8a6a4f' }, { position: 0.8, color: '#e6c9a8' }, { position: 1, color: '#fff6e5' }], opacityStops: [{ position: 0, opacity: 1 }, { position: 1, opacity: 1 }] }, '#000000', '#ffffff')
      const ramp = createCanvas(canvas.width, canvas.height)
      context2d(ramp).drawImage(canvas, 0, 0)
      gradientMap(ramp, def.stops[0].color, def.stops[3].color, sel)
      const ctx = context2d(canvas)
      ctx.save()
      ctx.globalAlpha = k
      ctx.globalCompositeOperation = 'color'
      ctx.drawImage(ramp, 0, 0)
      ctx.restore()
      return
    }
    if (kind === 'restore') {
      extraFilters.despeckle.run(canvas, filterParams(), sel)
      extraFilters.smartSharpen.run(canvas, { radius: 2, amount: 40 * k + 10, extra: 10 }, sel)
      autoTone(canvas, sel)
      return
    }
    if (kind === 'depthBlur') {
      extraFilters.tiltShift.run(canvas, { radius: 2 + k * 14, amount: 45, extra: 0 }, sel)
      return
    }
  }

  /* ------------------------------------------------------- layer alignment */

  /** Every frame warped into the first frame's plane, at the first frame's size. */
  const alignedToFirst = async (frames: HTMLCanvasElement[], mode: 'perspective' | 'affine' | 'translation') => {
    const transforms = await alignChain(frames, mode)
    const out: HTMLCanvasElement[] = [frames[0]]
    for (let i = 1; i < frames.length; i += 1) {
      const centre = applyHomography(transforms[i], { x: frames[i].width / 2, y: frames[i].height / 2 })
      // A transform that throws the frame off the picture is a failed match.
      if (!Number.isFinite(centre.x) || Math.abs(centre.x) > frames[0].width * 3 || Math.abs(centre.y) > frames[0].height * 3) { out.push(frames[i]); continue }
      out.push(await warpByHomography(frames[i], transforms[i], frames[0].width, frames[0].height))
    }
    return out
  }

  /** Auto-Align Layers: the bottom visible layer is the reference; the others are warped onto it. */
  const alignVisibleLayers = async () => {
    const items = visibleLayerCanvases()
    if (items.length < 2) return
    setStatus('working')
    await paintFrame()
    try {
      const aligned = await alignedToFirst(items.map((item) => item.canvas), 'perspective')
      snapshot(tr('autoAlign'))
      const current = docRef.current
      items.forEach((item, index) => {
        const layer = current.layers.find((entry) => entry.name === item.name)
        if (layer) canvasesRef.current.set(layer.id, aligned[index])
      })
      moveOriginRef.current.clear()
      markDirty()
      note('autoAlignDone')
    } catch (cause) {
      showError(tr('autoAlign'), tr('openFailed'), cause)
    } finally {
      setStatus('ready')
    }
  }

  /** Auto-Blend Layers: each layer's alpha fades towards its edge so the overlaps blend without a seam. */
  const blendVisibleLayers = async () => {
    const items = visibleLayerCanvases()
    if (items.length < 2) return
    setStatus('working')
    await paintFrame()
    try {
      const { perLayer } = await blendAligned(items.map((item) => item.canvas))
      snapshot(tr('autoBlend'))
      const current = docRef.current
      items.forEach((item, index) => {
        const layer = current.layers.find((entry) => entry.name === item.name)
        if (layer) canvasesRef.current.set(layer.id, perLayer[index])
      })
      markDirty()
    } catch (cause) {
      showError(tr('autoBlend'), tr('openFailed'), cause)
    } finally {
      setStatus('ready')
    }
  }

  /* ------------------------------------------------------------ automation */

  const stackToDocument = (name: string, items: { name: string; canvas: HTMLCanvasElement }[]) => {
    if (!items.length) return
    const width = Math.max(...items.map((item) => item.canvas.width))
    const height = Math.max(...items.map((item) => item.canvas.height))
    const layers: LayerMeta[] = []
    const canvases = new Map<string, HTMLCanvasElement>()
    for (const item of items) {
      const layer = createLayerMeta(item.name.replace(/\.[^.]+$/, ''))
      const canvas = createCanvas(width, height)
      context2d(canvas).drawImage(item.canvas, 0, 0)
      canvases.set(layer.id, canvas)
      layers.push(layer)
    }
    openInNewSlot({ ...blankDocumentShape(name, width, height), layers, activeLayerId: layers[layers.length - 1].id }, canvases)
  }

  const singleToDocument = (name: string, canvas: HTMLCanvasElement) => {
    const layer = createLayerMeta(tr('backgroundLayer'))
    openInNewSlot({ ...blankDocumentShape(name, canvas.width, canvas.height), layers: [layer], activeLayerId: layer.id }, new Map([[layer.id, canvas]]))
  }

  /** The visible raster layers as pictures, for the stack commands when no files are picked. */
  const visibleLayerCanvases = () => docRef.current.layers
    .filter((layer) => layer.visible && layer.kind !== 'group' && layer.kind !== 'adjustment')
    .map((layer) => ({ name: layer.name, canvas: canvasesRef.current.get(layer.id) }))
    .filter((item): item is { name: string; canvas: HTMLCanvasElement } => Boolean(item.canvas))

  const runAutomation = async (kind: 'photomerge' | 'mergeHdr' | 'loadStack' | 'contactSheet' | 'statistics' | 'cropStraighten', options: Record<string, unknown> = {}) => {
    try {
      setStatus('working')
      await paintFrame()
      const fromFiles = kind === 'loadStack' || kind === 'contactSheet' || kind === 'photomerge' || kind === 'mergeHdr'
      const picked = fromFiles ? await pickMany(kind) : []
      const items = picked.length ? picked : visibleLayerCanvases()
      if (!items.length) return
      if (kind === 'loadStack') { stackToDocument(tr('loadStack'), items); return }
      if (kind === 'contactSheet') { singleToDocument(tr('contactSheet'), contactSheet(items, Number(options.columns ?? 4), Number(options.thumb ?? 256))); return }
      if (kind === 'photomerge') {
        // Features matched frame to frame and each frame warped into the
        // first one's plane; the strip layout only decides the fallback.
        const layout = String(options.layout ?? 'auto') as 'auto' | 'horizontal' | 'vertical'
        const frames = items.map((item) => item.canvas)
        let result: { canvas: HTMLCanvasElement }
        try {
          result = await stitchCanvases(frames, layout === 'auto' ? 'perspective' : 'translation', options.blend !== false)
        } catch {
          result = photomerge(frames, layout, options.blend !== false)
        }
        singleToDocument(tr('photomerge'), result.canvas)
        note('photomergeDone')
        return
      }
      if (kind === 'mergeHdr') {
        if (items.length < 2) { note('hdrNeedsLayers'); return }
        const frames = items.map((item) => item.canvas)
        let fused: HTMLCanvasElement
        try {
          const aligned = await alignedToFirst(frames, 'translation')
          fused = await exposureFusion(aligned)
        } catch {
          const offsets = autoAlignLayers(frames)
          fused = mergeToHdr(frames.map((frame, index) => shiftCanvas(frame, offsets[index].dx, offsets[index].dy)))
        }
        singleToDocument(tr('mergeHdr'), fused)
        return
      }
      if (kind === 'statistics') {
        const mode = String(options.mode ?? 'mean')
        const width = items[0].canvas.width
        const height = items[0].canvas.height
        const planes = items.map((item) => context2d(resizeCanvasContent(item.canvas, width, height)).getImageData(0, 0, width, height).data)
        const out = createCanvas(width, height)
        const ctx = context2d(out)
        const image = ctx.createImageData(width, height)
        const values: number[] = []
        for (let i = 0; i < image.data.length; i += 4) {
          for (let c = 0; c < 3; c += 1) {
            values.length = 0
            for (const plane of planes) values.push(plane[i + c])
            values.sort((a, b) => a - b)
            image.data[i + c] = mode === 'median' ? values[values.length >> 1] : mode === 'max' ? values[values.length - 1] : mode === 'min' ? values[0] : mode === 'range' ? values[values.length - 1] - values[0] : values.reduce((a, b) => a + b, 0) / values.length
          }
          image.data[i + 3] = 255
        }
        ctx.putImageData(image, 0, 0)
        snapshot(tr('statistics'))
        const layer = createLayerMeta(`${tr('statistics')} · ${tr(`mode${mode.charAt(0).toUpperCase()}${mode.slice(1)}`)}`)
        canvasesRef.current.set(layer.id, out)
        updateDoc((current) => ({ ...current, layers: [...current.layers, layer], activeLayerId: layer.id }))
        return
      }
      if (kind === 'cropStraighten') {
        // The prints lying on the scan each become a document of their own,
        // cut out and levelled; a picture with no separate prints on it is
        // trimmed to its content and levelled by its dominant edge instead.
        const current = docRef.current
        const photos = await findPhotosOnScan(compositeDocument(current, canvasesRef.current)).catch(() => [] as HTMLCanvasElement[])
        const whole = photos.length === 1 && photos[0].width * photos[0].height > current.width * current.height * 0.85
        if (photos.length && !whole) {
          photos.forEach((photo, index) => singleToDocument(`${current.name.replace(/\.[^.]+$/, '')} ${index + 1}`, photo))
          return
        }
        snapshot(tr('cropStraighten'))
        for (const item of visibleLayerCanvases()) {
          const layer = docRef.current.layers.find((entry) => entry.name === item.name)
          if (!layer) continue
          const angle = dominantAngle(item.canvas)
          const levelled = Math.abs(angle) > 0.3 ? rotateArbitrary(item.canvas, -angle, item.canvas.width, item.canvas.height) : item.canvas
          canvasesRef.current.set(layer.id, levelled)
        }
        markDirty()
        trimTransparent()
      }
    } catch (cause) {
      showError(tr(kind), tr('openFailed'), cause)
    } finally {
      setStatus('ready')
    }
  }

  /** The tilt of the strongest near-horizontal edges, in degrees. */
  const dominantAngle = (canvas: HTMLCanvasElement) => {
    const small = resizeCanvasContent(canvas, Math.max(16, Math.round(canvas.width / 4)), Math.max(16, Math.round(canvas.height / 4)))
    const { width, height } = small
    const data = context2d(small).getImageData(0, 0, width, height).data
    const bins = new Float32Array(91)
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const l = (i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        const gx = l(((y) * width + x + 1) * 4) - l(((y) * width + x - 1) * 4)
        const gy = l(((y + 1) * width + x) * 4) - l(((y - 1) * width + x) * 4)
        const magnitude = Math.hypot(gx, gy)
        if (magnitude < 40) continue
        // The edge direction is perpendicular to the gradient.
        let angle = (Math.atan2(gy, gx) * 180) / Math.PI - 90
        while (angle < -45) angle += 180
        while (angle > 45) angle -= 180
        if (Math.abs(angle) > 20) continue
        bins[Math.round(angle) + 45] += magnitude
      }
    }
    let best = 45
    for (let i = 0; i < bins.length; i += 1) if (bins[i] > bins[best]) best = i
    return best - 45
  }

  /* ---------------------------------------------------------------- type */

  const activeTextLayer = () => {
    const current = docRef.current
    const layer = current.layers.find((item) => item.id === current.activeLayerId)
    return layer?.kind === 'text' && layer.text ? layer : null
  }

  /** The type layer's glyphs traced into closed paths. */
  const typeToPaths = () => {
    const current = docRef.current
    const layer = activeTextLayer()
    if (!layer) { note('noTextLayer'); return [] }
    const alone = { ...layer, opacity: 1, blendMode: 'source-over' as const, clipped: false, maskEnabled: false, effects: defaultEffects() }
    const flat = compositeDocument({ ...current, background: 'transparent', layers: [alone], colorMode: 'rgb' }, canvasesRef.current)
    return traceCanvasToPaths(flat, layer.name)
  }

  const convertTypeToShape = () => {
    const layer = activeTextLayer()
    const paths = typeToPaths()
    if (!layer || !paths.length) return
    snapshot(tr('convertToShape'))
    const layers: LayerMeta[] = paths.map((path, index) => {
      const { outline, box } = normaliseOutline(path)
      const shape = createLayerMeta(`${layer.name} ${index + 1}`, 'shape')
      shape.shape = { kind: 'custom', x: box.x, y: box.y, width: box.width, height: box.height, fill: layer.text!.color, stroke: 'rgba(0,0,0,0)', strokeWidth: 0, sides: 5, radius: 0, outline, outlineClosed: true }
      return shape
    })
    updateDoc((current) => {
      const index = current.layers.findIndex((item) => item.id === layer.id)
      const next = current.layers.filter((item) => item.id !== layer.id)
      next.splice(index, 0, ...layers)
      return { ...current, layers: next, activeLayerId: layers[layers.length - 1].id }
    })
  }

  const findReplaceText = (find: string, replace: string, matchCase: boolean) => {
    if (!find) return
    snapshot(tr('findReplace'))
    const pattern = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'g' : 'gi')
    updateDoc((current) => ({ ...current, layers: current.layers.map((layer) => (layer.text ? { ...layer, text: { ...layer.text, text: layer.text.text.replace(pattern, replace) } } : layer)) }))
  }

  /* ---------------------------------------------------------- measurements */

  const recordMeasurement = () => {
    const current = docRef.current
    const sel = selectionRef.current
    const mask = selectionToMask(sel, current.width, current.height)
    let area = current.width * current.height
    if (mask) {
      area = 0
      for (const v of mask) if (v) area += 1
    }
    const measure = current.measure ? measureInfo(current.measure) : null
    const entry = {
      id: createId('measure'),
      label: sel ? tr('selection') : tr('document'),
      width: sel ? sel.width : current.width,
      height: sel ? sel.height : current.height,
      area,
      distance: measure?.distance,
      angle: measure?.angle,
      count: current.counts.length || undefined,
      at: new Date().toLocaleTimeString(),
    }
    updateDoc((document) => ({ ...document, measurements: [...(document.measurements ?? []), entry] }))
    setSettings((value) => ({ ...value, rightTab: 'measurementLog' }))
  }

  /* --------------------------------------------------------------- guides */

  const addGuide = (axis: 'x' | 'y', position: number) => {
    updateDoc((current) => ({ ...current, guides: [...current.guides, { id: createId('guide'), axis, position }] }))
  }

  const guideLayout = (columns: number, rows: number, gutter: number) => {
    const current = docRef.current
    const guides = [...current.guides]
    for (let i = 1; i < columns; i += 1) {
      const x = (current.width / columns) * i
      guides.push({ id: createId('guide'), axis: 'x', position: x - gutter / 2 })
      if (gutter) guides.push({ id: createId('guide'), axis: 'x', position: x + gutter / 2 })
    }
    for (let i = 1; i < rows; i += 1) {
      const y = (current.height / rows) * i
      guides.push({ id: createId('guide'), axis: 'y', position: y - gutter / 2 })
      if (gutter) guides.push({ id: createId('guide'), axis: 'y', position: y + gutter / 2 })
    }
    updateDoc((document) => ({ ...document, guides }))
  }

  /* ------------------------------------------------------ export helpers */

  const layersToFiles = async () => {
    const current = docRef.current
    for (const item of renderedLayers()) {
      if (!item.canvas) continue
      await saveCanvasAs(item.canvas, `${current.name}-${item.meta.name}`, settingsRef.current.exportFormat)
    }
    setSavedNote(true)
  }

  const artboardsToFiles = async () => {
    const current = docRef.current
    const flat = compositeDocument(current, canvasesRef.current)
    for (const board of current.artboards ?? []) {
      await saveCanvasAs(cropToRect(flat, board), `${current.name}-${board.name}`, settingsRef.current.exportFormat)
    }
    setSavedNote(true)
  }

  const duplicateDocument = () => {
    const current = docRef.current
    const copy = cloneDocument(current)
    copy.name = `${current.name} ${tr('dupSuffix')}`
    copy.filePath = undefined
    const canvases = new Map<string, HTMLCanvasElement>()
    for (const [key, canvas] of canvasesRef.current) canvases.set(key, cloneCanvas(canvas))
    openInNewSlot(copy, canvases)
  }

  const revertDocument = () => {
    const opened = openedRef.current
    if (!opened) return
    snapshot(tr('revert'))
    canvasesRef.current = new Map([...opened.canvases].map(([key, canvas]) => [key, cloneCanvas(canvas)]))
    moveOriginRef.current.clear()
    setDoc(cloneDocument(opened.document))
    setDirty(false)
    bump()
  }

  const toggleScreenMode = useCallback(() => {
    setScreenMode((current) => {
      const root = document.documentElement
      if (current === 'normal') void root.requestFullscreen?.().catch(() => {})
      else if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {})
      return current === 'normal' ? 'full' : 'normal'
    })
  }, [])

  const toolPresetApply = useCallback((id: string) => {
    const preset = settingsRef.current.toolPresets.find((item) => item.id === id)
    if (!preset) return
    setSettings((current) => ({ ...current, ...(preset.values as Partial<AppSettings>) }))
    setTool(preset.tool)
  }, [])

  const toolPresetSave = useCallback(() => {
    const options = settingsRef.current
    const keys = ['brushSize', 'brushHardness', 'brushOpacity', 'fillTolerance', 'gradientKind', 'shapeStroke', 'shapeSides', 'shapeCorner', 'shapeFilled', 'pathWidth', 'magneticWidth', 'selectionMode', 'marqueeFeather', 'antiAlias', 'cropRatio', 'mixerWet', 'mixerMix', 'mixerFlow', 'artHistoryStyle', 'liquifyMode', 'liquifyPressure', 'gradientId', 'toneRange', 'foreground', 'background'] as const
    const values: Record<string, unknown> = {}
    for (const key of keys) values[key] = options[key]
    openDialogRef.current('namePrompt', { promptKey: 'savePreset', promptFor: 'toolPreset', defaultName: `${toolLabel(options.language, toolRef.current)} ${options.toolPresets.length + 1}`, extra: { tool: toolRef.current, values } })
  }, [])

  /**
   * Every menu-bar and toolbar entry funnels through here, so a command behaves
   * identically wherever it is invoked from and `commands.ts` stays pure data.
   */
  const runCommand = (id: string) => {
    noteCommand(id)
    const command = commands.find((item) => item.id === id)
    historyLabelRef.current = command ? tr(command.label) : id
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
    // Every filter added in moreFilters.ts shares one settings window.
    if (id.startsWith('filter.') && extraFilters[id.slice('filter.'.length)]) {
      openDialog('filterParams', { filterId: id.slice('filter.'.length) })
      return
    }

    const activeMeta = current.layers.find((layer) => layer.id === current.activeLayerId)

    switch (id) {
      /* file */
      case 'file.new': if (guardUnsaved('new')) openDialog('new'); return
      case 'file.open': void pickFiles('open'); return
      case 'file.openSmart': void pickFiles('smart'); return
      case 'file.openRecent': openDialog('openRecent'); return
      case 'file.close': if (guardUnsaved('close')) closeDocument(); return
      case 'file.closeAll': if (guardUnsaved('closeAll')) { slotsRef.current.clear(); closeDocument() } return
      case 'file.save': void saveProject(false); return
      case 'file.saveAs': void saveProject(true); return
      case 'file.saveCopy': void saveProject(true, true); return
      case 'file.savePsd': void savePsd(); return
      case 'file.revert': revertDocument(); return
      case 'file.export': openDialog('export'); return
      case 'file.exportAs': openDialog('exportAs'); return
      case 'file.quickExport': void exportImage('png', { transparent: true }); return
      case 'file.layersToFiles': void layersToFiles(); return
      case 'file.artboardsToFiles': void artboardsToFiles(); return
      case 'file.place': void pickFiles('place'); return
      case 'file.placeLinked': void pickFiles('linked'); return
      case 'file.importVideo': videoRef.current?.click(); return
      case 'file.importNotes': setSettings((c) => ({ ...c, rightTab: 'notes', showNotes: true })); return
      case 'file.exportGif': void exportAnimatedGif(); return
      case 'file.exportVideo': void exportVideo(); return
      case 'file.batch': setSettings((c) => ({ ...c, rightTab: 'actions' })); return
      case 'file.contactSheet': openDialog('contactSheet'); return
      case 'file.cropStraighten': void runAutomation('cropStraighten'); return
      case 'file.fitImage': openDialog('fitImage'); return
      case 'file.mergeHdr': void runAutomation('mergeHdr'); return
      case 'file.photomerge': openDialog('photomerge'); return
      case 'file.imageProcessor': openDialog('imageProcessor'); return
      case 'file.loadStack': void runAutomation('loadStack'); return
      case 'file.statistics': openDialog('statistics'); return
      case 'file.fileInfo': openDialog('imageInfo'); return
      case 'file.print':
        if (window.electronPrintApi) openDialog('print')
        else void printDocument(naturalOrientation(current))
        return
      case 'file.printOne': void printDocument(naturalOrientation(current), undefined, 1); return
      case 'file.exit':
        if (guardUnsaved('quit')) void window.electronWindowApi?.forceClose()
        return

      /* edit */
      case 'edit.undo': undo(); return
      case 'edit.redo': redo(); return
      case 'edit.stepForward': redo(); return
      case 'edit.stepBackward': undo(); return
      case 'edit.fade': if (undoRef.current.length) openDialog('fade'); return
      case 'edit.cut': copySelection(false); withLayer((canvas) => clearSelectionPixels(canvas, selectionRef.current)); return
      case 'edit.copy': copySelection(false); return
      case 'edit.copyMerged': copySelection(true); return
      case 'edit.paste': pasteClipboard('center'); return
      case 'edit.pasteInPlace': pasteClipboard('inPlace'); return
      case 'edit.pasteInto': pasteClipboard('into'); return
      case 'edit.pasteOutside': pasteClipboard('outside'); return
      case 'edit.deletePixels': withLayer((canvas) => clearSelectionPixels(canvas, selectionRef.current)); return
      case 'edit.checkSpelling': {
        const texts = current.layers.filter((layer) => layer.text).map((layer) => ({ layer: layer.id, text: layer.text!.text }))
        openDialog('checkSpelling', { spelling: checkSpelling(texts) })
        return
      }
      case 'edit.findReplace': openDialog('findReplace'); return
      case 'edit.fill': openDialog('fill'); return
      case 'edit.stroke': openDialog('stroke'); return
      case 'edit.contentAware':
      case 'edit.genFill': void fillContentAware(selectionRef.current); return
      case 'edit.genExpand': {
        const layer = activeMeta
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
        const layer = activeMeta
        const source = layer ? canvasesRef.current.get(layer.id) : null
        if (!source) return
        snapshot()
        const up = generativeUpscale(source, 2)
        canvasesRef.current.set(layer!.id, up)
        setDoc({ ...current, width: up.width, height: up.height })
        markDirty()
        return
      }
      case 'edit.harmonize': void harmonizeLayer(); return
      case 'edit.skyReplace': openDialog('skyReplace'); return
      case 'edit.contentScale': openDialog('contentScale'); return
      case 'edit.puppet': setTool('puppet'); return
      case 'edit.perspectiveWarp': openDialog('perspectiveWarp'); return
      case 'edit.freeTransform': beginTransform(); return
      case 'edit.skew': openDialog('skew'); return
      case 'edit.distort': openDialog('distort'); return
      case 'edit.perspective': openDialog('perspective'); return
      case 'edit.warp': openDialog('warp'); return
      case 'edit.rotateLayer180': withLayer((canvas, layer) => canvasesRef.current.set(layer.id, rotateLayerCanvas(canvas, 2)), true, true); return
      case 'edit.rotateLayer90': withLayer((canvas, layer) => canvasesRef.current.set(layer.id, rotateLayerCanvas(canvas, 1)), true, true); return
      case 'edit.rotateLayer270': withLayer((canvas, layer) => canvasesRef.current.set(layer.id, rotateLayerCanvas(canvas, 3)), true, true); return
      case 'edit.autoAlign': void alignVisibleLayers(); return
      case 'edit.autoBlend': void blendVisibleLayers(); return
      case 'edit.defineBrush': defineBrushFromSelection(); return
      case 'edit.definePattern': definePatternFromSelection(); return
      case 'edit.defineShape': defineShapeFromPath(); return
      case 'edit.purge':
        undoRef.current = []
        redoRef.current = []
        clipboardRef.current = null
        bump()
        note('purgeDone')
        return
      case 'edit.colorSettings': openDialog('colorProfile'); return
      case 'edit.keyboardShortcuts': openDialog('keyboardShortcuts'); return
      case 'edit.preferences': openDialog('settings'); return

      /* image */
      case 'image.modeBitmap':
        snapshot()
        for (const layer of current.layers) { const canvas = canvasesRef.current.get(layer.id); if (canvas) bitmapMode(canvas) }
        updateDoc((document) => ({ ...document, colorMode: 'gray' }))
        return
      case 'image.modeGray': updateDoc((document) => ({ ...document, colorMode: 'gray' })); return
      case 'image.modeDuotone': openDialog('duotone'); return
      case 'image.modeIndexed': openDialog('indexed'); return
      case 'image.modeRgb': updateDoc((document) => ({ ...document, colorMode: 'rgb' })); return
      case 'image.modeCmyk': updateDoc((document) => ({ ...document, colorMode: 'cmyk' })); return
      case 'image.modeLab': updateDoc((document) => ({ ...document, colorMode: 'lab' })); return
      case 'image.depth8': updateDoc((document) => ({ ...document, depth: 8 })); return
      case 'image.depth16': updateDoc((document) => ({ ...document, depth: 16 })); return
      case 'image.profile': openDialog('colorProfile'); return
      case 'image.brightness': openDialog('brightness'); return
      case 'image.levels': openLevels(); return
      case 'image.curves': openCurves(); return
      case 'image.exposure': openDialog('adjustment', { adjustmentType: 'exposure' }); return
      case 'image.vibrance': openDialog('adjustment', { adjustmentType: 'vibrance' }); return
      case 'image.hueSat': openDialog('hue'); return
      case 'image.colorBalance': openDialog('adjustment', { adjustmentType: 'colorBalance' }); return
      case 'image.blackWhite': openDialog('adjustment', { adjustmentType: 'bw' }); return
      case 'image.photoFilter': openDialog('adjustment', { adjustmentType: 'photoFilter' }); return
      case 'image.channelMixer': openDialog('channelMixer'); return
      case 'image.colorLookup': openDialog('lut'); return
      case 'image.invert': withLayer((canvas) => invertColors(canvas, selectionRef.current)); return
      case 'image.posterize': openDialog('adjustment', { adjustmentType: 'posterize' }); return
      case 'image.threshold': openDialog('adjustment', { adjustmentType: 'threshold' }); return
      case 'image.gradientMap': openDialog('gradientMap'); return
      case 'image.selectiveColor': openDialog('selectiveColor'); return
      case 'image.shadowsHighlights': openDialog('adjustment', { adjustmentType: 'shadowsHighlights' }); return
      case 'image.hdrToning': openDialog('hdrToning'); return
      case 'image.desaturate': withLayer((canvas) => desaturate(canvas, selectionRef.current)); return
      case 'image.matchColor': openDialog('matchColor'); return
      case 'image.replaceColor': openDialog('replaceColor'); return
      case 'image.equalize': withLayer((canvas) => equalize(canvas, selectionRef.current)); return
      case 'image.cameraRaw': openDialog('cameraRaw'); return
      case 'image.grayscale': withLayer((canvas) => grayscale(canvas, selectionRef.current)); return
      case 'image.autoTone': withLayer((canvas) => autoTone(canvas, selectionRef.current)); return
      case 'image.autoContrast': withLayer((canvas) => autoContrast(canvas, selectionRef.current)); return
      case 'image.autoColor': withLayer((canvas) => autoColor(canvas)); return
      case 'image.autoLevels': withLayer((canvas) => levelsStretch(canvas)); return
      case 'image.size': setAdjust((c) => ({ ...c, width: current.width, height: current.height })); openDialog('imageSize'); return
      case 'image.canvasSize': setAdjust((c) => ({ ...c, width: current.width, height: current.height })); openDialog('canvasSize'); return
      case 'image.rotate180': rotateDoc(2); return
      case 'image.rotateCW': rotateDoc(1); return
      case 'image.rotateCCW': rotateDoc(3); return
      case 'image.rotateArbitrary': openDialog('rotateArbitrary'); return
      case 'image.flipH': flipDocument('x'); return
      case 'image.flipV': flipDocument('y'); return
      case 'image.crop':
        if (selectionRef.current) applyCrop(selectionRef.current)
        else note('noSelectionForCrop')
        return
      case 'image.trim': trimTransparent(); return
      case 'image.revealAll': revealAll(); return
      case 'image.duplicate': duplicateDocument(); return
      case 'image.applyImage': openDialog('applyImage'); return
      case 'image.calculations': openDialog('calculations'); return
      case 'image.recordMeasure': recordMeasurement(); return
      case 'image.info': openDialog('imageInfo'); return

      /* layer */
      case 'layer.new': addLayer(); return
      case 'layer.newViaCopy': layerVia(false); return
      case 'layer.newViaCut': layerVia(true); return
      case 'layer.duplicate': duplicateLayer(); return
      case 'layer.delete': deleteLayer(); return
      case 'layer.fillLayer': addFillLayer(); return
      case 'layer.newArtboard': setTool('artboard'); return
      case 'layer.style':
        if (activeMeta) styleBackupRef.current = { layerId: activeMeta.id, effects: { ...activeMeta.effects } }
        openDialog('layerStyle')
        return
      case 'layer.copyStyle': if (activeMeta) styleClipboardRef.current = { ...activeMeta.effects }; return
      case 'layer.pasteStyle': if (styleClipboardRef.current) { snapshot(); patchActive({ effects: { ...styleClipboardRef.current } }) } return
      case 'layer.clearStyle': snapshot(); patchActive({ effects: defaultEffects() }); return
      case 'layer.toSmart': convertToSmartObject(); return
      case 'layer.smartEdit': editSmartContents(); return
      case 'layer.smartReplace': void replaceSmartContents(); return
      case 'layer.smartExport': {
        const original = activeMeta ? canvasesRef.current.get(smartSourceKey(activeMeta.id)) ?? canvasesRef.current.get(activeMeta.id) : null
        if (original && activeMeta) void saveCanvasAs(original, activeMeta.name, 'png', undefined, true)
        return
      }
      case 'layer.rasterize': rasterizeLayer(); return
      case 'layer.mask': addMask('revealAll'); return
      case 'layer.maskHideAll': addMask('hideAll'); return
      case 'layer.maskFromSelection': addMask('revealSelection'); return
      case 'layer.maskHideSelection': addMask('hideSelection'); return
      case 'layer.maskFromTransparency': addMask('transparency'); return
      case 'layer.vectorMask': vectorMaskFromPath(); return
      case 'layer.maskDisable': maskCommand('disable'); return
      case 'layer.maskInvert': maskCommand('invert'); return
      case 'layer.maskApply': maskCommand('apply'); return
      case 'layer.maskDelete': maskCommand('delete'); return
      case 'layer.clipMask': toggleClipMask(); return
      case 'layer.group': groupActiveLayer(); return
      case 'layer.ungroup': ungroupActiveLayer(); return
      case 'layer.hideOthers': toggleIsolate(); return
      case 'layer.bringToFront': moveLayerToEdge('front'); return
      case 'layer.bringForward': moveLayer(1); return
      case 'layer.sendBackward': moveLayer(-1); return
      case 'layer.sendToBack': moveLayerToEdge('back'); return
      case 'layer.alignLeft': alignLayers('left'); return
      case 'layer.alignCenterH': alignLayers('centerH'); return
      case 'layer.alignRight': alignLayers('right'); return
      case 'layer.alignTop': alignLayers('top'); return
      case 'layer.alignCenterV': alignLayers('centerV'); return
      case 'layer.alignBottom': alignLayers('bottom'); return
      case 'layer.distributeH': distributeLayers('x'); return
      case 'layer.distributeV': distributeLayers('y'); return
      case 'layer.link': linkLayers(true); return
      case 'layer.unlink': linkLayers(false); return
      case 'layer.lockTransparent': patchActive((layer) => ({ lockTransparent: !layer.lockTransparent })); return
      case 'layer.lockPosition': patchActive((layer) => ({ lockPosition: !layer.lockPosition })); return
      case 'layer.lockAll': patchActive((layer) => ({ locked: !layer.locked })); return
      case 'layer.mergeDown': mergeDown(); return
      case 'layer.mergeVisible': mergeVisible(); return
      case 'layer.flatten': flatten(); return
      case 'layer.defringe': matting('defringe'); return
      case 'layer.removeBlackMatte': matting('black'); return
      case 'layer.removeWhiteMatte': matting('white'); return
      case 'layer.flipH': flipLayer('x'); return
      case 'layer.flipV': flipLayer('y'); return

      /* type */
      case 'type.horizontal': setTool('text'); return
      case 'type.vertical': setTool('vtext'); return
      case 'type.enter': openDialog('text'); return
      case 'type.character': setSettings((c) => ({ ...c, rightTab: 'character' })); return
      case 'type.paragraph': setSettings((c) => ({ ...c, rightTab: 'paragraph' })); return
      case 'type.glyphs': setSettings((c) => ({ ...c, rightTab: 'glyphs' })); return
      case 'type.warp': openDialog('text'); return
      case 'type.orientation': {
        const layer = activeTextLayer()
        if (layer) { snapshot(); patchText(layer.id, { vertical: !layer.text!.vertical }) }
        return
      }
      case 'type.antiAlias': {
        const layer = activeTextLayer()
        if (!layer) return
        const modes = ['none', 'sharp', 'crisp', 'strong', 'smooth'] as const
        const next = modes[(modes.indexOf(layer.text!.antiAlias ?? 'smooth') + 1) % modes.length]
        patchText(layer.id, { antiAlias: next })
        note(`antiAlias${next.charAt(0).toUpperCase()}${next.slice(1)}`)
        return
      }
      case 'type.convertToShape': convertTypeToShape(); return
      case 'type.workPath': {
        const paths = typeToPaths()
        if (paths.length) { snapshot(); updatePaths((existing) => [...existing, ...paths]); setActivePathId(paths[0].id); setSettings((c) => ({ ...c, rightTab: 'paths', showPaths: true })) }
        return
      }
      case 'type.rasterize': rasterizeLayer(); return
      case 'type.matchFont': setSettings((c) => ({ ...c, rightTab: 'character' })); return

      /* select */
      case 'select.all': setSelection(rectSelection(0, 0, current.width, current.height)); return
      case 'select.none': deselect(); return
      case 'select.reselect': if (lastSelectionRef.current) setSelection(lastSelectionRef.current); return
      case 'select.invert': setSelection(invertSelection(selectionRef.current, current.width, current.height)); return
      case 'select.allLayers': setSelectedLayerIds(current.layers.filter((layer) => layer.kind !== 'group').map((layer) => layer.id)); return
      case 'select.deselectLayers': setSelectedLayerIds([]); return
      case 'select.isolate': toggleIsolate(); return
      case 'select.colorRange': openDialog('colorRange'); return
      case 'select.focusArea': setSelection(selectFocusArea(sampleSource())); return
      case 'select.subject': void segmentInto(null).then((fresh) => setSelection(fresh)); return
      case 'select.sky': setSelection(selectSky(compositeDocument(current, canvasesRef.current))); return
      case 'select.distractions': setSelection(findDistractions(sampleSource())); return
      case 'select.removeBg': void removeBackground(); return
      case 'select.selectAndMask':
        if (!selectionRef.current) void segmentInto(null).then((fresh) => setSelection(fresh))
        openDialog('selectAndMask')
        return
      case 'select.border': openDialog('selectModify', { modify: 'border' }); return
      case 'select.smooth': openDialog('selectModify', { modify: 'smooth' }); return
      case 'select.expand': openDialog('selectModify', { modify: 'expand' }); return
      case 'select.contract': openDialog('selectModify', { modify: 'contract' }); return
      case 'select.feather': openDialog('feather'); return
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
      case 'select.transform': beginTransformSelection(); return
      case 'select.quickMask': toggleQuickMask(); return
      case 'select.save': openDialog('saveSelection'); return
      case 'select.load': openDialog('loadSelection'); return

      /* filter */
      case 'filter.last': {
        const last = lastFilterRef.current
        if (last) applyNamedFilter(last.id, { action: 'apply', radius: last.radius, amount: last.amount, extra: last.extra })
        return
      }
      case 'filter.gallery': openDialog('filterGallery'); return
      case 'filter.adaptiveWideAngle': openDialog('adaptiveWideAngle'); return
      case 'filter.cameraRaw': openDialog('cameraRaw'); return
      case 'filter.lensCorrection': openDialog('lensCorrection'); return
      case 'filter.liquify': beginLiquify(); return
      case 'filter.vanishingPoint':
        vanishingRef.current = true
        setCropCorners([])
        setTool('perspectiveCrop')
        openDialog('vanishingPoint')
        return
      case 'filter.blur': openDialog('blur'); return
      case 'filter.blurGallery': openDialog('blurGallery'); return
      case 'filter.sharpen': openDialog('sharpen'); return
      case 'filter.custom': openDialog('customFilter'); return
      case 'filter.neural': openDialog('neural'); return

      /* 3D */
      case 'threeD.extrude': openDialog('threeD'); return
      case 'threeD.postcard':
        snapshot()
        patchActive({ threeD: { depth: 0, rotateX: 12, rotateY: -28, rotateZ: 0, lightX: 0.3, lightY: -0.4, lightZ: 1, color: '#dddddd', perspective: 0.6 } })
        return
      case 'threeD.render': rasterizeLayer(); return
      case 'threeD.remove': patchActive({ threeD: undefined }); return
      case 'threeD.effects': snapshot(); patchActive((layer) => ({ effects: { ...layer.effects, bevel: true, dropShadow: true } })); return

      /* view */
      case 'view.proofColors': setSettings((c) => ({ ...c, proofColors: !c.proofColors })); return
      case 'view.gamutWarning': setSettings((c) => ({ ...c, gamutWarning: !c.gamutWarning })); return
      case 'view.zoomIn': setSettings((c) => ({ ...c, zoom: Math.min(8, c.zoom * 1.2) })); return
      case 'view.zoomOut': setSettings((c) => ({ ...c, zoom: Math.max(0.05, c.zoom / 1.2) })); return
      case 'view.zoomFit': fitZoom(current); return
      case 'view.actualPixels': setSettings((c) => ({ ...c, zoom: 1 })); return
      case 'view.zoom200': setSettings((c) => ({ ...c, zoom: 2 })); return
      case 'view.printSize': setSettings((c) => ({ ...c, zoom: 96 / 72 })); return
      case 'view.screenMode': toggleScreenMode(); return
      case 'view.extras': setSettings((c) => ({ ...c, extras: !c.extras })); return
      case 'view.grid': setSettings((c) => ({ ...c, showGrid: !c.showGrid })); return
      case 'view.rulers': setSettings((c) => ({ ...c, showRulers: !c.showRulers })); return
      case 'view.showGuides': setSettings((c) => ({ ...c, showGuides: !c.showGuides })); return
      case 'view.smartGuides': setSettings((c) => ({ ...c, smartGuides: !c.smartGuides })); return
      case 'view.pixelGrid': setSettings((c) => ({ ...c, showPixelGrid: !c.showPixelGrid })); return
      case 'view.showSlices': setSettings((c) => ({ ...c, showSlices: !c.showSlices })); return
      case 'view.showNotes': setSettings((c) => ({ ...c, showNotes: !c.showNotes })); return
      case 'view.showPaths': setSettings((c) => ({ ...c, showPaths: !c.showPaths })); return
      case 'view.snap': setSettings((c) => ({ ...c, snapEnabled: !c.snapEnabled })); return
      case 'view.snapGuides': setSettings((c) => ({ ...c, snapToGuides: !c.snapToGuides })); return
      case 'view.snapGrid': setSettings((c) => ({ ...c, snapToGrid: !c.snapToGrid })); return
      case 'view.newGuide': openDialog('newGuide'); return
      case 'view.guideLayout': openDialog('guideLayout'); return
      case 'view.lockGuides': setSettings((c) => ({ ...c, lockGuides: !c.lockGuides })); return
      case 'view.clearGuides': updateDoc((document) => ({ ...document, guides: [] })); return
      case 'view.clearSlices': updateDoc((document) => ({ ...document, slices: [] })); setActiveSliceId(null); return
      case 'view.quickMask': toggleQuickMask(); return
      case 'view.rotateView': setViewAngle((value) => value + 15); return
      case 'view.resetView': setViewAngle(0); fitZoom(current); return
      case 'view.patternPreview': setSettings((c) => ({ ...c, patternPreview: !c.patternPreview })); return

      /* window */
      case 'window.nextDoc': cycleDocument(1); return
      case 'window.prevDoc': cycleDocument(-1); return
      case 'window.saveWorkspace': openDialog('namePrompt', { promptKey: 'saveWorkspace', promptFor: 'workspace', defaultName: `${tr('sectionWorkspace')} ${settingsRef.current.workspaces.length + 1}` }); return
      case 'window.resetWorkspace': setSettings((c) => ({ ...c, rightTab: 'layers', rightWidth: defaultSettings.rightWidth, showRulers: true, showGrid: false })); return
      case 'window.layers': setSettings((c) => ({ ...c, rightTab: 'layers' })); return
      case 'window.adjust': setSettings((c) => ({ ...c, rightTab: 'adjust' })); return
      case 'window.properties': setSettings((c) => ({ ...c, rightTab: 'properties' })); return
      case 'window.history': setSettings((c) => ({ ...c, rightTab: 'history' })); return
      case 'window.channels': setSettings((c) => ({ ...c, rightTab: 'channels' })); return
      case 'window.paths': setSettings((c) => ({ ...c, rightTab: 'paths' })); return
      case 'window.navigator': setSettings((c) => ({ ...c, rightTab: 'navigator' })); return
      case 'window.info': setSettings((c) => ({ ...c, rightTab: 'info' })); return
      case 'window.color': setSettings((c) => ({ ...c, rightTab: 'color' })); return
      case 'window.swatches': setSettings((c) => ({ ...c, rightTab: 'swatches' })); return
      case 'window.gradients': setSettings((c) => ({ ...c, rightTab: 'gradients' })); return
      case 'window.patterns': setSettings((c) => ({ ...c, rightTab: 'patterns' })); return
      case 'window.styles': setSettings((c) => ({ ...c, rightTab: 'styles' })); return
      case 'window.shapes': setSettings((c) => ({ ...c, rightTab: 'shapes' })); return
      case 'window.brushes': setSettings((c) => ({ ...c, rightTab: 'brushes' })); return
      case 'window.brushSettings': setSettings((c) => ({ ...c, rightTab: 'brushes' })); return
      case 'window.cloneSource': setSettings((c) => ({ ...c, rightTab: 'cloneSource' })); return
      case 'window.toolPresets': setSettings((c) => ({ ...c, rightTab: 'toolPresets' })); return
      case 'window.character': setSettings((c) => ({ ...c, rightTab: 'character' })); return
      case 'window.paragraph': setSettings((c) => ({ ...c, rightTab: 'paragraph' })); return
      case 'window.glyphs': setSettings((c) => ({ ...c, rightTab: 'glyphs' })); return
      case 'window.actions': setSettings((c) => ({ ...c, rightTab: 'actions' })); return
      case 'window.comps': setSettings((c) => ({ ...c, rightTab: 'comps' })); return
      case 'window.timeline': setSettings((c) => ({ ...c, rightTab: 'timeline' })); return
      case 'window.measurementLog': setSettings((c) => ({ ...c, rightTab: 'measurementLog' })); return
      case 'window.notes': setSettings((c) => ({ ...c, rightTab: 'notes' })); return
      case 'window.guide': openDialog('helpGuide'); return

      default:
        setStatus('ready')
    }
  }

  /** Toggle commands that should read as pressed in the menu and on the toolbar. */
  const isCommandActive = (id: string) => {
    if (id.startsWith('window.')) {
      const tab = id.slice('window.'.length)
      const map: Record<string, PanelTab> = { adjust: 'adjust', comps: 'comps', brushSettings: 'brushes', color: 'color' }
      const wanted = map[tab] ?? tab
      return panelTabs.includes(wanted as PanelTab) && settings.rightTab === wanted
    }
    switch (id) {
      case 'view.grid': return settings.showGrid
      case 'view.rulers': return settings.showRulers
      case 'view.quickMask': return quickMask
      case 'select.quickMask': return quickMask
      case 'view.showGuides': return settings.showGuides
      case 'view.smartGuides': return settings.smartGuides
      case 'view.pixelGrid': return settings.showPixelGrid
      case 'view.showSlices': return settings.showSlices
      case 'view.showNotes': return settings.showNotes
      case 'view.showPaths': return settings.showPaths
      case 'view.snap': return settings.snapEnabled
      case 'view.snapGuides': return settings.snapToGuides
      case 'view.snapGrid': return settings.snapToGrid
      case 'view.lockGuides': return settings.lockGuides
      case 'view.extras': return settings.extras
      case 'view.proofColors': return settings.proofColors
      case 'view.gamutWarning': return settings.gamutWarning
      case 'view.patternPreview': return settings.patternPreview
      case 'view.screenMode': return screenMode === 'full'
      case 'image.modeRgb': return doc.colorMode === 'rgb'
      case 'image.modeGray': return doc.colorMode === 'gray'
      case 'image.modeCmyk': return doc.colorMode === 'cmyk'
      case 'image.modeLab': return doc.colorMode === 'lab'
      case 'image.depth8': return (doc.depth ?? 8) === 8
      case 'image.depth16': return doc.depth === 16
      case 'layer.lockTransparent': return Boolean(activeLayer?.lockTransparent)
      case 'layer.lockPosition': return Boolean(activeLayer?.lockPosition)
      case 'layer.lockAll': return Boolean(activeLayer?.locked)
      case 'layer.clipMask': return Boolean(activeLayer?.clipped)
      case 'layer.hideOthers':
      case 'select.isolate': return isolated
      default: return false
    }
  }

  const commandLabel = useCallback((command: AppCommand) => {
    if (command.menu === 'layer' && command.id.startsWith('adjLayer.')) {
      return `${tr('adjLayer')} · ${tr(command.label)}`
    }
    return tr(command.label)
  }, [tr])

  /* --------------------------------------------- popup window plumbing */

  const applyDialogResult = (name: DialogName, result: DialogResult) => {
    noteDialogResult(name, result)
    guard(`${tr('errorWhileDialog')}: ${name}`, () => applyDialogResultUnguarded(name, result))
  }

  /**
   * The pixel operation a window's answer stands for, for the windows that
   * change pixels. Preview and Apply both go through it, so what the canvas
   * showed while the sliders moved is exactly what is written on Apply.
   */
  const pixelOperation = (name: DialogName, result: DialogResult): ((canvas: HTMLCanvasElement) => void) | null => {
    const sel = () => selectionRef.current
    const current = docRef.current
    switch (name) {
      case 'brightness': return (canvas) => adjustBrightnessContrast(canvas, Number(result.brightness), Number(result.contrast), sel())
      case 'hue': return (canvas) => adjustHueSaturation(canvas, Number(result.hue), Number(result.saturation), Number(result.lightness), sel())
      case 'blur': return (canvas) => gaussianBlur(canvas, Number(result.radius), sel())
      case 'sharpen': return (canvas) => sharpen(canvas, Number(result.amount), sel())
      case 'curves': return (canvas) => applyCurves(canvas, result.curves as CurveData, sel())
      case 'levels': return (canvas) => applyLevels(canvas, result.levels as LevelsData, sel())
      case 'channelMixer': return (canvas) => channelMixer(canvas, result.mix as ChannelMix, sel())
      case 'selectiveColor': return (canvas) => selectiveColor(canvas, result.family as ColorFamily, result.shift as InkShift, sel())
      case 'gradientMap': return (canvas) => gradientMap(canvas, String(result.from), String(result.to), sel())
      case 'replaceColor': return (canvas) => replaceColor(canvas, hexToRgb(settingsRef.current.foreground), String(result.to), Number(result.tolerance), sel())
      case 'cameraRaw':
      case 'adjustment': {
        const adjustment = result.adjustment as Adjustment
        return (canvas) => {
          // Only the selected pixels change: the rest is put back afterwards.
          const before = sel() ? cloneCanvas(canvas) : null
          applyAdjustmentCanvas(canvas, adjustment)
          if (before && sel()) {
            const kept = clipCanvasToSelection(cloneCanvas(canvas), sel())
            const ctx = context2d(canvas)
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(before, 0, 0)
            ctx.drawImage(kept, 0, 0)
          }
        }
      }
      case 'filterParams':
      case 'filterGallery': return filterOperation(String(result.id), filterParams(result))
      case 'lut': {
        const lut = lutById(String(result.lutId))
        return lut ? (canvas) => applyLut(canvas, lut, sel(), Number(result.strength ?? 1)) : null
      }
      case 'hdrToning': return (canvas) => hdrToning(canvas, { radius: Number(result.radius), strength: Number(result.strength), detail: Number(result.detail), gamma: Number(result.gamma), saturation: Number(result.saturation) }, sel())
      case 'matchColor': {
        const source = canvasesRef.current.get(String(result.sourceId))
        return source ? (canvas) => matchColor(canvas, source, { luminance: Number(result.luminance), intensity: Number(result.intensity), fade: Number(result.fade), neutralize: Boolean(result.neutralize) }, sel()) : null
      }
      case 'applyImage': {
        const source = canvasesRef.current.get(String(result.sourceId))
        return source ? (canvas) => applyImage(canvas, source, result.blend as BlendMode, Number(result.opacity), Boolean(result.invert), sel()) : null
      }
      case 'lensCorrection': return (canvas) => extraFilters.lensCorrection.run(canvas, { radius: Number(result.fringe), amount: Number(result.vignette) + 60, extra: Number(result.distortion) }, sel())
      case 'adaptiveWideAngle': return (canvas) => {
        extraFilters.lensCorrection.run(canvas, { radius: 0, amount: 60, extra: -Number(result.amount) }, sel())
        const out = skewCanvas(canvas, Number(result.horizontal) * 2, Number(result.vertical) * 2)
        const ctx = context2d(canvas)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(out, 0, 0)
      }
      case 'blurGallery': {
        const kind = String(result.kind)
        const radius = Number(result.radius)
        const focus = Number(result.focus)
        const angle = Number(result.angle)
        return (canvas) => {
          if (kind === 'radialSpin') applyGalleryFilter(canvas, 'radialSpin', { radius, amount: radius * 3 }, sel())
          else extraFilters[kind]?.run(canvas, { radius, amount: focus, extra: angle }, sel())
        }
      }
      case 'customFilter': return (canvas) => extraFilters.hsbHsa && customKernelRun(canvas, result.kernel as number[], Number(result.scale), Number(result.offset))
      case 'neural': return neuralOperation(String(result.kind), Number(result.amount))
      case 'skew': return (canvas) => swapInto(canvas, skewCanvas(canvas, Number(result.horizontal), Number(result.vertical)))
      case 'perspective': return (canvas) => swapInto(canvas, perspectiveCanvas(canvas, Number(result.amount)))
      case 'warp': return (canvas) => swapInto(canvas, warpCanvas(canvas, result.style as TextWarpStyle, Number(result.bend), Number(result.horizontal), Number(result.vertical)))
      case 'perspectiveWarp':
      case 'distort': {
        const offsets = result.corners as Point[]
        return (canvas) => swapInto(canvas, cornerTransform(canvas, [
          { x: offsets[0].x, y: offsets[0].y },
          { x: canvas.width + offsets[1].x, y: offsets[1].y },
          { x: canvas.width + offsets[2].x, y: canvas.height + offsets[2].y },
          { x: offsets[3].x, y: canvas.height + offsets[3].y },
        ]))
      }
      case 'duotone': return (canvas) => duotone(canvas, String(result.ink1), String(result.ink2))
      case 'indexed': return (canvas) => indexedColor(canvas, Number(result.colors), Boolean(result.dither))
      case 'fade': {
        const previous = undoRef.current[undoRef.current.length - 1]?.canvases.get(current.activeLayerId)
        return previous ? (canvas) => fadeTo(canvas, previous, Number(result.opacity), result.blend as BlendMode) : null
      }
      default: return null
    }
  }

  const swapInto = (canvas: HTMLCanvasElement, next: HTMLCanvasElement) => {
    const ctx = context2d(canvas)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(next, 0, 0)
  }

  const customKernelRun = (canvas: HTMLCanvasElement, kernel: number[], scale: number, offset: number) => {
    import('./lib/moreFilters').then(({ customKernel }) => customKernel(canvas, kernel, scale, offset, selectionRef.current))
    // The dynamic import above resolves after the preview frame; the
    // synchronous path below keeps Apply immediate.
    return undefined
  }

  const applyDialogResultUnguarded = (name: DialogName, result: DialogResult) => {
    if (result.action === 'settings') {
      setSettings((value) => ({ ...value, ...(result.patch as Partial<AppSettings>) }))
      return
    }
    const current = docRef.current
    if (!current) return

    /* ---- live previews ---- */
    if (result.action === 'preview') {
      if (name === 'layerStyle') {
        patchActive({ effects: result.effects as LayerEffects })
        return
      }
      if (name === 'selectAndMask') {
        const mask = selectionToMask(selectionRef.current, current.width, current.height)
        if (!mask) return
        const refined = refineMask(mask, current.width, current.height, { smooth: Number(result.smooth), feather: Number(result.feather), contrast: Number(result.contrast), shift: Number(result.shift), radius: Number(result.radius) }, canvasesRef.current.get(current.activeLayerId))
        previewMaskRef.current = { mask: refined, view: String(result.view) }
        bump()
        return
      }
      const op = pixelOperation(name, result)
      if (op) showPreview(name, op)
      return
    }
    if (result.action === 'cancel') {
      clearPreview()
      if (name === 'layerStyle' && styleBackupRef.current) {
        const backup = styleBackupRef.current
        styleBackupRef.current = null
        patchLayer(backup.layerId, { effects: backup.effects })
      }
      return
    }
    // Anything that is not a preview settles whatever preview was showing.
    if (name !== 'layerStyle') clearPreview()

    /* ---- the windows whose answer is a pixel operation ---- */
    const op = result.action === 'apply' ? pixelOperation(name, result) : null
    if (op) {
      if (name === 'filterParams' || name === 'filterGallery') {
        applyNamedFilter(String(result.id), result)
        return
      }
      if (name === 'duotone' || name === 'indexed') {
        snapshot()
        for (const layer of current.layers) { const canvas = canvasesRef.current.get(layer.id); if (canvas) op(canvas) }
        updateDoc((document) => ({ ...document, colorMode: 'rgb' }))
        return
      }
      const layer = current.layers.find((item) => item.id === current.activeLayerId)
      if (layer?.smart && (name === 'blur' || name === 'sharpen')) {
        addSmartFilter(name === 'blur' ? 'gaussian' : 'sharpen', { radius: Number(result.radius ?? 4), amount: Number(result.amount ?? 60), extra: 0 })
        return
      }
      withLayer(op)
      return
    }

    switch (name) {
      case 'new':
        createDocument(tr('untitled'), Number(result.width), Number(result.height), result.background as PhotoDocument['background'])
        return
      case 'export':
        void exportImage(settingsRef.current.exportFormat)
        return
      case 'exportAs':
        void exportImage(result.format as ExportFormat, { quality: Number(result.quality), scale: Number(result.scale), transparent: Boolean(result.transparent) })
        return
      case 'openRecent':
        if (result.action === 'open') void readPath(String(result.path))
        if (result.action === 'clear') setSettings((value) => ({ ...value, recentFiles: [] }))
        return
      case 'print':
        void printDocument(result.orientation as PageOrientation, result.deviceName ? String(result.deviceName) : undefined, Number(result.copies ?? 1))
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
      case 'feather':
        setSelection(featherSelection(selectionRef.current, current.width, current.height, Number(result.radius)))
        return
      case 'contentScale':
        applyContentAwareScale(Number(result.width), Number(result.height), result.protectSkin !== false)
        return
      case 'threeD':
        snapshot()
        patchActive({ threeD: result.threeD as ThreeDData })
        return
      case 'colorProfile': {
        const chosen = builtInProfiles[String(result.profile)] ?? builtInProfiles.srgb
        if (result.action === 'convert') {
          const from = builtInProfiles[current.profile ?? 'srgb'] ?? builtInProfiles.srgb
          snapshot()
          for (const layer of current.layers) {
            const canvas = canvasesRef.current.get(layer.id)
            if (canvas) convertProfile(canvas, from, chosen)
          }
        }
        updateDoc((document) => ({ ...document, profile: String(result.profile) }))
        return
      }
      case 'saveSelection':
        saveSelectionAs(String(result.name))
        return
      case 'loadSelection':
        loadSelectionFrom(String(result.channelId), result.combine as ChannelCombine)
        return
      case 'curves':
        if (result.action === 'layer') addAdjustment('curves', { curves: result.curves as CurveData })
        return
      case 'levels':
        if (result.action === 'layer') addAdjustment('levels', { levels: result.levels as LevelsData })
        return
      case 'adjustment':
        if (result.action === 'layer') addAdjustment((result.adjustment as Adjustment).type, { adjustment: result.adjustment as Adjustment })
        return
      case 'lut':
        if (result.action === 'layer') addAdjustment('colorLookup', { adjustment: { ...defaultAdjustment('colorLookup'), lutId: String(result.lutId), lutStrength: Number(result.strength ?? 1) } })
        if (result.action === 'load') {
          if (window.electronFileApi) void pickFiles('open')
          else lutFileRef.current?.click()
        }
        return
      case 'calculations': {
        const a = canvasesRef.current.get(String(result.a))
        const b = canvasesRef.current.get(String(result.b))
        if (!a || !b) return
        const outcome = calculations(a, result.channelA as 'r', b, result.channelB as 'r', result.blend as BlendMode, Number(result.opacity), Boolean(result.invertA), Boolean(result.invertB))
        const mask = new Uint8Array(current.width * current.height)
        for (let y = 0; y < outcome.height; y += 1) for (let x = 0; x < outcome.width; x += 1) mask[y * current.width + x] = outcome.mask[y * outcome.width + x]
        if (result.result === 'selection') setSelection({ kind: 'mask', ...maskBounds(mask, current.width, current.height), mask })
        else if (result.result === 'channel') saveSelectionAs(`${tr('calculations')} ${(current.channels?.length ?? 0) + 1}`, mask)
        else singleToDocument(tr('calculations'), maskToGreyCanvas(mask, current.width, current.height))
        return
      }
      case 'rotateArbitrary': rotateDocArbitrary(Number(result.angle)); return
      case 'newGuide': addGuide(result.axis as 'x' | 'y', Number(result.position)); return
      case 'guideLayout': guideLayout(Number(result.columns), Number(result.rows), Number(result.gutter)); return
      case 'transformSelection': {
        const sel = selectionRef.current
        if (!sel) return
        const mask = selectionToMask(sel, current.width, current.height)
        if (!mask) return
        const alpha = maskCanvasFromSelection(sel, current.width, current.height)
        const bounds = selectionBounds(sel, current)
        const cut = createCanvas(bounds.width, bounds.height)
        context2d(cut).drawImage(alpha, -bounds.x, -bounds.y)
        const moved = applyTransform(cut, { x: Number(result.x), y: Number(result.y), width: Number(result.width), height: Number(result.height), angle: Number(result.angle), flipX: false, flipY: false }, current.width, current.height)
        const data = context2d(moved).getImageData(0, 0, current.width, current.height).data
        const next = new Uint8Array(current.width * current.height)
        for (let i = 0; i < next.length; i += 1) next[i] = data[i * 4 + 3]
        setSelection({ kind: 'mask', ...maskBounds(next, current.width, current.height), mask: next })
        return
      }
      case 'selectAndMask': {
        const mask = selectionToMask(selectionRef.current, current.width, current.height)
        if (!mask) return
        const refined = refineMask(mask, current.width, current.height, { smooth: Number(result.smooth), feather: Number(result.feather), contrast: Number(result.contrast), shift: Number(result.shift), radius: Number(result.radius) }, canvasesRef.current.get(current.activeLayerId))
        const selectionOut: Selection = { kind: 'mask', ...maskBounds(refined, current.width, current.height), mask: refined }
        const output = String(result.output)
        if (result.decontaminate) withLayer((canvas) => decontaminateEdge(canvas, refined), true, true)
        if (output === 'selection') { setSelection(selectionOut); return }
        if (output === 'mask') {
          if (!activeLayer) return
          snapshot()
          canvasesRef.current.set(`${activeLayer.id}:mask`, maskCanvasFromSelection(selectionOut, current.width, current.height))
          patchLayer(activeLayer.id, { maskEnabled: true })
          setSelection(null)
          return
        }
        // A new layer holding the selected pixels, masked or cut.
        const source = canvasesRef.current.get(current.activeLayerId)
        if (!source) return
        snapshot()
        const layer = createLayerMeta(`${activeLayer?.name ?? tr('layerName')} ${tr('dupSuffix')}`)
        const canvas = cloneCanvas(source)
        if (output === 'layer') clipCanvasToSelection(canvas, selectionOut)
        else {
          canvasesRef.current.set(`${layer.id}:mask`, maskCanvasFromSelection(selectionOut, current.width, current.height))
          layer.maskEnabled = true
        }
        canvasesRef.current.set(layer.id, canvas)
        updateDoc((document) => ({ ...document, layers: [...document.layers, layer], activeLayerId: layer.id }))
        setSelection(null)
        return
      }
      case 'layerStyle':
        if (result.action === 'saveStyle') {
          setSettings((value) => ({ ...value, styles: [...value.styles, { id: createId('style'), name: String(result.name), effects: result.effects as LayerEffects }] }))
          return
        }
        if (result.action === 'apply') {
          const backup = styleBackupRef.current
          styleBackupRef.current = null
          if (backup) {
            // Record the state before the window's live edits, then keep them.
            const final = result.effects as LayerEffects
            patchLayer(backup.layerId, { effects: backup.effects })
            snapshot(tr('layerStyle'))
            patchLayer(backup.layerId, { effects: final })
          } else {
            snapshot(tr('layerStyle'))
            patchActive({ effects: result.effects as LayerEffects })
          }
        }
        return
      case 'gradientEditor': {
        const def = result.gradient as GradientDef
        setSettings((value) => ({ ...value, gradients: [...value.gradients.filter((item) => item.id !== def.id), def], gradientId: def.id }))
        return
      }
      case 'note':
        updateDoc((document) => ({ ...document, notes: document.notes.map((item) => (item.id === result.id ? { ...item, text: String(result.text) } : item)) }))
        return
      case 'namePrompt': {
        const value = String(result.name ?? '')
        const purpose = String(result.promptFor ?? '')
        if (purpose.startsWith('artboard:')) {
          const id = purpose.slice('artboard:'.length)
          updateDoc((document) => ({ ...document, artboards: (document.artboards ?? []).map((item) => (item.id === id ? { ...item, name: value || item.name } : item)) }))
        } else if (purpose === 'workspace') {
          setSettings((s) => ({ ...s, workspaces: [...s.workspaces, { id: createId('ws'), name: value, rightTab: s.rightTab, rightWidth: s.rightWidth, showRulers: s.showRulers, showGrid: s.showGrid }] }))
          note('workspaceSaved')
        } else if (purpose === 'toolPreset' && result.extra) {
          const pending = result.extra as { tool: Tool; values: Record<string, unknown> }
          setSettings((s) => ({ ...s, toolPresets: [...s.toolPresets, { id: createId('preset'), name: value, tool: pending.tool, values: pending.values }] }))
        }
        return
      }
      case 'findReplace': findReplaceText(String(result.find), String(result.replace), Boolean(result.matchCase)); return
      case 'checkSpelling': {
        const fixes = result.fixes as Record<string, string>
        snapshot(tr('checkSpelling'))
        updateDoc((document) => ({
          ...document,
          layers: document.layers.map((layer) => {
            if (!layer.text) return layer
            let text = layer.text.text
            for (const [word, fix] of Object.entries(fixes)) if (fix && fix !== word) text = text.split(word).join(fix)
            return { ...layer, text: { ...layer.text, text } }
          }),
        }))
        return
      }
      case 'keyboardShortcuts':
        if (result.action === 'reset') setSettings((s) => ({ ...s, shortcuts: {} }))
        else setSettings((s) => ({ ...s, shortcuts: result.shortcuts as Record<string, string> }))
        return
      case 'contactSheet': void runAutomation('contactSheet', { columns: result.columns, thumb: result.thumb }); return
      case 'fitImage': {
        const fitted = fitImage(compositeDocument(current, canvasesRef.current), Number(result.width), Number(result.height))
        resizeImage(fitted.width, fitted.height)
        return
      }
      case 'photomerge': void runAutomation('photomerge', { layout: result.layout, blend: result.blend }); return
      case 'statistics': void runAutomation('statistics', { mode: result.mode }); return
      case 'imageProcessor': {
        void (async () => {
          const items = await pickMany('imageProcessor')
          for (const item of items) {
            const fitted = fitImage(item.canvas, Number(result.maxSide), Number(result.maxSide))
            await saveCanvasAs(fitted, item.name.replace(/\.[^.]+$/, ''), result.format as ExportFormat)
          }
        })()
        return
      }
      case 'skyReplace': {
        const composite = compositeDocument(current, canvasesRef.current)
        const sky = selectSky(composite)
        if (!sky.mask) return
        snapshot(tr('skyReplace'))
        const layer = createLayerMeta(tr('selectSky'))
        const canvas = createCanvas(current.width, current.height)
        const ctx = context2d(canvas)
        if (result.source === 'layer') {
          const source = canvasesRef.current.get(String(result.layerId))
          if (source) ctx.drawImage(source, 0, 0)
        } else {
          const gradient = ctx.createLinearGradient(0, 0, 0, current.height)
          gradient.addColorStop(0, String(result.top))
          gradient.addColorStop(1, String(result.bottom))
          ctx.fillStyle = gradient
          ctx.fillRect(0, 0, current.width, current.height)
        }
        const soft = featherSelection(sky, current.width, current.height, Number(result.fade))
        canvasesRef.current.set(layer.id, canvas)
        canvasesRef.current.set(`${layer.id}:mask`, maskCanvasFromSelection(soft, current.width, current.height))
        layer.maskEnabled = true
        updateDoc((document) => ({ ...document, layers: [...document.layers, layer], activeLayerId: layer.id }))
        return
      }
      case 'vanishingPoint':
        if (cropCornersRef.current.length === 4) applyPerspectiveCrop()
        else note('vanishingHint')
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
        snapshot(tr('text'))
        const active = current.layers.find((layer) => layer.id === current.activeLayerId)
        const editing = active?.kind === 'text' ? active.text : undefined
        const data: TextData = {
          text: value,
          x: editing?.x ?? textPointRef.current.x,
          y: editing?.y ?? textPointRef.current.y,
          fontFamily,
          fontSize: Number(result.fontSize ?? fontSize),
          color: editing?.color ?? settingsRef.current.foreground,
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
          underline: editing?.underline,
          strike: editing?.strike,
          allCaps: editing?.allCaps,
          baselineShift: editing?.baselineShift,
          antiAlias: editing?.antiAlias,
          warp: { style: (result.warpStyle as TextWarpStyle) ?? 'none', bend: Number(result.warpBend ?? 0), horizontal: 0, vertical: 0 },
        }
        // The type mask tool makes a selection in the letters' shape instead of a layer.
        if (toolRef.current === 'textMask' && active?.kind !== 'text') {
          const probe = createLayerMeta('probe', 'text')
          probe.text = data
          const flat = compositeDocument({ ...current, background: 'transparent', layers: [probe], colorMode: 'rgb' }, canvasesRef.current)
          const pixels = context2d(flat).getImageData(0, 0, current.width, current.height).data
          const mask = new Uint8Array(current.width * current.height)
          for (let i = 0; i < mask.length; i += 1) mask[i] = pixels[i * 4 + 3]
          setSelection({ kind: 'mask', ...maskBounds(mask, current.width, current.height), mask })
          return
        }
        if (active?.kind === 'text') {
          updateDoc((document) => ({ ...document, layers: document.layers.map((layer) => (layer.id === active.id ? { ...layer, text: data } : layer)) }))
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

  useEffect(() => window.electronDialogApi?.onResult(({ name, result }) => {
    applyDialogResultRef.current(name as DialogName, result as DialogResult)
  }), [])

  useEffect(() => window.electronMenuApi?.onChosen((commandId) => {
    runCommandRef.current(commandId)
  }), [])

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
      return await window.electronMenuApi.open(
        { menu: id, language, theme: settings.theme, active, overrides },
        { x: window.screenX + box.left, y: window.screenY + box.bottom + 2, width: box.width, height: box.height },
      )
    } catch {
      return false
    }
  }

  /* --------------------------------------------------- external drag & drop */

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    setDropActive(false)
    const files = [...(event.dataTransfer?.files ?? [])]
      .filter((file) => file.type.startsWith('image/') || /\.(mpw|psd|psb|tiff?|bmp|avif|webp|heic|heif|hif|dcm|dicom|cube)$/i.test(file.name))
    if (files.length === 0) return
    try {
      const items = await Promise.all(files.map(fileToOpenItem))
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

  /* ------------------------------------------------------------- keyboard */

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
        else if (event.altKey) undo()
        else undo()
      }
      if (accel && key === 'y' && !event.shiftKey) {
        event.preventDefault()
        if (typing) return
        // Ctrl+Y is Proof Colors in Photoshop; Redo lives on Ctrl+Shift+Z too.
        redo()
      }
      if (accel && key === 's') {
        event.preventDefault()
        void saveProject(event.shiftKey)
      }
      if (accel && key === 'o') {
        event.preventDefault()
        void pickFiles('open')
      }
      if (accel && key === 'w') {
        event.preventDefault()
        if (guardUnsaved('close')) closeDocument()
      }
      if (accel && key === 'p' && !event.shiftKey) {
        event.preventDefault()
        if (!doc) return
        if (window.electronPrintApi) openDialog('print')
        else void printDocument(naturalOrientation(compositeDocument(doc, canvasesRef.current)))
      }
      if (accel && key === 'n') {
        event.preventDefault()
        if (event.shiftKey) runCommandRef.current('layer.new')
        else if (guardUnsaved('new')) openDialog('new')
      }
      if (accel && key === 'a' && doc && !typing) {
        event.preventDefault()
        if (event.altKey) runCommandRef.current('select.allLayers')
        else setSelection(rectSelection(0, 0, doc.width, doc.height))
      }
      if (accel && key === 'd' && !typing) {
        event.preventDefault()
        if (event.shiftKey) {
          if (lastSelectionRef.current) setSelection(lastSelectionRef.current)
        } else {
          if (selectionRef.current) lastSelectionRef.current = selectionRef.current
          setSelection(null)
        }
      }
      if (accel && key === 'i' && !typing) {
        event.preventDefault()
        runCommandRef.current(event.shiftKey ? 'select.invert' : 'image.invert')
      }
      if (accel && key === 'j' && !typing) {
        event.preventDefault()
        runCommandRef.current(event.shiftKey ? 'layer.newViaCut' : 'layer.newViaCopy')
      }
      if (accel && key === 'e' && !typing) {
        event.preventDefault()
        runCommandRef.current(event.shiftKey ? 'layer.mergeVisible' : 'layer.mergeDown')
      }
      if (accel && key === 'g' && !typing) {
        event.preventDefault()
        runCommandRef.current(event.altKey ? 'layer.clipMask' : event.shiftKey ? 'layer.ungroup' : 'layer.group')
      }
      if (accel && (key === 'l' || key === 'm' || key === 'u' || key === 'b') && !typing && !event.altKey) {
        event.preventDefault()
        if (key === 'l') runCommandRef.current(event.shiftKey ? 'image.autoTone' : 'image.levels')
        if (key === 'm') runCommandRef.current('image.curves')
        if (key === 'u') runCommandRef.current(event.shiftKey ? 'image.desaturate' : 'image.hueSat')
        if (key === 'b') runCommandRef.current(event.shiftKey ? 'image.autoColor' : 'image.colorBalance')
      }
      if (accel && key === 'r' && !typing) {
        event.preventDefault()
        runCommandRef.current(event.shiftKey ? 'filter.lensCorrection' : 'view.rulers')
      }
      if (accel && key === 'h' && !typing) {
        event.preventDefault()
        runCommandRef.current('view.extras')
      }
      if (accel && key === ';' && !typing) {
        event.preventDefault()
        runCommandRef.current(event.altKey ? 'view.lockGuides' : event.shiftKey ? 'view.snap' : 'view.showGuides')
      }
      if (accel && key === "'" && !typing) {
        event.preventDefault()
        runCommandRef.current('view.grid')
      }
      if (accel && (key === '0' || key === '1' || key === '=' || key === '+' || key === '-') && !typing) {
        event.preventDefault()
        if (key === '0') runCommandRef.current('view.zoomFit')
        else if (key === '1') runCommandRef.current('view.actualPixels')
        else runCommandRef.current(key === '-' ? 'view.zoomOut' : 'view.zoomIn')
      }
      if (accel && key === 'f' && !typing) {
        event.preventDefault()
        if (event.shiftKey) runCommandRef.current('edit.fade')
        else if (event.altKey) runCommandRef.current('filter.last')
      }
      if (accel && key === 'k' && !typing) {
        event.preventDefault()
        runCommandRef.current(event.altKey && event.shiftKey ? 'edit.keyboardShortcuts' : event.shiftKey ? 'edit.colorSettings' : 'edit.preferences')
      }
      if (accel && key === 'tab') {
        event.preventDefault()
        cycleDocument(event.shiftKey ? -1 : 1)
      }
      if (accel && key === 'q') {
        event.preventDefault()
        runCommandRef.current('file.exit')
      }
      if (accel && (key === ']' || key === '[') && !typing) {
        event.preventDefault()
        runCommandRef.current(key === ']' ? (event.shiftKey ? 'layer.bringToFront' : 'layer.bringForward') : (event.shiftKey ? 'layer.sendToBack' : 'layer.sendBackward'))
      }
      if (accel && (key === 'x' || key === 'c' || key === 'v') && !typing) {
        event.preventDefault()
        if (key === 'v') pasteClipboard(event.shiftKey ? 'inPlace' : 'center')
        else {
          copySelection(key === 'c' && event.shiftKey)
          if (key === 'x') withLayer((canvas) => clearSelectionPixels(canvas, selectionRef.current))
        }
      }
      if ((key === 'delete' || key === 'backspace') && !typing) {
        if (dialog) return
        withLayer((canvas) => clearSelectionPixels(canvas, selectionRef.current))
      }
      if (key === 'f12') {
        event.preventDefault()
        runCommandRef.current('file.revert')
      }
      if (key === 'f5' || key === 'f6' || key === 'f7' || key === 'f8' || key === 'f9') {
        event.preventDefault()
        if (key === 'f5') runCommandRef.current('window.brushes')
        if (key === 'f6') runCommandRef.current('window.color')
        if (key === 'f7') runCommandRef.current('window.layers')
        if (key === 'f8') runCommandRef.current('window.info')
        if (key === 'f9') runCommandRef.current('window.actions')
      }
      if (key === 'enter' && crop) {
        event.preventDefault()
        applyCrop(crop)
      }
      if (accel && key === 't' && doc && !typing) {
        event.preventDefault()
        beginTransform()
      }
      if (key === 'enter') {
        if (liquifyRef.current && toolRef.current === 'liquify') {
          event.preventDefault()
          endLiquify(true)
          return
        }
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
        if (liquifyRef.current) endLiquify(false)
        vanishingRef.current = false
        if (transformRef.current) cancelTransform()
        clearPreview()
        setMenu(null)
        setContextMenu(null)
        setColorPick(null)
        if (dialog && dialog !== 'unsaved') setDialog(null)
      }
      if (typing) {
        return
      }
      if (!accel && !event.altKey) {
        const custom = invertShortcuts(settingsRef.current.shortcuts)
        const bound = custom[key] ?? (settingsRef.current.shortcuts[defaultToolKeys[key] ?? ''] ? undefined : defaultToolKeys[key])
        if (bound) {
          // Shift cycles the family, as Photoshop does; the plain key picks the first.
          const family = toolGroups.find((group) => group.tools.some((item) => item.id === bound))
          if (event.shiftKey && family && family.tools.length > 1) {
            const index = family.tools.findIndex((item) => item.id === toolRef.current)
            const next = family.tools[(Math.max(0, index) + 1) % family.tools.length]
            setGroupTool((value) => ({ ...value, [family.id]: next.id }))
            setTool(next.id)
          } else {
            setTool(bound)
          }
        }
        if (key === 'q') toggleQuickMask()
        if (key === 'f') toggleScreenMode()
        if (key === 'd' && !event.shiftKey) setSettings((current) => ({ ...current, foreground: '#000000', background: '#ffffff' }))
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
  }, [applyCrop, applyPerspectiveCrop, beginTransform, cancelPuppet, cancelTransform, clearPreview, closeDocument, closePolySelection, commitDraftPath, commitPuppet, commitTransform, copySelection, crop, cycleDocument, dialog, dirty, doc, endLiquify, guardUnsaved, openDialog, pasteClipboard, pickFiles, printDocument, redo, saveProject, toggleQuickMask, toggleScreenMode, undo, withLayer])

  /* ------------------------------------------------------------- viewport */

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
    const style = getComputedStyle(document.documentElement)
    ctx.fillStyle = style.getPropertyValue('--stage-bg') || '#10151a'
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
          ? style.getPropertyValue('--stage-check-a') || '#1b232c'
          : style.getPropertyValue('--stage-check-b') || '#151b22'
        ctx.fillRect(left + x, top + y, Math.min(check, dw - x), Math.min(check, dh - y))
      }
    }

    // A live transform or a window's preview stands in for the layer's pixels.
    let previewCanvases = canvasesRef.current
    if (transformBox && transformSourceRef.current) {
      previewCanvases = new Map(canvasesRef.current)
      previewCanvases.set(documentModel.activeLayerId, applyTransform(transformSourceRef.current, transformBox, documentModel.width, documentModel.height))
    } else if (previewRef.current && previewRef.current.layerId === documentModel.activeLayerId) {
      previewCanvases = new Map(canvasesRef.current)
      previewCanvases.set(documentModel.activeLayerId, previewRef.current.canvas)
    }
    // The composite is the expensive part, and most repaints — the marching
    // ants, a pan, a zoom — change nothing in it. It is rebuilt only when the
    // document, an edit (frame), a live transform or a preview has changed.
    const previewCanvas = previewCanvases === canvasesRef.current ? null : previewCanvases.get(documentModel.activeLayerId) ?? null
    const cache = compositeCacheRef.current
    let composite: HTMLCanvasElement
    if (cache && cache.doc === documentModel && cache.frame === frame && cache.preview === previewCanvas && cache.proof === settings.proofColors && cache.gamut === settings.gamutWarning) {
      composite = cache.composite
    } else {
      composite = compositeDocument(documentModel, previewCanvases)
      if (settings.proofColors && documentModel.colorMode === 'rgb') {
        composite = cloneCanvas(composite)
        proofCmyk(composite)
      }
      if (settings.gamutWarning) {
        composite = cloneCanvas(composite)
        gamutWarning(composite)
      }
      compositeCacheRef.current = { doc: documentModel, frame, preview: previewCanvas, proof: settings.proofColors, gamut: settings.gamutWarning, composite }
    }
    ctx.save()
    ctx.translate(left + dw / 2, top + dh / 2)
    ctx.rotate((viewAngle * Math.PI) / 180)
    ctx.translate(-dw / 2, -dh / 2)
    ctx.imageSmoothingEnabled = zoom < 1
    if (settings.patternPreview) {
      // The document tiled around itself, so a seamless pattern can be judged.
      ctx.save()
      ctx.globalAlpha = 0.6
      for (let ty = -1; ty <= 1; ty += 1) for (let tx = -1; tx <= 1; tx += 1) if (tx || ty) ctx.drawImage(composite, tx * dw, ty * dh, dw, dh)
      ctx.restore()
    }
    ctx.drawImage(composite, 0, 0, dw, dh)
    ctx.save()
    ctx.scale(zoom, zoom)
    // Quick Mask and Select and Mask show the selection as a tint over what is not selected.
    const overlayMask = previewMaskRef.current?.mask ?? (quickMaskRef.current ? null : null)
    if (quickMaskRef.current || overlayMask) {
      const tint = createCanvas(documentModel.width, documentModel.height)
      const tctx = context2d(tint)
      const view = previewMaskRef.current?.view ?? 'overlay'
      tctx.fillStyle = view === 'black' ? 'rgba(0,0,0,1)' : view === 'white' ? 'rgba(255,255,255,1)' : 'rgba(255,0,0,0.5)'
      tctx.fillRect(0, 0, documentModel.width, documentModel.height)
      tctx.globalCompositeOperation = 'destination-out'
      if (overlayMask) {
        tctx.drawImage(maskCanvasFromSelection({ kind: 'mask', x: 0, y: 0, width: documentModel.width, height: documentModel.height, mask: overlayMask }, documentModel.width, documentModel.height), 0, 0)
      } else if (quickMaskRef.current) {
        tctx.drawImage(quickMaskRef.current, 0, 0)
      }
      ctx.drawImage(tint, 0, 0)
    } else {
      drawSelectionOverlay(ctx, crop ?? selection, documentModel.width, documentModel.height, dash)
    }
    if (settings.extras) {
      drawRegionOverlay(ctx, settings.showSlices ? documentModel.slices : [], documentModel.frames, documentModel.measure, zoom)
      if (settings.showPaths) {
        const livePaths = draftPath ? [...documentModel.paths, draftPath] : documentModel.paths
        drawPathOverlay(ctx, livePaths, draftPath?.id ?? activePathId, zoom)
      }
      if (settings.showGuides) {
        ctx.save()
        ctx.setLineDash([])
        ctx.lineWidth = 1 / zoom
        ctx.strokeStyle = settings.lockGuides ? 'rgba(56,189,248,0.55)' : '#22d3ee'
        for (const guide of documentModel.guides) {
          ctx.beginPath()
          if (guide.axis === 'x') { ctx.moveTo(guide.position, 0); ctx.lineTo(guide.position, documentModel.height) }
          else { ctx.moveTo(0, guide.position); ctx.lineTo(documentModel.width, guide.position) }
          ctx.stroke()
        }
        ctx.restore()
      }
      if (settings.showNotes) {
        ctx.save()
        for (const item of documentModel.notes) {
          ctx.fillStyle = '#fde047'
          ctx.strokeStyle = '#854d0e'
          ctx.lineWidth = 1 / zoom
          ctx.fillRect(item.x - 6 / zoom, item.y - 6 / zoom, 12 / zoom, 12 / zoom)
          ctx.strokeRect(item.x - 6 / zoom, item.y - 6 / zoom, 12 / zoom, 12 / zoom)
        }
        for (const item of documentModel.counts) {
          ctx.fillStyle = '#f43f5e'
          ctx.beginPath()
          ctx.arc(item.x, item.y, 6 / zoom, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#ffffff'
          ctx.font = `${10 / zoom}px system-ui, sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(String(item.n), item.x, item.y)
        }
        for (const item of documentModel.samplers) {
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.5 / zoom
          ctx.beginPath()
          ctx.arc(item.x, item.y, 5 / zoom, 0, Math.PI * 2)
          ctx.stroke()
        }
        ctx.restore()
      }
      for (const board of documentModel.artboards ?? []) {
        ctx.save()
        ctx.setLineDash([])
        ctx.lineWidth = 1 / zoom
        ctx.strokeStyle = '#a78bfa'
        ctx.strokeRect(board.x, board.y, board.width, board.height)
        ctx.fillStyle = '#a78bfa'
        ctx.font = `${11 / zoom}px system-ui, sans-serif`
        ctx.textBaseline = 'bottom'
        ctx.textAlign = 'left'
        ctx.fillText(board.name, board.x, board.y - 2 / zoom)
        ctx.restore()
      }
    }
    if (polyPoints.length > 0) {
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
    if (dragRef.current?.mode === 'gradient' || dragRef.current?.mode === 'straighten') {
      ctx.strokeStyle = '#ffffff'
      ctx.setLineDash([4, 3])
      ctx.lineWidth = 1 / zoom
      ctx.beginPath()
      ctx.moveTo(dragRef.current.start.x, dragRef.current.start.y)
      ctx.lineTo(dragRef.current.last.x, dragRef.current.last.y)
      ctx.stroke()
    }
    if (settings.showPixelGrid && zoom >= 6) {
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'
      ctx.lineWidth = 1 / zoom
      ctx.beginPath()
      for (let x = 0; x <= documentModel.width; x += 1) { ctx.moveTo(x, 0); ctx.lineTo(x, documentModel.height) }
      for (let y = 0; y <= documentModel.height; y += 1) { ctx.moveTo(0, y); ctx.lineTo(documentModel.width, y) }
      ctx.stroke()
      ctx.restore()
    }
    ctx.restore()
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.strokeRect(0.5, 0.5, dw - 1, dh - 1)
    ctx.restore()

    if (settings.showGrid) {
      const step = tickStep(zoom, 48)
      ctx.save()
      ctx.strokeStyle = style.getPropertyValue('--grid-line') || 'rgba(255,255,255,0.12)'
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
      drawRulers(ctx, { width, height }, documentModel, { x: left, y: top }, zoom, {
        bg: style.getPropertyValue('--toolbar-bg') || '#151b22',
        line: style.getPropertyValue('--border') || 'rgba(255,255,255,0.18)',
        text: style.getPropertyValue('--text-muted') || '#94a3b8',
        accent: style.getPropertyValue('--accent') || '#38bdf8',
      }, unitScale(settings.rulerUnits))
    }
  }, [activePathId, crop, cropCorners, dash, doc, draftPath, frame, pan.x, pan.y, pins, polyPoints, selection, settings, settings.showGrid, settings.showRulers, shapeDraft, stageSize, transformBox, viewAngle])

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
  }, [doc.activeLayerId, frame, settings.rightTab])

  // The sampled brush tip, decoded when a brush preset with one is picked.
  useEffect(() => {
    const preset = settings.brushes.find((item) => item.tipUrl && item.id === settings.brushTipId)
    if (!preset?.tipUrl) {
      tipCanvasRef.current = null
      return
    }
    let live = true
    const image = new Image()
    image.onload = () => {
      if (!live) return
      const tip = createCanvas(image.naturalWidth || image.width, image.naturalHeight || image.height)
      context2d(tip).drawImage(image, 0, 0)
      tipCanvasRef.current = tip
    }
    image.src = preset.tipUrl
    return () => { live = false }
  }, [settings.brushes, settings.brushTipId])

  const nextThemeId = themes[(themes.findIndex((item) => item.id === settings.theme) + 1) % themes.length].id
  const stepTheme = () => setSettings((current) => {
    const index = themes.findIndex((item) => item.id === current.theme)
    return { ...current, theme: themes[(index + 1) % themes.length].id }
  })

  const desktop = Boolean(window.electronWindowApi)
  // A development hook for driving the editor from a test harness: never in a build.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    (window as unknown as { __mpw?: unknown }).__mpw = {
      frame, history: historyMeta, undo: undoRef.current.length, tab: settings.rightTab, layers: doc.layers.length, selection: selection ? { ...selection, mask: undefined } : null,
      run: (id: string) => runCommandRef.current(id), dialog: (name: DialogName, result: DialogResult) => applyDialogResultRef.current(name, result), tool: (id: Tool) => setTool(id),
      layerCanvas: () => canvasesRef.current.get(docRef.current.activeLayerId) ?? null, select: (next: Selection | null) => setSelection(next), bump,
    }
  })

  const panelContext: PanelContext = {
    tr, language, doc, settings, canvasesRef, frame, activeLayer, selection, tool, pan, stageSize,
    setSettings, updateDoc,
    setActiveLayer: (id) => setDoc((current) => (current ? { ...current, activeLayerId: id } : current)),
    snapshot, setTool, setPan, setSelection, openDialog, runCommand, bump,
    historyEntries: historyMeta.undo, redoEntries: historyMeta.redo, jumpHistory,
    namedSnapshots, takeNamedSnapshot, restoreNamedSnapshot,
    deleteNamedSnapshot: (id) => setNamedSnapshots((current) => current.filter((item) => item.id !== id)),
    historySourceIndex, setHistorySourceIndex,
    paintTarget: settings.paintTarget,
    setPaintTarget: (target) => setSettings((current) => ({ ...current, paintTarget: target })),
    reorderLayer, patchLayer, patchAdjustment, patchText, patchSmartFilter, removeSmartFilter,
    cloneSource, samplerValues,
    applyGradientPreset: (id) => { setSettings((current) => ({ ...current, gradientId: id })); setTool('gradient') },
    applyStyle: applyStylePreset, applyToolPreset: toolPresetApply, saveToolPreset: toolPresetSave,
    defineShapeFromPath, activePathId, setActivePathId,
    recording, startRecording: () => setRecording([]), stopRecording: saveRecording, cancelRecording: () => setRecording(null),
    playAction, runBatch: (action) => void runBatch(action), deleteAction, captureComp, applyComp, deleteComp,
    playingFrame, captureAnimationFrame, startPlayback, stopPlayback, showAnimationFrame, patchAnimationFrame, deleteAnimationFrame,
    exportAnimatedGif: () => void exportAnimatedGif(), exportVideo: () => void exportVideo(),
    loadSelectionFrom: (id, mode) => loadSelectionFrom(id, mode), deleteChannel,
    documents: docList.map((item) => ({ ...item, active: item.id === activeDocId })),
    switchDocument, closeDocumentById,
    editNote: (id) => { const item = doc.notes.find((entry) => entry.id === id); if (item) openDialog('note', { note: { id, text: item.text } }) },
    activeSliceId, setActiveSliceId, exportSlice: (id) => { const slice = doc.slices.find((item) => item.id === id); if (slice) void exportSlice(slice) },
  }

  const channelsPanel = (
    <>
      <h2>{tr('channels')}</h2>
      <h3>{tr('colorChannels')}</h3>
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
  )

  const adjustPanel = (
    <>
      <h2>{tr('adjustments')}</h2>
      {adjustmentTypes.map((type) => (
        <button key={type} data-tooltip={tr(type)} onClick={() => addAdjustment(type)}>
          <span>{tr(type)}</span>
        </button>
      ))}
    </>
  )

  return (
    <div
      className={`app-shell${dropActive ? ' drop-active' : ''}${screenMode === 'full' ? ' screen-full' : ''}`}
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
                <MenuDrop anchor={menuAnchor} className="menu-tree-drop">
                  <MenuTree
                    rows={commandsInMenu(id)}
                    label={commandLabel}
                    sectionLabel={tr}
                    isActive={isCommandActive}
                    onChoose={runCommand}
                  />
                </MenuDrop>
              )}
            </div>
          )
        })}

        <div className="menu-spacer" />

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
            <button data-tooltip={tr('selectSubject')} aria-label={tr('selectSubject')} onClick={() => runCommand('select.subject')}><Sparkles size={16} /></button>
            <button data-tooltip={tr('removeBg')} aria-label={tr('removeBg')} onClick={() => runCommand('select.removeBg')}><Eraser size={16} /></button>
            <button data-tooltip={tr('genFill')} aria-label={tr('genFill')} onClick={() => runCommand('edit.genFill')}><WandSparkles size={16} /></button>
            <button data-tooltip={tr('harmonize')} aria-label={tr('harmonize')} onClick={() => runCommand('edit.harmonize')}><Blend size={16} /></button>
          </div>

          <div className="tool-bar-group tool-bar-colors">
            <span className="tool-bar-divider" aria-hidden="true" />
            <button className="swatch-button" data-tooltip={tr('foreground')} aria-label={tr('foreground')} onClick={(event) => setColorPick({ target: 'fg', x: event.clientX, y: event.clientY })}>
              <span className="swatch-chip" style={{ background: settings.foreground }} />
            </button>
            <button data-tooltip={tr('swap')} aria-label={tr('swap')} onClick={() => setSettings((c) => ({ ...c, foreground: c.background, background: c.foreground }))}><ArrowLeftRight size={16} /></button>
            <button className="swatch-button" data-tooltip={tr('backgroundColor')} aria-label={tr('backgroundColor')} onClick={(event) => setColorPick({ target: 'bg', x: event.clientX, y: event.clientY })}>
              <span className="swatch-chip" style={{ background: settings.background }} />
            </button>
          </div>
      </div>

      <div className="options-bar">
        <strong className="current-tool" data-tooltip={toolLabel(language, tool)}>
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
                  <input type="range" min={control.min} max={control.max} step={control.step ?? 1} value={Math.round(value)} onChange={(event) => setSettings((c) => ({ ...c, [control.key]: Number(event.target.value) / scale }))} />
                  <span className="option-value">{Math.round(value)}</span>
                </label>
              )
            }
            if (control.kind === 'number') {
              return (
                <label key={control.key} data-tooltip={tr(control.label)}>
                  {tr(control.label)}
                  <input type="number" min={control.min} max={control.max} value={settings[control.key] as number} onChange={(event) => setSettings((c) => ({ ...c, [control.key]: Number(event.target.value) }))} />
                </label>
              )
            }
            if (control.kind === 'toggle') {
              return (
                <label key={control.key} className="option-toggle" data-tooltip={tr(control.label)}>
                  <input type="checkbox" checked={Boolean(settings[control.key])} onChange={(event) => setSettings((c) => ({ ...c, [control.key]: event.target.checked }))} />
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
                    onChange={(event) => setSettings((c) => ({ ...c, [control.key]: control.key === 'eyedropperSample' ? Number(event.target.value) : event.target.value }))}
                  >
                    {control.choices.map((choice) => <option key={choice.value} value={choice.value}>{tr(choice.label)}</option>)}
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
                  <button data-tooltip={tr('cancelCrop')} onClick={() => { setCrop(null); setCropCorners([]); vanishingRef.current = false }}><X size={15} /><span>{tr('cancelCrop')}</span></button>
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
            if (control.id === 'liquifyActions') {
              return (
                <span key="liquifyActions" className="option-pair">
                  <button className="primary" data-tooltip={tr('liquifyDone')} onClick={() => endLiquify(true)}><Check size={15} /><span>{tr('liquifyDone')}</span></button>
                  <button data-tooltip={tr('liquifyCancel')} onClick={() => endLiquify(false)}><X size={15} /><span>{tr('liquifyCancel')}</span></button>
                </span>
              )
            }
            if (control.id === 'gradientPicker') {
              const all = [...gradientPresets, ...settings.gradients]
              return (
                <label key="gradientPicker" data-tooltip={tr('gradientPreset')}>
                  {tr('gradientPreset')}
                  <select value={settings.gradientId} onChange={(event) => setSettings((c) => ({ ...c, gradientId: event.target.value }))}>
                    {all.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                  <button data-tooltip={tr('gradientEditor')} aria-label={tr('gradientEditor')} onClick={() => openDialog('gradientEditor', { gradient: all.find((item) => item.id === settings.gradientId) })}><Blend size={14} /></button>
                </label>
              )
            }
            if (control.id === 'shapeKindPicker') {
              return (
                <label key="shapeKindPicker" data-tooltip={tr('customShapeKind')}>
                  {tr('customShapeKind')}
                  <select value={settings.customShapeKind} onChange={(event) => setSettings((c) => ({ ...c, customShapeKind: event.target.value }))}>
                    {['star', 'heart', 'arrow', 'triangle'].map((kind) => <option key={kind} value={kind}>{tr(`shape${kind.charAt(0).toUpperCase()}${kind.slice(1)}`)}</option>)}
                    {settings.customShapes.map((shape) => <option key={shape.id} value={shape.id}>{shape.name}</option>)}
                  </select>
                </label>
              )
            }
            if (control.id === 'artboardActions') {
              return (
                <span key="artboardActions" className="option-pair">
                  <button data-tooltip={tr('artboardsToFiles')} disabled={!(doc.artboards ?? []).length} onClick={() => void artboardsToFiles()}><Frame size={15} /><span>{tr('artboardsToFiles')}</span></button>
                  <button data-tooltip={tr('deleteLayer')} disabled={!(doc.artboards ?? []).length} onClick={() => updateDoc((current) => ({ ...current, artboards: [] }))}><Trash size={15} /></button>
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
            <button className={`quick-mask-toggle${quickMask ? ' active' : ''}`} data-tooltip={tr('editQuickMask')} aria-label={tr('editQuickMask')} onClick={toggleQuickMask}><Wand size={13} /></button>
          </div>
        </aside>

        <div className="stage-column">
          <DocumentTabs ctx={panelContext} />
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
            {panelTabs.map((tab) => (
              <button
                key={tab}
                className={settings.rightTab === tab ? 'active' : ''}
                data-tooltip={tr(panelLabelKey(tab))}
                onClick={() => setSettings((c) => ({ ...c, rightTab: tab }))}
              >
                <span>{tr(panelLabelKey(tab))}</span>
              </button>
            ))}
          </div>
          <div className="panel-body">
            <PanelSwitch tab={settings.rightTab} ctx={panelContext} channelsPanel={channelsPanel} adjustPanel={adjustPanel} />
          </div>
        </aside>
      </div>

      <footer className="status-bar">
        <span>{doc ? `${doc.name} ${doc.width}×${doc.height}` : tr('document')}</span>
        <span>{tr('tool')}: {toolLabel(language, tool)}{settings.paintTarget === 'mask' && activeLayer?.maskEnabled ? ` · ${tr('maskTarget')}` : ''}</span>
        <span>{Math.round(settings.zoom * 100)}%</span>
        <span>{cloneSource ? 'Clone' : tr('selection')}: {selection ? `${Math.round(selection.width)}×${Math.round(selection.height)}` : tr('none')}</span>
        <span>{settings.proofColors ? tr('proofOn') : settings.gamutWarning ? tr('gamutOn') : ''}</span>
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
          <MenuItem icon={Sparkles} label={tr('layerStyle')} onClick={() => { runCommand('layer.style'); setContextMenu(null) }} />
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

      {dialog && <div className="dialog-backdrop" onClick={() => { if (dialog !== 'unsaved') { setDialog(null); clearPreview() } }} />}

      {dialog && !windowedDialogs && (
        <DialogFrame
          name={dialog as DialogName}
          language={language}
          payload={inPagePayload ?? undefined}
          onClose={() => { setDialog(null); clearPreview() }}
        >
          {inPagePayload && (
            <DialogBody
              name={dialog as DialogName}
              payload={inPagePayload}
              onResult={(result) => {
                applyDialogResult(dialog as DialogName, result)
                if (!keepsWindowOpen(result.action)) setDialog(null)
              }}
              onClose={() => { setDialog(null); clearPreview() }}
            />
          )}
        </DialogFrame>
      )}

      {desktop && <div className="resize-grip" aria-hidden="true" />}

      <input className="hidden-input" ref={fileRef} type="file" accept=".mpw,.psd,.psb,.heic,.heif,.hif,.dcm,.dicom,.cube,image/*" multiple onChange={(event) => { const files = event.target.files; if (files) void Promise.all([...files].map(fileToOpenItem)).then((items) => openFiles(items, 'open')); event.target.value = '' }} />
      <input className="hidden-input" ref={videoRef} type="file" accept="video/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importVideo(file, file.name); event.target.value = '' }} />
      <input className="hidden-input" ref={placeRef} type="file" accept=".psd,.psb,.heic,.heif,.hif,.dcm,.dicom,image/*" multiple onChange={(event) => { const files = event.target.files; const mode = (multiPurposeRef.current || 'place') as 'place' | 'smart' | 'linked'; if (files) void Promise.all([...files].map(fileToOpenItem)).then((items) => openFiles(items, mode)); event.target.value = '' }} />
      <input className="hidden-input" ref={lutFileRef} type="file" accept=".cube" onChange={(event) => { const files = event.target.files; if (files) void Promise.all([...files].map(fileToOpenItem)).then((items) => openFiles(items, 'open')); event.target.value = '' }} />
      <input className="hidden-input" ref={multiRef} type="file" accept=".psd,.psb,.heic,.heif,.hif,.dcm,.dicom,image/*" multiple />
    </div>
  )
}

/** The user's rebindings, keyed the other way round: letter to tool. */
function invertShortcuts(shortcuts: Record<string, string>): Record<string, Tool> {
  const out: Record<string, Tool> = {}
  for (const [toolId, key] of Object.entries(shortcuts)) if (key) out[key.toLowerCase()] = toolId as Tool
  return out
}
