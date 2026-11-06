import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type WheelEvent } from 'react'
import { RULER_SIZE, gridCell, gridLines, gridPath, rulerLabel, type GridLine } from '../canvasGrid'
import { DEFAULT_LINE_WIDTH } from '../constants/colors'
import { sanitizeMemo, wrapMemo } from '../memo'
import { nodeIconById } from '../nodeIcons'
import { MIN_ICON, readable } from '../themes'
import type { DiagramDocument, DiagramNode, LinePattern, MemoStyle, MemoTarget, ThemeMode } from '../types'
import { FISH_ANGLE_DEG } from '../layout/engine'
import { resolveTextColor } from '../constants/colors'
import { connectorPath, ribbonPath, type EdgeOrient } from '../utils/connectors'
import { shapePath } from '../utils/shapePath'

const FISH_TAN = Math.tan((FISH_ANGLE_DEG * Math.PI) / 180)

/** Rulers along the top and left edges, in diagram units, with a mark following the pointer. */
function Rulers({ xs, ys, width, height }: { xs: GridLine[]; ys: GridLine[]; width: number; height: number }) {
  const markX = useRef<SVGLineElement>(null)
  const markY = useRef<SVGLineElement>(null)
  const guides = useRef<SVGGElement>(null)
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Moved directly: a render for every pointer move would be wasted on a thin line.
    const canvas = host.current?.parentElement
    if (!canvas) return undefined
    const show = (on: boolean) => guides.current?.setAttribute('visibility', on ? 'visible' : 'hidden')
    const move = (event: MouseEvent) => {
      const box = canvas.getBoundingClientRect()
      markX.current?.setAttribute('transform', `translate(${Math.round(event.clientX - box.left) + 0.5} 0)`)
      markY.current?.setAttribute('transform', `translate(0 ${Math.round(event.clientY - box.top) + 0.5})`)
      show(true)
    }
    const leave = () => show(false)
    canvas.addEventListener('mousemove', move)
    canvas.addEventListener('mouseleave', leave)
    return () => {
      canvas.removeEventListener('mousemove', move)
      canvas.removeEventListener('mouseleave', leave)
    }
  }, [])
  const size = RULER_SIZE
  return (
    <div className="canvas-rulers" ref={host} aria-hidden="true">
      <svg className="ruler ruler-x" width={width} height={size} data-ruler="x">
        {xs.filter((tick) => tick.px > size).map((tick) => (
          <g key={tick.value}>
            <line x1={tick.px} x2={tick.px} y1={size - (tick.major ? 12 : 5)} y2={size} />
            {tick.major && <text x={tick.px + 3} y={10}>{rulerLabel(tick.value)}</text>}
          </g>
        ))}
      </svg>
      <svg className="ruler ruler-y" width={size} height={height} data-ruler="y">
        {ys.filter((tick) => tick.px > size).map((tick) => (
          <g key={tick.value}>
            <line y1={tick.px} y2={tick.px} x1={size - (tick.major ? 12 : 5)} x2={size} />
            {tick.major && <text x={10} y={tick.px - 3} transform={`rotate(-90 10 ${tick.px - 3})`}>{rulerLabel(tick.value)}</text>}
          </g>
        ))}
      </svg>
      <div className="ruler-corner">px</div>
      {/* The pointer's place, marked on the rulers alone: the canvas stays clear. */}
      <svg className="ruler-guides" width={width} height={height}>
        <g ref={guides} visibility="hidden" data-ruler-guides="">
          <line ref={markX} x1={0} x2={0} y1={0} y2={size} />
          <line ref={markY} x1={0} x2={size} y1={0} y2={0} />
        </g>
      </svg>
    </div>
  )
}

const measuring = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')

/** The width a line of memo text takes. */
function measureText(font: string, text: string): number {
  if (!measuring) return text.length * 8
  measuring.font = font
  return measuring.measureText(text).width
}

type Props = {
  doc: DiagramDocument
  zoom: number
  showGrid: boolean
  showRulers: boolean
  showMemos: boolean
  onMemoMove: (target: MemoTarget, dx: number, dy: number) => void
  theme: ThemeMode
  viewResetKey: number
  viewCenterKey: number
  editingId: string | null
  onSelect: (id: string | null) => void
  onSelectMany: (ids: string[]) => void
  onSelectEdge: (id: string, add?: boolean) => void
  onToggleNode: (id: string) => void
  onAddNodes: (ids: string[]) => void
  onMoveNodes: (ids: string[], dx: number, dy: number) => void
  onContext: (x: number, y: number, nodeId: string | null, canvasX?: number, canvasY?: number) => void
  onEditStart: (id: string) => void
  onEditCommit: (id: string, text: string) => void
  onEditCancel: () => void
  onZoom: (zoom: number) => void
}

const DRAG_THRESHOLD = 4 // px of movement before a node actually starts dragging
const ZOOM_MIN = 0.1 // 10%
const ZOOM_MAX = 4 // 400%

/** Stable, id-safe key for a colour string (e.g. "#94a3b8" -> "94a3b8"). */
function colorKey(color: string): string {
  return color.replace(/[^a-zA-Z0-9]/g, '')
}

function dashArray(linePattern: LinePattern): string | undefined {
  if (linePattern === 'dashed') return '8 6'
  if (linePattern === 'dotted') return '2 5'
  if (linePattern === 'dashdot') return '10 5 2 5'
  return undefined
}

function fontFamily(font: string): string {
  if (font === 'serif') return 'Georgia, serif'
  if (font === 'mono') return 'Consolas, monospace'
  if (font === 'outfit') return 'Outfit, sans-serif'
  if (font === 'notoSansKr') return '"Noto Sans KR", sans-serif'
  // Any other value is treated as an installed system font family name.
  return `"${font}", "Noto Sans KR", sans-serif`
}

/** Trunk/branch width for a node at the given depth (thicker near the root). */
function branchWidth(depth: number): number {
  return Math.max(2.4, 12 - depth * 2.2)
}

/** Fishbone bone width by depth (spine thickest, tapering into causes). */
function fishWidth(depth: number): number {
  return Math.max(2, 7 - depth * 1.4)
}

/** A filled straight segment tapering from full width w1 (start) to w2 (end). */
function taperSegmentPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w1: number,
  w2: number,
): string {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const nx = (-dy / len) * (w1 / 2)
  const ny = (dx / len) * (w1 / 2)
  const mx = (-dy / len) * (w2 / 2)
  const my = (dx / len) * (w2 / 2)
  return `M ${(x1 + nx).toFixed(2)} ${(y1 + ny).toFixed(2)} L ${(x2 + mx).toFixed(2)} ${(y2 + my).toFixed(2)} L ${(x2 - mx).toFixed(2)} ${(y2 - my).toFixed(2)} L ${(x1 - nx).toFixed(2)} ${(y1 - ny).toFixed(2)} Z`
}

/** The keys that add to what is selected instead of starting over. */
const adds = (event: ReactMouseEvent) => event.ctrlKey || event.shiftKey || event.metaKey

type DragState =
  | { kind: 'pan'; ox: number; oy: number; px: number; py: number }
  | { kind: 'node'; id: string; group: string[]; ox: number; oy: number }
  | { kind: 'marquee'; ox: number; oy: number; add: boolean }
  | { kind: 'memo'; target: MemoTarget; ox: number; oy: number; dx: number; dy: number }

type Rect = { x1: number; y1: number; x2: number; y2: number }

export function DiagramCanvas({
  doc,
  zoom,
  showGrid,
  showRulers,
  showMemos,
  onMemoMove,
  theme,
  viewResetKey,
  viewCenterKey,
  editingId,
  onSelect,
  onSelectMany,
  onSelectEdge,
  onToggleNode,
  onAddNodes,
  onMoveNodes,
  onContext,
  onEditStart,
  onEditCommit,
  onEditCancel,
  onZoom,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const nodesRef = useRef(doc.nodes)
  nodesRef.current = doc.nodes
  const [pan, setPan] = useState({ x: 40, y: 20 })
  // The canvas's size in pixels: the grid and rulers are drawn for exactly this much.
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const element = svgRef.current
    if (!element) return undefined
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const xLines = useMemo(() => (showGrid || showRulers ? gridLines(pan.x, zoom, size.width) : []), [showGrid, showRulers, pan.x, zoom, size.width])
  const yLines = useMemo(() => (showGrid || showRulers ? gridLines(pan.y, zoom, size.height) : []), [showGrid, showRulers, pan.y, zoom, size.height])
  // Group-drag preview: a delta applied to every id in `ids`.
  const [dragPreview, setDragPreview] = useState<{ ids: string[]; dx: number; dy: number } | null>(null)
  const [marquee, setMarquee] = useState<Rect | null>(null)
  // A memo being dragged, and where it is so far.
  const [memoDrag, setMemoDrag] = useState<{ id: string; dx: number; dy: number } | null>(null)
  const drag = useRef<DragState | null>(null)

  // Connectors follow the layout orientation so every edge leaves the same face
  // (e.g. parent-bottom in a top-down tree) instead of flipping per edge.
  const edgeOrient: EdgeOrient =
    doc.layout === 'ttb' || doc.layout === 'btt'
      ? 'v'
      : doc.layout === 'ltr' || doc.layout === 'rtl'
        ? 'h'
        : 'auto'

  const nodeMap = useMemo(() => {
    const map = new Map(doc.nodes.map((n) => [n.id, n]))
    if (dragPreview) {
      for (const id of dragPreview.ids) {
        const node = map.get(id)
        if (node) map.set(id, { ...node, x: node.x + dragPreview.dx, y: node.y + dragPreview.dy })
      }
    }
    return map
  }, [doc.nodes, dragPreview])

  const nodeDepthMap = useMemo(() => {
    const depthMap = new Map<string, number>()
    const depthOf = (node: DiagramNode): number => {
      const existing = depthMap.get(node.id)
      if (existing !== undefined) return existing
      if (!node.parentId) {
        depthMap.set(node.id, 0)
        return 0
      }
      const parent = nodeMap.get(node.parentId)
      const depth = parent ? depthOf(parent) + 1 : 0
      depthMap.set(node.id, depth)
      return depth
    }
    nodeMap.forEach((node) => depthOf(node))
    return depthMap
  }, [nodeMap])

  const nodes = useMemo(() => Array.from(nodeMap.values()), [nodeMap])
  // Edge keyed by its child (target) node, so the fishbone skeleton can inherit
  // the same colour/pattern the user set on that connection.
  const edgeByChild = useMemo(() => {
    const map = new Map<string, (typeof doc.edges)[number]>()
    doc.edges.forEach((e) => map.set(e.to, e))
    return map
  }, [doc.edges])
  // Distinct colours that need arrow/dot/diamond caps. We build one marker per
  // colour with an explicit fill (instead of relying on `context-stroke`, which
  // silently falls back to black — invisible on the dark theme — and is flaky in
  // exported SVGs).
  const capColors = useMemo(() => {
    const set = new Set<string>()
    for (const e of doc.edges) {
      if ((e.startCap && e.startCap !== 'none') || (e.endCap && e.endCap !== 'none')) set.add(e.color)
    }
    return Array.from(set)
  }, [doc.edges])
  const editingNode = editingId ? nodeMap.get(editingId) : null
  const fishbone = useMemo(() => {
    if (doc.mode !== 'fishbone') return null
    const effect = nodes.find((node) => node.role === 'effect')
    if (!effect) return null

    const isRtl = doc.layout === 'rtl'
    const dir = isRtl ? -1 : 1
    const clampToHead = (x: number, headX: number) =>
      dir > 0 ? Math.min(x, headX) : Math.max(x, headX)

    const center = (n: DiagramNode) => ({ x: n.x + n.width / 2, y: n.y + n.height / 2 })
    const effectCenter = center(effect)
    const spineY = effectCenter.y
    // Inner edge of the effect box; the spine (its axis) starts here.
    const headEdgeX = effect.x + effect.width / 2 - dir * (effect.width / 2)
    const axisHeadX = (n: DiagramNode) => (n.role === 'effect' ? headEdgeX : center(n).x)

    // A bone for every non-effect node: a diagonal from the point where a line at
    // the fishbone angle meets the parent's horizontal axis, out to the node.
    const bones: { id: string; x1: number; y1: number; x2: number; y2: number }[] = []
    const childAttach = new Map<string, number[]>()
    for (const node of nodes) {
      if (node.role === 'effect' || !node.parentId) continue
      const parent = nodeMap.get(node.parentId)
      if (!parent) continue
      const c = center(node)
      const pc = center(parent)
      const run = Math.abs(c.y - pc.y) / FISH_TAN
      const attachX = clampToHead(c.x + dir * run, axisHeadX(parent))
      bones.push({ id: node.id, x1: attachX, y1: pc.y, x2: c.x, y2: c.y })
      const arr = childAttach.get(parent.id) ?? []
      arr.push(attachX)
      childAttach.set(parent.id, arr)
    }

    // A horizontal sub-axis for every non-effect node that has children.
    const axes: { id: string; x1: number; y1: number; x2: number; y2: number }[] = []
    for (const node of nodes) {
      if (node.role === 'effect' || !node.parentId) continue
      const attaches = childAttach.get(node.id)
      if (!attaches || attaches.length === 0) continue
      const c = center(node)
      const end = dir > 0 ? Math.min(...attaches) : Math.max(...attaches)
      axes.push({ id: node.id, x1: c.x, y1: c.y, x2: end - dir * 20, y2: c.y })
    }

    // The spine is the effect's axis: head edge out to the last category bone.
    const catAttaches = childAttach.get(effect.id) ?? []
    let tailX = headEdgeX
    for (const a of catAttaches) tailX = dir > 0 ? Math.min(tailX, a) : Math.max(tailX, a)
    tailX -= dir * 40

    return { headEdgeX, spineY, tailX, bones, axes }
  }, [doc.mode, doc.layout, nodes, nodeMap])

  useEffect(() => {
    // Runs on first mount (viewResetKey starts at 0) and on every explicit view
    // reset, so the initial single-node diagram is centred instead of stuck at
    // the default top-left pan.
    const wrap = svgRef.current?.parentElement
    const vw = wrap?.clientWidth ?? window.innerWidth
    const vh = wrap?.clientHeight ?? window.innerHeight - 120
    const currentNodes = nodesRef.current

    if (currentNodes.length === 0) {
      setPan({ x: vw / 2 - 70, y: vh / 2 - 22 })
      onZoom(1)
      return
    }

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of currentNodes) {
      minX = Math.min(minX, n.x)
      minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x + n.width)
      maxY = Math.max(maxY, n.y + n.height)
    }
    const contentW = Math.max(1, maxX - minX)
    const contentH = Math.max(1, maxY - minY)
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    // Zoom-to-fit: shrink so the whole (restored) diagram is visible, but never
    // enlarge past 100% for small diagrams. Then centre it at that zoom.
    const PAD = 80
    const fit = Math.min((vw - PAD) / contentW, (vh - PAD) / contentH)
    const scale = Number(Math.min(1, Math.max(ZOOM_MIN, fit)).toFixed(2))
    setPan({ x: vw / 2 - cx * scale, y: vh / 2 - cy * scale })
    onZoom(scale)
  }, [viewResetKey, onZoom])

  // Center: the diagram in the middle, at the zoom it has.
  useEffect(() => {
    if (!viewCenterKey) return
    const wrap = svgRef.current?.parentElement
    const list = nodesRef.current
    if (!wrap || !list.length) return
    const minX = Math.min(...list.map((n) => n.x))
    const maxX = Math.max(...list.map((n) => n.x + n.width))
    const minY = Math.min(...list.map((n) => n.y))
    const maxY = Math.max(...list.map((n) => n.y + n.height))
    setPan({ x: wrap.clientWidth / 2 - ((minX + maxX) / 2) * zoom, y: wrap.clientHeight / 2 - ((minY + maxY) / 2) * zoom })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewCenterKey])

  const onWheel = (e: WheelEvent) => {
    // Plain wheel zooms (panning is done by dragging the canvas).
    e.preventDefault()
    const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1
    const next = Number(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * factor)).toFixed(2))
    if (next === zoom) return
    // Keep the canvas point at the viewport center fixed while zooming.
    const rect = svgRef.current?.getBoundingClientRect()
    const cx = (rect?.width ?? window.innerWidth) / 2
    const cy = (rect?.height ?? window.innerHeight) / 2
    const ratio = next / zoom
    setPan((p) => ({ x: cx - (cx - p.x) * ratio, y: cy - (cy - p.y) * ratio }))
    onZoom(next)
  }

  // Where each memo goes: a shape's beside it, a line's at its middle.
  const memos = useMemo(() => {
    const out: { target: MemoTarget; owner: { note?: string; noteStyle?: Partial<MemoStyle> }; x: number; y: number; anchorX: number; anchorY: number }[] = []
    for (const node of nodes) {
      if (node.note === undefined) continue
      out.push({ target: { kind: 'node', id: node.id }, owner: node, x: node.x + node.width + 18, y: node.y - 14, anchorX: node.x + node.width, anchorY: node.y + node.height / 2 })
    }
    for (const edge of doc.edges) {
      if (edge.note === undefined) continue
      const from = nodeMap.get(edge.from)
      const to = nodeMap.get(edge.to)
      if (!from || !to) continue
      const anchorX = (from.x + from.width / 2 + to.x + to.width / 2) / 2
      const anchorY = (from.y + from.height / 2 + to.y + to.height / 2) / 2
      out.push({ target: { kind: 'edge', id: edge.id }, owner: edge, x: anchorX + 16, y: anchorY + 16, anchorX, anchorY })
    }
    return out
  }, [nodes, doc.edges, nodeMap])

  const clientToCanvas = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect()
    return {
      x: ((clientX - (rect?.left ?? 0)) - pan.x) / zoom,
      y: ((clientY - (rect?.top ?? 0)) - pan.y) / zoom,
    }
  }

  const endDrag = () => {
    const d = drag.current
    if (d?.kind === 'node' && dragPreview && (dragPreview.dx !== 0 || dragPreview.dy !== 0)) {
      onMoveNodes(dragPreview.ids, dragPreview.dx, dragPreview.dy)
    } else if (d?.kind === 'node' && d.group.length > 1) {
      // Pressed one of several and let go without dragging: a plain click, which starts over.
      onSelect(d.id)
    } else if (d?.kind === 'marquee' && marquee) {
      const minX = Math.min(marquee.x1, marquee.x2)
      const maxX = Math.max(marquee.x1, marquee.x2)
      const minY = Math.min(marquee.y1, marquee.y2)
      const maxY = Math.max(marquee.y1, marquee.y2)
      const hit = doc.nodes
        .filter(
          (n) => n.x < maxX && n.x + n.width > minX && n.y < maxY && n.y + n.height > minY,
        )
        .map((n) => n.id)
      if (d.add) onAddNodes(hit)
      else onSelectMany(hit)
    }
    if (d?.kind === 'memo' && memoDrag) onMemoMove(d.target, memoDrag.dx, memoDrag.dy)
    setMemoDrag(null)
    drag.current = null
    setDragPreview(null)
    setMarquee(null)
  }

  return (
    <div
      className="canvas-wrap"
      onContextMenu={(e) => {
        e.preventDefault()
        const point = clientToCanvas(e.clientX, e.clientY)
        onContext(e.clientX, e.clientY, null, point.x, point.y)
      }}
      onWheel={onWheel}
    >
      <svg
        ref={svgRef}
        className={`canvas-svg ${drag.current?.kind === 'node' ? 'dragging-node' : ''} ${
          drag.current?.kind === 'marquee' ? 'marqueeing' : ''
        }`}
        onMouseDown={(e) => {
          if ((e.target as Element).closest('.node-hit')) return
          // Middle button always pans. When the grid is on, a left drag on empty
          // canvas also pans the background (to shift every shape at once);
          // otherwise a left drag draws a selection marquee.
          if (e.button === 1 || (e.button === 0 && showGrid)) {
            e.preventDefault()
            drag.current = { kind: 'pan', ox: e.clientX, oy: e.clientY, px: pan.x, py: pan.y }
            return
          }
          if (e.button !== 0) return
          const start = clientToCanvas(e.clientX, e.clientY)
          drag.current = { kind: 'marquee', ox: e.clientX, oy: e.clientY, add: adds(e) }
          setMarquee({ x1: start.x, y1: start.y, x2: start.x, y2: start.y })
          if (!adds(e)) onSelect(null)
        }}
        onMouseMove={(e) => {
          const d = drag.current
          if (!d) return
          if (d.kind === 'pan') {
            setPan({
              x: d.px + (e.clientX - d.ox),
              y: d.py + (e.clientY - d.oy),
            })
            return
          }
          if (d.kind === 'marquee') {
            const p = clientToCanvas(e.clientX, e.clientY)
            setMarquee((m) => (m ? { ...m, x2: p.x, y2: p.y } : m))
            return
          }
          if (d.kind === 'memo') {
            setMemoDrag({ id: d.target.id, dx: d.dx + (e.clientX - d.ox) / zoom, dy: d.dy + (e.clientY - d.oy) / zoom })
            return
          }
          const dx = e.clientX - d.ox
          const dy = e.clientY - d.oy
          // Ignore tiny jitter so a click/double-click doesn't nudge the node.
          if (!dragPreview && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
          setDragPreview({ ids: d.group, dx: dx / zoom, dy: dy / zoom })
        }}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        <defs>
          {capColors.map((color) => {
            const k = colorKey(color)
            return (
              <g key={k}>
                <marker
                  id={`cap-arrow-${k}`}
                  viewBox="0 0 12 12"
                  refX="10"
                  refY="6"
                  markerWidth="12"
                  markerHeight="12"
                  markerUnits="userSpaceOnUse"
                  orient="auto-start-reverse"
                >
                  <path d="M1 2 L11 6 L1 10 z" fill={color} />
                </marker>
                <marker
                  id={`cap-dot-${k}`}
                  viewBox="0 0 12 12"
                  refX="6"
                  refY="6"
                  markerWidth="10"
                  markerHeight="10"
                  markerUnits="userSpaceOnUse"
                  orient="auto"
                >
                  <circle cx="6" cy="6" r="4" fill={color} />
                </marker>
                <marker
                  id={`cap-diamond-${k}`}
                  viewBox="0 0 12 12"
                  refX="6"
                  refY="6"
                  markerWidth="12"
                  markerHeight="12"
                  markerUnits="userSpaceOnUse"
                  orient="auto"
                >
                  <path d="M6 1 L11 6 L6 11 L1 6 z" fill={color} />
                </marker>
              </g>
            )
          })}
        </defs>

        {showGrid && (
          // In screen pixels and with no transform of its own: lines stay one pixel wide at any zoom.
          <g className="canvas-grid" fill="none" strokeWidth="1" data-grid-cell={gridCell(zoom)}>
            <path stroke="var(--grid-line)" d={gridPath(xLines, yLines, size.width, size.height, (line) => !line.major)} />
            <path stroke="var(--grid-line-major)" d={gridPath(xLines, yLines, size.width, size.height, (line) => line.major)} />
          </g>
        )}

        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {fishbone && (
            <g className="fishbone-skeleton" fill="var(--spine)">
              {/* spine: the effect's trunk — thick at the head, tapering to the tail */}
              <path
                d={taperSegmentPath(
                  fishbone.tailX,
                  fishbone.spineY,
                  fishbone.headEdgeX,
                  fishbone.spineY,
                  fishWidth(1),
                  fishWidth(0),
                )}
              />
              {/* horizontal sub-axes for categories/causes that have children */}
              {fishbone.axes.map((axis) => {
                const depth = nodeDepthMap.get(axis.id) ?? 1
                const edge = edgeByChild.get(axis.id)
                const pattern = edge?.linePattern ?? 'solid'
                if (pattern !== 'solid') {
                  return (
                    <path
                      key={`axis-${axis.id}`}
                      d={`M ${axis.x1} ${axis.y1} L ${axis.x2} ${axis.y2}`}
                      fill="none"
                      stroke={edge?.color ?? 'var(--spine)'}
                      strokeWidth={edge?.width ?? fishWidth(depth)}
                      strokeDasharray={dashArray(pattern)}
                      strokeLinecap="round"
                    />
                  )
                }
                return (
                  <path
                    key={`axis-${axis.id}`}
                    fill={edge?.color ?? 'var(--spine)'}
                    d={taperSegmentPath(
                      axis.x1,
                      axis.y1,
                      axis.x2,
                      axis.y2,
                      edge?.width ?? fishWidth(depth),
                      edge?.width ?? fishWidth(depth + 1),
                    )}
                  />
                )
              })}
              {/* diagonal bones tapering from the parent's axis out to each node */}
              {fishbone.bones.map((bone) => {
                const depth = nodeDepthMap.get(bone.id) ?? 1
                const edge = edgeByChild.get(bone.id)
                const pattern = edge?.linePattern ?? 'solid'
                if (pattern !== 'solid') {
                  return (
                    <path
                      key={`bone-${bone.id}`}
                      d={`M ${bone.x1} ${bone.y1} L ${bone.x2} ${bone.y2}`}
                      fill="none"
                      stroke={edge?.color ?? 'var(--spine)'}
                      strokeWidth={edge?.width ?? fishWidth(depth)}
                      strokeDasharray={dashArray(pattern)}
                      strokeLinecap="round"
                    />
                  )
                }
                return (
                  <path
                    key={`bone-${bone.id}`}
                    fill={edge?.color ?? 'var(--spine)'}
                    d={taperSegmentPath(
                      bone.x1,
                      bone.y1,
                      bone.x2,
                      bone.y2,
                      edge?.width ?? fishWidth(depth - 1),
                      edge?.width ?? fishWidth(depth),
                    )}
                  />
                )
              })}
            </g>
          )}

          {doc.mode !== 'fishbone' && doc.edges.map((edge) => {
            const from = nodeMap.get(edge.from)
            const to = nodeMap.get(edge.to)
            if (!from || !to) return null
            const isSelected = Boolean(doc.selectedEdgeId) && (doc.selectedEdgeId === edge.id || Boolean(doc.selectedEdgeIds?.includes(edge.id)))
            const lineWidth = edge.width ?? DEFAULT_LINE_WIDTH
            const selectEdge = (e: ReactMouseEvent) => {
              e.stopPropagation()
              if (e.button === 0) onSelectEdge(edge.id, adds(e))
            }
            if (edge.lineType === 'root') {
              // Organic tree-root branch: a filled tapered ribbon (no dashes).
              const parentDepth = nodeDepthMap.get(from.id) ?? 0
              const childDepth = nodeDepthMap.get(to.id) ?? parentDepth + 1
              const scale = lineWidth / DEFAULT_LINE_WIDTH
              const d = ribbonPath(from, to, branchWidth(parentDepth) * scale, branchWidth(childDepth) * scale, edgeOrient, edge.fromSide, edge.toSide)
              return (
                <path
                  key={edge.id}
                  className="edge-hit"
                  d={d}
                  fill={edge.color}
                  stroke={isSelected ? 'var(--accent)' : 'none'}
                  strokeWidth={isSelected ? 2 : 0}
                  onMouseDown={selectEdge}
                />
              )
            }
            const d = connectorPath(from, to, edge.lineType, edgeOrient, edge.fromSide, edge.toSide)
            return (
              <g key={edge.id}>
                {/* Invisible wide hit target so thin lines are easy to click. */}
                <path
                  className="edge-hit"
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={Math.max(14, lineWidth + 10)}
                  onMouseDown={selectEdge}
                />
                <path
                  d={d}
                  fill="none"
                  stroke={isSelected ? 'var(--accent)' : edge.color}
                  strokeWidth={isSelected ? lineWidth + 1.5 : lineWidth}
                  strokeDasharray={dashArray(edge.linePattern)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                  markerStart={
                    edge.startCap && edge.startCap !== 'none'
                      ? `url(#cap-${edge.startCap}-${colorKey(edge.color)})`
                      : undefined
                  }
                  markerEnd={
                    edge.endCap && edge.endCap !== 'none'
                      ? `url(#cap-${edge.endCap}-${colorKey(edge.color)})`
                      : undefined
                  }
                />
              </g>
            )
          })}

          {nodes.map((node) => (
            <g
              key={node.id}
              className={`node-hit ${doc.selectedIds.includes(node.id) ? 'selected' : ''}`}
              onMouseDown={(e) => {
                e.stopPropagation()
                if (e.button !== 0) return
                // If the node is part of the current multi-selection, drag the
                // whole group; otherwise select just this node and drag it.
                const inMulti = doc.selectedIds.includes(node.id) && doc.selectedIds.length > 1
                if (adds(e)) {
                  onToggleNode(node.id)
                  return
                }
                if (!inMulti) onSelect(node.id)
                drag.current = {
                  kind: 'node',
                  id: node.id,
                  group: inMulti ? doc.selectedIds : [node.id],
                  ox: e.clientX,
                  oy: e.clientY,
                }
              }}
              onDoubleClick={(e) => {
                e.stopPropagation()
                onEditStart(node.id)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onContext(e.clientX, e.clientY, node.id)
              }}
            >
              <path
                className="node-shape"
                d={shapePath(node.shape, node.x, node.y, node.width, node.height)}
                fill={node.image ? 'none' : node.color}
                stroke={node.image ? 'none' : 'var(--node-stroke)'}
                strokeWidth={1.5}
              />
              {node.image ? (
                <image href={node.image.src} x={node.x} y={node.y} width={node.width} height={node.height} preserveAspectRatio="none" />
              ) : null}
              {!node.image && nodeIconById(node.icon) ? (
                <g
                  className="node-icon"
                  data-icon={node.icon}
                  transform={`translate(${node.x + 8} ${node.y + node.height / 2 - 9}) scale(0.75)`}
                  fill="none"
                  stroke={readable(nodeIconById(node.icon)!.color, [node.color], MIN_ICON)}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dangerouslySetInnerHTML={{ __html: nodeIconById(node.icon)!.body }}
                />
              ) : null}
              {!node.image && <text
                className="node-label"
                x={node.x + node.width / 2 + (nodeIconById(node.icon) ? 10 : 0)}
                y={node.y + node.height / 2 + (node.shape === 'cylinder' ? 5 : 1)}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                <tspan
                  fill={resolveTextColor(node.textStyle?.color, theme)}
                  fontFamily={fontFamily(node.textStyle?.fontFamily ?? 'notoSansKr')}
                  fontSize={node.textStyle?.fontSize ?? 13}
                  fontWeight={node.textStyle?.bold ? 700 : 500}
                  fontStyle={node.textStyle?.italic ? 'italic' : 'normal'}
                  textDecoration={[
                    node.textStyle?.underline ? 'underline' : '',
                    node.textStyle?.strike ? 'line-through' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {node.text.length > 18 ? `${node.text.slice(0, 18)}...` : node.text}
                </tspan>
              </text>}
            </g>
          ))}

          {showMemos && memos.map((memo) => {
            const style = sanitizeMemo(memo.owner.noteStyle)
            const moved = memoDrag?.id === memo.target.id ? memoDrag : style
            const x = memo.x + moved.dx
            const y = memo.y + moved.dy
            const lineHeight = style.fontSize * 1.35
            const font = `${style.italic ? 'italic ' : ''}${style.bold ? '700' : '400'} ${style.fontSize}px ${fontFamily(style.fontFamily)}`
            const fitting = Math.max(1, Math.floor((style.height - 16) / lineHeight))
            const lines = wrapMemo(memo.owner.note ?? '', style.width - 16, (text) => measureText(font, text)).slice(0, fitting)
            return (
              <g
                key={memo.target.id}
                className="memo-note"
                data-memo={memo.target.kind}
                data-memo-box={`${x} ${y} ${style.width} ${style.height}`}
                onMouseDown={(e) => {
                  if (e.button !== 0) return
                  e.stopPropagation()
                  if (memo.target.kind === 'node') onSelect(memo.target.id)
                  else onSelectEdge(memo.target.id)
                  drag.current = { kind: 'memo', target: memo.target, ox: e.clientX, oy: e.clientY, dx: style.dx, dy: style.dy }
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onContext(e.clientX, e.clientY, memo.target.kind === 'node' ? memo.target.id : null)
                }}
              >
                {style.linePattern !== 'none' && <line className="memo-line" x1={memo.anchorX} y1={memo.anchorY} x2={x + style.width / 2} y2={y + style.height / 2} stroke={style.lineColor} strokeWidth={style.lineWidth} strokeDasharray={dashArray(style.linePattern)} />}
                <path d={`M${x} ${y}h${style.width}v${style.height - 12}l-12 12h${12 - style.width}z`} fill={style.color} stroke="rgba(0, 0, 0, 0.25)" strokeWidth="1" />
                <path d={`M${x + style.width} ${y + style.height - 12}h-12v12z`} fill="rgba(0, 0, 0, 0.14)" />
                <text
                  fill={style.textColor}
                  fontFamily={fontFamily(style.fontFamily)}
                  fontSize={style.fontSize}
                  fontWeight={style.bold ? 700 : 400}
                  fontStyle={style.italic ? 'italic' : 'normal'}
                  textDecoration={[style.underline ? 'underline' : '', style.strike ? 'line-through' : ''].filter(Boolean).join(' ') || undefined}
                >
                  {lines.map((text, index) => <tspan key={index} x={x + 8} y={y + 8 + style.fontSize + index * lineHeight}>{text}</tspan>)}
                </text>
              </g>
            )
          })}

          {marquee && (
            <rect
              className="marquee-rect"
              x={Math.min(marquee.x1, marquee.x2)}
              y={Math.min(marquee.y1, marquee.y2)}
              width={Math.abs(marquee.x2 - marquee.x1)}
              height={Math.abs(marquee.y2 - marquee.y1)}
            />
          )}
        </g>
      </svg>

      {showRulers && <Rulers xs={xLines} ys={yLines} width={size.width} height={size.height} />}

      {editingNode && (
        <input
          className="node-editor"
          style={{
            left: pan.x + editingNode.x * zoom,
            top: pan.y + editingNode.y * zoom,
            width: Math.max(120, editingNode.width * zoom),
            height: editingNode.height * zoom,
            fontFamily: fontFamily(editingNode.textStyle?.fontFamily ?? 'notoSansKr'),
            fontSize: (editingNode.textStyle?.fontSize ?? 13) * zoom,
          }}
          autoFocus
          defaultValue={editingNode.text}
          onBlur={(e) => onEditCommit(editingNode.id, e.target.value.trim() || editingNode.text)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onEditCommit(editingNode.id, (e.target as HTMLInputElement).value.trim() || editingNode.text)
            }
            if (e.key === 'Escape') onEditCancel()
          }}
        />
      )}
    </div>
  )
}
