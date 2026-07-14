import { DEFAULT_MODEL_ID, getModelById } from './models.js'

let activeModelId = DEFAULT_MODEL_ID

export function getActiveModelId() {
  return activeModelId
}

/**
 * Yield to the UI thread so status/overlay paints before/after heavy work.
 * @returns {Promise<void>}
 */
export function yieldToUi() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0)
    })
  })
}

/**
 * Run monocular depth estimation in an Electron utility process (off UI thread).
 *
 * @param {HTMLCanvasElement | HTMLImageElement} image
 * @param {(msg: string) => void} [onProgress]
 * @param {string} [modelId]
 * @returns {Promise<{ width: number, height: number, data: Float32Array, modelId: string }>}
 */
export async function estimateDepth(image, onProgress, modelId = activeModelId) {
  const id = modelId || DEFAULT_MODEL_ID
  activeModelId = id
  const meta = getModelById(id)

  const api = globalThis.depthApi
  if (!api?.estimate) {
    throw new Error(
      '깊이 백그라운드 API를 사용할 수 없습니다. 앱을 재시작하거나 preload 설정을 확인하세요.'
    )
  }

  onProgress?.(`${meta.shortName} — 백그라운드 준비…`)
  await yieldToUi()

  const { width, height, rgba } = canvasToRgba(image)

  const stop = api.onProgress?.((message) => {
    onProgress?.(message)
  })

  try {
    onProgress?.(`${meta.shortName}로 깊이 추정 요청…`)
    await yieldToUi()

    const result = await api.estimate({
      modelId: id,
      width,
      height,
      rgba
    })

    const data =
      result.data instanceof Float32Array
        ? result.data
        : new Float32Array(result.data)

    onProgress?.(`${meta.shortName} 깊이 추정 완료`)
    await yieldToUi()

    return {
      width: result.width,
      height: result.height,
      data,
      modelId: result.modelId || id
    }
  } finally {
    stop?.()
  }
}

/**
 * @param {HTMLCanvasElement | HTMLImageElement} image
 */
function canvasToRgba(image) {
  let canvas
  let width
  let height

  if (image instanceof HTMLCanvasElement) {
    canvas = image
    width = image.width
    height = image.height
  } else {
    width = image.naturalWidth || image.width
    height = image.naturalHeight || image.height
    canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx0 = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx0) throw new Error('Canvas 2D를 사용할 수 없습니다.')
    ctx0.drawImage(image, 0, 0, width, height)
  }

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D를 사용할 수 없습니다.')
  const imageData = ctx.getImageData(0, 0, width, height)
  // Copy so the transferable/cloned buffer is detached from the live canvas.
  const rgba = imageData.data.buffer.slice(
    imageData.data.byteOffset,
    imageData.data.byteOffset + imageData.data.byteLength
  )

  return { width, height, rgba }
}
