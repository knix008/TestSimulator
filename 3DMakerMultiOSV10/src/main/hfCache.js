import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Weight files transformers.js may place under `onnx/` depending on dtype. */
const ONNX_WEIGHT_FILES = [
  'model.onnx',
  'model_fp16.onnx',
  'model_quantized.onnx',
  'model_q4.onnx',
  'model_q4f16.onnx',
  'model_q8.onnx',
  'model_uint8.onnx'
]

/**
 * @param {string} cacheDir
 * @param {string} modelId
 */
export function modelCacheRootFor(cacheDir, modelId) {
  return join(cacheDir, ...String(modelId).split('/'))
}

/**
 * True when config + at least one ONNX weight exist under the HF FileCache layout.
 * @param {string} cacheDir
 * @param {string} modelId
 */
export function isModelCached(cacheDir, modelId) {
  if (!cacheDir || !modelId) return false
  const root = modelCacheRootFor(cacheDir, modelId)
  if (!existsSync(join(root, 'config.json'))) return false

  const onnxDir = join(root, 'onnx')
  if (!existsSync(onnxDir)) return false

  return ONNX_WEIGHT_FILES.some((name) => existsSync(join(onnxDir, name)))
}

/**
 * @param {string} cacheDir
 * @param {string} modelId
 */
export function measureModelCacheBytes(cacheDir, modelId) {
  const root = modelCacheRootFor(cacheDir, modelId)
  if (!existsSync(root)) return 0
  return sumBytes(root)
}

/**
 * @param {string} dir
 */
function sumBytes(dir) {
  let total = 0
  if (!existsSync(dir)) return 0
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) total += sumBytes(full)
    else total += st.size
  }
  return total
}

/**
 * @param {number} bytes
 */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
