import { v4 as uuid } from 'uuid'
import type {
  DiagramDocument,
  DiagramEdge,
  DiagramMode,
  DiagramNode,
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
    dirty: true,
  }
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

export function setMode(
  doc: DiagramDocument,
  mode: DiagramMode,
  labels: { central: string; effect: string; category: string },
): DiagramDocument {
  if (mode === doc.mode) return doc
  if (mode === 'mindmap') {
    return relayout({ ...createMindmapDoc(labels.central), dirty: true })
  }
  return relayout({ ...createFishboneDoc(labels.effect, labels.category), dirty: true })
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
    })),
    selectedId: data.nodes[0]?.id ?? null,
    selectedIds: data.nodes[0] ? [data.nodes[0].id] : [],
    filePath,
    dirty: false,
  }
}
