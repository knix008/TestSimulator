import type { DiagramMode, DiagramNode, LayoutDirection } from '../types'

const NODE_W = 140
const NODE_H = 44
const H_GAP = 72
const V_GAP = 44

function childrenOf(nodes: DiagramNode[], parentId: string): DiagramNode[] {
  return nodes.filter((n) => n.parentId === parentId)
}

function subtreeHeight(nodes: DiagramNode[], id: string): number {
  const kids = childrenOf(nodes, id)
  if (kids.length === 0) return NODE_H
  return kids.reduce((sum, k) => sum + subtreeHeight(nodes, k.id), 0) + (kids.length - 1) * V_GAP
}

function subtreeWidth(nodes: DiagramNode[], id: string): number {
  const kids = childrenOf(nodes, id)
  if (kids.length === 0) return NODE_W
  return kids.reduce((sum, k) => sum + subtreeWidth(nodes, k.id), 0) + (kids.length - 1) * H_GAP
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

function layoutVerticalTree(
  nodes: DiagramNode[],
  id: string,
  x: number,
  y: number,
  depth: number,
  out: Map<string, { x: number; y: number }>,
) {
  out.set(id, { x, y })
  const kids = childrenOf(nodes, id)
  if (kids.length === 0) return

  const totalW = kids.reduce((sum, k) => sum + subtreeWidth(nodes, k.id), 0) + (kids.length - 1) * H_GAP
  let cursor = x + NODE_W / 2 - totalW / 2

  for (const kid of kids) {
    const w = subtreeWidth(nodes, kid.id)
    const cx = cursor + w / 2 - NODE_W / 2
    const cy = y + NODE_H + V_GAP + depth * 10
    layoutVerticalTree(nodes, kid.id, cx, cy, depth + 1, out)
    cursor += w + H_GAP
  }
}

function layoutRadial(nodes: DiagramNode[], rootId: string, cx: number, cy: number) {
  const out = new Map<string, { x: number; y: number }>()
  out.set(rootId, { x: cx - NODE_W / 2, y: cy - NODE_H / 2 })

  const RING_GAP = 210 // minimum radius increase per level
  const ARC_GAP = NODE_W + 60 // minimum arc length reserved for each node

  const placeLevel = (parentIds: string[], level: number) => {
    const levelNodes = parentIds.flatMap((pid) => childrenOf(nodes, pid))
    if (levelNodes.length === 0) return
    const step = (Math.PI * 2) / levelNodes.length
    // Grow the ring so nodes never crowd, even with many siblings on one level.
    const radius = Math.max(level * RING_GAP, (levelNodes.length * ARC_GAP) / (Math.PI * 2))
    levelNodes.forEach((node, i) => {
      const angle = -Math.PI / 2 + step * i
      out.set(node.id, {
        x: cx + Math.cos(angle) * radius - NODE_W / 2,
        y: cy + Math.sin(angle) * radius - NODE_H / 2,
      })
    })
    placeLevel(
      levelNodes.map((n) => n.id),
      level + 1,
    )
  }

  placeLevel([rootId], 1)
  return out
}

// Nested fishbone (Ishikawa) geometry. Every parent runs a *horizontal* axis
// (the spine for the effect, a sub-axis for each category/cause); its children
// branch off that axis as diagonal "bones" at a fixed angle and sit at the bone
// ends. Categories alternate above/below the spine; deeper children stay on the
// same side, marching outward. The canvas re-derives every bone attach point
// from these positions using the same angle, so bones stay pinned to their
// parent's axis even after a node is dragged.
export const FISH_ANGLE_DEG = 58
const FISH_TAN = Math.tan((FISH_ANGLE_DEG * Math.PI) / 180)
const FISH_RISE = 165 // vertical distance from the spine to a category center
const FISH_RUN = FISH_RISE / FISH_TAN // horizontal run of a category bone
const FISH_BONE_GAP = 300 // spacing between successive category bones on the spine
const FISH_FIRST_OFFSET = 90 // gap from the head to the first category bone
const FISH_MARGIN = 90
const FISH_SUB_RISE = 120 // vertical distance from a sub-axis to its child
const FISH_SUB_RUN = FISH_SUB_RISE / FISH_TAN // horizontal run of a sub bone
const FISH_SUB_FIRST = 85 // gap from a node to its first child bone
// Children share a sub-axis y, so this must clear the node width to avoid overlap.
const FISH_SUB_GAP = NODE_W + 60

function layoutFishbone(nodes: DiagramNode[], width: number, height: number, layout: LayoutDirection) {
  const out = new Map<string, { x: number; y: number }>()
  const effect = nodes.find((n) => n.role === 'effect') ?? nodes.find((n) => !n.parentId)
  if (!effect) return out

  const isRtl = layout === 'rtl'
  const dir = isRtl ? -1 : 1 // +1: head on the right, bones angle rightward toward it
  const spineY = height / 2
  const effectW = effect.width || NODE_W + 40
  const effectH = effect.height || NODE_H

  const headCenterX = isRtl ? FISH_MARGIN + effectW / 2 : width - FISH_MARGIN - effectW / 2
  out.set(effect.id, { x: headCenterX - effectW / 2, y: spineY - effectH / 2 })
  // The spine meets the effect at its inner edge; category bones attach along it.
  const headEdgeX = headCenterX - dir * (effectW / 2)

  const place = (node: DiagramNode, cx: number, cy: number) => {
    const w = node.width || NODE_W
    const h = node.height || NODE_H
    out.set(node.id, { x: cx - w / 2, y: cy - h / 2 })
  }

  // Lay a node's children along its horizontal axis at (axisX, axisY), each on a
  // diagonal sub-bone toward `side`, then recurse for deeper causes.
  const branch = (parentId: string, axisX: number, axisY: number, side: number) => {
    childrenOf(nodes, parentId).forEach((kid, k) => {
      const attachX = axisX - dir * (FISH_SUB_FIRST + k * FISH_SUB_GAP)
      const cx = attachX - dir * FISH_SUB_RUN
      const cy = axisY + side * FISH_SUB_RISE
      place(kid, cx, cy)
      branch(kid.id, cx, cy, side)
    })
  }

  childrenOf(nodes, effect.id).forEach((cat, i) => {
    const side = i % 2 === 0 ? -1 : 1 // -1 above the spine, +1 below
    const pair = Math.floor(i / 2)
    const attachX = headEdgeX - dir * (FISH_FIRST_OFFSET + pair * FISH_BONE_GAP)
    const cx = attachX - dir * FISH_RUN
    const cy = spineY + side * FISH_RISE
    place(cat, cx, cy)
    branch(cat.id, cx, cy, side)
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
    positions = layoutFishbone(nodes, viewportW, viewportH, layout)
  } else if (layout === 'radial') {
    positions = layoutRadial(nodes, root.id, viewportW / 2, viewportH / 2)
  } else if (layout === 'ttb') {
    positions = new Map()
    layoutVerticalTree(nodes, root.id, viewportW / 2 - NODE_W / 2, 80, 0, positions)
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
