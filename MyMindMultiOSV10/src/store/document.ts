import { v4 as uuid } from 'uuid'
import type {
  DiagramDocument,
  DiagramEdge,
  DiagramMode,
  DiagramNode,
  LayoutDirection,
  LineType,
  ShapeType,
} from '../types'
import { NODE_COLORS } from '../constants/colors'
import { applyLayout, NODE_H, NODE_W } from '../layout/engine'

function colorAt(i: number) {
  return NODE_COLORS[i % NODE_COLORS.length]
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
      color: '#3b82f6',
    },
  ]
  return {
    version: 1,
    mode: 'mindmap',
    layout: 'radial',
    defaultShape: 'rounded',
    defaultLine: 'curve',
    nodes,
    edges: [],
    selectedId: rootId,
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
      color: '#ef4444',
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
      color: colorAt(i),
      role: 'category' as const,
    })),
  ]
  const edges: DiagramEdge[] = catIds.map((id) => ({
    id: uuid(),
    from: effectId,
    to: id,
    lineType: 'solid',
    color: '#94a3b8',
  }))
  return {
    version: 1,
    mode: 'fishbone',
    layout: 'ltr',
    defaultShape: 'rect',
    defaultLine: 'solid',
    nodes,
    edges,
    selectedId: effectId,
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
  const node: DiagramNode = {
    id,
    parentId,
    text,
    x: (parent?.x ?? 0) + 160,
    y: (parent?.y ?? 0) + siblings.length * (NODE_H + 16),
    width: NODE_W,
    height: NODE_H,
    shape: doc.defaultShape,
    color: colorAt(doc.nodes.length),
    role: role ?? (doc.mode === 'fishbone' ? (parent?.role === 'effect' ? 'category' : 'cause') : undefined),
  }
  const edge: DiagramEdge = {
    id: uuid(),
    from: parentId,
    to: id,
    lineType: doc.defaultLine,
    color: '#94a3b8',
  }
  return {
    ...doc,
    nodes: [...doc.nodes, node],
    edges: [...doc.edges, edge],
    selectedId: id,
    dirty: true,
  }
}

export function addSibling(doc: DiagramDocument, nodeId: string, text: string): DiagramDocument {
  const node = doc.nodes.find((n) => n.id === nodeId)
  if (!node?.parentId) return addChild(doc, nodeId, text)
  return addChild(doc, node.parentId, text, node.role)
}

export function deleteNode(doc: DiagramDocument, nodeId: string): DiagramDocument {
  const root = doc.nodes.find((n) => n.parentId === null)
  if (root?.id === nodeId) return doc

  const toRemove = new Set<string>()
  const walk = (id: string) => {
    toRemove.add(id)
    doc.nodes.filter((n) => n.parentId === id).forEach((c) => walk(c.id))
  }
  walk(nodeId)

  return {
    ...doc,
    nodes: doc.nodes.filter((n) => !toRemove.has(n.id)),
    edges: doc.edges.filter((e) => !toRemove.has(e.from) && !toRemove.has(e.to)),
    selectedId: root?.id ?? null,
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

export function updateNodeText(doc: DiagramDocument, nodeId: string, text: string): DiagramDocument {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => (n.id === nodeId ? { ...n, text } : n)),
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

export function setEdgeLine(doc: DiagramDocument, nodeId: string, lineType: LineType): DiagramDocument {
  return {
    ...doc,
    edges: doc.edges.map((e) => (e.to === nodeId || e.from === nodeId ? { ...e, lineType } : e)),
    defaultLine: lineType,
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
      nodes: doc.nodes,
      edges: doc.edges,
    },
    null,
    2,
  )
}

export function deserialize(content: string, filePath: string | null): DiagramDocument {
  const data = JSON.parse(content) as Omit<DiagramDocument, 'dirty' | 'selectedId' | 'filePath'>
  return {
    ...data,
    selectedId: data.nodes[0]?.id ?? null,
    filePath,
    dirty: false,
  }
}
