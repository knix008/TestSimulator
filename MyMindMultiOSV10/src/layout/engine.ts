import type { DiagramMode, DiagramNode, LayoutDirection } from '../types'

const NODE_W = 140
const NODE_H = 44
const H_GAP = 48
const V_GAP = 28

function childrenOf(nodes: DiagramNode[], parentId: string): DiagramNode[] {
  return nodes.filter((n) => n.parentId === parentId)
}

function subtreeHeight(nodes: DiagramNode[], id: string): number {
  const kids = childrenOf(nodes, id)
  if (kids.length === 0) return NODE_H
  return kids.reduce((sum, k) => sum + subtreeHeight(nodes, k.id), 0) + (kids.length - 1) * V_GAP
}

function layoutTree(
  nodes: DiagramNode[],
  id: string,
  x: number,
  y: number,
  dir: 1 | -1,
  depth: number,
  out: Map<string, { x: number; y: number }>,
) {
  out.set(id, { x, y })
  const kids = childrenOf(nodes, id)
  if (kids.length === 0) return

  const totalH = kids.reduce((sum, k) => sum + subtreeHeight(nodes, k.id), 0) + (kids.length - 1) * V_GAP
  let cursor = y - totalH / 2

  for (const kid of kids) {
    const h = subtreeHeight(nodes, kid.id)
    const cy = cursor + h / 2
    const cx = x + dir * (NODE_W + H_GAP + depth * 8)
    layoutTree(nodes, kid.id, cx, cy, dir, depth + 1, out)
    cursor += h + V_GAP
  }
}

function layoutRadial(nodes: DiagramNode[], rootId: string, cx: number, cy: number) {
  const out = new Map<string, { x: number; y: number }>()
  out.set(rootId, { x: cx, y: cy })

  const placeLevel = (parentIds: string[], radius: number) => {
    const levelNodes = parentIds.flatMap((pid) => childrenOf(nodes, pid))
    if (levelNodes.length === 0) return
    const step = (Math.PI * 2) / levelNodes.length
    levelNodes.forEach((node, i) => {
      const angle = -Math.PI / 2 + step * i
      out.set(node.id, {
        x: cx + Math.cos(angle) * radius - NODE_W / 2,
        y: cy + Math.sin(angle) * radius - NODE_H / 2,
      })
    })
    placeLevel(
      levelNodes.map((n) => n.id),
      radius + 180,
    )
  }

  placeLevel([rootId], 180)
  return out
}

function layoutFishbone(nodes: DiagramNode[], width: number, height: number) {
  const out = new Map<string, { x: number; y: number }>()
  const effect = nodes.find((n) => n.role === 'effect') ?? nodes.find((n) => !n.parentId)
  if (!effect) return out

  const spineY = height / 2
  const effectX = width - 220
  out.set(effect.id, { x: effectX, y: spineY - NODE_H / 2 })

  const categories = childrenOf(nodes, effect.id)
  const mid = (categories.length - 1) / 2

  categories.forEach((cat, i) => {
    const side = i % 2 === 0 ? -1 : 1
    const index = Math.floor(i / 2)
    const x = 180 + index * 200 + (i > mid ? 40 : 0)
    const y = spineY + side * 140
    out.set(cat.id, { x, y: y - NODE_H / 2 })

    const causes = childrenOf(nodes, cat.id)
    causes.forEach((cause, ci) => {
      out.set(cause.id, {
        x: x + 20 + ci * 10,
        y: y + side * (60 + ci * (NODE_H + 12)) - NODE_H / 2,
      })
    })
  })

  return out
}

export function applyLayout(
  nodes: DiagramNode[],
  mode: DiagramMode,
  layout: LayoutDirection,
  viewportW: number,
  viewportH: number,
): DiagramNode[] {
  if (nodes.length === 0) return nodes

  const root = nodes.find((n) => n.parentId === null) ?? nodes[0]
  const cy = viewportH / 2 - NODE_H / 2

  let positions: Map<string, { x: number; y: number }>

  if (mode === 'fishbone') {
    positions = layoutFishbone(nodes, viewportW, viewportH)
  } else if (layout === 'radial') {
    positions = layoutRadial(nodes, root.id, viewportW / 2, viewportH / 2)
  } else {
    positions = new Map()
    const dir: 1 | -1 = layout === 'ltr' ? 1 : -1
    const startX = layout === 'ltr' ? 80 : viewportW - 80 - NODE_W
    layoutTree(nodes, root.id, startX, cy, dir, 0, positions)
  }

  return nodes.map((n) => {
    const p = positions.get(n.id)
    if (!p) return n
    return {
      ...n,
      x: p.x,
      y: p.y,
      width: n.width || NODE_W,
      height: n.height || NODE_H,
    }
  })
}

export { NODE_W, NODE_H }
