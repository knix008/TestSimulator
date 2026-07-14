/**
 * Utility process: runs depth estimation off the UI / main threads.
 * Communicates with the main process via process.parentPort.
 *
 * NOTE: Transformers.js is loaded with dynamic import AFTER coaxing
 * `process.release.name` to `"node"`. Electron’s utilityProcess sometimes
 * looks non-Node, which disables FS path loading and triggers:
 *   "Unable to determine content-length from response headers..."
 */
import { mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

ensureNodeReleaseName()
suppressContentLengthWarn()

const { pipeline, RawImage, env } = await import('@huggingface/transformers')

/** @type {Map<string, Awaited<ReturnType<typeof pipeline>>>} */
const pipelineCache = new Map()
/** @type {string | null} */
let cacheDir = null
let ready = false

const ONNX_WEIGHT_FILES = [
  'model.onnx',
  'model_fp16.onnx',
  'model_quantized.onnx',
  'model_q4.onnx',
  'model_q4f16.onnx',
  'model_q8.onnx',
  'model_uint8.onnx'
]

function ensureNodeReleaseName() {
  if (typeof process === 'undefined' || !process.release) return
  if (process.release.name === 'node') return
  try {
    Object.defineProperty(process, 'release', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: { ...process.release, name: 'node' }
    })
  } catch {
    try {
      process.release.name = 'node'
    } catch {
      /* ignore */
    }
  }
}

function suppressContentLengthWarn() {
  const original = console.warn.bind(console)
  console.warn = (...args) => {
    const text = args.map((a) => String(a ?? '')).join(' ')
    if (text.includes('Unable to determine content-length')) return
    original(...args)
  }
}

/**
 * @param {string} dir
 * @param {string} modelId
 */
function isModelCached(dir, modelId) {
  if (!dir || !modelId) return false
  const root = join(dir, ...String(modelId).split('/'))
  if (!existsSync(join(root, 'config.json'))) return false
  const onnxDir = join(root, 'onnx')
  if (!existsSync(onnxDir)) return false
  return ONNX_WEIGHT_FILES.some((name) => existsSync(join(onnxDir, name)))
}

/**
 * @param {string} dir
 * @param {string} modelId
 */
function hasExternalOnnxData(dir, modelId) {
  const onnxDir = join(dir, ...String(modelId).split('/'), 'onnx')
  return existsSync(join(onnxDir, 'model.onnx_data'))
}

/**
 * @param {string | undefined} dir
 */
function configureCache(dir) {
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  cacheDir = dir
  env.cacheDir = dir
  env.useFSCache = true
  env.useBrowserCache = false
  env.useCustomCache = false
  env.allowLocalModels = true
  env.allowRemoteModels = true
  env.localModelPath = dir
}

function post(message) {
  process.parentPort.postMessage(message)
}

/**
 * @param {string} requestId
 * @param {boolean} fromCache
 */
function makeProgressCallback(requestId, fromCache) {
  return (event) => {
    if (!event) return
    const file = event.file ? ` (${event.file})` : ''
    if (event.status === 'initiate') {
      post({
        type: 'progress',
        requestId,
        message: fromCache
          ? `로컬 캐시에서 모델 준비${file}`
          : `모델 다운로드 준비${file}`,
        fromCache
      })
    } else if (event.status === 'download') {
      post({
        type: 'progress',
        requestId,
        message: fromCache
          ? `캐시에서 파일 읽기${file}`
          : `모델 다운로드 중${file}`,
        fromCache
      })
    } else if (event.status === 'progress' && event.progress != null) {
      const pct = Math.round(event.progress)
      post({
        type: 'progress',
        requestId,
        message: fromCache
          ? `캐시 로드… ${pct}%${file}`
          : `다운로드… ${pct}%${file}`,
        fromCache
      })
    } else if (event.status === 'done') {
      post({
        type: 'progress',
        requestId,
        message: fromCache ? `캐시 파일 준비 완료${file}` : `다운로드 완료${file}`,
        fromCache
      })
    }
  }
}

/**
 * @param {string} modelId
 * @param {string} requestId
 */
async function getPipeline(modelId, requestId) {
  const cachedPipe = pipelineCache.get(modelId)
  if (cachedPipe) {
    post({
      type: 'progress',
      requestId,
      message: '메모리에 로드된 모델 재사용 (다운로드 없음)',
      fromCache: true
    })
    return cachedPipe
  }

  const onDisk = Boolean(cacheDir && isModelCached(cacheDir, modelId))
  const external = Boolean(cacheDir && hasExternalOnnxData(cacheDir, modelId))

  post({
    type: 'progress',
    requestId,
    message: onDisk
      ? '디스크 캐시에서 모델을 불러오는 중… (재다운로드 없음)'
      : '모델을 처음 받아 캐시에 저장합니다…',
    fromCache: onDisk
  })

  /** @type {Record<string, any>} */
  const options = {
    device: 'cpu',
    dtype: 'fp32',
    // Large DA models ship as model.onnx + model.onnx_data
    use_external_data_format: external || undefined,
    progress_callback: makeProgressCallback(requestId, onDisk)
  }

  if (onDisk) options.local_files_only = true

  try {
    const pipe = await pipeline('depth-estimation', modelId, options)
    pipelineCache.set(modelId, pipe)
    return pipe
  } catch (err) {
    if (!onDisk) throw err
    post({
      type: 'progress',
      requestId,
      message: '캐시 로드 실패 — 원격에서 다시 받는 중…',
      fromCache: false
    })
    const pipe = await pipeline('depth-estimation', modelId, {
      device: 'cpu',
      dtype: 'fp32',
      use_external_data_format: external || true,
      local_files_only: false,
      progress_callback: makeProgressCallback(requestId, false)
    })
    pipelineCache.set(modelId, pipe)
    return pipe
  }
}

/**
 * @param {any} event
 */
async function handleMessage(event) {
  const msg = event?.data ?? event
  if (!msg || typeof msg !== 'object') return

  if (msg.type === 'init') {
    configureCache(msg.cacheDir)
    ready = true
    post({
      type: 'ready',
      cacheDir,
      nodeRelease: process.release?.name,
      cachedDefault: msg.defaultModelId
        ? isModelCached(cacheDir, msg.defaultModelId)
        : false
    })
    return
  }

  if (msg.type === 'cacheStatus') {
    post({
      type: 'cacheStatusResult',
      requestId: msg.requestId,
      modelId: msg.modelId,
      cached: Boolean(cacheDir && isModelCached(cacheDir, msg.modelId)),
      cacheDir
    })
    return
  }

  if (msg.type !== 'estimate') return

  const { requestId, modelId, width, height, rgba } = msg
  try {
    if (!ready) throw new Error('깊이 워커가 초기화되지 않았습니다.')
    if (!modelId) throw new Error('modelId가 없습니다.')
    if (!width || !height || !rgba) throw new Error('이미지 데이터가 없습니다.')

    const bytes =
      rgba instanceof ArrayBuffer
        ? new Uint8Array(rgba)
        : rgba instanceof Uint8Array
          ? rgba
          : new Uint8Array(rgba)

    const pipe = await getPipeline(modelId, requestId)

    post({
      type: 'progress',
      requestId,
      message: '깊이 추정 중… (백그라운드)',
      fromCache: true
    })

    const image = new RawImage(bytes, width, height, 4)
    const result = await pipe(image)
    const depth = result.depth ?? result
    const outW = depth.width
    const outH = depth.height
    const raw = depth.data
    const data = new Float32Array(outW * outH)
    for (let i = 0; i < data.length; i++) data[i] = Number(raw[i])

    post({
      type: 'result',
      requestId,
      modelId,
      width: outW,
      height: outH,
      data: data.buffer,
      fromCache: Boolean(cacheDir && isModelCached(cacheDir, modelId))
    })
  } catch (err) {
    post({
      type: 'error',
      requestId,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    })
  }
}

process.parentPort.on('message', (event) => {
  handleMessage(event).catch((err) => {
    post({
      type: 'error',
      requestId: event?.data?.requestId,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined
    })
  })
})

post({
  type: 'boot',
  nodeRelease: process.release?.name
})
