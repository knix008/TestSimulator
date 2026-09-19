import { modelSpec, modelSpecs } from './neural'

/**
 * Where the network weights live. Under Electron the main process keeps them
 * as files in the user's data folder and streams the download with progress;
 * in the browser build the Cache API holds them. Either way a model is
 * fetched once, on the user's say-so from the Neural Models window, and read
 * from disk after that.
 */

export type ModelProgress = { id: string; received: number; total: number; done: boolean; error?: string }

export type ModelStore = {
  /** Ids of the models already on this machine. */
  list(): Promise<string[]>
  read(id: string): Promise<ArrayBuffer>
  download(id: string): Promise<void>
  remove(id: string): Promise<void>
  onProgress(listener: (progress: ModelProgress) => void): () => void
}

type ElectronModelApi = {
  list(): Promise<string[]>
  read(id: string): Promise<ArrayBuffer>
  download(id: string, url: string, bytes: number): Promise<{ ok: boolean; message?: string }>
  remove(id: string): Promise<void>
  onProgress(listener: (progress: ModelProgress) => void): () => void
}

function electronApi(): ElectronModelApi | null {
  return ((window as unknown as { electronModelApi?: ElectronModelApi }).electronModelApi) ?? null
}

/* --------------------------------------------------------------- browser */

const CACHE = 'mpw-models'
const listeners = new Set<(progress: ModelProgress) => void>()

function emit(progress: ModelProgress) {
  for (const listener of listeners) listener(progress)
}

const browserStore: ModelStore = {
  async list() {
    if (typeof caches === 'undefined') return []
    const cache = await caches.open(CACHE)
    const keys = await cache.keys()
    return modelSpecs.filter((spec) => keys.some((request) => request.url.endsWith(`/${spec.id}.onnx`))).map((spec) => spec.id)
  },
  async read(id) {
    const cache = await caches.open(CACHE)
    const hit = await cache.match(keyFor(id))
    if (!hit) throw new Error(`model ${id} is not downloaded`)
    return hit.arrayBuffer()
  },
  async download(id) {
    const spec = modelSpec(id)
    if (!spec) throw new Error(`unknown model ${id}`)
    const response = await fetch(spec.url)
    if (!response.ok || !response.body) throw new Error(`${response.status} ${response.statusText}`)
    const total = Number(response.headers.get('content-length')) || spec.bytes
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length
      emit({ id, received, total, done: false })
    }
    const cache = await caches.open(CACHE)
    await cache.put(keyFor(id), new Response(new Blob(chunks as BlobPart[]), { headers: { 'content-type': 'application/octet-stream' } }))
    emit({ id, received, total, done: true })
  },
  async remove(id) {
    const cache = await caches.open(CACHE)
    await cache.delete(keyFor(id))
  },
  onProgress(listener) {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
}

function keyFor(id: string) {
  return `${window.location.origin}/models/${id}.onnx`
}

/* ---------------------------------------------------------------- electron */

function electronStore(api: ElectronModelApi): ModelStore {
  return {
    list: () => api.list(),
    read: (id) => api.read(id),
    async download(id) {
      const spec = modelSpec(id)
      if (!spec) throw new Error(`unknown model ${id}`)
      const result = await api.download(id, spec.url, spec.bytes)
      if (!result.ok) throw new Error(result.message ?? 'download failed')
    },
    remove: (id) => api.remove(id),
    onProgress: (listener) => api.onProgress(listener),
  }
}

/** The store for this build: the Electron one when its bridge is present. */
export function modelStore(): ModelStore {
  const api = electronApi()
  return api ? electronStore(api) : browserStore
}

/** Bytes as a short human figure, for the models window. */
export function formatBytes(bytes: number) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`
  return `${Math.round(bytes / 1e3)} KB`
}
