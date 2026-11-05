import { v4 as uuid } from 'uuid'
import type {
  DiagramDocument,
  DiagramEdge,
  DiagramMode,
  DiagramNode,
  EdgeSide,
  EndCap,
  LayoutDirection,
  LinePattern,
  LineType,
  ShapeType,
  TextStyle,
} from '../types'
import { AUTO_TEXT_COLOR, NODE_COLORS } from '../constants/colors'
import { applyLayout, NODE_H, NODE_W } from '../layout/engine'

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: 'notoSansKr',
  fontSize: 13,
  color: AUTO_TEXT_COLOR,
  bold: true,
  italic: false,
  underline: false,
  strike: false,
}

function colorAt(i: number) {
  return NODE_COLORS[i % NODE_COLORS.length]
}

function nodeLevel(doc: DiagramDocument, nodeId: string | null): number {
  let level = 0
  let currentId = nodeId
  while (currentId) {
    const current = doc.nodes.find((node) => node.id === currentId)
    if (!current?.parentId) return level
    currentId = current.parentId
    level += 1
  }
  return level
}

function colorForLevel(level: number) {
  return colorAt(level)
}

function defaultNodeTextStyle(): TextStyle {
  return { ...DEFAULT_TEXT_STYLE }
}

function normalizeLineType(value: unknown): LineType {
  if (value === 'curve' || value === 'straight' || value === 'elbow' || value === 'root') return value
  return 'straight'
}

function normalizeLinePattern(value: unknown, fallback?: unknown): LinePattern {
  if (value === 'solid' || value === 'dashed' || value === 'dotted' || value === 'dashdot') return value
  if (fallback === 'solid' || fallback === 'dashed' || fallback === 'dotted') return fallback
  return 'solid'
}

function normalizeEndCap(value: unknown): EndCap {
  if (value === 'arrow' || value === 'dot' || value === 'diamond') return value
  return 'none'
}

function normalizeSide(value: unknown): EdgeSide {
  if (value === 'top' || value === 'bottom' || value === 'left' || value === 'right') return value
  return 'auto'
}

function normalizeTextStyle(style: Partial<TextStyle> | undefined): TextStyle {
  return { ...DEFAULT_TEXT_STYLE, ...style }
}

export function createMindmapDoc(centralText: string): DiagramDocument {
  const rootId = uuid()
  const nodes: DiagramNode[] = [
    {
      id: rootId,
      parentId: null,
      text: centralText,
      x: 0,
      y: 0,
      width: NODE_W + 20,
      height: NODE_H + 8,
      shape: 'rounded',
      color: colorForLevel(0),
      textStyle: defaultNodeTextStyle(),
    },
  ]
  return {
    version: 1,
    mode: 'mindmap',
    layout: 'radial',
    defaultShape: 'rounded',
    defaultLine: 'curve',
    defaultLinePattern: 'solid',
    nodes,
    edges: [],
    selectedId: rootId,
    selectedIds: [rootId],
    selectedEdgeId: null,
    filePath: null,
    dirty: false,
  }
}

export function createFishboneDoc(effectText: string, categoryText: string): DiagramDocument {
  const effectId = uuid()
  const catIds = [uuid(), uuid(), uuid(), uuid()]
  const nodes: DiagramNode[] = [
    {
      id: effectId,
      parentId: null,
      text: effectText,
      x: 0,
      y: 0,
      width: NODE_W + 40,
      height: NODE_H + 8,
      shape: 'rounded',
      color: colorForLevel(0),
      textStyle: defaultNodeTextStyle(),
      role: 'effect',
    },
    ...catIds.map((id, i) => ({
      id,
      parentId: effectId,
      text: `${categoryText} ${i + 1}`,
      x: 0,
      y: 0,
      width: NODE_W,
      height: NODE_H,
      shape: 'rect' as ShapeType,
      color: colorForLevel(1),
      textStyle: defaultNodeTextStyle(),
      role: 'category' as const,
    })),
  ]
  const edges: DiagramEdge[] = catIds.map((id) => ({
    id: uuid(),
    from: effectId,
    to: id,
    lineType: 'straight',
    linePattern: 'solid',
    color: '#94a3b8',
  }))
  return {
    version: 1,
    mode: 'fishbone',
    layout: 'ltr',
    defaultShape: 'rect',
    defaultLine: 'straight',
    defaultLinePattern: 'solid',
    nodes,
    edges,
    selectedId: effectId,
    selectedIds: [effectId],
    selectedEdgeId: null,
    filePath: null,
    dirty: false,
  }
}

export function relayout(doc: DiagramDocument, w = 1200, h = 700): DiagramDocument {
  return {
    ...doc,
    nodes: applyLayout(doc.nodes, doc.mode, doc.layout, w, h),
  }
}

export function addChild(
  doc: DiagramDocument,
  parentId: string,
  text: string,
  role?: DiagramNode['role'],
): DiagramDocument {
  const id = uuid()
  const parent = doc.nodes.find((n) => n.id === parentId)
  const siblings = doc.nodes.filter((n) => n.parentId === parentId)
  const level = nodeLevel(doc, parentId) + 1
  const node: DiagramNode = {
    id,
    parentId,
    text,
    x: (parent?.x ?? 0) + 160,
    y: (parent?.y ?? 0) + siblings.length * (NODE_H + 16),
    width: NODE_W,
    height: NODE_H,
    shape: doc.defaultShape,
    color: colorForLevel(level),
    textStyle: defaultNodeTextStyle(),
    role: role ?? (doc.mode === 'fishbone' ? (parent?.role === 'effect' ? 'category' : 'cause') : undefined),
  }
  const edge: DiagramEdge = {
    id: uuid(),
    from: parentId,
    to: id,
    lineType: doc.defaultLine,
    linePattern: doc.defaultLinePattern,
    color: '#94a3b8',
  }
  return {
    ...doc,
    nodes: [...doc.nodes, node],
    edges: [...doc.edges, edge],
    selectedId: id,
    selectedIds: [id],
    selectedEdgeId: null,
    dirty: true,
  }
}

export function addFreeNode(doc: DiagramDocument, text: string, x: number, y: number): DiagramDocument {
  const id = uuid()
  const node: DiagramNode = {
    id,
    parentId: null,
    text,
    x,
    y,
    width: NODE_W,
    height: NODE_H,
    shape: doc.defaultShape,
    color: colorForLevel(0),
    textStyle: defaultNodeTextStyle(),
  }
  return {
    ...doc,
    nodes: [...doc.nodes, node],
    selectedId: id,
    selectedIds: [id],
    selectedEdgeId: null,
    dirty: true,
  }
}

export function addSibling(doc: DiagramDocument, nodeId: string, text: string): DiagramDocument {
  const node = doc.nodes.find((n) => n.id === nodeId)
  if (!node?.parentId) return addChild(doc, nodeId, text)
  return addChild(doc, node.parentId, text, node.role)
}

export function deleteNode(doc: DiagramDocument, nodeId: string): DiagramDocument {
  return deleteNodes(doc, [nodeId])
}

export function deleteNodes(doc: DiagramDocument, nodeIds: string[]): DiagramDocument {
  const root = doc.nodes.find((n) => n.parentId === null)
  const toRemove = new Set<string>()
  const walk = (id: string) => {
    toRemove.add(id)
    doc.nodes.filter((n) => n.parentId === id).forEach((c) => walk(c.id))
  }
  for (const id of nodeIds) {
    if (id === root?.id) continue // never delete the root
    walk(id)
  }
  if (toRemove.size === 0) return doc

  return {
    ...doc,
    nodes: doc.nodes.filter((n) => !toRemove.has(n.id)),
    edges: doc.edges.filter((e) => !toRemove.has(e.from) && !toRemove.has(e.to)),
    selectedId: root?.id ?? null,
    selectedIds: root ? [root.id] : [],
    selectedEdgeId: null,
    dirty: true,
  }
}

/** Return a node and all of its descendants (the node itself is index 0). */
export function collectSubtree(nodes: DiagramNode[], rootId: string): DiagramNode[] {
  const result: DiagramNode[] = []
  const walk = (id: string) => {
    const node = nodes.find((n) => n.id === id)
    if (!node) return
    result.push(node)
    nodes.filter((c) => c.parentId === id).forEach((c) => walk(c.id))
  }
  walk(rootId)
  return result
}

/**
 * Insert a copied subtree (as returned by collectSubtree) into the document with
 * fresh ids. Attaches under `targetParentId`, or as a free root when it is null.
 * Offsets every node by (dx, dy) so a paste/duplicate does not land exactly on
 * the original.
 */
export function insertSubtree(
  doc: DiagramDocument,
  subtree: DiagramNode[],
  targetParentId: string | null,
  dx: number,
  dy: number,
): DiagramDocument {
  if (subtree.length === 0) return doc
  const oldRootId = subtree[0].id
  const idMap = new Map<string, string>()
  subtree.forEach((n) => idMap.set(n.id, uuid()))

  const newNodes: DiagramNode[] = subtree.map((n) => ({
    ...n,
    id: idMap.get(n.id)!,
    parentId: n.id === oldRootId ? targetParentId : idMap.get(n.parentId as string)!,
    x: n.x + dx,
    y: n.y + dy,
  }))

  const newEdges: DiagramEdge[] = subtree
    .filter((n) => n.id !== oldRootId)
    .map((n) => ({
      id: uuid(),
      from: idMap.get(n.parentId as string)!,
      to: idMap.get(n.id)!,
      lineType: doc.defaultLine,
      linePattern: doc.defaultLinePattern,
      color: '#94a3b8',
    }))
  if (targetParentId) {
    newEdges.push({
      id: uuid(),
      from: targetParentId,
      to: idMap.get(oldRootId)!,
      lineType: doc.defaultLine,
      linePattern: doc.defaultLinePattern,
      color: '#94a3b8',
    })
  }

  const mergedNodes = [...doc.nodes, ...newNodes]
  const newRootId = idMap.get(oldRootId)!
  return {
    ...doc,
    // Re-derive fishbone roles so a pasted branch fits its new parent.
    nodes: doc.mode === 'fishbone' ? assignFishboneRoles(mergedNodes) : mergedNodes,
    edges: [...doc.edges, ...newEdges],
    selectedId: newRootId,
    selectedIds: [newRootId],
    selectedEdgeId: null,
    dirty: true,
  }
}

/** Duplicate a node and its subtree as a sibling (same parent), nudged nearby. */
export function duplicateNode(doc: DiagramDocument, nodeId: string): DiagramDocument {
  const node = doc.nodes.find((n) => n.id === nodeId)
  if (!node) return doc
  const subtree = collectSubtree(doc.nodes, nodeId)
  return insertSubtree(doc, subtree, node.parentId, 40, 40)
}

export function moveNode(doc: DiagramDocument, nodeId: string, x: number, y: number): DiagramDocument {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)),
    dirty: true,
  }
}

export function moveNodesBy(
  doc: DiagramDocument,
  nodeIds: string[],
  dx: number,
  dy: number,
): DiagramDocument {
  const ids = new Set(nodeIds)
  return {
    ...doc,
    nodes: doc.nodes.map((n) => (ids.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)),
    dirty: true,
  }
}

export function updateNodeText(doc: DiagramDocument, nodeId: string, text: string): DiagramDocument {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => (n.id === nodeId ? { ...n, text } : n)),
    dirty: true,
  }
}

export function setNodeNote(doc: DiagramDocument, nodeId: string, note: string): DiagramDocument {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => (n.id === nodeId ? { ...n, note } : n)),
    dirty: true,
  }
}

export function setNodeShape(doc: DiagramDocument, nodeId: string, shape: ShapeType): DiagramDocument {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => (n.id === nodeId ? { ...n, shape } : n)),
    defaultShape: shape,
    dirty: true,
  }
}

export function setNodeColor(doc: DiagramDocument, nodeId: string, color: string): DiagramDocument {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => (n.id === nodeId ? { ...n, color } : n)),
    dirty: true,
  }
}

export function setNodeTextStyle(
  doc: DiagramDocument,
  nodeId: string,
  textStyle: Partial<TextStyle>,
): DiagramDocument {
  return {
    ...doc,
    nodes: doc.nodes.map((n) =>
      n.id === nodeId ? { ...n, textStyle: { ...normalizeTextStyle(n.textStyle), ...textStyle } } : n,
    ),
    dirty: true,
  }
}

/** Select a single edge, clearing any node selection (they are exclusive). */
export function selectEdge(doc: DiagramDocument, edgeId: string | null): DiagramDocument {
  return { ...doc, selectedEdgeId: edgeId, selectedId: null, selectedIds: [] }
}

/** Patch one edge by id, updating the relevant document default when present. */
export function updateEdgeById(
  doc: DiagramDocument,
  edgeId: string,
  patch: Partial<DiagramEdge>,
): DiagramDocument {
  return {
    ...doc,
    edges: doc.edges.map((e) => (e.id === edgeId ? { ...e, ...patch } : e)),
    ...(patch.lineType ? { defaultLine: patch.lineType } : {}),
    ...(patch.linePattern ? { defaultLinePattern: patch.linePattern } : {}),
    dirty: true,
  }
}

export function setEdgeLine(doc: DiagramDocument, nodeId: string, lineType: LineType): DiagramDocument {
  return {
    ...doc,
    edges: doc.edges.map((e) => (e.to === nodeId || e.from === nodeId ? { ...e, lineType } : e)),
    defaultLine: lineType,
    dirty: true,
  }
}

export function setEdgeColor(doc: DiagramDocument, nodeId: string, color: string): DiagramDocument {
  return {
    ...doc,
    edges: doc.edges.map((e) => (e.to === nodeId || e.from === nodeId ? { ...e, color } : e)),
    dirty: true,
  }
}

export function setEdgeStartCap(doc: DiagramDocument, nodeId: string, startCap: EndCap): DiagramDocument {
  return {
    ...doc,
    edges: doc.edges.map((e) => (e.to === nodeId || e.from === nodeId ? { ...e, startCap } : e)),
    dirty: true,
  }
}

export function setEdgeEndCap(doc: DiagramDocument, nodeId: string, endCap: EndCap): DiagramDocument {
  return {
    ...doc,
    edges: doc.edges.map((e) => (e.to === nodeId || e.from === nodeId ? { ...e, endCap } : e)),
    dirty: true,
  }
}

export function setEdgePattern(doc: DiagramDocument, nodeId: string, linePattern: LinePattern): DiagramDocument {
  return {
    ...doc,
    edges: doc.edges.map((e) => (e.to === nodeId || e.from === nodeId ? { ...e, linePattern } : e)),
    defaultLinePattern: linePattern,
    dirty: true,
  }
}

export function setLayout(doc: DiagramDocument, layout: LayoutDirection): DiagramDocument {
  return relayout({ ...doc, layout, dirty: true })
}

/**
 * Assign fishbone roles from the tree structure: the root is the `effect`, its
 * direct children are `category`, and everything deeper is a `cause`.
 */
function assignFishboneRoles(nodes: DiagramNode[]): DiagramNode[] {
  const roleFor = (node: DiagramNode): DiagramNode['role'] => {
    if (!node.parentId) return 'effect'
    const parent = nodes.find((n) => n.id === node.parentId)
    return parent && !parent.parentId ? 'category' : 'cause'
  }
  return nodes.map((n) => ({ ...n, role: roleFor(n) }))
}

/**
 * Switch between mindmap and fishbone. The two views share the same node/edge
 * tree — only the rendering changes — so this preserves all content and just
 * re-derives the roles and layout the target view needs.
 */
export function setMode(
  doc: DiagramDocument,
  mode: DiagramMode,
  _labels: { central: string; effect: string; category: string },
): DiagramDocument {
  if (mode === doc.mode) return doc

  if (mode === 'fishbone') {
    // Fishbone can only run horizontally; keep an existing rtl, else use ltr.
    const layout: LayoutDirection = doc.layout === 'rtl' ? 'rtl' : 'ltr'
    return {
      ...doc,
      mode,
      layout,
      nodes: assignFishboneRoles(doc.nodes),
      dirty: true,
    }
  }

  // Back to mindmap: roles are irrelevant here, so drop them. Keep a horizontal
  // orientation if the fishbone used one, otherwise fall back to radial.
  const layout: LayoutDirection = doc.layout === 'ltr' || doc.layout === 'rtl' ? doc.layout : 'radial'
  return {
    ...doc,
    mode,
    layout,
    nodes: doc.nodes.map(({ role: _role, ...rest }) => rest),
    dirty: true,
  }
}

export function serialize(doc: DiagramDocument): string {
  return JSON.stringify(
    {
      version: doc.version,
      mode: doc.mode,
      layout: doc.layout,
      defaultShape: doc.defaultShape,
      defaultLine: doc.defaultLine,
      defaultLinePattern: doc.defaultLinePattern,
      nodes: doc.nodes.map((node) => ({
        ...node,
        textStyle: normalizeTextStyle(node.textStyle),
      })),
      edges: doc.edges.map((edge) => ({
        ...edge,
        lineType: normalizeLineType(edge.lineType),
        linePattern: normalizeLinePattern(edge.linePattern),
        startCap: normalizeEndCap(edge.startCap),
        endCap: normalizeEndCap(edge.endCap),
        fromSide: normalizeSide(edge.fromSide),
        toSide: normalizeSide(edge.toSide),
      })),
    },
    null,
    2,
  )
}

export function deserialize(content: string, filePath: string | null): DiagramDocument {
  const data = JSON.parse(content) as Omit<DiagramDocument, 'dirty' | 'selectedId' | 'filePath'>
  const defaultLine = normalizeLineType(data.defaultLine)
  const defaultLinePattern = normalizeLinePattern(data.defaultLinePattern, data.defaultLine)
  return {
    ...data,
    defaultLine,
    defaultLinePattern,
    nodes: data.nodes.map((node) => ({
      ...node,
      textStyle: normalizeTextStyle(node.textStyle),
    })),
    edges: data.edges.map((edge) => ({
      ...edge,
      lineType: normalizeLineType(edge.lineType),
      linePattern: normalizeLinePattern(edge.linePattern, edge.lineType),
      startCap: normalizeEndCap(edge.startCap),
      endCap: normalizeEndCap(edge.endCap),
      fromSide: normalizeSide(edge.fromSide),
      toSide: normalizeSide(edge.toSide),
    })),
    selectedId: data.nodes[0]?.id ?? null,
    selectedIds: data.nodes[0] ? [data.nodes[0].id] : [],
    selectedEdgeId: null,
    filePath,
    dirty: false,
  }
}
