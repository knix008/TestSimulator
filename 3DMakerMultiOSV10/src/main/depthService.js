import { pipeline, RawImage, env } from '@huggingface/transformers'

// Main process uses onnxruntime-node (CPU), not browser WASM.
env.allowLocalModels = false
env.useBrowserCache = false
env.backends.onnx.wasm.proxy = false

/** @type {Awaited<ReturnType<typeof pipeline>> | null} */
let depthPipeline = null

/**
 * @param {(message: string) => void} [onProgress]
 */
export async function loadDepthModel(onProgress) {
  if (depthPipeline) return depthPipeline

  onProgress?.('깊이 모델 준비 중…')

  depthPipeline = await pipeline(
    'depth-estimation',
    'onnx-community/depth-anything-v2-small',
    {
      device: 'cpu',
      dtype: 'fp32',
      progress_callback: (event) => {
        if (!onProgress || !event) return
        if (event.status === 'progress' && event.progress != null) {
          onProgress(`모델 다운로드… ${Math.round(event.progress)}%`)
        } else if (event.status === 'initiate' || event.status === 'download') {
          onProgress('깊이 모델 다운로드 중…')
        }
      }
    }
  )

  return depthPipeline
}

/**
 * Estimate depth from RGBA pixel bytes (from canvas getImageData).
 *
 * @param {{ width: number, height: number, rgba: Uint8Array | number[] }} input
 * @param {(message: string) => void} [onProgress]
 * @returns {Promise<{ width: number, height: number, data: Float32Array }>}
 */
export async function estimateDepthFromRgba(input, onProgress) {
  const { width, height } = input
  if (!width || !height) {
    throw new Error('깊이 추정에 필요한 이미지 크기가 없습니다.')
  }

  const rgba = input.rgba instanceof Uint8Array ? input.rgba : Uint8Array.from(input.rgba)
  if (rgba.length < width * height * 4) {
    throw new Error(
      `RGBA 버퍼 길이가 부족합니다. expected=${width * height * 4}, got=${rgba.length}`
    )
  }

  const pipe = await loadDepthModel(onProgress)
  onProgress?.('깊이 추정 중…')

  // Avoid sharp: build RawImage directly from renderer pixels.
  const image = new RawImage(rgba, width, height, 4)
  const result = await pipe(image)
  const depth = result.depth ?? result

  const outW = depth.width
  const outH = depth.height
  const raw = depth.data
  const data = new Float32Array(outW * outH)
  for (let i = 0; i < data.length; i++) {
    data[i] = Number(raw[i])
  }

  return { width: outW, height: outH, data }
}
