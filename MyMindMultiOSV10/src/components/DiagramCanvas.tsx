import { useEffect, useMemo, useRef, useState, type WheelEvent } from 'react'
import type { DiagramDocument, DiagramNode, LinePattern, LineType, ShapeType, TextFont, ThemeMode } from '../types'
import { FISH_ANGLE_DEG } from '../layout/engine'
import { resolveTextColor } from '../constants/colors'

const FISH_TAN = Math.tan((FISH_ANGLE_DEG * Math.PI) / 180)

type Props = {
  doc: DiagramDocument
  zoom: number
  showGrid: boolean
  theme: ThemeMode
  viewResetKey: number
  editingId: string | null
  onSelect: (id: string | null) => void
  onSelectMany: (ids: string[]) => void
  onMoveNodes: (ids: string[], dx: number, dy: number) => void
  onContext: (x: number, y: number, nodeId: string | null, canvasX?: number, canvasY?: number) => void
  onEditStart: (id: string) => void
  onEditCommit: (id: string, text: string) => void
  onEditCancel: () => void
  onZoom: (zoom: number) => void
}

const GRID = 20
const DRAG_THRESHOLD = 4 // px of movement before a node actually starts dragging
const ZOOM_MIN = 0.1 // 10%
const ZOOM_MAX = 4 // 400%

function shapePath(shape: ShapeType, x: number, y: number, w: number, h: number): string {
  switch (shape) {
    case 'ellipse':
      return `M ${x + w / 2} ${y} A ${w / 2} ${h / 2} 0 1 1 ${x + w / 2 - 0.01} ${y}`
    case 'diamond':
      return `M ${x + w / 2} ${y} L ${x + w} ${y + h / 2} L ${x + w / 2} ${y + h} L ${x} ${y + h / 2} Z`
    case 'parallelogram':
      return `M ${x + 16} ${y} L ${x + w} ${y} L ${x + w - 16} ${y + h} L ${x} ${y + h} Z`
    case 'rect':
      return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`
    case 'rounded':
    default: {
      const r = 12
      return `M ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} H ${x + r} Q ${x} ${y + h} ${x} ${y + h - r} V ${y + r} Q ${x} ${y} ${x + r} ${y} Z`
    }
  }
}

function dashArray(linePattern: LinePattern): string | undefined {
  if (linePattern === 'dashed') return '8 6'
  if (linePattern === 'dotted') return '2 5'
  if (linePattern === 'dashdot') return '10 5 2 5'
  return undefined
}

function fontFamily(font: TextFont): string {
  if (font === 'serif') return 'Georgia, serif'
  if (font === 'mono') return 'Consolas, monospace'
  if (font === 'outfit') return 'Outfit, sans-serif'
  return 'Noto Sans KR, sans-serif'
}

function edgePath(
  from: DiagramNode,
  to: DiagramNode,
  lineType: LineType,
): string {
  const x1 = from.x + from.width / 2
  const y1 = from.y + from.height / 2
  const x2 = to.x + to.width / 2
  const y2 = to.y + to.height / 2

  if (lineType === 'root') {
    const mx = (x1 + x2) / 2
    const vertical = y2 >= y1 ? 1 : -1
    const spread = Math.max(24, Math.abs(y2 - y1) * 0.28)
    return `M ${x1} ${y1} C ${mx - 42} ${y1 + vertical * spread}, ${mx + 18} ${y2 - vertical * spread * 0.45}, ${x2} ${y2}`
  }

  if (lineType === 'elbow') {
    return `M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2}`
  }

  if (lineType === 'curve') {
    const mx = (x1 + x2) / 2
    return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
  }
  return `M ${x1} ${y1} L ${x2} ${y2}`
}

/** Trunk/branch width for a node at the given depth (thicker near the root). */
function branchWidth(depth: number): number {
  return Math.max(2.4, 12 - depth * 2.2)
}

/** Fishbone bone width by depth (spine thickest, tapering into causes). */
function fishWidth(depth: number): number {
  return Math.max(2, 7 - depth * 1.4)
}

const cubicAt = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const u = 1 - t
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
}
const cubicDeriv = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const u = 1 - t
  return 3 * u * u * (p1 - p0) + 6 * u * t * (p2 - p1) + 3 * t * t * (p3 - p2)
}

/**
 * A filled, organically tapered "tree-root" ribbon between two node centers:
 * wide at the parent, narrowing to the child, following a smooth S-curve.
 */
function rootRibbonPath(from: DiagramNode, to: DiagramNode, wStart: number, wEnd: number): string {
  const x1 = from.x + from.width / 2
  const y1 = from.y + from.height / 2
  const x2 = to.x + to.width / 2
  const y2 = to.y + to.height / 2
  const dx = x2 - x1
  const c1x = x1 + dx * 0.5
  const c2x = x1 + dx * 0.5
  const N = 22
  const left: string[] = []
  const right: string[] = []
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const px = cubicAt(x1, c1x, c2x, x2, t)
    const py = cubicAt(y1, y1, y2, y2, t)
    let tx = cubicDeriv(x1, c1x, c2x, x2, t)
    let ty = cubicDeriv(y1, y1, y2, y2, t)
    const len = Math.hypot(tx, ty) || 1
    tx /= len
    ty /= len
    const nx = -ty
    const ny = tx
    // Fuller near the base, easing to the tip.
    const h = wEnd / 2 + (wStart / 2 - wEnd / 2) * Math.pow(1 - t, 1.3)
    left.push(`${(px + nx * h).toFixed(2)} ${(py + ny * h).toFixed(2)}`)
    right.push(`${(px - nx * h).toFixed(2)} ${(py - ny * h).toFixed(2)}`)
  }
  return `M ${left.join(' L ')} L ${right.reverse().join(' L ')} Z`
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

type DragState =
  | { kind: 'pan'; ox: number; oy: number; px: number; py: number }
  | { kind: 'node'; id: string; group: string[]; ox: number; oy: number }
  | { kind: 'marquee'; ox: number; oy: number }

type Rect = { x1: number; y1: number; x2: number; y2: number }

export function DiagramCanvas({
  doc,
  zoom,
  showGrid,
  theme,
  viewResetKey,
  editingId,
  onSelect,
  onSelectMany,
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
  // Group-drag preview: a delta applied to every id in `ids`.
  const [dragPreview, setDragPreview] = useState<{ ids: string[]; dx: number; dy: number } | null>(null)
  const [marquee, setMarquee] = useState<Rect | null>(null)
  const drag = useRef<DragState | null>(null)

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
    if (viewResetKey === 0) return
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
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    setPan({ x: vw / 2 - cx, y: vh / 2 - cy })
    onZoom(1)
  }, [viewResetKey, onZoom])

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
      onSelectMany(hit)
    }
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
          // Middle button pans; left button on empty canvas draws a marquee.
          if (e.button === 1) {
            e.preventDefault()
            drag.current = { kind: 'pan', ox: e.clientX, oy: e.clientY, px: pan.x, py: pan.y }
            return
          }
          if (e.button !== 0) return
          const start = clientToCanvas(e.clientX, e.clientY)
          drag.current = { kind: 'marquee', ox: e.clientX, oy: e.clientY }
          setMarquee({ x1: start.x, y1: start.y, x2: start.x, y2: start.y })
          onSelect(null)
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
          <pattern id="mymind-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="var(--grid-line)" strokeWidth="1" />
          </pattern>
          <pattern
            id="mymind-grid-major"
            width={GRID * 5}
            height={GRID * 5}
            patternUnits="userSpaceOnUse"
          >
            <rect width={GRID * 5} height={GRID * 5} fill="url(#mymind-grid)" />
            <path
              d={`M ${GRID * 5} 0 L 0 0 0 ${GRID * 5}`}
              fill="none"
              stroke="var(--grid-line-major)"
              strokeWidth="1"
            />
          </pattern>
          <marker
            id="cap-arrow"
            viewBox="0 0 12 12"
            refX="10"
            refY="6"
            markerWidth="12"
            markerHeight="12"
            markerUnits="userSpaceOnUse"
            orient="auto-start-reverse"
          >
            <path d="M1 2 L11 6 L1 10 z" fill="context-stroke" />
          </marker>
          <marker
            id="cap-dot"
            viewBox="0 0 12 12"
            refX="6"
            refY="6"
            markerWidth="10"
            markerHeight="10"
            markerUnits="userSpaceOnUse"
            orient="auto"
          >
            <circle cx="6" cy="6" r="4" fill="context-stroke" />
          </marker>
          <marker
            id="cap-diamond"
            viewBox="0 0 12 12"
            refX="6"
            refY="6"
            markerWidth="12"
            markerHeight="12"
            markerUnits="userSpaceOnUse"
            orient="auto"
          >
            <path d="M6 1 L11 6 L6 11 L1 6 z" fill="context-stroke" />
          </marker>
        </defs>

        {showGrid && (
          <rect
            className="canvas-grid"
            x={-((pan.x % (GRID * 5)) + GRID * 5)}
            y={-((pan.y % (GRID * 5)) + GRID * 5)}
            width="200%"
            height="200%"
            fill="url(#mymind-grid-major)"
          />
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
                return (
                  <path
                    key={`axis-${axis.id}`}
                    d={taperSegmentPath(
                      axis.x1,
                      axis.y1,
                      axis.x2,
                      axis.y2,
                      fishWidth(depth),
                      fishWidth(depth + 1),
                    )}
                  />
                )
              })}
              {/* diagonal bones tapering from the parent's axis out to each node */}
              {fishbone.bones.map((bone) => {
                const depth = nodeDepthMap.get(bone.id) ?? 1
                return (
                  <path
                    key={`bone-${bone.id}`}
                    d={taperSegmentPath(
                      bone.x1,
                      bone.y1,
                      bone.x2,
                      bone.y2,
                      fishWidth(depth - 1),
                      fishWidth(depth),
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
            if (edge.lineType === 'root') {
              // Organic tree-root branch: a filled tapered ribbon (no dashes).
              const parentDepth = nodeDepthMap.get(from.id) ?? 0
              const childDepth = nodeDepthMap.get(to.id) ?? parentDepth + 1
              return (
                <path
                  key={edge.id}
                  d={rootRibbonPath(from, to, branchWidth(parentDepth), branchWidth(childDepth))}
                  fill={edge.color}
                  stroke="none"
                />
              )
            }
            return (
              <path
                key={edge.id}
                d={edgePath(from, to, edge.lineType)}
                fill="none"
                stroke={edge.color}
                strokeWidth={2}
                strokeDasharray={dashArray(edge.linePattern)}
                strokeLinecap="round"
                strokeLinejoin="round"
                markerStart={edge.startCap && edge.startCap !== 'none' ? `url(#cap-${edge.startCap})` : undefined}
                markerEnd={edge.endCap && edge.endCap !== 'none' ? `url(#cap-${edge.endCap})` : undefined}
              />
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
                if (e.shiftKey) {
                  const next = doc.selectedIds.includes(node.id)
                    ? doc.selectedIds.filter((id) => id !== node.id)
                    : [...doc.selectedIds, node.id]
                  onSelectMany(next)
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
                d={shapePath(node.shape, node.x, node.y, node.width, node.height)}
                fill={node.color}
                stroke="var(--node-stroke)"
                strokeWidth={1.5}
              />
              {node.note?.trim() ? <title>{node.note}</title> : null}
              <text className="node-label" x={node.x + node.width / 2} y={node.y + node.height / 2 + 1}>
                <tspan
                  fill={resolveTextColor(node.textStyle?.color, theme)}
                  fontFamily={fontFamily(node.textStyle?.fontFamily ?? 'notoSansKr')}
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
              </text>
              {node.note?.trim() ? (
                <g className="node-note-badge" aria-hidden>
                  <circle cx={node.x + node.width - 10} cy={node.y + 10} r={7} fill="var(--accent)" />
                  <text
                    x={node.x + node.width - 10}
                    y={node.y + 10 + 0.5}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={10}
                    fontWeight={700}
                    fill="#ffffff"
                  >
                    ✎
                  </text>
                </g>
              ) : null}
            </g>
          ))}

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

      {editingNode && (
        <input
          className="node-editor"
          style={{
            left: pan.x + editingNode.x * zoom,
            top: pan.y + editingNode.y * zoom,
            width: Math.max(120, editingNode.width * zoom),
            height: editingNode.height * zoom,
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
