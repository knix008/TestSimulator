/**
 * Utility process: runs depth estimation off the UI / main threads.
 * Communicates with the main process via process.parentPort.
 */
import { mkdirSync } from 'node:fs'
import { pipeline, RawImage, env } from '@huggingface/transformers'

/** @type {Map<string, Awaited<ReturnType<typeof pipeline>>>} */
const pipelineCache = new Map()
let ready = false

function configureCache(cacheDir) {
  if (!cacheDir) return
  mkdirSync(cacheDir, { recursive: true })
  env.cacheDir = cacheDir
  env.useFSCache = true
  env.useBrowserCache = false
  env.useCustomCache = false
  env.allowLocalModels = false
  env.allowRemoteModels = true
}

function post(message) {
  process.parentPort.postMessage(message)
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
    post({ type: 'ready' })
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

    post({ type: 'progress', requestId, message: '백그라운드에서 모델 준비 중…' })

    let pipe = pipelineCache.get(modelId)
    if (!pipe) {
      pipe = await pipeline('depth-estimation', modelId, {
        device: 'cpu',
        dtype: 'fp32',
        progress_callback: (event) => {
          if (!event) return
          const file = event.file ? ` (${event.file})` : ''
          if (event.status === 'initiate') {
            post({ type: 'progress', requestId, message: `모델 준비${file}` })
          } else if (event.status === 'download') {
            post({ type: 'progress', requestId, message: `모델 파일 로드${file}` })
          } else if (event.status === 'progress' && event.progress != null) {
            post({
              type: 'progress',
              requestId,
              message: `모델 로드… ${Math.round(event.progress)}%${file}`
            })
          } else if (event.status === 'done') {
            post({ type: 'progress', requestId, message: `모델 파일 완료${file}` })
          }
        }
      })
      pipelineCache.set(modelId, pipe)
    } else {
      post({ type: 'progress', requestId, message: '메모리에 로드된 모델 사용' })
    }

    post({ type: 'progress', requestId, message: '깊이 추정 중… (백그라운드)' })

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
      data: data.buffer
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

post({ type: 'boot' })
