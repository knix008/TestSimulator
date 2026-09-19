import { cloneCanvas } from './canvas'
import type { PhotoDocument } from './types'

export type HistorySnapshot = {
  document: PhotoDocument
  canvases: Map<string, HTMLCanvasElement>
  /** What the state was left by: the command, tool or window that made it. */
  label?: string
  /** When the state was taken, for the History panel's list. */
  at?: number
}

/** A named snapshot: kept apart from the undo stack, so its cap never drops it. */
export type NamedSnapshot = { id: string; name: string; snapshot: HistorySnapshot }

let historyLimit = 30

/** The undo depth; the Preferences window sets it. */
export function setHistoryLimit(limit: number) {
  historyLimit = Math.max(1, Math.round(limit))
}

export function getHistoryLimit() {
  return historyLimit
}

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
      smartFilters: layer.smartFilters?.map((item) => ({ ...item })),
      smartTransform: layer.smartTransform ? { ...layer.smartTransform } : undefined,
    })),
    guides: document.guides.map((item) => ({ ...item })),
    notes: document.notes.map((item) => ({ ...item })),
    samplers: document.samplers.map((item) => ({ ...item })),
    counts: document.counts.map((item) => ({ ...item })),
    paths: document.paths.map((path) => ({ ...path, nodes: path.nodes.map((node) => ({ ...node })) })),
    slices: document.slices.map((item) => ({ ...item })),
    frames: document.frames.map((item) => ({ ...item })),
    measure: document.measure ? { ...document.measure } : null,
    artboards: document.artboards?.map((item) => ({ ...item })),
    measurements: document.measurements?.map((item) => ({ ...item })),
  }
}

export function cloneCanvases(canvases: Map<string, HTMLCanvasElement>) {
  const next = new Map<string, HTMLCanvasElement>()
  for (const [id, canvas] of canvases) {
    next.set(id, cloneCanvas(canvas))
  }
  return next
}

export function takeSnapshot(document: PhotoDocument, canvases: Map<string, HTMLCanvasElement>, label?: string): HistorySnapshot {
  return { document: cloneDocument(document), canvases: cloneCanvases(canvases), label, at: Date.now() }
}

export function pushHistory(stack: HistorySnapshot[], snapshot: HistorySnapshot) {
  stack.push(snapshot)
  while (stack.length > historyLimit) {
    stack.shift()
  }
}
