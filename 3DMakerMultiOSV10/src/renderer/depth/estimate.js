import { pipeline, env } from '@huggingface/transformers'
import { DEFAULT_MODEL_ID, getModelById } from './models.js'

// Import as asset URLs so Vite serves them (avoid /public dynamic-import errors).
import ortJsepMjs from '../ort/ort-wasm-simd-threaded.jsep.mjs?url'
import ortJsepWasm from '../ort/ort-wasm-simd-threaded.jsep.wasm?url'
import ortMjs from '../ort/ort-wasm-simd-threaded.mjs?url'
import ortWasm from '../ort/ort-wasm-simd-threaded.wasm?url'

env.backends.onnx.wasm.wasmPaths = {
  'ort-wasm-simd-threaded.jsep.mjs': ortJsepMjs,
  'ort-wasm-simd-threaded.jsep.wasm': ortJsepWasm,
  'ort-wasm-simd-threaded.mjs': ortMjs,
  'ort-wasm-simd-threaded.wasm': ortWasm
}
env.backends.onnx.wasm.numThreads = 1
env.backends.onnx.wasm.proxy = false

env.allowLocalModels = false
env.allowRemoteModels = true
env.useBrowserCache = false
env.useCustomCache = true
env.customCache = createElectronModelCache()

/** @type {Map<string, Awaited<ReturnType<typeof pipeline>>>} */
const pipelineCache = new Map()
let activeModelId = DEFAULT_MODEL_ID

function createElectronModelCache() {
  return {
    async match(request) {
      const api = globalThis.modelCache
      if (!api?.match) return undefined
      const key = requestKey(request)
      const data = await api.match(key)
      if (!data) return undefined
      const body =
        data instanceof ArrayBuffer
          ? data
          : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' }
      })
    },
    async put(request, response) {
      const api = globalThis.modelCache
      if (!api?.put) return
      const key = requestKey(request)
      const buffer = new Uint8Array(await response.arrayBuffer())
      await api.put(key, buffer)
    }
  }
}

function requestKey(request) {
  if (typeof request === 'string') return request
  if (request && typeof request.url === 'string') return request.url
  return String(request)
}

export function getActiveModelId() {
  return activeModelId
}

/**
 * @param {string} modelId
 * @param {(msg: string) => void} [onProgress]
 */
export async function loadDepthModel(modelId = activeModelId, onProgress) {
  const id = modelId || DEFAULT_MODEL_ID
  activeModelId = id
  const meta = getModelById(id)

  const cached = pipelineCache.get(id)
  if (cached) {
    onProgress?.(`메모리 캐시 사용: ${meta.shortName}`)
    return cached
  }

  let usingExistingCache = false
  try {
    const info = await globalThis.modelCache?.info?.()
    usingExistingCache = Boolean(info && info.fileCount > 0)
    if (usingExistingCache) {
      onProgress?.(
        `${meta.shortName} — 저장 캐시 확인 (${info.fileCount}개 파일, ${formatBytes(info.bytes)})`
      )
    } else {
      onProgress?.(`${meta.shortName} — 처음 다운로드 (${meta.sizeHint})`)
    }
  } catch {
    onProgress?.(`${meta.shortName} 준비 중…`)
  }

  const pipe = await pipeline('depth-estimation', id, {
    device: 'wasm',
    dtype: 'fp32',
    progress_callback: (event) => {
      if (!onProgress || !event) return
      const file = event.file ? ` (${event.file})` : ''
      if (event.status === 'initiate') {
        onProgress(`${meta.shortName} 준비${file}`)
        return
      }
      if (event.status === 'download') {
        onProgress(
          usingExistingCache
            ? `${meta.shortName} 캐시 로드${file}`
            : `${meta.shortName} 다운로드${file}`
        )
        return
      }
      if (event.status === 'progress' && event.progress != null) {
        const pct = Math.round(event.progress)
        onProgress(
          usingExistingCache
            ? `${meta.shortName} 캐시… ${pct}%`
            : `${meta.shortName} 다운로드… ${pct}%`
        )
        return
      }
      if (event.status === 'done') {
        onProgress(`${meta.shortName} 파일 완료${file}`)
      }
    }
  })

  pipelineCache.set(id, pipe)
  onProgress?.(`${meta.shortName} 준비 완료`)
  return pipe
}

/**
 * @param {HTMLImageElement | HTMLCanvasElement | string} image
 * @param {(msg: string) => void} [onProgress]
 * @param {string} [modelId]
 * @returns {Promise<{ width: number, height: number, data: Float32Array, modelId: string }>}
 */
export async function estimateDepth(image, onProgress, modelId = activeModelId) {
  const id = modelId || DEFAULT_MODEL_ID
  const pipe = await loadDepthModel(id, onProgress)
  onProgress?.(`${getModelById(id).shortName}로 깊이 추정 중…`)

  const result = await pipe(image)
  const depth = result.depth ?? result

  const width = depth.width
  const height = depth.height
  const raw = depth.data

  const data = new Float32Array(width * height)
  for (let i = 0; i < data.length; i++) {
    data[i] = Number(raw[i])
  }

  return { width, height, data, modelId: id }
}

function formatBytes(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
