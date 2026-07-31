import { useEffect, useMemo, useRef, useState, type WheelEvent } from 'react'
import type { DiagramDocument, DiagramNode, LineType, ShapeType } from '../types'

type Props = {
  doc: DiagramDocument
  zoom: number
  showGrid: boolean
  viewResetKey: number
  editingId: string | null
  onSelect: (id: string | null) => void
  onMoveNode: (id: string, x: number, y: number) => void
  onContext: (x: number, y: number, nodeId: string | null) => void
  onEditStart: (id: string) => void
  onEditCommit: (id: string, text: string) => void
  onEditCancel: () => void
  onZoom: (zoom: number) => void
}

const GRID = 20

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

function dashArray(lineType: LineType): string | undefined {
  if (lineType === 'dashed') return '8 6'
  if (lineType === 'dotted') return '2 5'
  return undefined
}

function edgePath(
  from: DiagramNode,
  to: DiagramNode,
  lineType: LineType,
  mode: DiagramDocument['mode'],
): string {
  const x1 = from.x + from.width / 2
  const y1 = from.y + from.height / 2
  const x2 = to.x + to.width / 2
  const y2 = to.y + to.height / 2

  if (mode === 'fishbone') {
    return `M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2}`
  }

  if (lineType === 'curve') {
    const mx = (x1 + x2) / 2
    return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
  }
  return `M ${x1} ${y1} L ${x2} ${y2}`
}

type DragState =
  | { kind: 'pan'; ox: number; oy: number; px: number; py: number }
  | { kind: 'node'; id: string; ox: number; oy: number; nx: number; ny: number }

export function DiagramCanvas({
  doc,
  zoom,
  showGrid,
  viewResetKey,
  editingId,
  onSelect,
  onMoveNode,
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
  const [dragPreview, setDragPreview] = useState<{ id: string; x: number; y: number } | null>(null)
  const drag = useRef<DragState | null>(null)

  const nodeMap = useMemo(() => {
    const map = new Map(doc.nodes.map((n) => [n.id, n]))
    if (dragPreview) {
      const node = map.get(dragPreview.id)
      if (node) map.set(dragPreview.id, { ...node, x: dragPreview.x, y: dragPreview.y })
    }
    return map
  }, [doc.nodes, dragPreview])

  const nodes = useMemo(() => Array.from(nodeMap.values()), [nodeMap])
  const editingNode = editingId ? nodeMap.get(editingId) : null

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
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const next = Math.min(2, Math.max(0.4, zoom + (e.deltaY > 0 ? -0.08 : 0.08)))
    onZoom(Number(next.toFixed(2)))
  }

  const endDrag = () => {
    if (drag.current?.kind === 'node' && dragPreview) {
      onMoveNode(dragPreview.id, dragPreview.x, dragPreview.y)
    }
    drag.current = null
    setDragPreview(null)
  }

  return (
    <div
      className="canvas-wrap"
      onContextMenu={(e) => {
        e.preventDefault()
        onContext(e.clientX, e.clientY, null)
      }}
      onWheel={onWheel}
    >
      <svg
        ref={svgRef}
        className={`canvas-svg ${drag.current?.kind === 'node' ? 'dragging-node' : ''}`}
        onMouseDown={(e) => {
          if (e.button !== 0) return
          if ((e.target as Element).closest('.node-hit')) return
          drag.current = { kind: 'pan', ox: e.clientX, oy: e.clientY, px: pan.x, py: pan.y }
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
          const x = d.nx + (e.clientX - d.ox) / zoom
          const y = d.ny + (e.clientY - d.oy) / zoom
          setDragPreview({ id: d.id, x, y })
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
          {doc.mode === 'fishbone' && (
            <line
              x1={80}
              y1={(window.innerHeight - 120) / 2 / zoom}
              x2={(window.innerWidth - 160) / zoom}
              y2={(window.innerHeight - 120) / 2 / zoom}
              stroke="var(--spine)"
              strokeWidth={3}
              strokeLinecap="round"
            />
          )}

          {doc.edges.map((edge) => {
            const from = nodeMap.get(edge.from)
            const to = nodeMap.get(edge.to)
            if (!from || !to) return null
            return (
              <path
                key={edge.id}
                d={edgePath(from, to, edge.lineType, doc.mode)}
                fill="none"
                stroke={edge.color}
                strokeWidth={2}
                strokeDasharray={dashArray(edge.lineType)}
              />
            )
          })}

          {nodes.map((node) => (
            <g
              key={node.id}
              className={`node-hit ${doc.selectedId === node.id ? 'selected' : ''}`}
              onMouseDown={(e) => {
                e.stopPropagation()
                if (e.button !== 0) return
                onSelect(node.id)
                drag.current = {
                  kind: 'node',
                  id: node.id,
                  ox: e.clientX,
                  oy: e.clientY,
                  nx: node.x,
                  ny: node.y,
                }
                setDragPreview({ id: node.id, x: node.x, y: node.y })
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
              <text className="node-label" x={node.x + node.width / 2} y={node.y + node.height / 2 + 1}>
                {node.text.length > 18 ? `${node.text.slice(0, 18)}…` : node.text}
              </text>
            </g>
          ))}
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
