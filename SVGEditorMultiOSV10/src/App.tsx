import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlignCenter,
  BringToFront,
  ChevronDown,
  Circle,
  Copy,
  Diamond,
  Download,
  Eraser,
  FileImage,
  Grid3X3,
  Hexagon,
  ImagePlus,
  Info,
  Languages,
  Minus,
  Moon,
  MousePointer2,
  PenLine,
  Plus,
  RectangleHorizontal,
  Save,
  SendToBack,
  Settings2,
  Slash,
  Square,
  Star,
  Sun,
  Trash2,
  Triangle,
  Type,
  Undo2,
  Redo2,
  RotateCcw,
  ClipboardPaste,
  X,
} from 'lucide-react'
import * as UTIF from 'utif'
import './App.css'

type Language = 'ko' | 'en'
type Theme = 'dark' | 'light'
type Tool = 'select' | 'rect' | 'square' | 'roundRect' | 'ellipse' | 'circleShape' | 'triangle' | 'diamondShape' | 'pentagon' | 'hexagon' | 'octagon' | 'star' | 'trapezoid' | 'parallelogram' | 'chevron' | 'crossShape' | 'curve' | 'line' | 'connector' | 'pen' | 'text' | 'eraser'
type DrawableTool = Exclude<Tool, 'select' | 'eraser'>
type ToolGroupId = 'basic' | 'advanced' | 'line'
type ExportFormat = 'svg' | 'png' | 'jpg' | 'webp' | 'avif' | 'gif' | 'tiff'
type FileAction = 'open' | 'append'
type UnsavedChoice = 'save' | 'discard' | 'cancel'
type LineStyle = 'straight' | 'elbow' | 'curve'
type MarkerStyle = 'none' | 'arrow' | 'circle' | 'diamond'
type ShadowEffect = 'none' | 'soft' | 'deep' | 'long' | 'glow' | 'emboss'
type ShadowDirection = 'topLeft' | 'top' | 'topRight' | 'left' | 'center' | 'right' | 'bottomLeft' | 'bottom' | 'bottomRight'
type TextAlign = 'left' | 'center' | 'right'

type Point = { x: number; y: number }
type RasterLayer = { id: string; name: string; src: string; x: number; y: number; width: number; height: number }
type ResizeAnchor = 'nw' | 'ne' | 'sw' | 'se'
type ErrorDetails = { title: string; message: string; details: string }
type SelectionBox = { start: Point; current: Point }
type SvgImportResult = { shapes: Shape[]; shouldPreserveAsImage: boolean; documentXml: Document }
type CanvasItemKind = 'shape' | 'raster'
type DragState = { kind: CanvasItemKind; id: string; start: Point; original: Shape | RasterLayer }
type ResizeState = { kind: CanvasItemKind; id: string; anchor: ResizeAnchor }
type ClipboardState = { shapes: Shape[]; rasters: RasterLayer[] }
const currentLeftPanelWidth = 220
const maxLeftPanelWidth = 340
const minRightPanelWidth = 240
const maxRightPanelWidth = 420
const settingsStorageKey = 'svg-editor-v1-settings'

type AppSettings = {
  language: Language
  theme: Theme
  zoom: number
  showGrid: boolean
  leftWidth: number
  rightWidth: number
  exportFormat: ExportFormat
  removeBackground: boolean
  expandedToolGroups: Record<ToolGroupId, boolean>
}

const defaultSettings: AppSettings = {
  language: 'ko',
  theme: 'dark',
  zoom: 0.86,
  showGrid: true,
  leftWidth: currentLeftPanelWidth,
  rightWidth: 300,
  exportFormat: 'png',
  removeBackground: false,
  expandedToolGroups: { basic: true, advanced: true, line: true },
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

function loadSettings(): AppSettings {
  if (typeof window === 'undefined') {
    return defaultSettings
  }
  try {
    const raw = window.localStorage.getItem(settingsStorageKey)
    if (!raw) {
      return defaultSettings
    }
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    const groups = parsed.expandedToolGroups ?? defaultSettings.expandedToolGroups
    return {
      language: parsed.language === 'ko' || parsed.language === 'en' ? parsed.language : defaultSettings.language,
      theme: parsed.theme === 'dark' || parsed.theme === 'light' ? parsed.theme : defaultSettings.theme,
      zoom: clampNumber(parsed.zoom, 0.25, 2.5, defaultSettings.zoom),
      showGrid: typeof parsed.showGrid === 'boolean' ? parsed.showGrid : defaultSettings.showGrid,
      leftWidth: clampNumber(parsed.leftWidth, currentLeftPanelWidth, maxLeftPanelWidth, defaultSettings.leftWidth),
      rightWidth: clampNumber(parsed.rightWidth, minRightPanelWidth, maxRightPanelWidth, defaultSettings.rightWidth),
      exportFormat: parsed.exportFormat && ['svg', 'png', 'jpg', 'webp', 'avif', 'gif', 'tiff'].includes(parsed.exportFormat) ? parsed.exportFormat : defaultSettings.exportFormat,
      removeBackground: typeof parsed.removeBackground === 'boolean' ? parsed.removeBackground : defaultSettings.removeBackground,
      expandedToolGroups: {
        basic: typeof groups.basic === 'boolean' ? groups.basic : defaultSettings.expandedToolGroups.basic,
        advanced: typeof groups.advanced === 'boolean' ? groups.advanced : defaultSettings.expandedToolGroups.advanced,
        line: typeof groups.line === 'boolean' ? groups.line : defaultSettings.expandedToolGroups.line,
      },
    }
  } catch {
    return defaultSettings
  }
}

type Shape = {
  id: string
  type: DrawableTool
  name: string
  x: number
  y: number
  width: number
  height: number
  points?: Point[]
  text?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: string
  fontStyle?: string
  textAlign?: TextAlign
  fill: string
  stroke: string
  strokeWidth: number
  opacity: number
  fromId?: string
  toId?: string
  lineStyle?: LineStyle
  startMarker?: MarkerStyle
  endMarker?: MarkerStyle
  shadowEffect?: ShadowEffect
  shadowDirection?: ShadowDirection
  shadowDistance?: number
  shadowBlur?: number
  shadowColor?: string
  shadowOpacity?: number
}

const canvasSize = { width: 1200, height: 760 }
const fontOptions = ['Arial, sans-serif', 'Segoe UI, sans-serif', 'Georgia, serif', 'Times New Roman, serif', 'Consolas, monospace', 'Courier New, monospace']

const shadowPresets: Record<Exclude<ShadowEffect, 'none'>, { direction: ShadowDirection; distance: number; blur: number; color: string; opacity: number }> = {
  soft: { direction: 'bottomRight', distance: 10, blur: 14, color: '#000000', opacity: 0.28 },
  deep: { direction: 'bottomRight', distance: 18, blur: 10, color: '#000000', opacity: 0.42 },
  long: { direction: 'bottomRight', distance: 28, blur: 4, color: '#000000', opacity: 0.32 },
  glow: { direction: 'center', distance: 0, blur: 18, color: '#67d5b5', opacity: 0.65 },
  emboss: { direction: 'bottomRight', distance: 8, blur: 2, color: '#000000', opacity: 0.34 },
}

const shadowOptions: ShadowEffect[] = ['none', 'soft', 'deep', 'long', 'glow', 'emboss']
const shadowDirections: ShadowDirection[] = ['topLeft', 'top', 'topRight', 'left', 'center', 'right', 'bottomLeft', 'bottom', 'bottomRight']
const shadowDirectionVectors: Record<ShadowDirection, Point> = {
  topLeft: { x: -1, y: -1 },
  top: { x: 0, y: -1 },
  topRight: { x: 1, y: -1 },
  left: { x: -1, y: 0 },
  center: { x: 0, y: 0 },
  right: { x: 1, y: 0 },
  bottomLeft: { x: -1, y: 1 },
  bottom: { x: 0, y: 1 },
  bottomRight: { x: 1, y: 1 },
}
const shadowEffectLabelKeys: Record<ShadowEffect, string> = {
  none: 'shadowNone',
  soft: 'shadowSoft',
  deep: 'shadowDeep',
  long: 'shadowLong',
  glow: 'shadowGlow',
  emboss: 'shadowEmboss',
}
const shadowDirectionLabelKeys: Record<ShadowDirection, string> = {
  topLeft: 'shadowTopLeft',
  top: 'shadowTop',
  topRight: 'shadowTopRight',
  left: 'shadowLeft',
  center: 'shadowCenter',
  right: 'shadowRight',
  bottomLeft: 'shadowBottomLeft',
  bottom: 'shadowBottom',
  bottomRight: 'shadowBottomRight',
}

const messages = {
  ko: {
    appName: 'SVG Editor V1.0',
    file: '파일',
    open: '열기',
    add: '추가',
    newFile: '새 파일',
    saveSvg: 'SVG 저장',
    exportFormatFile: '현재 형식으로 저장',
    saveChangesTitle: '변경사항 저장',
    saveChangesMessage: '현재 작업 내용에 변경사항이 있습니다. 계속하기 전에 저장하시겠습니까?',
    save: '저장',
    dontSave: '저장 안 함',
    cancel: '취소',
    export: '내보내기',
    exportOptions: '내보내기 옵션',
    exportRun: '내보내기',
    about: '정보',
    theme: '테마',
    language: '언어',
    grid: 'Grid',
    tools: '그리기 도구',
    basicTools: '기본',
    advancedTools: '고급',
    lineTools: '선/연결',
    properties: '속성',
    select: '선택',
    rect: '사각형',
    square: '정사각형',
    roundRect: '둥근 사각형',
    ellipse: '타원',
    circleShape: '원',
    triangle: '삼각형',
    diamondShape: '마름모',
    pentagon: '오각형',
    hexagon: '육각형',
    octagon: '팔각형',
    star: '별',
    trapezoid: '사다리꼴',
    parallelogram: '평행사변형',
    chevron: '갈매기',
    crossShape: '십자',
    line: '선',
    connector: '연결선',
    pen: '펜',
    text: '텍스트',
    fontFamily: '폰트',
    fontSize: '글자 크기',
    fontWeight: '굵기',
    fontStyle: '기울임',
    textAlign: '정렬',
    normal: '보통',
    bold: '굵게',
    italic: '기울임',
    alignLeft: '왼쪽',
    alignCenter: '가운데',
    alignRight: '오른쪽',
    eraser: '지우개',
    fill: '채우기',
    stroke: '테두리 색',
    strokeWidth: '테두리 두께',
    opacity: '투명도',
    shadowEffect: '3D 그림자',
    shadowNone: '없음',
    shadowSoft: '부드러운 그림자',
    shadowDeep: '깊은 3D',
    shadowLong: '긴 그림자',
    shadowGlow: '빛 번짐',
    shadowEmboss: '엠보스',
    shadowDirection: '그림자 위치',
    shadowDistance: '거리',
    shadowBlur: '흐림',
    shadowColor: '그림자 색',
    shadowOpacity: '그림자 투명도',
    shadowTopLeft: '왼쪽 위',
    shadowTop: '위',
    shadowTopRight: '오른쪽 위',
    shadowLeft: '왼쪽',
    shadowCenter: '중앙',
    shadowRight: '오른쪽',
    shadowBottomLeft: '왼쪽 아래',
    shadowBottom: '아래',
    shadowBottomRight: '오른쪽 아래',
    noSelection: '선택된 도형이 없습니다.',
    removeBackground: '배경 제거 및 최소 크기',
    format: '형식',
    duplicate: '복제',
    delete: '삭제',
    front: '앞으로',
    back: '뒤로',
    zoomIn: '확대',
    zoomOut: '축소',
    resetZoom: '배율 초기화',
    resetView: 'Reset',
    minimize: '최소화',
    maximize: '최대화',
    closeWindow: '닫기',
    canvas: '캔버스',
    aboutTitle: '프로그램 정보',
    creator: '제작자',
    version: '버전',
    supported: 'SVG 생성/편집, JPG/GIF/TIFF/PNG/WebP/AVIF 읽기, 다중 형식 내보내기, Web/Linux/macOS/Windows 빌드 지원.',
    close: '닫기',
    desktopBuild: '설치 프로그램은 NSIS, DMG, AppImage/DEB/RPM 대상으로 구성되어 있습니다.',
    fileReadError: '파일을 읽을 수 없습니다.',
    exportFallback: '이 브라우저가 선택한 형식의 Canvas 인코딩을 지원하지 않아 PNG로 저장합니다.',
    selected: '선택됨',
    selectedCount: '개 선택됨',
    name: '이름',
    svgText: '전체 SVG 텍스트',
    undo: '실행 취소',
    redo: '다시 실행',
    lineStyle: '선 종류',
    startMarker: '시작 모양',
    endMarker: '끝 모양',
    straight: '직선',
    elbow: '꺾은선',
    curve: '곡선',
    none: '없음',
    arrow: '화살표',
    circleMarker: '원',
    diamond: '마름모',
    connectorHint: '연결선을 선택한 뒤 도형 두 개를 차례로 클릭하세요.',
    statusReady: '준비',
    selectedNone: '선택 없음',
    shapesCount: '도형',
    imagesCount: '이미지',
    canvasSize: '캔버스',
    copied: '복사됨',
    copy: '복사',
    paste: '붙여넣기',
    errorTitle: '오류 상세 정보',
    errorMessage: '오류가 발생했습니다.',
  },
  en: {
    appName: 'SVG Editor V1.0',
    file: 'File',
    open: 'Open',
    add: 'Add',
    newFile: 'New file',
    saveSvg: 'Save SVG',
    exportFormatFile: 'Save current format',
    saveChangesTitle: 'Save changes',
    saveChangesMessage: 'The current document has unsaved changes. Do you want to save before continuing?',
    save: 'Save',
    dontSave: "Don't save",
    cancel: 'Cancel',
    export: 'Export',
    exportOptions: 'Export options',
    exportRun: 'Export',
    about: 'About',
    theme: 'Theme',
    language: 'Language',
    grid: 'Grid',
    tools: 'Drawing tools',
    basicTools: 'Basic',
    advancedTools: 'Advanced',
    lineTools: 'Lines / connectors',
    properties: 'Properties',
    select: 'Select',
    rect: 'Rectangle',
    square: 'Square',
    roundRect: 'Rounded rectangle',
    ellipse: 'Ellipse',
    circleShape: 'Circle',
    triangle: 'Triangle',
    diamondShape: 'Diamond',
    pentagon: 'Pentagon',
    hexagon: 'Hexagon',
    octagon: 'Octagon',
    star: 'Star',
    trapezoid: 'Trapezoid',
    parallelogram: 'Parallelogram',
    chevron: 'Chevron',
    crossShape: 'Cross',
    line: 'Line',
    connector: 'Connector',
    pen: 'Pen',
    text: 'Text',
    fontFamily: 'Font',
    fontSize: 'Font size',
    fontWeight: 'Weight',
    fontStyle: 'Style',
    textAlign: 'Align',
    normal: 'Normal',
    bold: 'Bold',
    italic: 'Italic',
    alignLeft: 'Left',
    alignCenter: 'Center',
    alignRight: 'Right',
    eraser: 'Eraser',
    fill: 'Fill',
    stroke: 'Border color',
    strokeWidth: 'Border width',
    opacity: 'Opacity',
    shadowEffect: '3D shadow',
    shadowNone: 'None',
    shadowSoft: 'Soft shadow',
    shadowDeep: 'Deep 3D',
    shadowLong: 'Long shadow',
    shadowGlow: 'Glow',
    shadowEmboss: 'Emboss',
    shadowDirection: 'Shadow position',
    shadowDistance: 'Distance',
    shadowBlur: 'Blur',
    shadowColor: 'Shadow color',
    shadowOpacity: 'Shadow opacity',
    shadowTopLeft: 'Top left',
    shadowTop: 'Top',
    shadowTopRight: 'Top right',
    shadowLeft: 'Left',
    shadowCenter: 'Center',
    shadowRight: 'Right',
    shadowBottomLeft: 'Bottom left',
    shadowBottom: 'Bottom',
    shadowBottomRight: 'Bottom right',
    noSelection: 'No shape is selected.',
    removeBackground: 'Remove background and trim bounds',
    format: 'Format',
    duplicate: 'Duplicate',
    delete: 'Delete',
    front: 'Bring forward',
    back: 'Send backward',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    resetZoom: 'Reset zoom',
    resetView: 'Reset',
    minimize: 'Minimize',
    maximize: 'Maximize',
    closeWindow: 'Close',
    canvas: 'Canvas',
    aboutTitle: 'Program information',
    creator: 'Creator',
    version: 'Version',
    supported: 'Create/edit SVG, read JPG/GIF/TIFF/PNG/WebP/AVIF, export multiple image formats, and build for Web/Linux/macOS/Windows.',
    close: 'Close',
    desktopBuild: 'Installers are configured for NSIS, DMG, and AppImage/DEB/RPM targets.',
    fileReadError: 'The file could not be read.',
    exportFallback: 'This browser cannot encode the selected Canvas format, so PNG was saved instead.',
    selected: 'Selected',
    selectedCount: 'selected',
    name: 'Name',
    svgText: 'Full SVG text',
    undo: 'Undo',
    redo: 'Redo',
    lineStyle: 'Line style',
    startMarker: 'Start marker',
    endMarker: 'End marker',
    straight: 'Straight',
    elbow: 'Elbow',
    curve: 'Curve',
    none: 'None',
    arrow: 'Arrow',
    circleMarker: 'Circle',
    diamond: 'Diamond',
    connectorHint: 'Select Connector, then click two shapes in order.',
    statusReady: 'Ready',
    selectedNone: 'No selection',
    shapesCount: 'Shapes',
    imagesCount: 'Images',
    canvasSize: 'Canvas',
    copied: 'Copied',
    copy: 'Copy',
    paste: 'Paste',
    errorTitle: 'Error details',
    errorMessage: 'An error occurred.',
  },
} satisfies Record<Language, Record<string, string>>

const toolIcons = {
  select: MousePointer2,
  rect: RectangleHorizontal,
  square: Square,
  roundRect: RectangleHorizontal,
  ellipse: Circle,
  circleShape: Circle,
  triangle: Triangle,
  diamondShape: Diamond,
  pentagon: Hexagon,
  hexagon: Hexagon,
  octagon: Hexagon,
  star: Star,
  trapezoid: Triangle,
  parallelogram: Slash,
  chevron: BringToFront,
  crossShape: Plus,
  curve: PenLine,
  line: Slash,
  connector: BringToFront,
  pen: PenLine,
  text: Type,
  eraser: Eraser,
}

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

function normalizeRect(start: Point, end: Point) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  }
}

function normalizeSquareRect(start: Point, end: Point) {
  const size = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y))
  return {
    x: end.x < start.x ? start.x - size : start.x,
    y: end.y < start.y ? start.y - size : start.y,
    width: size,
    height: size,
  }
}

function polygonPoints(shape: Shape) {
  const left = shape.x
  const top = shape.y
  const right = shape.x + shape.width
  const bottom = shape.y + shape.height
  const centerX = shape.x + shape.width / 2
  const centerY = shape.y + shape.height / 2

  if (shape.type === 'triangle') {
    return [{ x: centerX, y: top }, { x: right, y: bottom }, { x: left, y: bottom }]
  }
  if (shape.type === 'diamondShape') {
    return [{ x: centerX, y: top }, { x: right, y: centerY }, { x: centerX, y: bottom }, { x: left, y: centerY }]
  }
  if (shape.type === 'pentagon') {
    return Array.from({ length: 5 }, (_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / 5
      return { x: centerX + Math.cos(angle) * shape.width / 2, y: centerY + Math.sin(angle) * shape.height / 2 }
    })
  }
  if (shape.type === 'hexagon') {
    return [
      { x: shape.x + shape.width * 0.25, y: top },
      { x: shape.x + shape.width * 0.75, y: top },
      { x: right, y: centerY },
      { x: shape.x + shape.width * 0.75, y: bottom },
      { x: shape.x + shape.width * 0.25, y: bottom },
      { x: left, y: centerY },
    ]
  }
  if (shape.type === 'octagon') {
    const insetX = shape.width * 0.3
    const insetY = shape.height * 0.3
    return [
      { x: left + insetX, y: top },
      { x: right - insetX, y: top },
      { x: right, y: top + insetY },
      { x: right, y: bottom - insetY },
      { x: right - insetX, y: bottom },
      { x: left + insetX, y: bottom },
      { x: left, y: bottom - insetY },
      { x: left, y: top + insetY },
    ]
  }
  if (shape.type === 'star') {
    const outerRadius = Math.min(Math.abs(shape.width), Math.abs(shape.height)) / 2
    const innerRadius = outerRadius * 0.45
    return Array.from({ length: 10 }, (_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI / 5
      const radius = index % 2 === 0 ? outerRadius : innerRadius
      return { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius }
    })
  }
  if (shape.type === 'trapezoid') {
    return [{ x: left + shape.width * 0.22, y: top }, { x: right - shape.width * 0.22, y: top }, { x: right, y: bottom }, { x: left, y: bottom }]
  }
  if (shape.type === 'parallelogram') {
    return [{ x: left + shape.width * 0.22, y: top }, { x: right, y: top }, { x: right - shape.width * 0.22, y: bottom }, { x: left, y: bottom }]
  }
  if (shape.type === 'chevron') {
    return [{ x: left, y: top }, { x: centerX, y: centerY }, { x: left, y: bottom }, { x: left + shape.width * 0.45, y: bottom }, { x: right, y: centerY }, { x: left + shape.width * 0.45, y: top }]
  }
  if (shape.type === 'crossShape') {
    return [
      { x: left + shape.width * 0.35, y: top },
      { x: left + shape.width * 0.65, y: top },
      { x: left + shape.width * 0.65, y: top + shape.height * 0.35 },
      { x: right, y: top + shape.height * 0.35 },
      { x: right, y: top + shape.height * 0.65 },
      { x: left + shape.width * 0.65, y: top + shape.height * 0.65 },
      { x: left + shape.width * 0.65, y: bottom },
      { x: left + shape.width * 0.35, y: bottom },
      { x: left + shape.width * 0.35, y: top + shape.height * 0.65 },
      { x: left, y: top + shape.height * 0.65 },
      { x: left, y: top + shape.height * 0.35 },
      { x: left + shape.width * 0.35, y: top + shape.height * 0.35 },
    ]
  }
  return []
}

function svgPoints(points: Point[]) {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

function isPointInShape(point: Point, shape: Shape) {
  const padding = Math.max(8, shape.strokeWidth + 4)
  return point.x >= shape.x - padding && point.x <= shape.x + shape.width + padding && point.y >= shape.y - padding && point.y <= shape.y + shape.height + padding
}

function isPointInRaster(point: Point, raster: RasterLayer) {
  return point.x >= raster.x && point.x <= raster.x + raster.width && point.y >= raster.y && point.y <= raster.y + raster.height
}

function shapeBounds(shape: Shape) {
  const pad = shape.strokeWidth + 4
  if (shape.points?.length) {
    const xs = shape.points.map((point) => point.x)
    const ys = shape.points.map((point) => point.y)
    return {
      x: Math.min(...xs) - pad,
      y: Math.min(...ys) - pad,
      width: Math.max(...xs) - Math.min(...xs) + pad * 2,
      height: Math.max(...ys) - Math.min(...ys) + pad * 2,
    }
  }

  return {
    x: shape.x - pad,
    y: shape.y - pad,
    width: Math.max(1, shape.width + pad * 2),
    height: Math.max(1, shape.height + pad * 2),
  }
}

function rasterBounds(raster: RasterLayer) {
  return { x: raster.x, y: raster.y, width: Math.max(1, raster.width), height: Math.max(1, raster.height) }
}

function cloneShapes(shapes: Shape[]) {
  return shapes.map((shape) => ({
    ...shape,
    points: shape.points?.map((point) => ({ ...point })),
  }))
}

function getShapeCenter(shape: Shape) {
  return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }
}

function getSurfacePoint(shape: Shape, toward: Point) {
  const center = getShapeCenter(shape)
  const dx = toward.x - center.x
  const dy = toward.y - center.y
  if (dx === 0 && dy === 0) {
    return center
  }

  if (shape.type === 'ellipse') {
    const rx = Math.max(1, Math.abs(shape.width / 2))
    const ry = Math.max(1, Math.abs(shape.height / 2))
    const scale = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry))
    return { x: center.x + dx * scale, y: center.y + dy * scale }
  }

  const halfWidth = Math.max(1, Math.abs(shape.width / 2))
  const halfHeight = Math.max(1, Math.abs(shape.height / 2))
  const scale = Math.min(halfWidth / Math.abs(dx || 0.0001), halfHeight / Math.abs(dy || 0.0001))
  return { x: center.x + dx * scale, y: center.y + dy * scale }
}

function getConnectorPoints(shape: Shape, shapes: Shape[]) {
  const from = shapes.find((item) => item.id === shape.fromId)
  const to = shapes.find((item) => item.id === shape.toId)
  if (!from || !to) {
    return { start: { x: shape.x, y: shape.y }, end: { x: shape.x + shape.width, y: shape.y + shape.height } }
  }

  const fromCenter = getShapeCenter(from)
  const toCenter = getShapeCenter(to)
  return {
    start: getSurfacePoint(from, toCenter),
    end: getSurfacePoint(to, fromCenter),
  }
}

function connectorPath(shape: Shape, shapes: Shape[]) {
  const { start, end } = getConnectorPoints(shape, shapes)
  if (shape.lineStyle === 'elbow') {
    const midX = start.x + (end.x - start.x) / 2
    return { start, end, svg: `M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}` }
  }
  if (shape.lineStyle === 'curve') {
    const controlX = start.x + (end.x - start.x) / 2
    return { start, end, svg: `M ${start.x} ${start.y} C ${controlX} ${start.y}, ${controlX} ${end.y}, ${end.x} ${end.y}` }
  }
  return { start, end, svg: `M ${start.x} ${start.y} L ${end.x} ${end.y}` }
}

function curvePath(shape: Shape) {
  const start = { x: shape.x, y: shape.y + shape.height }
  const end = { x: shape.x + shape.width, y: shape.y }
  const controlX = shape.x + shape.width / 2
  return `M ${start.x} ${start.y} C ${controlX} ${start.y}, ${controlX} ${end.y}, ${end.x} ${end.y}`
}

function resizeShape(shape: Shape, anchor: ResizeAnchor, point: Point) {
  const original = { left: shape.x, top: shape.y, right: shape.x + shape.width, bottom: shape.y + shape.height }
  const next = { ...original }

  if (anchor.includes('w')) {
    next.left = Math.min(point.x, original.right - 8)
  }
  if (anchor.includes('e')) {
    next.right = Math.max(point.x, original.left + 8)
  }
  if (anchor.includes('n')) {
    next.top = Math.min(point.y, original.bottom - 8)
  }
  if (anchor.includes('s')) {
    next.bottom = Math.max(point.y, original.top + 8)
  }

  const width = next.right - next.left
  const height = next.bottom - next.top
  if (shape.points?.length) {
    const scaleX = shape.width === 0 ? 1 : width / shape.width
    const scaleY = shape.height === 0 ? 1 : height / shape.height
    return {
      ...shape,
      x: next.left,
      y: next.top,
      width,
      height,
      points: shape.points.map((oldPoint) => ({
        x: next.left + (oldPoint.x - shape.x) * scaleX,
        y: next.top + (oldPoint.y - shape.y) * scaleY,
      })),
    }
  }

  return { ...shape, x: next.left, y: next.top, width, height }
}

function resizeRaster(raster: RasterLayer, anchor: ResizeAnchor, point: Point) {
  const original = { left: raster.x, top: raster.y, right: raster.x + raster.width, bottom: raster.y + raster.height }
  const next = { ...original }

  if (anchor.includes('w')) {
    next.left = Math.min(point.x, original.right - 8)
  }
  if (anchor.includes('e')) {
    next.right = Math.max(point.x, original.left + 8)
  }
  if (anchor.includes('n')) {
    next.top = Math.min(point.y, original.bottom - 8)
  }
  if (anchor.includes('s')) {
    next.bottom = Math.max(point.y, original.top + 8)
  }

  return { ...raster, x: next.left, y: next.top, width: next.right - next.left, height: next.bottom - next.top }
}

function getResizeHandleAt(point: Point, shape: Shape): ResizeAnchor | null {
  const bounds = shapeBounds(shape)
  const handles: Array<{ anchor: ResizeAnchor; point: Point }> = [
    { anchor: 'nw', point: { x: bounds.x, y: bounds.y } },
    { anchor: 'ne', point: { x: bounds.x + bounds.width, y: bounds.y } },
    { anchor: 'sw', point: { x: bounds.x, y: bounds.y + bounds.height } },
    { anchor: 'se', point: { x: bounds.x + bounds.width, y: bounds.y + bounds.height } },
  ]

  return handles.find((handle) => Math.abs(point.x - handle.point.x) <= 12 && Math.abs(point.y - handle.point.y) <= 12)?.anchor ?? null
}

function getRasterResizeHandleAt(point: Point, raster: RasterLayer): ResizeAnchor | null {
  const bounds = rasterBounds(raster)
  const handles: Array<{ anchor: ResizeAnchor; point: Point }> = [
    { anchor: 'nw', point: { x: bounds.x, y: bounds.y } },
    { anchor: 'ne', point: { x: bounds.x + bounds.width, y: bounds.y } },
    { anchor: 'sw', point: { x: bounds.x, y: bounds.y + bounds.height } },
    { anchor: 'se', point: { x: bounds.x + bounds.width, y: bounds.y + bounds.height } },
  ]

  return handles.find((handle) => Math.abs(point.x - handle.point.x) <= 12 && Math.abs(point.y - handle.point.y) <= 12)?.anchor ?? null
}

function resizeCursor(anchor: ResizeAnchor) {
  return anchor === 'nw' || anchor === 'se' ? 'nwse-resize' : 'nesw-resize'
}

function rectsIntersect(first: { x: number; y: number; width: number; height: number }, second: { x: number; y: number; width: number; height: number }) {
  return first.x <= second.x + second.width && first.x + first.width >= second.x && first.y <= second.y + second.height && first.y + first.height >= second.y
}

function selectionBounds(box: SelectionBox) {
  return normalizeRect(box.start, box.current)
}

function getSceneBounds(shapes: Shape[], rasters: RasterLayer[]) {
  const bounds = [
    ...shapes.map(shapeBounds),
    ...rasters.map((raster) => ({ x: raster.x, y: raster.y, width: raster.width, height: raster.height })),
  ]

  if (bounds.length === 0) {
    return { x: 0, y: 0, width: canvasSize.width, height: canvasSize.height }
  }

  const left = Math.max(0, Math.floor(Math.min(...bounds.map((bound) => bound.x))))
  const top = Math.max(0, Math.floor(Math.min(...bounds.map((bound) => bound.y))))
  const right = Math.min(canvasSize.width, Math.ceil(Math.max(...bounds.map((bound) => bound.x + bound.width))))
  const bottom = Math.min(canvasSize.height, Math.ceil(Math.max(...bounds.map((bound) => bound.y + bound.height))))

  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }
}

function escapeXml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function markerUrl(marker: MarkerStyle | undefined, prefix: 'start' | 'end') {
  return marker && marker !== 'none' ? ` marker-${prefix}="url(#${prefix}-${marker})"` : ''
}

function effectiveShadow(shape: Shape) {
  if (!shape.shadowEffect || shape.shadowEffect === 'none') {
    return null
  }
  const preset = shadowPresets[shape.shadowEffect]
  const direction = shape.shadowDirection ?? preset.direction
  const vector = shadowDirectionVectors[direction]
  const distance = shape.shadowDistance ?? preset.distance
  return {
    dx: vector.x * distance,
    dy: vector.y * distance,
    blur: shape.shadowBlur ?? preset.blur,
    color: shape.shadowColor ?? preset.color,
    opacity: shape.shadowOpacity ?? preset.opacity,
  }
}

function hexToRgba(hex: string, opacity: number) {
  const normalized = hex.replace('#', '')
  const value = normalized.length === 3 ? normalized.split('').map((item) => item + item).join('') : normalized
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`
}

function shadowFilter(shape: Shape) {
  return effectiveShadow(shape) ? ` filter="url(#shadow-${shape.id})"` : ''
}

function shadowFilterDefs(shapes: Shape[]) {
  const filters = shapes.flatMap((shape) => {
    const shadow = effectiveShadow(shape)
    return shadow ? [`<filter id="shadow-${shape.id}" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="${shadow.dx}" dy="${shadow.dy}" stdDeviation="${shadow.blur}" flood-color="${shadow.color}" flood-opacity="${shadow.opacity}"/></filter>`] : []
  })
  return filters.join('')
}

function applyCanvasShadow(context: CanvasRenderingContext2D, shape: Shape) {
  const shadow = effectiveShadow(shape)
  if (!shadow) {
    return
  }
  context.shadowOffsetX = shadow.dx
  context.shadowOffsetY = shadow.dy
  context.shadowBlur = shadow.blur
  context.shadowColor = hexToRgba(shadow.color, shadow.opacity)
}

function shapeToSvg(shape: Shape, shapes: Shape[]) {
  const filter = shadowFilter(shape)
  const common = `fill="${shape.fill}" stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}" opacity="${shape.opacity}"${filter}`
  if (shape.type === 'connector') {
    return `<path d="${connectorPath(shape, shapes).svg}" fill="none" stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}" opacity="${shape.opacity}" stroke-linecap="round" stroke-linejoin="round"${filter}${markerUrl(shape.startMarker, 'start')}${markerUrl(shape.endMarker, 'end')}/>`
  }
  if (shape.type === 'rect' || shape.type === 'square') {
    return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" rx="6" ${common}/>`
  }
  if (shape.type === 'roundRect') {
    return `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" rx="${Math.min(28, Math.abs(shape.width) / 4, Math.abs(shape.height) / 4)}" ${common}/>`
  }
  if (shape.type === 'ellipse' || shape.type === 'circleShape') {
    return `<ellipse cx="${shape.x + shape.width / 2}" cy="${shape.y + shape.height / 2}" rx="${shape.width / 2}" ry="${shape.height / 2}" ${common}/>`
  }
  if (shape.type === 'triangle' || shape.type === 'diamondShape' || shape.type === 'pentagon' || shape.type === 'hexagon' || shape.type === 'octagon' || shape.type === 'star' || shape.type === 'trapezoid' || shape.type === 'parallelogram' || shape.type === 'chevron' || shape.type === 'crossShape') {
    return `<polygon points="${svgPoints(polygonPoints(shape))}" ${common}/>`
  }
  if (shape.type === 'line') {
    return `<line x1="${shape.x}" y1="${shape.y}" x2="${shape.x + shape.width}" y2="${shape.y + shape.height}" fill="none" stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}" opacity="${shape.opacity}" stroke-linecap="round"${filter}/>`
  }
  if (shape.type === 'curve') {
    return `<path d="${curvePath(shape)}" fill="none" stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}" opacity="${shape.opacity}" stroke-linecap="round" stroke-linejoin="round"${filter}/>`
  }
  if (shape.type === 'pen' && shape.points?.length) {
    return `<polyline points="${shape.points.map((point) => `${point.x},${point.y}`).join(' ')}" fill="none" stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}" opacity="${shape.opacity}" stroke-linecap="round" stroke-linejoin="round"${filter}/>`
  }
  if (shape.type === 'text') {
    const align = shape.textAlign ?? 'left'
    const x = align === 'center' ? shape.x + shape.width / 2 : align === 'right' ? shape.x + shape.width : shape.x
    const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start'
    return `<text x="${x}" y="${shape.y + (shape.fontSize ?? 32)}" fill="${shape.fill}" stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}" opacity="${shape.opacity}" font-size="${shape.fontSize ?? 32}" font-family="${shape.fontFamily ?? 'Arial, sans-serif'}" font-weight="${shape.fontWeight ?? '400'}" font-style="${shape.fontStyle ?? 'normal'}" text-anchor="${anchor}"${filter}>${escapeXml(shape.text ?? '')}</text>`
  }
  return ''
}

function buildSvg(shapes: Shape[], rasters: RasterLayer[], removeBackground: boolean) {
  const bounds = removeBackground ? getSceneBounds(shapes, rasters) : { x: 0, y: 0, width: canvasSize.width, height: canvasSize.height }
  const rasterNodes = rasters.map((raster) => `<image href="${raster.src}" x="${raster.x}" y="${raster.y}" width="${raster.width}" height="${raster.height}"/>`)
  const defs = `<defs>${shadowFilterDefs(shapes)}<marker id="end-arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker><marker id="start-arrow" markerWidth="10" markerHeight="10" refX="1" refY="5" orient="auto-start-reverse"><path d="M 0 5 L 10 0 L 10 10 z" fill="context-stroke"/></marker><marker id="end-circle" markerWidth="10" markerHeight="10" refX="5" refY="5"><circle cx="5" cy="5" r="4" fill="context-stroke"/></marker><marker id="start-circle" markerWidth="10" markerHeight="10" refX="5" refY="5"><circle cx="5" cy="5" r="4" fill="context-stroke"/></marker><marker id="end-diamond" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M 6 0 L 12 6 L 6 12 L 0 6 z" fill="context-stroke"/></marker><marker id="start-diamond" markerWidth="12" markerHeight="12" refX="2" refY="6" orient="auto"><path d="M 6 0 L 12 6 L 6 12 L 0 6 z" fill="context-stroke"/></marker></defs>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}">${defs}${rasterNodes.join('')}${shapes.map((shape) => shapeToSvg(shape, shapes)).join('')}</svg>`
}

function drawMarker(context: CanvasRenderingContext2D, marker: MarkerStyle | undefined, point: Point, toward: Point, color: string) {
  if (!marker || marker === 'none') {
    return
  }
  const angle = Math.atan2(point.y - toward.y, point.x - toward.x)
  context.save()
  context.translate(point.x, point.y)
  context.rotate(angle)
  context.fillStyle = color
  context.strokeStyle = color
  if (marker === 'arrow') {
    context.beginPath()
    context.moveTo(0, 0)
    context.lineTo(-14, -7)
    context.lineTo(-14, 7)
    context.closePath()
    context.fill()
  } else if (marker === 'circle') {
    context.beginPath()
    context.arc(0, 0, 6, 0, Math.PI * 2)
    context.fill()
  } else if (marker === 'diamond') {
    context.beginPath()
    context.moveTo(0, 0)
    context.lineTo(-7, -7)
    context.lineTo(-14, 0)
    context.lineTo(-7, 7)
    context.closePath()
    context.fill()
  }
  context.restore()
}

function drawShape(context: CanvasRenderingContext2D, shape: Shape, selected: boolean, shapes: Shape[] = []) {
  context.save()
  context.globalAlpha = shape.opacity
  context.lineWidth = shape.strokeWidth
  context.strokeStyle = shape.stroke
  context.fillStyle = shape.fill
  context.lineCap = 'round'
  context.lineJoin = 'round'
  applyCanvasShadow(context, shape)

  if (shape.type === 'connector') {
    const path = connectorPath(shape, shapes)
    const path2d = new Path2D(path.svg)
    context.stroke(path2d)
    drawMarker(context, shape.startMarker, path.start, path.end, shape.stroke)
    drawMarker(context, shape.endMarker, path.end, path.start, shape.stroke)
  } else if (shape.type === 'rect' || shape.type === 'square') {
    context.beginPath()
    context.roundRect(shape.x, shape.y, shape.width, shape.height, 6)
    context.fill()
    context.stroke()
  } else if (shape.type === 'roundRect') {
    context.beginPath()
    context.roundRect(shape.x, shape.y, shape.width, shape.height, Math.min(28, Math.abs(shape.width) / 4, Math.abs(shape.height) / 4))
    context.fill()
    context.stroke()
  } else if (shape.type === 'ellipse' || shape.type === 'circleShape') {
    context.beginPath()
    context.ellipse(shape.x + shape.width / 2, shape.y + shape.height / 2, Math.abs(shape.width / 2), Math.abs(shape.height / 2), 0, 0, Math.PI * 2)
    context.fill()
    context.stroke()
  } else if (shape.type === 'triangle' || shape.type === 'diamondShape' || shape.type === 'pentagon' || shape.type === 'hexagon' || shape.type === 'octagon' || shape.type === 'star' || shape.type === 'trapezoid' || shape.type === 'parallelogram' || shape.type === 'chevron' || shape.type === 'crossShape') {
    const points = polygonPoints(shape)
    context.beginPath()
    context.moveTo(points[0].x, points[0].y)
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y))
    context.closePath()
    context.fill()
    context.stroke()
  } else if (shape.type === 'line') {
    context.beginPath()
    context.moveTo(shape.x, shape.y)
    context.lineTo(shape.x + shape.width, shape.y + shape.height)
    context.stroke()
  } else if (shape.type === 'curve') {
    const path = new Path2D(curvePath(shape))
    context.stroke(path)
  } else if (shape.type === 'pen' && shape.points?.length) {
    context.beginPath()
    context.moveTo(shape.points[0].x, shape.points[0].y)
    shape.points.slice(1).forEach((point) => context.lineTo(point.x, point.y))
    context.stroke()
  } else if (shape.type === 'text') {
    const align = shape.textAlign ?? 'left'
    const x = align === 'center' ? shape.x + shape.width / 2 : align === 'right' ? shape.x + shape.width : shape.x
    context.font = `${shape.fontStyle ?? 'normal'} ${shape.fontWeight ?? '400'} ${shape.fontSize ?? 32}px ${shape.fontFamily ?? 'Arial, sans-serif'}`
    context.textAlign = align
    context.textBaseline = 'alphabetic'
    if (shape.stroke !== 'transparent' && shape.strokeWidth > 0) {
      context.strokeText(shape.text ?? '', x, shape.y + (shape.fontSize ?? 32))
    }
    context.fillText(shape.text ?? '', x, shape.y + (shape.fontSize ?? 32))
  }

  context.restore()

  if (selected) {
    const bounds = shapeBounds(shape)
    context.save()
    context.strokeStyle = '#0aa6a6'
    context.lineWidth = 2
    context.setLineDash([8, 5])
    context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)
    if (shape.type !== 'connector') {
      context.setLineDash([])
      context.fillStyle = '#f4c95d'
      context.strokeStyle = '#10252a'
      ;[
        [bounds.x, bounds.y],
        [bounds.x + bounds.width, bounds.y],
        [bounds.x, bounds.y + bounds.height],
        [bounds.x + bounds.width, bounds.y + bounds.height],
      ].forEach(([x, y]) => {
        context.beginPath()
        context.rect(x - 5, y - 5, 10, 10)
        context.fill()
        context.stroke()
      })
    }
    context.restore()
  }
}

function drawSelectionBounds(context: CanvasRenderingContext2D, bounds: { x: number; y: number; width: number; height: number }) {
  context.save()
  context.strokeStyle = '#0aa6a6'
  context.lineWidth = 2
  context.setLineDash([8, 5])
  context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)
  context.setLineDash([])
  context.fillStyle = '#f4c95d'
  context.strokeStyle = '#10252a'
  ;[
    [bounds.x, bounds.y],
    [bounds.x + bounds.width, bounds.y],
    [bounds.x, bounds.y + bounds.height],
    [bounds.x + bounds.width, bounds.y + bounds.height],
  ].forEach(([x, y]) => {
    context.beginPath()
    context.rect(x - 5, y - 5, 10, 10)
    context.fill()
    context.stroke()
  })
  context.restore()
}

async function loadImage(src: string) {
  const image = new Image()
  image.decoding = 'async'
  image.src = src
  await image.decode()
  return image
}

async function renderSceneToCanvas(shapes: Shape[], rasters: RasterLayer[], removeBackground: boolean, fillBackground: string | null) {
  const bounds = removeBackground ? getSceneBounds(shapes, rasters) : { x: 0, y: 0, width: canvasSize.width, height: canvasSize.height }
  const canvas = document.createElement('canvas')
  canvas.width = bounds.width
  canvas.height = bounds.height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas rendering is unavailable.')
  }

  if (fillBackground) {
    context.fillStyle = fillBackground
    context.fillRect(0, 0, canvas.width, canvas.height)
  }

  context.translate(-bounds.x, -bounds.y)
  for (const raster of rasters) {
    const image = await loadImage(raster.src)
    context.drawImage(image, raster.x, raster.y, raster.width, raster.height)
  }
  shapes.forEach((shape) => drawShape(context, shape, false, shapes))
  return canvas
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function svgAttribute(element: SVGElement, name: string) {
  const direct = element.getAttribute(name)
  if (direct !== null) {
    return direct
  }
  const style = element.getAttribute('style')
  return style?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}:`))?.split(':').slice(1).join(':').trim() ?? null
}

function svgNumber(element: SVGElement, name: string, fallback: number) {
  const value = svgAttribute(element, name)
  if (!value) {
    return fallback
  }
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseSvgPoints(value: string | null) {
  if (!value) {
    return []
  }
  const numbers = [...value.matchAll(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)].map((match) => Number(match[0]))
  const points: Point[] = []
  for (let index = 0; index < numbers.length - 1; index += 2) {
    points.push({ x: numbers[index], y: numbers[index + 1] })
  }
  return points
}

function parsePathPoints(pathData: string | null) {
  if (!pathData) {
    return []
  }
  const tokens = pathData.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? []
  const points: Point[] = []
  let index = 0
  let command = ''
  let current: Point = { x: 0, y: 0 }

  const readNumber = () => Number(tokens[index++])
  const isCommand = (token: string | undefined) => Boolean(token && /^[a-zA-Z]$/.test(token))
  const push = (point: Point) => {
    current = point
    points.push(point)
  }

  while (index < tokens.length) {
    if (isCommand(tokens[index])) {
      command = tokens[index++]
    }
    const relative = command === command.toLowerCase()
    const type = command.toLowerCase()
    if (type === 'z') {
      if (points[0]) {
        push({ ...points[0] })
      }
      continue
    }
    if (type === 'h') {
      const x = readNumber()
      push({ x: relative ? current.x + x : x, y: current.y })
      continue
    }
    if (type === 'v') {
      const y = readNumber()
      push({ x: current.x, y: relative ? current.y + y : y })
      continue
    }
    const coordinateCount = type === 'm' || type === 'l' || type === 't' ? 2 : type === 's' || type === 'q' ? 4 : type === 'c' ? 6 : 0
    if (coordinateCount === 0 || index + coordinateCount > tokens.length) {
      break
    }
    const values = Array.from({ length: coordinateCount }, readNumber)
    const x = values[values.length - 2]
    const y = values[values.length - 1]
    push({ x: relative ? current.x + x : x, y: relative ? current.y + y : y })
    if (type === 'm') {
      command = relative ? 'l' : 'L'
    }
  }

  return points
}

function pointsShape(base: Omit<Shape, 'type' | 'x' | 'y' | 'width' | 'height'>, points: Point[]) {
  const bounds = getSceneBounds([{ ...base, type: 'pen', x: 0, y: 0, width: 1, height: 1, points }], [])
  return { ...base, type: 'pen' as const, points, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
}

function inheritedSvgAttribute(element: SVGElement, name: string) {
  let current: SVGElement | null = element
  while (current) {
    const value = svgAttribute(current, name)
    if (value !== null) {
      return value
    }
    current = current.parentElement instanceof SVGElement ? current.parentElement : null
  }
  return null
}

function svgPaint(element: SVGElement, name: string, fallback: string) {
  const value = inheritedSvgAttribute(element, name)
  if (!value || value === 'none') {
    return name === 'fill' ? 'transparent' : fallback
  }
  return value.startsWith('url(') ? fallback : value
}

function transformCommandMatrix(command: string, rawValues: string) {
  const values = [...rawValues.matchAll(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)].map((match) => Number(match[0]))
  if (command === 'matrix' && values.length >= 6) {
    return new DOMMatrix(values.slice(0, 6))
  }
  if (command === 'translate') {
    return new DOMMatrix().translate(values[0] ?? 0, values[1] ?? 0)
  }
  if (command === 'scale') {
    return new DOMMatrix().scale(values[0] ?? 1, values[1] ?? values[0] ?? 1)
  }
  if (command === 'rotate') {
    const angle = values[0] ?? 0
    if (values.length >= 3) {
      return new DOMMatrix().translate(values[1], values[2]).rotate(angle).translate(-values[1], -values[2])
    }
    return new DOMMatrix().rotate(angle)
  }
  if (command === 'skewX') {
    return new DOMMatrix().skewX(values[0] ?? 0)
  }
  if (command === 'skewY') {
    return new DOMMatrix().skewY(values[0] ?? 0)
  }
  return new DOMMatrix()
}

function svgTransformMatrix(element: SVGElement) {
  const chain: SVGElement[] = []
  let current: SVGElement | null = element
  while (current && current.localName.toLowerCase() !== 'svg') {
    chain.unshift(current)
    current = current.parentElement instanceof SVGElement ? current.parentElement : null
  }

  return chain.reduce((matrix, item) => {
    const transform = item.getAttribute('transform')
    if (!transform) {
      return matrix
    }
    const itemMatrix = [...transform.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\(([^)]*)\)/g)].reduce((currentMatrix, match) => currentMatrix.multiply(transformCommandMatrix(match[1], match[2])), new DOMMatrix())
    return matrix.multiply(itemMatrix)
  }, new DOMMatrix())
}

function transformPoint(point: Point, matrix: DOMMatrix) {
  const transformed = new DOMPoint(point.x, point.y).matrixTransform(matrix)
  return { x: transformed.x, y: transformed.y }
}

function transformedRect(x: number, y: number, width: number, height: number, matrix: DOMMatrix) {
  const points = [
    transformPoint({ x, y }, matrix),
    transformPoint({ x: x + width, y }, matrix),
    transformPoint({ x, y: y + height }, matrix),
    transformPoint({ x: x + width, y: y + height }, matrix),
  ]
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
}

const svgShapeSelector = 'rect, ellipse, circle, line, text, polyline, polygon, path'
const svgGraphicSelector = `${svgShapeSelector}, image, use`

function hasInheritedPresentation(element: SVGElement) {
  const inheritedAttributes = ['fill', 'stroke', 'stroke-width', 'opacity', 'font-size', 'font-family', 'font-weight', 'font-style', 'text-anchor', 'style']
  let parent = element.parentElement
  while (parent && parent.localName.toLowerCase() !== 'svg') {
    if (inheritedAttributes.some((attribute) => parent?.hasAttribute(attribute))) {
      return true
    }
    parent = parent.parentElement
  }
  return false
}

function pathHasUnsupportedCommands(pathData: string | null) {
  return /[aAcCqQsStT]/.test(pathData ?? '')
}

function shouldPreserveSvgAsImage(documentXml: Document, parsedCount: number) {
  const root = documentXml.documentElement
  if (!root || root.localName.toLowerCase() !== 'svg' || documentXml.querySelector('parsererror')) {
    return true
  }

  const graphicElements = Array.from(root.querySelectorAll(svgGraphicSelector))
  if (parsedCount === 0 || graphicElements.length !== parsedCount) {
    return true
  }

  if (root.querySelector('defs, linearGradient, radialGradient, pattern, clipPath, mask, filter, marker, symbol, image, use, style')) {
    return true
  }

  if (root.querySelector('[transform], [clip-path], [mask], [filter], [class], [fill^="url("], [stroke^="url("]')) {
    return true
  }

  return Array.from(root.querySelectorAll(svgShapeSelector)).some((node) => {
    const element = node as SVGElement
    if (hasInheritedPresentation(element)) {
      return true
    }
    if (element.localName.toLowerCase() === 'path' && pathHasUnsupportedCommands(element.getAttribute('d'))) {
      return true
    }
    return element.localName.toLowerCase() === 'text' && element.children.length > 0
  })
}

function parseSvgImport(svgText: string): SvgImportResult {
  const parsed: Shape[] = []
  const documentXml = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  documentXml.querySelectorAll(svgShapeSelector).forEach((node, index) => {
    const element = node as SVGElement
    const matrix = svgTransformMatrix(element)
    const fill = svgPaint(element, 'fill', '#67d5b5')
    const stroke = svgPaint(element, 'stroke', '#173b46')
    const strokeWidth = Number.parseFloat(inheritedSvgAttribute(element, 'stroke-width') ?? '') || 2
    const opacity = Number.parseFloat(inheritedSvgAttribute(element, 'opacity') ?? '') || 1
    const base = { id: makeId('svg'), name: `${node.nodeName} ${index + 1}`, fill, stroke, strokeWidth, opacity }

    if (node.nodeName === 'rect') {
      parsed.push({ ...base, type: 'rect', ...transformedRect(svgNumber(element, 'x', 0), svgNumber(element, 'y', 0), svgNumber(element, 'width', 80), svgNumber(element, 'height', 60), matrix) })
    } else if (node.nodeName === 'ellipse' || node.nodeName === 'circle') {
      const cx = svgNumber(element, 'cx', 80)
      const cy = svgNumber(element, 'cy', 80)
      const rx = svgNumber(element, 'rx', svgNumber(element, 'r', 40))
      const ry = svgNumber(element, 'ry', svgNumber(element, 'r', 40))
      parsed.push({ ...base, type: 'ellipse', ...transformedRect(cx - rx, cy - ry, rx * 2, ry * 2, matrix) })
    } else if (node.nodeName === 'line') {
      const start = transformPoint({ x: svgNumber(element, 'x1', 0), y: svgNumber(element, 'y1', 0) }, matrix)
      const end = transformPoint({ x: svgNumber(element, 'x2', 100), y: svgNumber(element, 'y2', 100) }, matrix)
      parsed.push({ ...base, type: 'line', x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y, fill: 'transparent' })
    } else if (node.nodeName === 'text') {
      const fontSize = svgNumber(element, 'font-size', 32)
      const anchor = inheritedSvgAttribute(element, 'text-anchor')
      const textAlign: TextAlign = anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left'
      const point = transformPoint({ x: svgNumber(element, 'x', 0), y: svgNumber(element, 'y', 0) - fontSize }, matrix)
      parsed.push({ ...base, type: 'text', x: point.x, y: point.y, width: 220, height: fontSize + 16, text: element.textContent || 'Text', fontFamily: inheritedSvgAttribute(element, 'font-family') ?? 'Arial, sans-serif', fontSize, fontWeight: inheritedSvgAttribute(element, 'font-weight') ?? '400', fontStyle: inheritedSvgAttribute(element, 'font-style') ?? 'normal', textAlign })
    } else if (node.nodeName === 'polyline' || node.nodeName === 'polygon') {
      const points = parseSvgPoints(element.getAttribute('points')).map((point) => transformPoint(point, matrix))
      if (points.length > 1) {
        parsed.push(pointsShape({ ...base, fill: 'transparent' }, node.nodeName === 'polygon' ? [...points, points[0]] : points))
      }
    } else if (node.nodeName === 'path') {
      const points = parsePathPoints(element.getAttribute('d')).map((point) => transformPoint(point, matrix))
      if (points.length > 1) {
        parsed.push(pointsShape({ ...base, fill: 'transparent' }, points))
      }
    }
  })
  return { shapes: parsed, shouldPreserveAsImage: shouldPreserveSvgAsImage(documentXml, parsed.length), documentXml }
}

function svgLengthNumber(value: string | null) {
  if (!value || value.trim().endsWith('%')) {
    return null
  }
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function svgViewBoxSize(documentXml: Document) {
  const values = documentXml.documentElement.getAttribute('viewBox')?.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? []
  if (values.length === 4 && values[2] > 0 && values[3] > 0) {
    return { x: values[0], y: values[1], width: values[2], height: values[3] }
  }
  return null
}

function svgSourceMetrics(documentXml: Document) {
  const root = documentXml.documentElement
  const viewBox = svgViewBoxSize(documentXml)
  const sourceWidth = svgLengthNumber(root.getAttribute('width')) ?? viewBox?.width ?? 420
  const sourceHeight = svgLengthNumber(root.getAttribute('height')) ?? viewBox?.height ?? 300
  return {
    x: viewBox?.x ?? 0,
    y: viewBox?.y ?? 0,
    width: sourceWidth,
    height: sourceHeight,
    scale: Math.min(640 / sourceWidth, 420 / sourceHeight, 1),
  }
}

function svgImageLayer(name: string, svgText: string, documentXml: Document): RasterLayer {
  const metrics = svgSourceMetrics(documentXml)
  return {
    id: makeId('image'),
    name,
    src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`,
    x: 90,
    y: 90,
    width: Math.max(1, metrics.width * metrics.scale),
    height: Math.max(1, metrics.height * metrics.scale),
  }
}

function transformedSvgBounds(element: SVGGraphicsElement) {
  const box = element.getBBox()
  const matrix = element.getCTM()
  if (!matrix || box.width <= 0 || box.height <= 0) {
    return null
  }
  const points = [
    new DOMPoint(box.x, box.y).matrixTransform(matrix),
    new DOMPoint(box.x + box.width, box.y).matrixTransform(matrix),
    new DOMPoint(box.x, box.y + box.height).matrixTransform(matrix),
    new DOMPoint(box.x + box.width, box.y + box.height).matrixTransform(matrix),
  ]
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  }
}

function cloneSvgElementWithAncestors(element: SVGElement, root: SVGElement) {
  let child = element.cloneNode(true) as SVGElement
  let parent = element.parentNode
  while (parent instanceof SVGElement && parent !== root) {
    const parentClone = parent.cloneNode(false) as SVGElement
    parentClone.appendChild(child)
    child = parentClone
    parent = parent.parentNode
  }
  return child
}

function serializeSvgElementLayer(documentXml: Document, elementIndex: number, bounds: { x: number; y: number; width: number; height: number }) {
  const namespace = 'http://www.w3.org/2000/svg'
  const sourceRoot = documentXml.documentElement as unknown as SVGElement
  const sourceElement = sourceRoot.querySelectorAll(svgGraphicSelector).item(elementIndex) as SVGElement | null
  if (!sourceElement) {
    return null
  }

  const layerDocument = document.implementation.createDocument(namespace, 'svg', null)
  const layerRoot = layerDocument.documentElement
  for (const attribute of Array.from(sourceRoot.attributes)) {
    if (!['width', 'height', 'viewBox', 'x', 'y'].includes(attribute.name)) {
      layerRoot.setAttribute(attribute.name, attribute.value)
    }
  }
  layerRoot.setAttribute('xmlns', namespace)
  layerRoot.setAttribute('width', String(bounds.width))
  layerRoot.setAttribute('height', String(bounds.height))
  layerRoot.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`)

  sourceRoot.querySelectorAll('defs, style').forEach((node) => {
    layerRoot.appendChild(layerDocument.importNode(node, true))
  })
  layerRoot.appendChild(layerDocument.importNode(cloneSvgElementWithAncestors(sourceElement, sourceRoot), true))
  return new XMLSerializer().serializeToString(layerRoot)
}

async function svgElementImageLayers(name: string, svgText: string, documentXml: Document) {
  const metrics = svgSourceMetrics(documentXml)
  const host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.left = '-10000px'
  host.style.top = '-10000px'
  host.style.visibility = 'hidden'
  host.innerHTML = svgText
  document.body.appendChild(host)

  try {
    const liveRoot = host.querySelector('svg')
    const liveElements = Array.from(liveRoot?.querySelectorAll(svgGraphicSelector) ?? []) as SVGGraphicsElement[]
    const layers = liveElements.flatMap((element, index) => {
      const bounds = transformedSvgBounds(element)
      if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
        return []
      }
      const paddedBounds = { x: bounds.x - 2, y: bounds.y - 2, width: bounds.width + 4, height: bounds.height + 4 }
      const layerSvg = serializeSvgElementLayer(documentXml, index, paddedBounds)
      if (!layerSvg) {
        return []
      }
      return [{
        id: makeId('image'),
        name: `${name} ${element.localName} ${index + 1}`,
        src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(layerSvg)}`,
        x: 90 + (paddedBounds.x - metrics.x) * metrics.scale,
        y: 90 + (paddedBounds.y - metrics.y) * metrics.scale,
        width: Math.max(1, paddedBounds.width * metrics.scale),
        height: Math.max(1, paddedBounds.height * metrics.scale),
      }]
    })
    return layers.length > 0 ? layers : [svgImageLayer(name, svgText, documentXml)]
  } finally {
    host.remove()
  }
}

function App() {
  const [initialSettings] = useState(loadSettings)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stageRef = useRef<HTMLElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const fileActionRef = useRef<FileAction>('open')
  const dragRef = useRef<DragState | null>(null)
  const resizeRef = useRef<ResizeState | null>(null)
  const drawingRef = useRef<{ id: string; start: Point } | null>(null)
  const connectorStartRef = useRef<string | null>(null)
  const clipboardRef = useRef<ClipboardState>({ shapes: [], rasters: [] })
  const undoStackRef = useRef<Shape[][]>([])
  const redoStackRef = useRef<Shape[][]>([])
  const unsavedChoiceRef = useRef<((choice: UnsavedChoice) => void) | null>(null)
  const [language, setLanguage] = useState<Language>(initialSettings.language)
  const [theme, setTheme] = useState<Theme>(initialSettings.theme)
  const [tool, setTool] = useState<Tool>('select')
  const [zoom, setZoom] = useState(initialSettings.zoom)
  const [showGrid, setShowGrid] = useState(initialSettings.showGrid)
  const [shapes, setShapes] = useState<Shape[]>([
    { id: makeId('shape'), type: 'rect', name: 'Panel', x: 180, y: 150, width: 260, height: 150, fill: '#67d5b5', stroke: '#173b46', strokeWidth: 4, opacity: 1 },
    { id: makeId('shape'), type: 'ellipse', name: 'Glow', x: 500, y: 210, width: 210, height: 150, fill: '#f4c95d', stroke: '#5c4d18', strokeWidth: 3, opacity: 0.9 },
    { id: makeId('shape'), type: 'text', name: 'Title', x: 260, y: 420, width: 320, height: 48, fill: '#eefaf7', stroke: 'transparent', strokeWidth: 0, opacity: 1, text: 'SVG Editor' },
  ])
  const [rasters, setRasters] = useState<RasterLayer[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
  const [leftWidth, setLeftWidth] = useState(initialSettings.leftWidth)
  const [rightWidth, setRightWidth] = useState(initialSettings.rightWidth)
  const [exportFormat, setExportFormat] = useState<ExportFormat>(initialSettings.exportFormat)
  const [removeBackground, setRemoveBackground] = useState(initialSettings.removeBackground)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showFileMenu, setShowFileMenu] = useState(false)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [hasClipboard, setHasClipboard] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [historyStatus, setHistoryStatus] = useState({ canUndo: false, canRedo: false })
  const [errorDetails, setErrorDetails] = useState<ErrorDetails | null>(null)
  const [errorCopied, setErrorCopied] = useState(false)
  const [canvasCursor, setCanvasCursor] = useState<string | null>(null)
  const [expandedToolGroups, setExpandedToolGroups] = useState<Record<ToolGroupId, boolean>>(initialSettings.expandedToolGroups)
  const [isDirty, setIsDirty] = useState(false)

  const text = messages[language]
  const selectedShape = selectedIds.length === 1 ? shapes.find((shape) => shape.id === selectedIds[0]) : undefined
  const selectedRaster = selectedIds.length === 1 ? rasters.find((raster) => raster.id === selectedIds[0]) : undefined
  const selectedItem = selectedShape ?? selectedRaster
  const toolGroups = useMemo(() => [
    { id: 'basic', label: text.basicTools, tools: ['rect', 'square', 'roundRect', 'ellipse', 'circleShape', 'text', 'pen'] },
    { id: 'advanced', label: text.advancedTools, tools: ['triangle', 'diamondShape', 'pentagon', 'hexagon', 'octagon', 'star', 'trapezoid', 'parallelogram', 'chevron', 'crossShape', 'curve'] },
    { id: 'line', label: text.lineTools, tools: ['line', 'connector'] },
  ] satisfies { id: ToolGroupId; label: string; tools: Tool[] }[], [text.advancedTools, text.basicTools, text.lineTools])
  const svgText = useMemo(() => buildSvg(shapes, rasters, false), [shapes, rasters])
  const statusSelection = selectedIds.length > 1 ? `${selectedIds.length} ${text.selectedCount}` : selectedItem ? `${text.selected}: ${selectedItem.name}` : text.selectedNone
  const gridSize = `${Math.max(8, 40 * zoom)}px`
  const defaultCanvasCursor = tool === 'select' ? 'default' : tool === 'eraser' ? 'not-allowed' : 'crosshair'

  function selectShape(id: string | null) {
    setSelectedIds(id ? [id] : [])
  }

  function selectShapes(ids: string[]) {
    setSelectedIds(ids)
  }

  function formatError(error: unknown) {
    if (error instanceof Error) {
      return `${error.name}: ${error.message}\n\n${error.stack ?? ''}`.trim()
    }
    if (typeof error === 'string') {
      return error
    }
    try {
      return JSON.stringify(error, null, 2)
    } catch {
      return String(error)
    }
  }

  const showError = useCallback((title: string, message: string, error: unknown) => {
    setErrorCopied(false)
    setErrorDetails({ title, message, details: formatError(error) })
  }, [])

  const refreshHistoryStatus = useCallback(() => {
    setHistoryStatus({ canUndo: undoStackRef.current.length > 0, canRedo: redoStackRef.current.length > 0 })
  }, [])

  function remember(snapshot: Shape[]) {
    undoStackRef.current = [...undoStackRef.current.slice(-49), cloneShapes(snapshot)]
    redoStackRef.current = []
    refreshHistoryStatus()
  }

  const updateShapes = useCallback((updater: (current: Shape[]) => Shape[], recordHistory = true) => {
    setShapes((current) => {
      if (recordHistory) {
        undoStackRef.current = [...undoStackRef.current.slice(-49), cloneShapes(current)]
        redoStackRef.current = []
        refreshHistoryStatus()
        setIsDirty(true)
      }
      return updater(current)
    })
  }, [refreshHistoryStatus])

  const undo = useCallback(() => {
    const previous = undoStackRef.current.at(-1)
    if (!previous) {
      return
    }
    undoStackRef.current = undoStackRef.current.slice(0, -1)
    redoStackRef.current = [...redoStackRef.current, cloneShapes(shapes)]
    setShapes(cloneShapes(previous))
    selectShapes([])
    refreshHistoryStatus()
  }, [refreshHistoryStatus, shapes])

  const redo = useCallback(() => {
    const next = redoStackRef.current.at(-1)
    if (!next) {
      return
    }
    redoStackRef.current = redoStackRef.current.slice(0, -1)
    undoStackRef.current = [...undoStackRef.current, cloneShapes(shapes)]
    setShapes(cloneShapes(next))
    selectShapes([])
    refreshHistoryStatus()
  }, [refreshHistoryStatus, shapes])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    const settings: AppSettings = {
      language,
      theme,
      zoom,
      showGrid,
      leftWidth,
      rightWidth,
      exportFormat,
      removeBackground,
      expandedToolGroups,
    }
    window.localStorage.setItem(settingsStorageKey, JSON.stringify(settings))
  }, [expandedToolGroups, exportFormat, language, leftWidth, removeBackground, rightWidth, showGrid, theme, zoom])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) {
      return
    }

    const ratio = window.devicePixelRatio || 1
    canvas.width = canvasSize.width * ratio
    canvas.height = canvasSize.height * ratio
    canvas.style.width = `${canvasSize.width * zoom}px`
    canvas.style.height = `${canvasSize.height * zoom}px`
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, canvasSize.width, canvasSize.height)

    const drawRasters = async () => {
      for (const raster of rasters) {
        const image = await loadImage(raster.src)
        context.drawImage(image, raster.x, raster.y, raster.width, raster.height)
      }
      shapes.forEach((shape) => drawShape(context, shape, selectedIds.includes(shape.id), shapes))
      rasters.filter((raster) => selectedIds.includes(raster.id)).forEach((raster) => drawSelectionBounds(context, rasterBounds(raster)))
      if (selectionBox) {
        const bounds = selectionBounds(selectionBox)
        context.save()
        context.fillStyle = 'rgba(103, 213, 181, 0.12)'
        context.strokeStyle = '#67d5b5'
        context.lineWidth = 1.5
        context.setLineDash([6, 4])
        context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height)
        context.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height)
        context.restore()
      }
    }

    void drawRasters()
  }, [shapes, rasters, selectedIds, selectionBox, zoom])

  useEffect(() => {
    const closeMenu = () => {
      setContextMenu(null)
      setShowFileMenu(false)
    }
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [])

  function getCanvasPoint(event: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvasSize.width,
      y: ((event.clientY - rect.top) / rect.height) * canvasSize.height,
    }
  }

  function createShape(start: Point, end: Point): Shape {
    const rect = normalizeRect(start, end)
    if (tool === 'line') {
      return { id: makeId('shape'), type: 'line', name: text.line, x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y, fill: 'transparent', stroke: '#67d5b5', strokeWidth: 4, opacity: 1 }
    }
    if (tool === 'curve') {
      return { id: makeId('shape'), type: 'curve', name: text.curve, ...rect, fill: 'transparent', stroke: '#7dd3fc', strokeWidth: 4, opacity: 1 }
    }
    if (tool === 'pen') {
      return { id: makeId('shape'), type: 'pen', name: text.pen, x: start.x, y: start.y, width: 1, height: 1, points: [start, end], fill: 'transparent', stroke: '#f4c95d', strokeWidth: 4, opacity: 1 }
    }
    if (tool === 'text') {
      return { id: makeId('shape'), type: 'text', name: text.text, x: start.x, y: start.y, width: 260, height: 52, text: language === 'ko' ? '텍스트' : 'Text', fontFamily: 'Arial, sans-serif', fontSize: 32, fontWeight: '400', fontStyle: 'normal', textAlign: 'left', fill: '#eefaf7', stroke: 'transparent', strokeWidth: 0, opacity: 1 }
    }
    if (tool === 'connector') {
      return { id: makeId('shape'), type: 'connector', name: text.connector, x: start.x, y: start.y, width: end.x - start.x, height: end.y - start.y, fill: 'transparent', stroke: '#67d5b5', strokeWidth: 4, opacity: 1, lineStyle: 'straight', startMarker: 'none', endMarker: 'arrow' }
    }
    if (tool === 'square' || tool === 'circleShape') {
      return { id: makeId('shape'), type: tool, name: text[tool], ...normalizeSquareRect(start, end), fill: tool === 'square' ? '#67d5b5' : '#f4c95d', stroke: '#173b46', strokeWidth: 3, opacity: 1 }
    }
    if (tool === 'roundRect') {
      return { id: makeId('shape'), type: tool, name: text[tool], ...rect, fill: '#67d5b5', stroke: '#173b46', strokeWidth: 3, opacity: 1 }
    }
    if (tool === 'triangle' || tool === 'diamondShape' || tool === 'pentagon' || tool === 'hexagon' || tool === 'octagon' || tool === 'star' || tool === 'trapezoid' || tool === 'parallelogram' || tool === 'chevron' || tool === 'crossShape') {
      return { id: makeId('shape'), type: tool, name: text[tool], ...rect, fill: '#7dd3fc', stroke: '#0f3d66', strokeWidth: 3, opacity: 1 }
    }
    return { id: makeId('shape'), type: tool === 'ellipse' ? 'ellipse' : 'rect', name: tool === 'rect' ? text.rect : text.ellipse, ...rect, fill: tool === 'rect' ? '#67d5b5' : '#f4c95d', stroke: '#173b46', strokeWidth: 3, opacity: 1 }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const point = getCanvasPoint(event)
    setContextMenu(null)

    if (tool === 'connector') {
      const target = [...shapes].reverse().find((shape) => shape.type !== 'connector' && isPointInShape(point, shape))
      if (!target) {
        return
      }
      if (!connectorStartRef.current) {
        connectorStartRef.current = target.id
        selectShape(target.id)
        return
      }
      const from = shapes.find((shape) => shape.id === connectorStartRef.current)
      if (!from || from.id === target.id) {
        connectorStartRef.current = target.id
        selectShape(target.id)
        return
      }
      const { start, end } = getConnectorPoints({ ...createShape(point, point), fromId: from.id, toId: target.id }, shapes)
      const connector: Shape = { id: makeId('shape'), type: 'connector', name: `${from.name} -> ${target.name}`, x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y), fill: 'transparent', stroke: '#67d5b5', strokeWidth: 4, opacity: 1, fromId: from.id, toId: target.id, lineStyle: 'straight', startMarker: 'none', endMarker: 'arrow' }
      updateShapes((current) => [...current, connector])
      selectShape(connector.id)
      connectorStartRef.current = null
      setTool('select')
      setCanvasCursor(null)
      return
    }

    if (tool === 'select' || tool === 'eraser') {
      const selectedResizeTarget = selectedIds.length === 1 ? shapes.find((shape) => shape.id === selectedIds[0] && shape.type !== 'connector') : undefined
      const selectedRasterResizeTarget = selectedIds.length === 1 ? rasters.find((raster) => raster.id === selectedIds[0]) : undefined
      const selectedResizeAnchor = selectedResizeTarget ? getResizeHandleAt(point, selectedResizeTarget) : null
      if (tool === 'select' && selectedResizeTarget && selectedResizeAnchor) {
        remember(shapes)
        resizeRef.current = { kind: 'shape', id: selectedResizeTarget.id, anchor: selectedResizeAnchor }
        return
      }
      const selectedRasterResizeAnchor = selectedRasterResizeTarget ? getRasterResizeHandleAt(point, selectedRasterResizeTarget) : null
      if (tool === 'select' && selectedRasterResizeTarget && selectedRasterResizeAnchor) {
        setIsDirty(true)
        resizeRef.current = { kind: 'raster', id: selectedRasterResizeTarget.id, anchor: selectedRasterResizeAnchor }
        return
      }

      const targetShape = [...shapes].reverse().find((shape) => isPointInShape(point, shape))
      const targetRaster = targetShape ? undefined : [...rasters].reverse().find((raster) => isPointInRaster(point, raster))
      const target = targetShape ?? targetRaster
      if (tool === 'eraser' && target) {
        if (targetShape) {
          updateShapes((current) => current.filter((shape) => shape.id !== target.id))
        } else {
          setRasters((current) => current.filter((raster) => raster.id !== target.id))
          setIsDirty(true)
        }
        selectShapes([])
        return
      }
      if (!target) {
        selectShapes([])
        setSelectionBox({ start: point, current: point })
        return
      }
      if (!selectedIds.includes(target.id)) {
        selectShape(target.id)
      }
      if (target) {
        const resizeAnchor = targetShape && targetShape.type !== 'connector' ? getResizeHandleAt(point, targetShape) : targetRaster ? getRasterResizeHandleAt(point, targetRaster) : null
        if (resizeAnchor && targetShape) {
          remember(shapes)
          resizeRef.current = { kind: 'shape', id: target.id, anchor: resizeAnchor }
          return
        }
        if (resizeAnchor && targetRaster) {
          setIsDirty(true)
          resizeRef.current = { kind: 'raster', id: target.id, anchor: resizeAnchor }
          return
        }
        if (targetShape) {
          remember(shapes)
          dragRef.current = { kind: 'shape', id: target.id, start: point, original: targetShape }
        } else if (targetRaster) {
          setIsDirty(true)
          dragRef.current = { kind: 'raster', id: target.id, start: point, original: targetRaster }
        }
      }
      return
    }

    const shape = createShape(point, point)
    updateShapes((current) => [...current, shape])
    selectShape(shape.id)
    drawingRef.current = { id: shape.id, start: point }
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const point = getCanvasPoint(event)
    if (dragRef.current) {
      setCanvasCursor('grabbing')
      const { kind, id, start, original } = dragRef.current
      const dx = point.x - start.x
      const dy = point.y - start.y
      if (kind === 'shape') {
        const originalShape = original as Shape
        updateShapes((current) => current.map((shape) => shape.id === id ? { ...shape, x: originalShape.x + dx, y: originalShape.y + dy, points: originalShape.points?.map((oldPoint) => ({ x: oldPoint.x + dx, y: oldPoint.y + dy })) } : shape), false)
      } else {
        setRasters((current) => current.map((raster) => raster.id === id ? { ...raster, x: original.x + dx, y: original.y + dy } : raster))
      }
    }

    if (resizeRef.current) {
      const { kind, id, anchor } = resizeRef.current
      setCanvasCursor(resizeCursor(anchor))
      if (kind === 'shape') {
        updateShapes((current) => current.map((shape) => shape.id === id ? resizeShape(shape, anchor, point) : shape), false)
      } else {
        setRasters((current) => current.map((raster) => raster.id === id ? resizeRaster(raster, anchor, point) : raster))
      }
    }

    if (drawingRef.current) {
      const { id, start } = drawingRef.current
      updateShapes((current) => current.map((shape) => {
        if (shape.id !== id) {
          return shape
        }
        if (shape.type === 'pen') {
          const points = [...(shape.points ?? [start]), point]
          const bounds = getSceneBounds([{ ...shape, points }], [])
          return { ...shape, points, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
        }
        if (shape.type === 'line') {
          return { ...shape, width: point.x - start.x, height: point.y - start.y }
        }
        if (shape.type === 'text') {
          return shape
        }
        return { ...shape, ...normalizeRect(start, point) }
      }), false)
    }

    if (selectionBox) {
      setSelectionBox((current) => current ? { ...current, current: point } : current)
    }

    if (!dragRef.current && !resizeRef.current && !drawingRef.current && !selectionBox) {
      if (tool === 'select') {
        const resizeTarget = selectedIds.length === 1 ? shapes.find((shape) => shape.id === selectedIds[0] && shape.type !== 'connector') : undefined
        const rasterResizeTarget = selectedIds.length === 1 ? rasters.find((raster) => raster.id === selectedIds[0]) : undefined
        const resizeAnchor = resizeTarget ? getResizeHandleAt(point, resizeTarget) : null
        const rasterResizeAnchor = rasterResizeTarget ? getRasterResizeHandleAt(point, rasterResizeTarget) : null
        if (resizeAnchor || rasterResizeAnchor) {
          setCanvasCursor(resizeCursor((resizeAnchor ?? rasterResizeAnchor) as ResizeAnchor))
          return
        }
        const targetShape = [...shapes].reverse().find((shape) => isPointInShape(point, shape))
        const targetRaster = targetShape ? undefined : [...rasters].reverse().find((raster) => isPointInRaster(point, raster))
        setCanvasCursor(targetShape || targetRaster ? 'grab' : 'default')
        return
      }
      setCanvasCursor(tool === 'eraser' ? 'not-allowed' : 'crosshair')
    }
  }

  function handlePointerUp() {
    if (selectionBox) {
      const bounds = selectionBounds(selectionBox)
      const ids = [
        ...shapes.filter((shape) => rectsIntersect(bounds, shapeBounds(shape))).map((shape) => shape.id),
        ...rasters.filter((raster) => rectsIntersect(bounds, rasterBounds(raster))).map((raster) => raster.id),
      ]
      selectShapes(ids)
      setSelectionBox(null)
    }
    const finishedDrawing = Boolean(drawingRef.current)
    dragRef.current = null
    resizeRef.current = null
    drawingRef.current = null
    if (finishedDrawing) {
      setTool('select')
      setCanvasCursor(null)
    }
  }

  function handlePointerLeave() {
    handlePointerUp()
    setCanvasCursor(null)
  }

  function handleCanvasContextMenu(event: React.MouseEvent<HTMLCanvasElement>) {
    event.preventDefault()
    const point = getCanvasPoint(event)
    const target = [...shapes].reverse().find((shape) => isPointInShape(point, shape)) ?? [...rasters].reverse().find((raster) => isPointInRaster(point, raster))
    if (target && !selectedIds.includes(target.id)) {
      selectShape(target.id)
    }
    if (target || selectedIds.length > 0) {
      setContextMenu({ x: event.clientX, y: event.clientY })
    }
  }

  async function handleFiles(files: FileList | null, action: FileAction = fileActionRef.current) {
    if (!files?.length) {
      return
    }

    const importedShapes: Shape[] = []
    const importedRasters: RasterLayer[] = []

    for (const file of Array.from(files)) {
      try {
        if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
          const svgText = await file.text()
          const parsed = parseSvgImport(svgText)
          if (parsed.shapes.length > 0) {
            importedShapes.push(...parsed.shapes)
            continue
          }

          importedRasters.push(...await svgElementImageLayers(file.name, svgText, parsed.documentXml))
          continue
        }

        if (file.name.toLowerCase().endsWith('.tif') || file.name.toLowerCase().endsWith('.tiff')) {
          const buffer = await file.arrayBuffer()
          const ifds = UTIF.decode(buffer)
          UTIF.decodeImage(buffer, ifds[0])
          const rgba = UTIF.toRGBA8(ifds[0])
          const width = Number(ifds[0].width || 1)
          const height = Number(ifds[0].height || 1)
          const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height)
          const tempCanvas = document.createElement('canvas')
          tempCanvas.width = imageData.width
          tempCanvas.height = imageData.height
          tempCanvas.getContext('2d')?.putImageData(imageData, 0, 0)
          importedRasters.push({ id: makeId('image'), name: file.name, src: tempCanvas.toDataURL('image/png'), x: 100, y: 100, width: Math.min(520, imageData.width), height: Math.min(360, imageData.height) })
          continue
        }

        const src = URL.createObjectURL(file)
        const image = await loadImage(src)
        importedRasters.push({ id: makeId('image'), name: file.name, src, x: 110, y: 110, width: Math.min(640, image.naturalWidth), height: Math.min(420, image.naturalHeight) })
      } catch (error) {
        showError(text.errorTitle, text.fileReadError, error)
      }
    }

    if (action === 'open') {
      undoStackRef.current = []
      redoStackRef.current = []
      setShapes(importedShapes)
      setRasters(importedRasters)
      selectShapes([...importedShapes.map((shape) => shape.id), ...importedRasters.map((raster) => raster.id)])
      refreshHistoryStatus()
      setIsDirty(false)
      return
    }

    if (importedShapes.length > 0) {
      updateShapes((current) => [...current, ...importedShapes])
    }
    if (importedRasters.length > 0) {
      setRasters((current) => [...current, ...importedRasters])
      setIsDirty(true)
    }
    if (importedShapes.length > 0) {
      selectShapes(importedShapes.map((shape) => shape.id))
    } else if (importedRasters.length > 0) {
      selectShapes(importedRasters.map((raster) => raster.id))
    }
  }

  function updateSelected(patch: Partial<Shape & RasterLayer>) {
    if (selectedIds.length !== 1) {
      return
    }
    if (selectedShape) {
      updateShapes((current) => current.map((shape) => shape.id === selectedIds[0] ? { ...shape, ...patch } : shape))
      return
    }
    if (selectedRaster) {
      setRasters((current) => current.map((raster) => raster.id === selectedIds[0] ? { ...raster, ...patch } : raster))
      setIsDirty(true)
    }
  }

  function duplicateSelected() {
    const selected = shapes.filter((shape) => selectedIds.includes(shape.id))
    const selectedImages = rasters.filter((raster) => selectedIds.includes(raster.id))
    if (selected.length === 0 && selectedImages.length === 0) {
      return
    }
    const clones = selected.map((shape) => ({ ...shape, id: makeId('shape'), name: `${shape.name} copy`, x: shape.x + 24, y: shape.y + 24, points: shape.points?.map((point) => ({ x: point.x + 24, y: point.y + 24 })) }))
    const imageClones = selectedImages.map((raster) => ({ ...raster, id: makeId('image'), name: `${raster.name} copy`, x: raster.x + 24, y: raster.y + 24 }))
    if (clones.length > 0) {
      updateShapes((current) => [...current, ...clones])
    }
    if (imageClones.length > 0) {
      setRasters((current) => [...current, ...imageClones])
      setIsDirty(true)
    }
    selectShapes([...clones.map((shape) => shape.id), ...imageClones.map((raster) => raster.id)])
  }

  const copySelected = useCallback(() => {
    const nextClipboard = {
      shapes: cloneShapes(shapes.filter((shape) => selectedIds.includes(shape.id))),
      rasters: rasters.filter((raster) => selectedIds.includes(raster.id)).map((raster) => ({ ...raster })),
    }
    clipboardRef.current = nextClipboard
    setHasClipboard(nextClipboard.shapes.length > 0 || nextClipboard.rasters.length > 0)
  }, [rasters, selectedIds, shapes])

  const pasteClipboard = useCallback(() => {
    const copiedShapes = clipboardRef.current.shapes
    const copiedRasters = clipboardRef.current.rasters
    if (copiedShapes.length === 0 && copiedRasters.length === 0) {
      return
    }

    const pastedShapes = copiedShapes.map((shape) => ({ ...shape, id: makeId('shape'), name: `${shape.name} copy`, x: shape.x + 24, y: shape.y + 24, points: shape.points?.map((point) => ({ x: point.x + 24, y: point.y + 24 })) }))
    const pastedRasters = copiedRasters.map((raster) => ({ ...raster, id: makeId('image'), name: `${raster.name} copy`, x: raster.x + 24, y: raster.y + 24 }))
    clipboardRef.current = { shapes: cloneShapes(pastedShapes), rasters: pastedRasters.map((raster) => ({ ...raster })) }
    setHasClipboard(true)
    if (pastedShapes.length > 0) {
      updateShapes((current) => [...current, ...pastedShapes])
    }
    if (pastedRasters.length > 0) {
      setRasters((current) => [...current, ...pastedRasters])
      setIsDirty(true)
    }
    selectShapes([...pastedShapes.map((shape) => shape.id), ...pastedRasters.map((raster) => raster.id)])
  }, [updateShapes])

  const deleteSelected = useCallback(() => {
    const ids = new Set(selectedIds)
    updateShapes((current) => current.filter((shape) => !ids.has(shape.id)))
    setRasters((current) => current.filter((raster) => !ids.has(raster.id)))
    selectShapes([])
  }, [selectedIds, updateShapes])

  function moveLayer(direction: 'front' | 'back') {
    if (selectedIds.length === 0) {
      return
    }
    const ids = new Set(selectedIds)
    updateShapes((current) => {
      const selected = current.filter((shape) => ids.has(shape.id))
      if (selected.length === 0) {
        return current
      }
      const rest = current.filter((shape) => !ids.has(shape.id))
      return direction === 'front' ? [...rest, ...selected] : [...selected, ...rest]
    })
    setRasters((current) => {
      const selected = current.filter((raster) => ids.has(raster.id))
      if (selected.length === 0) {
        return current
      }
      const rest = current.filter((raster) => !ids.has(raster.id))
      return direction === 'front' ? [...rest, ...selected] : [...selected, ...rest]
    })
  }

  function resolveUnsavedChoice(choice: UnsavedChoice) {
    setShowUnsavedDialog(false)
    unsavedChoiceRef.current?.(choice)
    unsavedChoiceRef.current = null
  }

  function askUnsavedChanges() {
    if (!isDirty || (shapes.length === 0 && rasters.length === 0)) {
      return Promise.resolve<UnsavedChoice>('discard')
    }
    setShowUnsavedDialog(true)
    return new Promise<UnsavedChoice>((resolve) => {
      unsavedChoiceRef.current = resolve
    })
  }

  async function confirmDocumentReplacement() {
    const choice = await askUnsavedChanges()
    if (choice === 'cancel') {
      return false
    }
    if (choice === 'save') {
      return exportFile('svg')
    }
    return true
  }

  async function createNewFile() {
    if (!await confirmDocumentReplacement()) {
      return
    }
    undoStackRef.current = []
    redoStackRef.current = []
    setShapes([])
    setRasters([])
    selectShapes([])
    setSelectionBox(null)
    setContextMenu(null)
    setTool('select')
    refreshHistoryStatus()
    setIsDirty(false)
  }

  async function openFile() {
    if (!await confirmDocumentReplacement()) {
      return
    }
    fileActionRef.current = 'open'
    fileInputRef.current?.click()
  }

  function addFile() {
    fileActionRef.current = 'append'
    fileInputRef.current?.click()
  }

  function handleExternalDrag(event: React.DragEvent<HTMLElement>) {
    if (Array.from(event.dataTransfer.types).includes('Files')) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
      setIsDraggingFile(true)
    }
  }

  function handleExternalDragLeave(event: React.DragEvent<HTMLElement>) {
    const nextTarget = event.relatedTarget as Node | null
    if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
      setIsDraggingFile(false)
    }
  }

  function handleExternalDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault()
    setIsDraggingFile(false)
    if (event.dataTransfer.files.length > 0) {
      void handleFiles(event.dataTransfer.files, 'append')
    }
  }

  const exportFile = useCallback(async (format: ExportFormat) => {
    if (format === 'svg') {
      downloadBlob(new Blob([buildSvg(shapes, rasters, removeBackground)], { type: 'image/svg+xml' }), 'svg-editor-export.svg')
      setIsDirty(false)
      return true
    }

    const mime = format === 'jpg' ? 'image/jpeg' : format === 'tiff' ? 'image/tiff' : `image/${format}`
    const needsOpaqueBackground = format === 'jpg'
    const canvas = await renderSceneToCanvas(shapes, rasters, removeBackground, needsOpaqueBackground ? '#ffffff' : removeBackground ? null : theme === 'dark' ? '#182129' : '#ffffff')

    if (format === 'tiff') {
      const context = canvas.getContext('2d')
      const image = context?.getImageData(0, 0, canvas.width, canvas.height)
      if (image) {
        const tiff = UTIF.encodeImage(new Uint8Array(image.data), canvas.width, canvas.height)
        downloadBlob(new Blob([tiff], { type: 'image/tiff' }), 'svg-editor-export.tiff')
        return true
      }
      return false
    }

    return new Promise<boolean>((resolve) => canvas.toBlob((blob) => {
      if (!blob || (blob.type && blob.type !== mime && format !== 'jpg')) {
        showError(text.errorTitle, text.exportFallback, new Error(`Requested ${mime}, received ${blob?.type || 'no blob'}.`))
        canvas.toBlob((fallback) => {
          if (fallback) {
            downloadBlob(fallback, 'svg-editor-export.png')
          }
          resolve(Boolean(fallback))
        }, 'image/png')
        return
      }
      downloadBlob(blob, `svg-editor-export.${format}`)
      resolve(true)
    }, mime, 0.92))
  }, [rasters, removeBackground, shapes, showError, text.errorTitle, text.exportFallback, theme])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.key === 'Escape') {
        dragRef.current = null
        resizeRef.current = null
        drawingRef.current = null
        connectorStartRef.current = null
        setSelectionBox(null)
        setCanvasCursor(null)
        setShowFileMenu(false)
        setTool('select')
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void exportFile('svg')
        return
      }
      if (target?.matches('input, textarea, select')) {
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        copySelected()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        pasteClipboard()
        return
      }
      if (event.key === 'Delete' && selectedIds.length > 0) {
        event.preventDefault()
        deleteSelected()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          redo()
        } else {
          undo()
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [copySelected, deleteSelected, exportFile, pasteClipboard, redo, selectedIds.length, undo])

  function handlePanelResize(side: 'left' | 'right', event: React.PointerEvent<HTMLDivElement>) {
    const startX = event.clientX
    const startWidth = side === 'left' ? leftWidth : rightWidth
    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX
      if (side === 'left') {
        setLeftWidth(Math.min(maxLeftPanelWidth, Math.max(currentLeftPanelWidth, startWidth + delta)))
      } else {
        setRightWidth(Math.min(maxRightPanelWidth, Math.max(minRightPanelWidth, startWidth - delta)))
      }
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function resetView() {
    const bounds = getSceneBounds(shapes, rasters)
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
    setZoom(1)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const stage = stageRef.current
        const canvas = canvasRef.current
        if (!stage || !canvas) {
          return
        }
        stage.scrollTo({
          left: Math.max(0, canvas.offsetLeft + center.x - stage.clientWidth / 2),
          top: Math.max(0, canvas.offsetTop + center.y - stage.clientHeight / 2),
          behavior: 'smooth',
        })
      })
    })
  }

  return (
    <main className={`app-shell ${isDraggingFile ? 'drag-over' : ''}`} onDragEnter={handleExternalDrag} onDragOver={handleExternalDrag} onDragLeave={handleExternalDragLeave} onDrop={handleExternalDrop}>
      <input ref={fileInputRef} className="hidden-input" type="file" multiple accept=".svg,.jpg,.jpeg,.gif,.tif,.tiff,.png,.webp,.avif,image/*" onChange={(event) => { void handleFiles(event.target.files); event.target.value = '' }} />
      <header className="toolbar">
        <div className="brand" title={text.appName}>
          <img src="/app-icon.svg" alt="" />
          <span>{text.appName}</span>
        </div>
        <div className="toolbar-group file-toolbar" onClick={(event) => event.stopPropagation()}>
          <button className={showFileMenu ? 'active' : ''} title={text.file} onClick={() => setShowFileMenu((value) => !value)}><FileImage size={18} /><span>{text.file}</span><ChevronDown size={15} /></button>
          {showFileMenu && <div className="file-menu">
            <button onClick={() => { setShowFileMenu(false); void createNewFile() }}><Plus size={16} /><span>{text.newFile}</span></button>
            <button onClick={() => { setShowFileMenu(false); void openFile() }}><ImagePlus size={16} /><span>{text.open}</span></button>
            <button onClick={() => { setShowFileMenu(false); addFile() }}><FileImage size={16} /><span>{text.add}</span></button>
            <div className="file-menu-separator" />
            <button onClick={() => { setShowFileMenu(false); void exportFile('svg') }}><Save size={16} /><span>{text.saveSvg}</span><kbd>Ctrl+S</kbd></button>
            <button onClick={() => { setShowFileMenu(false); void exportFile(exportFormat) }}><Download size={16} /><span>{text.exportFormatFile}</span></button>
            <button onClick={() => { setShowFileMenu(false); setShowExportDialog(true) }}><Download size={16} /><span>{text.exportOptions}</span></button>
            <label className="file-menu-format">{text.format}<select title={text.format} value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ExportFormat)}>
              {(['png', 'jpg', 'webp', 'avif', 'gif', 'tiff', 'svg'] as ExportFormat[]).map((format) => <option key={format} value={format}>{format.toUpperCase()}</option>)}
            </select></label>
            <div className="file-menu-separator" />
            <button disabled={selectedIds.length === 0} onClick={() => { copySelected(); setShowFileMenu(false) }}><Copy size={16} /><span>{text.copy}</span><kbd>Ctrl+C</kbd></button>
            <button disabled={!hasClipboard} onClick={() => { pasteClipboard(); setShowFileMenu(false) }}><ClipboardPaste size={16} /><span>{text.paste}</span><kbd>Ctrl+V</kbd></button>
          </div>}
        </div>
        <div className="toolbar-group">
          <button title={text.undo} disabled={!historyStatus.canUndo} onClick={undo}><Undo2 size={18} /><span>{text.undo}</span></button>
          <button title={text.redo} disabled={!historyStatus.canRedo} onClick={redo}><Redo2 size={18} /><span>{text.redo}</span></button>
        </div>
        <div className="toolbar-group">
          <button title={text.zoomOut} onClick={() => setZoom((value) => Math.max(0.25, value - 0.1))}><Minus size={18} /></button>
          <button className="zoom-readout" title={text.resetZoom} onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
          <button title={text.resetZoom} onClick={resetView}><RotateCcw size={18} /><span>{text.resetView}</span></button>
          <button title={text.zoomIn} onClick={() => setZoom((value) => Math.min(2.5, value + 0.1))}><Plus size={18} /></button>
          <button className={showGrid ? 'active' : ''} title={text.grid} onClick={() => setShowGrid((value) => !value)}><Grid3X3 size={18} /></button>
        </div>
        <div className="toolbar-spacer" />
        <div className="toolbar-group">
          <button title={text.language} onClick={() => setLanguage((value) => value === 'ko' ? 'en' : 'ko')}><Languages size={18} /><span>{language === 'ko' ? '영어' : '한글'}</span></button>
          <button title={text.theme} onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}<span>{theme === 'dark' ? 'Light' : 'Dark'}</span></button>
          <button title={text.about} onClick={() => setShowAbout(true)}><Info size={18} /></button>
        </div>
        <div className="window-controls" aria-label="Window controls">
          <button title={text.minimize} onClick={() => void window.electronWindowApi?.minimize()}><Minus size={16} /></button>
          <button title={text.maximize} onClick={() => void window.electronWindowApi?.toggleMaximize()}><Square size={14} /></button>
          <button className="window-close" title={text.closeWindow} onClick={() => void window.electronWindowApi?.close()}><X size={16} /></button>
        </div>
      </header>

      <section className="workspace" style={{ gridTemplateColumns: `${leftWidth}px 8px minmax(0, 1fr) 8px ${rightWidth}px` }}>
        <aside className="panel left-panel">
          <h2>{text.tools}</h2>
          <div className="primary-tools">
            <button className={`primary-tool ${tool === 'select' ? 'active' : ''}`} title={text.select} onClick={() => setTool('select')}><MousePointer2 size={20} /><span>{text.select}</span></button>
            <button className={`primary-tool ${tool === 'eraser' ? 'active' : ''}`} title={text.eraser} onClick={() => setTool('eraser')}><Eraser size={20} /><span>{text.eraser}</span></button>
          </div>
          <div className="tool-groups">
            {toolGroups.map((group) => <section className="tool-group" key={group.id}>
              <button className="tool-group-title" type="button" aria-expanded={expandedToolGroups[group.id]} onClick={() => setExpandedToolGroups((current) => ({ ...current, [group.id]: !current[group.id] }))}>
                <span>{expandedToolGroups[group.id] ? '-' : '+'}</span>
                <span>{group.label}</span>
              </button>
              {expandedToolGroups[group.id] && <div className="tool-grid">
                {group.tools.map((toolName) => {
                  const Icon = toolIcons[toolName]
                  return <button key={toolName} className={tool === toolName ? 'active' : ''} title={text[toolName]} onClick={() => setTool(toolName)}><Icon size={20} /><span>{text[toolName]}</span></button>
                })}
              </div>}
            </section>)}
          </div>
        </aside>
        <div className="resize-handle" onPointerDown={(event) => handlePanelResize('left', event)} />
        <section ref={stageRef} className={`canvas-stage ${showGrid ? 'show-grid' : ''}`} style={{ '--grid-size': gridSize } as React.CSSProperties} aria-label={text.canvas} onWheel={(event) => { setZoom((value) => Math.min(2.5, Math.max(0.25, value - event.deltaY * 0.001))) }}>
          <canvas ref={canvasRef} style={{ cursor: canvasCursor ?? defaultCanvasCursor }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerLeave} onContextMenu={handleCanvasContextMenu} />
          {contextMenu && <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
            <button onClick={duplicateSelected}><AlignCenter size={15} />{text.duplicate}</button>
            <button onClick={() => moveLayer('front')}><BringToFront size={15} />{text.front}</button>
            <button onClick={() => moveLayer('back')}><SendToBack size={15} />{text.back}</button>
            <button onClick={deleteSelected}><Trash2 size={15} />{text.delete}</button>
          </div>}
        </section>
        <div className="resize-handle" onPointerDown={(event) => handlePanelResize('right', event)} />
        <aside className="panel properties-panel">
          <section className="svg-source-panel">
            <h3>{text.svgText}</h3>
            <textarea readOnly value={svgText} spellCheck={false} />
          </section>
          {selectedItem && <section className="selected-properties">
            <h2><Settings2 size={18} />{text.properties}</h2>
            <div className="property-stack">
              <p className="selection-label">{text.selected}: {selectedItem.name}</p>
              <label>{text.name}<input value={selectedItem.name} onChange={(event) => updateSelected({ name: event.target.value })} /></label>
              <div className="geometry-grid">
                <label>X<input type="number" value={Math.round(selectedItem.x)} onChange={(event) => updateSelected({ x: Number(event.target.value) })} /></label>
                <label>Y<input type="number" value={Math.round(selectedItem.y)} onChange={(event) => updateSelected({ y: Number(event.target.value) })} /></label>
                <label>W<input type="number" value={Math.round(selectedItem.width)} onChange={(event) => updateSelected({ width: Number(event.target.value) })} /></label>
                <label>H<input type="number" value={Math.round(selectedItem.height)} onChange={(event) => updateSelected({ height: Number(event.target.value) })} /></label>
              </div>
              {selectedShape && selectedShape.type === 'text' && <div className="text-controls">
                <label>{text.text}<input value={selectedShape.text ?? ''} onChange={(event) => updateSelected({ text: event.target.value })} /></label>
                <label>{text.fontFamily}<select value={selectedShape.fontFamily ?? 'Arial, sans-serif'} onChange={(event) => updateSelected({ fontFamily: event.target.value })}>
                  {fontOptions.map((font) => <option key={font} value={font}>{font.split(',')[0]}</option>)}
                </select></label>
                <label>{text.fontSize}<span className="range-field"><input type="range" min="10" max="96" value={selectedShape.fontSize ?? 32} onChange={(event) => updateSelected({ fontSize: Number(event.target.value), height: Number(event.target.value) + 20 })} /><span className="range-value">{selectedShape.fontSize ?? 32}px</span></span></label>
                <div className="text-style-grid">
                  <label>{text.fontWeight}<select value={selectedShape.fontWeight ?? '400'} onChange={(event) => updateSelected({ fontWeight: event.target.value })}>
                    <option value="400">{text.normal}</option>
                    <option value="700">{text.bold}</option>
                  </select></label>
                  <label>{text.fontStyle}<select value={selectedShape.fontStyle ?? 'normal'} onChange={(event) => updateSelected({ fontStyle: event.target.value })}>
                    <option value="normal">{text.normal}</option>
                    <option value="italic">{text.italic}</option>
                  </select></label>
                  <label>{text.textAlign}<select value={selectedShape.textAlign ?? 'left'} onChange={(event) => updateSelected({ textAlign: event.target.value as TextAlign })}>
                    <option value="left">{text.alignLeft}</option>
                    <option value="center">{text.alignCenter}</option>
                    <option value="right">{text.alignRight}</option>
                  </select></label>
                </div>
              </div>}
              {selectedShape && <>
              <label>{text.fill}<input type="color" value={selectedShape.fill === 'transparent' ? '#ffffff' : selectedShape.fill} onChange={(event) => updateSelected({ fill: event.target.value })} /></label>
              <label>{text.stroke}<input type="color" value={selectedShape.stroke === 'transparent' ? '#000000' : selectedShape.stroke} onChange={(event) => updateSelected({ stroke: event.target.value })} /></label>
              <label>{text.strokeWidth}<span className="range-field"><input type="range" min="0" max="24" value={selectedShape.strokeWidth} onChange={(event) => updateSelected({ strokeWidth: Number(event.target.value) })} /><span className="range-value">{selectedShape.strokeWidth}px</span></span></label>
              <label>{text.opacity}<span className="range-field"><input type="range" min="0.1" max="1" step="0.05" value={selectedShape.opacity} onChange={(event) => updateSelected({ opacity: Number(event.target.value) })} /><span className="range-value">{Math.round(selectedShape.opacity * 100)}%</span></span></label>
              <label>{text.shadowEffect}<select value={selectedShape.shadowEffect ?? 'none'} onChange={(event) => {
                const effect = event.target.value as ShadowEffect
                const preset = effect === 'none' ? null : shadowPresets[effect]
                updateSelected(preset ? { shadowEffect: effect, shadowDirection: preset.direction, shadowDistance: preset.distance, shadowBlur: preset.blur, shadowColor: preset.color, shadowOpacity: preset.opacity } : { shadowEffect: 'none' })
              }}>
                {shadowOptions.map((effect) => <option key={effect} value={effect}>{text[shadowEffectLabelKeys[effect] as keyof typeof text]}</option>)}
              </select></label>
              {(selectedShape.shadowEffect ?? 'none') !== 'none' && <div className="shadow-controls">
                <label>{text.shadowDirection}<select value={selectedShape.shadowDirection ?? shadowPresets[selectedShape.shadowEffect as Exclude<ShadowEffect, 'none'>].direction} onChange={(event) => updateSelected({ shadowDirection: event.target.value as ShadowDirection })}>
                  {shadowDirections.map((direction) => <option key={direction} value={direction}>{text[shadowDirectionLabelKeys[direction] as keyof typeof text]}</option>)}
                </select></label>
                <label>{text.shadowDistance}<span className="range-field"><input type="range" min="0" max="60" value={selectedShape.shadowDistance ?? shadowPresets[selectedShape.shadowEffect as Exclude<ShadowEffect, 'none'>].distance} onChange={(event) => updateSelected({ shadowDistance: Number(event.target.value) })} /><span className="range-value">{selectedShape.shadowDistance ?? shadowPresets[selectedShape.shadowEffect as Exclude<ShadowEffect, 'none'>].distance}px</span></span></label>
                <label>{text.shadowBlur}<span className="range-field"><input type="range" min="0" max="40" value={selectedShape.shadowBlur ?? shadowPresets[selectedShape.shadowEffect as Exclude<ShadowEffect, 'none'>].blur} onChange={(event) => updateSelected({ shadowBlur: Number(event.target.value) })} /><span className="range-value">{selectedShape.shadowBlur ?? shadowPresets[selectedShape.shadowEffect as Exclude<ShadowEffect, 'none'>].blur}px</span></span></label>
                <label>{text.shadowColor}<input type="color" value={selectedShape.shadowColor ?? shadowPresets[selectedShape.shadowEffect as Exclude<ShadowEffect, 'none'>].color} onChange={(event) => updateSelected({ shadowColor: event.target.value })} /></label>
                <label>{text.shadowOpacity}<span className="range-field"><input type="range" min="0" max="1" step="0.05" value={selectedShape.shadowOpacity ?? shadowPresets[selectedShape.shadowEffect as Exclude<ShadowEffect, 'none'>].opacity} onChange={(event) => updateSelected({ shadowOpacity: Number(event.target.value) })} /><span className="range-value">{Math.round((selectedShape.shadowOpacity ?? shadowPresets[selectedShape.shadowEffect as Exclude<ShadowEffect, 'none'>].opacity) * 100)}%</span></span></label>
              </div>}
              </>}
              {selectedShape && selectedShape.type === 'connector' && <div className="connector-dropdowns">
                <label>{text.lineStyle}<select value={selectedShape.lineStyle ?? 'straight'} onChange={(event) => updateSelected({ lineStyle: event.target.value as LineStyle })}>
                  <option value="straight">{text.straight}</option>
                  <option value="elbow">{text.elbow}</option>
                  <option value="curve">{text.curve}</option>
                </select></label>
                <label>{text.startMarker}<select value={selectedShape.startMarker ?? 'none'} onChange={(event) => updateSelected({ startMarker: event.target.value as MarkerStyle })}>
                  <option value="none">{text.none}</option>
                  <option value="arrow">{text.arrow}</option>
                  <option value="circle">{text.circleMarker}</option>
                  <option value="diamond">{text.diamond}</option>
                </select></label>
                <label>{text.endMarker}<select value={selectedShape.endMarker ?? 'arrow'} onChange={(event) => updateSelected({ endMarker: event.target.value as MarkerStyle })}>
                  <option value="none">{text.none}</option>
                  <option value="arrow">{text.arrow}</option>
                  <option value="circle">{text.circleMarker}</option>
                  <option value="diamond">{text.diamond}</option>
                </select></label>
              </div>}
              <div className="property-actions">
                <button onClick={duplicateSelected}><AlignCenter size={16} />{text.duplicate}</button>
                <button onClick={deleteSelected}><Trash2 size={16} />{text.delete}</button>
              </div>
            </div>
          </section>}
        </aside>
      </section>

      <footer className="status-bar">
        <span>{text.statusReady}</span>
        <span>{text.canvasSize}: {canvasSize.width} x {canvasSize.height}</span>
        <span>{Math.round(zoom * 100)}%</span>
        <span>{text.shapesCount}: {shapes.length}</span>
        <span>{text.imagesCount}: {rasters.length}</span>
        <span>{text.grid}: {showGrid ? 'On' : 'Off'}</span>
        <span>{statusSelection}</span>
      </footer>

      {showAbout && <dialog className="about-dialog" open>
        <img src="/app-icon.svg" alt="" />
        <h2>{text.aboutTitle}</h2>
        <p><strong>{text.appName}</strong></p>
        <p>{text.version}: 1.0.0</p>
        <p>{text.creator}: SHKWON(knix008@naver.com)</p>
        <p>{text.supported}</p>
        <p>{text.desktopBuild}</p>
        <button onClick={() => setShowAbout(false)}>{text.close}</button>
      </dialog>}
      {showUnsavedDialog && <dialog className="export-dialog" open>
        <h2>{text.saveChangesTitle}</h2>
        <p>{text.saveChangesMessage}</p>
        <div className="dialog-actions">
          <button onClick={() => resolveUnsavedChoice('cancel')}>{text.cancel}</button>
          <button onClick={() => resolveUnsavedChoice('discard')}>{text.dontSave}</button>
          <button onClick={() => resolveUnsavedChoice('save')}><Save size={16} />{text.save}</button>
        </div>
      </dialog>}
      {showExportDialog && <dialog className="export-dialog" open>
        <h2>{text.exportOptions}</h2>
        <div className="export-options">
          <label>{text.format}<select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ExportFormat)}>
            {(['png', 'jpg', 'webp', 'avif', 'gif', 'tiff', 'svg'] as ExportFormat[]).map((format) => <option key={format} value={format}>{format.toUpperCase()}</option>)}
          </select></label>
          <label className="check-row"><input type="checkbox" checked={removeBackground} onChange={(event) => setRemoveBackground(event.target.checked)} />{text.removeBackground}</label>
        </div>
        <div className="dialog-actions">
          <button onClick={() => setShowExportDialog(false)}>{text.close}</button>
          <button onClick={() => { setShowExportDialog(false); void exportFile(exportFormat) }}><Download size={16} />{text.exportRun}</button>
        </div>
      </dialog>}
      {errorDetails && <dialog className="error-dialog" open>
        <h2>{errorDetails.title}</h2>
        <p>{errorDetails.message}</p>
        <textarea readOnly value={errorDetails.details} spellCheck={false} />
        <div className="dialog-actions">
          <button onClick={() => void navigator.clipboard.writeText(`${errorDetails.message}\n\n${errorDetails.details}`).then(() => setErrorCopied(true))}>{errorCopied ? text.copied : text.copy}</button>
          <button onClick={() => setErrorDetails(null)}>{text.close}</button>
        </div>
      </dialog>}
    </main>
  )
}

export default App
