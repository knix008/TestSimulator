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
  vdir: 1 | -1, // +1: children below (ttb), -1: children above (btt)
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
    const cy = y + vdir * (NODE_H + V_GAP + depth * 10)
    layoutVerticalTree(nodes, kid.id, cx, cy, depth + 1, vdir, out)
    cursor += w + H_GAP
  }
}

// Count the leaves under a node (a node with no children counts as one leaf).
// Leaf counts drive how much angular room each subtree reserves, so dense
// branches get a proportionally wider wedge and siblings never overlap.
function leafCount(nodes: DiagramNode[], id: string): number {
  const kids = childrenOf(nodes, id)
  if (kids.length === 0) return 1
  return kids.reduce((sum, k) => sum + leafCount(nodes, k.id), 0)
}

function treeDepth(nodes: DiagramNode[], id: string): number {
  const kids = childrenOf(nodes, id)
  if (kids.length === 0) return 0
  return 1 + Math.max(...kids.map((k) => treeDepth(nodes, k.id)))
}

// Recursive sector (wedge) radial layout: every node owns an angular slice, and
// its children split that slice proportionally to their leaf counts and sit one
// ring further out. Because a child stays inside its parent's wedge, branches
// never cross and siblings never collide.
function layoutRadial(nodes: DiagramNode[], rootId: string, cx: number, cy: number) {
  const out = new Map<string, { x: number; y: number }>()
  out.set(rootId, { x: cx - NODE_W / 2, y: cy - NODE_H / 2 })

  const totalLeaves = leafCount(nodes, rootId)
  const depth = Math.max(1, treeDepth(nodes, rootId))
  // Ring spacing wide enough that even if every leaf landed on the outermost
  // ring they would still clear NODE_W; keeps a comfortable gap between nodes.
  const ringGap = Math.max(200, (totalLeaves * (NODE_W + 40)) / (Math.PI * 2 * depth))

  const place = (id: string, a0: number, a1: number, level: number) => {
    const kids = childrenOf(nodes, id)
    if (kids.length === 0) return
    const total = kids.reduce((sum, k) => sum + leafCount(nodes, k.id), 0)
    const radius = level * ringGap
    let a = a0
    for (const kid of kids) {
      const span = (a1 - a0) * (leafCount(nodes, kid.id) / total)
      const mid = a + span / 2
      out.set(kid.id, {
        x: cx + Math.cos(mid) * radius - NODE_W / 2,
        y: cy + Math.sin(mid) * radius - NODE_H / 2,
      })
      place(kid.id, a, a + span, level + 1)
      a += span
    }
  }

  place(rootId, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2, 1)
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
// Spacing is kept compact but must satisfy FISH_RISE - FISH_SUB_RISE >= NODE_H so
// a category's first-level children can still fan to the spine side without being
// clamped away.
const FISH_RISE = 140 // vertical distance from the spine to a category center
const FISH_RUN = FISH_RISE / FISH_TAN // horizontal run of a category bone
const FISH_FIRST_OFFSET = 44 // gap from the head to the first category bone
const FISH_MARGIN = 90
const FISH_SUB_RISE = 95 // vertical distance from a sub-axis to its child
const FISH_SUB_RUN = FISH_SUB_RISE / FISH_TAN // horizontal run of a sub bone
const FISH_SUB_FIRST = 38 // gap from a node to its first child bone
const FISH_BONE_GAP = 38 // minimum clear gap between adjacent category subtrees
const FISH_SUB_GAP = 26 // minimum clear gap between adjacent child subtrees

// Total number of nodes in a subtree (used to balance branches above/below).
function subtreeCount(nodes: DiagramNode[], id: string): number {
  return 1 + childrenOf(nodes, id).reduce((sum, k) => sum + subtreeCount(nodes, k.id), 0)
}

// Horizontal reach of a node's subtree, measured from the node centre. Every
// child occupies its own horizontal slot (past the previous child's whole
// subtree), so siblings — whichever side they fan to — never overlap.
function fishReach(nodes: DiagramNode[], id: string): number {
  let maxReach = NODE_W / 2
  let d = FISH_SUB_FIRST + FISH_SUB_RUN
  for (const kid of childrenOf(nodes, id)) {
    const r = fishReach(nodes, kid.id)
    maxReach = Math.max(maxReach, d + r)
    d += r + FISH_SUB_GAP + NODE_W / 2
  }
  return maxReach
}

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

  // Lay a node's children as a nested fishbone: each child gets its own slot
  // along the parent's axis and fans above or below it (whichever side holds
  // fewer nodes so far), recursing so deeper causes are also split evenly
  // above/below their parent. `catSide` is the spine side this whole branch lives
  // on; a child is never placed across the spine (clamped to catSide), so — since
  // each subtree owns its own horizontal band — the above and below halves can
  // reuse the same x-range without ever colliding.
  const branch = (parentId: string, axisX: number, axisY: number, catSide: number) => {
    let d = FISH_SUB_FIRST + FISH_SUB_RUN
    let upLoad = 0
    let downLoad = 0
    for (const kid of childrenOf(nodes, parentId)) {
      let side = upLoad <= downLoad ? -1 : 1
      let cy = axisY + side * FISH_SUB_RISE
      // Keep the child (and thus its subtree) on the category's side of the spine.
      if ((catSide < 0 && cy > spineY - NODE_H) || (catSide > 0 && cy < spineY + NODE_H)) {
        side = catSide
        cy = axisY + side * FISH_SUB_RISE
      }
      if (side < 0) upLoad += subtreeCount(nodes, kid.id)
      else downLoad += subtreeCount(nodes, kid.id)
      const cx = axisX - dir * d
      place(kid, cx, cy)
      branch(kid.id, cx, cy, catSide)
      d += fishReach(nodes, kid.id) + FISH_SUB_GAP + NODE_W / 2
    }
  }

  // Distribute categories evenly above/below the spine by *subtree size* (each
  // goes to whichever side holds fewer nodes so far, ties go up). Each side keeps
  // its own cursor so the diagram stays compact; branches never cross the spine
  // (see branch's clamp), so the two halves can overlap horizontally safely.
  let aboveCursor = FISH_FIRST_OFFSET + FISH_RUN
  let belowCursor = FISH_FIRST_OFFSET + FISH_RUN
  let aboveLoad = 0
  let belowLoad = 0
  childrenOf(nodes, effect.id).forEach((cat) => {
    const load = subtreeCount(nodes, cat.id)
    const side = aboveLoad <= belowLoad ? -1 : 1 // -1 above the spine, +1 below
    const cursor = side < 0 ? aboveCursor : belowCursor
    const cx = headEdgeX - dir * cursor
    const cy = spineY + side * FISH_RISE
    place(cat, cx, cy)
    branch(cat.id, cx, cy, side)
    const advance = fishReach(nodes, cat.id) + FISH_BONE_GAP + NODE_W / 2
    if (side < 0) {
      aboveCursor = cursor + advance
      aboveLoad += load
    } else {
      belowCursor = cursor + advance
      belowLoad += load
    }
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
    layoutVerticalTree(nodes, root.id, viewportW / 2 - NODE_W / 2, 80, 0, 1, positions)
  } else if (layout === 'btt') {
    positions = new Map()
    layoutVerticalTree(nodes, root.id, viewportW / 2 - NODE_W / 2, viewportH - 80 - NODE_H, 0, -1, positions)
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
