import { cloneCanvas } from './canvas'
import type { PhotoDocument } from './types'

export type HistorySnapshot = {
  document: PhotoDocument
  canvases: Map<string, HTMLCanvasElement>
}

const historyLimit = 30

export function cloneDocument(document: PhotoDocument): PhotoDocument {
  return {
    ...document,
    layers: document.layers.map((layer) => ({
      ...layer,
      effects: { ...layer.effects },
      adjustment: layer.adjustment ? { ...layer.adjustment } : undefined,
      curves: layer.curves
        ? { rgb: layer.curves.rgb.map((p) => ({ ...p })), r: layer.curves.r.map((p) => ({ ...p })), g: layer.curves.g.map((p) => ({ ...p })), b: layer.curves.b.map((p) => ({ ...p })) }
        : undefined,
      levels: layer.levels ? { ...layer.levels } : undefined,
      fill: layer.fill ? { ...layer.fill, start: { ...layer.fill.start }, end: { ...layer.fill.end } } : undefined,
      text: layer.text ? { ...layer.text } : undefined,
      shape: layer.shape ? { ...layer.shape } : undefined,
    })),
    guides: document.guides.map((item) => ({ ...item })),
    notes: document.notes.map((item) => ({ ...item })),
    samplers: document.samplers.map((item) => ({ ...item })),
    counts: document.counts.map((item) => ({ ...item })),
    paths: document.paths.map((path) => ({ ...path, nodes: path.nodes.map((node) => ({ ...node })) })),
    slices: document.slices.map((item) => ({ ...item })),
    frames: document.frames.map((item) => ({ ...item })),
    measure: document.measure ? { ...document.measure } : null,
  }
}

export function cloneCanvases(canvases: Map<string, HTMLCanvasElement>) {
  const next = new Map<string, HTMLCanvasElement>()
  for (const [id, canvas] of canvases) {
    next.set(id, cloneCanvas(canvas))
  }
  return next
}

export function takeSnapshot(document: PhotoDocument, canvases: Map<string, HTMLCanvasElement>): HistorySnapshot {
  return { document: cloneDocument(document), canvases: cloneCanvases(canvases) }
}

export function pushHistory(stack: HistorySnapshot[], snapshot: HistorySnapshot) {
  stack.push(snapshot)
  if (stack.length > historyLimit) {
    stack.shift()
  }
}
