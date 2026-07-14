/**
 * @typedef {Object} LoadedSpaceImage
 * @property {File} file
 * @property {HTMLCanvasElement} textureImage
 * @property {HTMLCanvasElement} depthImage
 * @property {string} previewUrl
 * @property {string} label
 * @property {number} sourceWidth
 * @property {number} sourceHeight
 */

const MIME_BY_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  avif: 'image/avif',
  webp: 'image/webp'
}

const SUPPORTED_MIME = new Set(Object.values(MIME_BY_EXT))

/** Depth model input long-edge cap (keeps inference fast on CPU). */
const DEPTH_MAX_EDGE = 1280
/** Texture long-edge cap — keep as much photo detail as practical for the mesh map. */
const TEXTURE_MAX_EDGE = 8192

/**
 * @param {File} file
 * @returns {string | null}
 */
export function resolveImageMime(file) {
  const type = (file.type || '').toLowerCase()
  if (SUPPORTED_MIME.has(type)) return type

  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext && MIME_BY_EXT[ext]) return MIME_BY_EXT[ext]
  return null
}

/**
 * @param {File} file
 * @returns {boolean}
 */
export function isSupportedImageFile(file) {
  return resolveImageMime(file) != null
}

/**
 * Load JPEG / PNG / GIF / AVIF / WebP (including high-resolution files).
 * Returns a texture canvas plus a downscaled canvas for depth estimation.
 *
 * @param {File} file
 * @returns {Promise<LoadedSpaceImage>}
 */
export async function loadSupportedImage(file) {
  const mime = resolveImageMime(file)
  if (!mime) {
    throw new Error(
      '지원하지 않는 형식입니다. JPEG, PNG, GIF, AVIF, WebP를 사용해 주세요.'
    )
  }

  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image'
    })

    const sourceWidth = bitmap.width
    const sourceHeight = bitmap.height
    if (!sourceWidth || !sourceHeight) {
      bitmap.close()
      throw new Error('이미지를 읽을 수 없습니다. 파일이 손상되었는지 확인해 주세요.')
    }

    const textureImage = resizeBitmapToCanvas(bitmap, TEXTURE_MAX_EDGE)
    const depthImage = resizeBitmapToCanvas(bitmap, DEPTH_MAX_EDGE)
    bitmap.close()

    const previewUrl = textureImage.toDataURL('image/jpeg', 0.85)
    const megapixels = ((sourceWidth * sourceHeight) / 1e6).toFixed(1)
    const resizedNote =
      sourceWidth > TEXTURE_MAX_EDGE || sourceHeight > TEXTURE_MAX_EDGE
        ? ` → 텍스처 ${textureImage.width}×${textureImage.height}`
        : ''

    return {
      file,
      textureImage,
      depthImage,
      previewUrl,
      label: `${file.name} (${sourceWidth}×${sourceHeight}, ${megapixels}MP${resizedNote})`,
      sourceWidth,
      sourceHeight
    }
  } catch (err) {
    if (err instanceof Error && /지원하지|읽을 수 없습니다/.test(err.message)) {
      throw err
    }
    const hint =
      mime === 'image/avif'
        ? ' AVIF를 이 환경에서 디코딩하지 못했을 수 있습니다.'
        : ''
    throw new Error(`이미지를 열지 못했습니다.${hint} (${file.name})`)
  }
}

/**
 * @param {ImageBitmap} bitmap
 * @param {number} maxEdge
 */
function resizeBitmapToCanvas(bitmap, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('Canvas를 초기화할 수 없습니다.')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, width, height)
  return canvas
}
