import { diagramThemeById, type DiagramTheme } from '../diagramThemes'
import { lineThemeById, type LineTheme } from '../lineThemes'
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
  TextStyle, MemoStyle, MemoTarget } from '../types'
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

/** Which branch of the diagram a node is on: the place of its ancestor among the centre's children. */
function branchIndex(nodes: DiagramNode[], id: string): number {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  let current = byId.get(id)
  for (let guard = 0; current && guard < 10000; guard++) {
    const parent = current.parentId ? byId.get(current.parentId) : undefined
    if (!parent) return 0
    if (!parent.parentId) return nodes.filter((node) => node.parentId === parent.id).indexOf(current)
    current = parent
  }
  return 0
}

function lineThemeEdge(theme: LineTheme, nodes: DiagramNode[], childId: string) {
  return {
    lineType: theme.lineType,
    linePattern: theme.linePattern,
    startCap: theme.startCap,
    endCap: theme.endCap,
    color: theme.palette[branchIndex(nodes, childId) % theme.palette.length],
  }
}

/** How far from the centre a node is. */
function depthOf(nodes: DiagramNode[], node: DiagramNode): number {
  const byId = new Map(nodes.map((item) => [item.id, item]))
  let depth = 0
  let current = node
  for (let guard = 0; current.parentId && guard < 10000; guard++) {
    const parent = byId.get(current.parentId)
    if (!parent) break
    current = parent
    depth += 1
  }
  return depth
}

/** A colour towards white: the further from the centre, the lighter. */
function lighter(hex: string, k: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const part = (shift: number) => {
    const c = (n >> shift) & 255
    return Math.round(c + (255 - c) * k).toString(16).padStart(2, '0')
  }
  return `#${part(16)}${part(8)}${part(0)}`
}

/** What a theme makes of one node. */
function themedNode(theme: DiagramTheme, nodes: DiagramNode[], node: DiagramNode): DiagramNode {
  if (node.image) return node
  const depth = depthOf(nodes, node)
  const isRoot = depth === 0
  const color = isRoot
    ? theme.root
    : theme.byLevel
      ? theme.palette[depth % theme.palette.length]
      : depth === 1 || theme.flat
        ? theme.palette[branchIndex(nodes, node.id) % theme.palette.length]
        : lighter(theme.palette[branchIndex(nodes, node.id) % theme.palette.length], 0.35)
  return {
    ...node,
    color,
    shape: isRoot ? theme.rootShape : depth === 1 ? theme.shape : theme.outer ?? theme.shape,
    textStyle: { ...normalizeTextStyle(node.textStyle), color: isRoot ? theme.rootText : theme.text },
  }
}

/** Dresses the whole diagram: colours, shapes, text and connectors. */
export function applyDiagramTheme(doc: DiagramDocument, theme: DiagramTheme): DiagramDocument {
  const lined = applyLineTheme(doc, lineThemeById(theme.line))
  return {
    ...lined,
    diagramTheme: theme.id,
    defaultShape: theme.shape,
    nodes: doc.nodes.map((node) => themedNode(theme, doc.nodes, node)),
  }
}

/** Styles every connector of the diagram, and those added later. */
export function applyLineTheme(doc: DiagramDocument, theme: LineTheme): DiagramDocument {
  return {
    ...doc,
    lineTheme: theme.id,
    defaultLine: theme.lineType,
    defaultLinePattern: theme.linePattern,
    edges: doc.edges.map((edge) => ({ ...edge, ...lineThemeEdge(theme, doc.nodes, edge.to) })),
    dirty: true,
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
    ...(doc.lineTheme ? lineThemeEdge(lineThemeById(doc.lineTheme), [...doc.nodes, node], id) : {}),
  }
  const placed = doc.diagramTheme ? themedNode(diagramThemeById(doc.diagramTheme), [...doc.nodes, node], node) : node
  return {
    ...doc,
    nodes: [...doc.nodes, placed],
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

  const mergedNodes = [...doc.nodes, ...newNodes]
  // A copied line looks as the one it copies; if that one has gone since, as a new line would.
  const copiedEdge = (from: string, oldId: string): DiagramEdge => {
    const to = idMap.get(oldId)!
    const original = doc.edges.find((edge) => edge.to === oldId)
    if (original) return { ...original, id: uuid(), from, to }
    return {
      id: uuid(),
      from,
      to,
      lineType: doc.defaultLine,
      linePattern: doc.defaultLinePattern,
      color: '#94a3b8',
      ...(doc.lineTheme ? lineThemeEdge(lineThemeById(doc.lineTheme), mergedNodes, to) : {}),
    }
  }
  const newEdges: DiagramEdge[] = subtree.filter((n) => n.id !== oldRootId).map((n) => copiedEdge(idMap.get(n.parentId as string)!, n.id))
  if (targetParentId) newEdges.push(copiedEdge(targetParentId, oldRootId))

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

/** Changes a memo's text and look; an empty text with remove set takes the memo away. */
export function updateMemo(doc: DiagramDocument, target: MemoTarget, change: { note?: string; style?: Partial<MemoStyle>; remove?: boolean }): DiagramDocument {
  const apply = <T extends { note?: string; noteStyle?: Partial<MemoStyle> }>(owner: T): T => {
    if (change.remove) {
      const { note: _note, noteStyle: _style, ...rest } = owner
      return rest as T
    }
    return {
      ...owner,
      ...(change.note !== undefined ? { note: change.note } : {}),
      ...(change.style ? { noteStyle: { ...owner.noteStyle, ...change.style } } : {}),
    }
  }
  return target.kind === 'node'
    ? { ...doc, nodes: doc.nodes.map((node) => (node.id === target.id ? apply(node) : node)), dirty: true }
    : { ...doc, edges: doc.edges.map((edge) => (edge.id === target.id ? apply(edge) : edge)), dirty: true }
}

/** Sets or removes the icon of these shapes. */
export function setNodeIcon(doc: DiagramDocument, ids: string[], icon: string | undefined): DiagramDocument {
  return { ...doc, nodes: doc.nodes.map((node) => (ids.includes(node.id) ? { ...node, icon } : node)), dirty: true }
}

const IMAGE_MAX_WIDTH = 320
const IMAGE_MAX_HEIGHT = 240

/** A picture as a node of its own, right of what is there, small enough to see the whole of it. */
export function addImageNode(doc: DiagramDocument, name: string, src: string, naturalWidth: number, naturalHeight: number): DiagramDocument {
  const width = Math.max(1, naturalWidth)
  const height = Math.max(1, naturalHeight)
  const scale = Math.min(1, IMAGE_MAX_WIDTH / width, IMAGE_MAX_HEIGHT / height)
  const right = doc.nodes.length ? Math.max(...doc.nodes.map((node) => node.x + node.width)) : 0
  const top = doc.nodes.length ? Math.min(...doc.nodes.map((node) => node.y)) : 0
  const id = uuid()
  const node: DiagramNode = {
    id,
    parentId: null,
    text: name,
    x: right + 40,
    y: top,
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    shape: 'rect',
    color: '#ffffff',
    textStyle: defaultNodeTextStyle(),
    image: { src, width, height },
  }
  return { ...doc, nodes: [...doc.nodes, node], selectedId: id, selectedIds: [id], selectedEdgeId: null, dirty: true }
}

/** A picture's new width; the height follows, so it keeps its proportions. */
export function setImageWidth(doc: DiagramDocument, id: string, width: number): DiagramDocument {
  return {
    ...doc,
    nodes: doc.nodes.map((node) =>
      node.id === id && node.image ? { ...node, width, height: Math.max(1, Math.round((width * node.image.height) / node.image.width)) } : node,
    ),
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

/**
 * Selects a line, and nothing else. With `add` (Ctrl or Shift held) it joins or leaves what is
 * already selected, shapes included.
 */
export function selectEdge(doc: DiagramDocument, edgeId: string | null, add = false): DiagramDocument {
  if (!edgeId) return { ...doc, selectedEdgeId: null, selectedEdgeIds: [], selectedId: null, selectedIds: [] }
  const before = doc.selectedEdgeId ? (doc.selectedEdgeIds?.length ? doc.selectedEdgeIds : [doc.selectedEdgeId]) : []
  const ids = add ? (before.includes(edgeId) ? before.filter((id) => id !== edgeId) : [...before, edgeId]) : [edgeId]
  const line = { selectedEdgeId: ids.at(-1) ?? null, selectedEdgeIds: ids }
  return add ? { ...doc, ...line } : { ...doc, ...line, selectedId: null, selectedIds: [] }
}

/** A shape joins or leaves what is selected (Ctrl or Shift held); selected lines stay. */
export function toggleNodeSelection(doc: DiagramDocument, nodeId: string): DiagramDocument {
  const before = targetNodeIds(doc)
  const ids = before.includes(nodeId) ? before.filter((id) => id !== nodeId) : [...before, nodeId]
  return { ...doc, selectedId: ids.at(-1) ?? null, selectedIds: ids }
}

/** Shapes join what is selected (a marquee with Ctrl or Shift held); selected lines stay. */
export function addNodesToSelection(doc: DiagramDocument, nodeIds: string[]): DiagramDocument {
  const ids = [...new Set([...targetNodeIds(doc), ...nodeIds])]
  return { ...doc, selectedId: doc.selectedId ?? ids[0] ?? null, selectedIds: ids }
}

/** The lines an edit applies to: the selected lines, or else every line of the selected shapes. */
export function targetEdgeIds(doc: DiagramDocument): string[] {
  if (doc.selectedEdgeId) return doc.selectedEdgeIds?.length ? doc.selectedEdgeIds : [doc.selectedEdgeId]
  const shapes = doc.selectedIds.length ? doc.selectedIds : doc.selectedId ? [doc.selectedId] : []
  return doc.edges.filter((edge) => shapes.includes(edge.from) || shapes.includes(edge.to)).map((edge) => edge.id)
}

/** Changes all the target lines at once. */
export function editLines(doc: DiagramDocument, patch: Partial<DiagramEdge>): DiagramDocument {
  const ids = targetEdgeIds(doc)
  if (!ids.length) return doc
  return {
    ...doc,
    edges: doc.edges.map((edge) => (ids.includes(edge.id) ? { ...edge, ...patch } : edge)),
    ...(patch.lineType ? { defaultLine: patch.lineType } : {}),
    ...(patch.linePattern ? { defaultLinePattern: patch.linePattern } : {}),
    dirty: true,
  }
}

/** The shapes an edit applies to: every selected one. */
export function targetNodeIds(doc: DiagramDocument): string[] {
  return doc.selectedIds.length ? doc.selectedIds : doc.selectedId ? [doc.selectedId] : []
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
      ...(doc.lineTheme ? { lineTheme: doc.lineTheme } : {}),
      ...(doc.diagramTheme ? { diagramTheme: doc.diagramTheme } : {}),
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
