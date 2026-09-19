import { context2d, createCanvas } from './canvas'
import { gaussianBlur } from './filters'
import { maskBounds } from './selection'
import { blurMask } from './segment'
import type { Selection } from './types'

/**
 * The neural networks behind Select Subject, Sky, the depth-aware blur,
 * Generative Fill's object removal and Super Zoom, run locally with ONNX
 * Runtime. Nothing here knows how a model is fetched or executed: a `Runner`
 * is handed in, which is what lets the pre- and post-processing be tested
 * against a stand-in and lets the runtime (WebGPU or WebAssembly) be chosen
 * elsewhere. `models.ts` fetches the weights, `ort.ts` runs them.
 *
 * Every model is open-weight and runs on this machine; the registry below
 * says where each comes from, how big it is and under which licence.
 */

export type ModelTask = 'subject' | 'sky' | 'depth' | 'inpaint' | 'upscale'

export type ModelSpec = {
  id: string
  task: ModelTask
  name: string
  /** Where the weights are fetched from on first use. */
  url: string
  bytes: number
  license: string
  /** The square side the picture is resampled to (upscalers tile instead). */
  size: number
  mean: [number, number, number]
  std: [number, number, number]
  /** Higher wins when several models serve the same task. */
  quality: number
  /** The ranking on WebGPU, where full-precision weights run far faster than quantised ones. */
  gpuQuality?: number
  note: string
}

const imagenet = { mean: [0.485, 0.456, 0.406] as [number, number, number], std: [0.229, 0.224, 0.225] as [number, number, number] }

export const modelSpecs: ModelSpec[] = [
  { id: 'u2netp', task: 'subject', name: 'U²-Net small', url: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx', bytes: 4574861, license: 'Apache-2.0', size: 320, ...imagenet, quality: 1, note: 'modelNoteU2netp' },
  { id: 'silueta', task: 'subject', name: 'Silueta', url: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/silueta.onnx', bytes: 44173029, license: 'Apache-2.0', size: 320, ...imagenet, quality: 2, note: 'modelNoteSilueta' },
  { id: 'isnet', task: 'subject', name: 'ISNet general', url: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx', bytes: 178648008, license: 'Apache-2.0', size: 1024, mean: [0.5, 0.5, 0.5], std: [1, 1, 1], quality: 3, note: 'modelNoteIsnet' },
  { id: 'segformer', task: 'sky', name: 'SegFormer-B0 ADE20K', url: 'https://huggingface.co/Xenova/segformer-b0-finetuned-ade-512-512/resolve/main/onnx/model_quantized.onnx', bytes: 4418863, license: 'NVIDIA Source Code License (non-commercial)', size: 512, ...imagenet, quality: 1, note: 'modelNoteSegformer' },
  { id: 'depthAnything', task: 'depth', name: 'Depth Anything V2 small', url: 'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_quantized.onnx', bytes: 27258801, license: 'Apache-2.0', size: 518, ...imagenet, quality: 1, note: 'modelNoteDepth' },
  { id: 'lama', task: 'inpaint', name: 'LaMa', url: 'https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx', bytes: 208044816, license: 'Apache-2.0', size: 512, mean: [0, 0, 0], std: [1, 1, 1], quality: 1, note: 'modelNoteLama' },
  { id: 'swin2sr', task: 'upscale', name: 'Swin2SR ×2 (8-bit)', url: 'https://huggingface.co/Xenova/swin2SR-classical-sr-x2-64/resolve/main/onnx/model_quantized.onnx', bytes: 21471413, license: 'Apache-2.0', size: 128, mean: [0, 0, 0], std: [1, 1, 1], quality: 2, gpuQuality: 1, note: 'modelNoteSwin2sr' },
  { id: 'swin2srFp32', task: 'upscale', name: 'Swin2SR ×2 (full precision)', url: 'https://huggingface.co/Xenova/swin2SR-classical-sr-x2-64/resolve/main/onnx/model.onnx', bytes: 54428699, license: 'Apache-2.0', size: 128, mean: [0, 0, 0], std: [1, 1, 1], quality: 1, gpuQuality: 2, note: 'modelNoteSwin2srFp32' },
  { id: 'depthAnythingFp32', task: 'depth', name: 'Depth Anything V2 small (full precision)', url: 'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx', bytes: 99060839, license: 'Apache-2.0', size: 518, ...imagenet, quality: 0, gpuQuality: 2, note: 'modelNoteDepthFp32' },
]

export function modelSpec(id: string) {
  return modelSpecs.find((spec) => spec.id === id) ?? null
}

/** The best downloaded model for a task (ranked for the GPU when asked), or null. */
export function bestModelFor(task: ModelTask, downloaded: Iterable<string>, webgpu = false) {
  const have = new Set(downloaded)
  const rank = (spec: ModelSpec) => (webgpu ? spec.gpuQuality ?? spec.quality : spec.quality)
  return modelSpecs.filter((spec) => spec.task === task && have.has(spec.id)).sort((a, b) => rank(b) - rank(a))[0] ?? null
}

/* ------------------------------------------------------------- runners */

export type Tensor = { data: Float32Array; dims: number[] }

/** A loaded model: feed tensors in by name, get tensors out by name. */
export type Runner = {
  inputNames: string[]
  outputNames: string[]
  run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>>
}

/* -------------------------------------------------------- pre-processing */

/**
 * The picture resampled to `width` x `height` and laid out as the networks
 * want it: one plane per channel, (value / 255 - mean) / std.
 */
export function packPlanes(canvas: HTMLCanvasElement, width: number, height: number, mean: [number, number, number], std: [number, number, number]) {
  const small = createCanvas(width, height)
  const ctx = context2d(small)
  ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, width, height)
  const data = ctx.getImageData(0, 0, width, height).data
  const planes = new Float32Array(3 * width * height)
  const area = width * height
  for (let i = 0; i < area; i += 1) {
    planes[i] = (data[i * 4] / 255 - mean[0]) / std[0]
    planes[area + i] = (data[i * 4 + 1] / 255 - mean[1]) / std[1]
    planes[2 * area + i] = (data[i * 4 + 2] / 255 - mean[2]) / std[2]
  }
  return { data: planes, dims: [1, 3, height, width] }
}

/** Bilinear resampling of a single-channel map. */
export function resizeMap(map: Float32Array, width: number, height: number, toWidth: number, toHeight: number) {
  if (width === toWidth && height === toHeight) return Float32Array.from(map)
  const out = new Float32Array(toWidth * toHeight)
  for (let y = 0; y < toHeight; y += 1) {
    const fy = Math.min(height - 1, Math.max(0, ((y + 0.5) * height) / toHeight - 0.5))
    const y0 = Math.floor(fy)
    const y1 = Math.min(height - 1, y0 + 1)
    const ty = fy - y0
    for (let x = 0; x < toWidth; x += 1) {
      const fx = Math.min(width - 1, Math.max(0, ((x + 0.5) * width) / toWidth - 0.5))
      const x0 = Math.floor(fx)
      const x1 = Math.min(width - 1, x0 + 1)
      const tx = fx - x0
      out[y * toWidth + x] = (map[y0 * width + x0] * (1 - tx) + map[y0 * width + x1] * tx) * (1 - ty) + (map[y1 * width + x0] * (1 - tx) + map[y1 * width + x1] * tx) * ty
    }
  }
  return out
}

/** Planes back into a canvas: values in 0..1 (or 0..255 when `scale` says so). */
export function unpackPlanes(tensor: Tensor, scale = 1) {
  const [, , height, width] = tensor.dims
  const canvas = createCanvas(width, height)
  const ctx = context2d(canvas)
  const image = ctx.createImageData(width, height)
  const area = width * height
  for (let i = 0; i < area; i += 1) {
    image.data[i * 4] = Math.max(0, Math.min(255, tensor.data[i] * scale))
    image.data[i * 4 + 1] = Math.max(0, Math.min(255, tensor.data[area + i] * scale))
    image.data[i * 4 + 2] = Math.max(0, Math.min(255, tensor.data[2 * area + i] * scale))
    image.data[i * 4 + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

function toSelection(mask: Uint8Array, width: number, height: number): Selection {
  return { kind: 'mask', ...maskBounds(mask, width, height), mask }
}

/* -------------------------------------------------------------- subject */

/**
 * Select Subject: a salient-object network (U²-Net or ISNet) scores every
 * pixel; the map is stretched to full contrast, brought back to the
 * picture's size and cut at the half-way mark. `soft` is the same map as an
 * 8-bit alpha, for Remove Background's edges.
 */
export async function runSubject(runner: Runner, spec: ModelSpec, canvas: HTMLCanvasElement): Promise<{ selection: Selection; soft: Uint8Array }> {
  const input = packPlanes(canvas, spec.size, spec.size, spec.mean, spec.std)
  const outputs = await runner.run({ [runner.inputNames[0]]: input })
  const first = outputs[runner.outputNames[0]]
  const side = first.dims[first.dims.length - 1]
  const map = first.data.subarray(0, side * side)
  let min = Infinity
  let max = -Infinity
  for (const v of map) { if (v < min) min = v; if (v > max) max = v }
  const range = max - min || 1
  const normalised = new Float32Array(map.length)
  for (let i = 0; i < map.length; i += 1) normalised[i] = (map[i] - min) / range
  const full = resizeMap(normalised, side, side, canvas.width, canvas.height)
  const mask = new Uint8Array(full.length)
  const soft = new Uint8Array(full.length)
  for (let i = 0; i < full.length; i += 1) {
    soft[i] = Math.round(Math.max(0, Math.min(1, full[i])) * 255)
    mask[i] = full[i] >= 0.5 ? 255 : 0
  }
  return { selection: toSelection(mask, canvas.width, canvas.height), soft }
}

/* ------------------------------------------------------------------ sky */

/** ADE20K's class index for sky. */
export const ADE_SKY = 2

/**
 * Select Sky: a scene-parsing network labels every pixel with one of ADE20K's
 * 150 classes; the pixels it calls sky are the selection.
 */
export async function runSky(runner: Runner, spec: ModelSpec, canvas: HTMLCanvasElement): Promise<Selection> {
  const input = packPlanes(canvas, spec.size, spec.size, spec.mean, spec.std)
  const outputs = await runner.run({ [runner.inputNames[0]]: input })
  const logits = outputs[runner.outputNames[0]]
  const [, classes, height, width] = logits.dims
  const area = width * height
  const sky = new Float32Array(area)
  for (let i = 0; i < area; i += 1) {
    let best = 0
    let bestValue = -Infinity
    for (let c = 0; c < classes; c += 1) {
      const v = logits.data[c * area + i]
      if (v > bestValue) { bestValue = v; best = c }
    }
    sky[i] = best === ADE_SKY ? 1 : 0
  }
  const full = resizeMap(sky, width, height, canvas.width, canvas.height)
  const mask = new Uint8Array(full.length)
  for (let i = 0; i < full.length; i += 1) mask[i] = full[i] >= 0.5 ? 255 : 0
  return toSelection(blurMask(mask, canvas.width, canvas.height, 1), canvas.width, canvas.height)
}

/* ---------------------------------------------------------------- depth */

/**
 * A relative depth map, 1 nearest and 0 farthest, at the picture's size.
 * Depth Anything gives inverse depth (large is near), stretched here to 0..1.
 */
export async function runDepth(runner: Runner, spec: ModelSpec, canvas: HTMLCanvasElement): Promise<Float32Array> {
  const input = packPlanes(canvas, spec.size, spec.size, spec.mean, spec.std)
  const outputs = await runner.run({ [runner.inputNames[0]]: input })
  const depth = outputs[runner.outputNames[0]]
  const height = depth.dims[depth.dims.length - 2]
  const width = depth.dims[depth.dims.length - 1]
  const map = depth.data.subarray(0, width * height)
  let min = Infinity
  let max = -Infinity
  for (const v of map) { if (v < min) min = v; if (v > max) max = v }
  const range = max - min || 1
  const normalised = new Float32Array(map.length)
  for (let i = 0; i < map.length; i += 1) normalised[i] = (map[i] - min) / range
  return resizeMap(normalised, width, height, canvas.width, canvas.height)
}

/**
 * Depth Blur: the picture blurred more the farther away it is, the focus
 * at `focus` (0 far … 1 near) staying sharp. Four blurred copies at growing
 * radii are mixed per pixel by how far the pixel is from the focus depth.
 */
export function depthBlur(canvas: HTMLCanvasElement, depth: Float32Array, radius: number, focus = 1, selection: Selection | null = null) {
  const levels = [0.25, 0.5, 0.75, 1].map((factor) => {
    const copy = createCanvas(canvas.width, canvas.height)
    context2d(copy).drawImage(canvas, 0, 0)
    gaussianBlur(copy, radius * factor, selection)
    return context2d(copy).getImageData(0, 0, canvas.width, canvas.height).data
  })
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const sharp = Uint8ClampedArray.from(image.data)
  const ladder = [sharp, ...levels]
  for (let i = 0; i < depth.length; i += 1) {
    const away = Math.min(1, Math.abs(depth[i] - focus) / Math.max(0.05, Math.max(focus, 1 - focus)))
    if (away <= 0.02) continue
    // The amount of blur picks a spot between two rungs of the ladder.
    const position = away * (ladder.length - 1)
    const lower = Math.min(ladder.length - 1, Math.floor(position))
    const upper = Math.min(ladder.length - 1, lower + 1)
    const t = position - lower
    const a = ladder[lower]
    const b = ladder[upper]
    const p = i * 4
    for (let c = 0; c < 3; c += 1) image.data[p + c] = a[p + c] * (1 - t) + b[p + c] * t
  }
  ctx.putImageData(image, 0, 0)
}

/* -------------------------------------------------------------- inpaint */

/**
 * Object removal with LaMa, which works at 512 x 512: the hole's
 * neighbourhood is cut out as a square (at least the network's size, larger
 * when the hole is), scaled to 512, filled, scaled back, and only the hole's
 * own pixels are written into the picture.
 */
export async function runInpaint(runner: Runner, spec: ModelSpec, canvas: HTMLCanvasElement, mask: Uint8Array) {
  const { width, height } = canvas
  const box = maskBounds(mask, width, height)
  if (box.width <= 0 || box.height <= 0) return
  // A square around the hole with room on every side, clamped to the picture.
  const margin = Math.max(spec.size / 2, Math.max(box.width, box.height) * 0.75)
  let side = Math.ceil(Math.max(box.width, box.height) + margin * 2)
  side = Math.min(side, Math.max(width, height))
  let x0 = Math.round(box.x + box.width / 2 - side / 2)
  let y0 = Math.round(box.y + box.height / 2 - side / 2)
  x0 = Math.max(0, Math.min(width - Math.min(side, width), x0))
  y0 = Math.max(0, Math.min(height - Math.min(side, height), y0))
  const cropW = Math.min(side, width - x0)
  const cropH = Math.min(side, height - y0)
  // The crop, letterboxed onto the network's square.
  const crop = createCanvas(spec.size, spec.size)
  const cctx = context2d(crop)
  cctx.drawImage(canvas, x0, y0, cropW, cropH, 0, 0, spec.size, spec.size)
  const image = packPlanes(crop, spec.size, spec.size, spec.mean, spec.std)
  const scaleX = spec.size / cropW
  const scaleY = spec.size / cropH
  const hole = new Float32Array(spec.size * spec.size)
  for (let y = 0; y < spec.size; y += 1) {
    const sy = Math.min(height - 1, y0 + Math.floor(y / scaleY))
    for (let x = 0; x < spec.size; x += 1) {
      const sx = Math.min(width - 1, x0 + Math.floor(x / scaleX))
      hole[y * spec.size + x] = mask[sy * width + sx] ? 1 : 0
    }
  }
  // A slightly grown hole, so the network never sees the object's own rim.
  const grown = Float32Array.from(hole)
  for (let y = 1; y < spec.size - 1; y += 1) {
    for (let x = 1; x < spec.size - 1; x += 1) {
      const i = y * spec.size + x
      if (hole[i]) continue
      if (hole[i - 1] || hole[i + 1] || hole[i - spec.size] || hole[i + spec.size]) grown[i] = 1
    }
  }
  const feeds: Record<string, Tensor> = {}
  const imageName = runner.inputNames.find((name) => /image|input/i.test(name)) ?? runner.inputNames[0]
  const maskName = runner.inputNames.find((name) => /mask/i.test(name)) ?? runner.inputNames[1]
  feeds[imageName] = image
  feeds[maskName] = { data: grown, dims: [1, 1, spec.size, spec.size] }
  const outputs = await runner.run(feeds)
  const output = outputs[runner.outputNames[0]]
  let max = 0
  for (const v of output.data) if (v > max) max = v
  const filled = unpackPlanes(output, max > 1.5 ? 1 : 255)
  // Back to the crop's size, and only the hole is taken.
  const restored = createCanvas(cropW, cropH)
  context2d(restored).drawImage(filled, 0, 0, spec.size, spec.size, 0, 0, cropW, cropH)
  const patch = context2d(restored).getImageData(0, 0, cropW, cropH).data
  const ctx = context2d(canvas)
  const target = ctx.getImageData(0, 0, width, height)
  for (let y = 0; y < cropH; y += 1) {
    for (let x = 0; x < cropW; x += 1) {
      const i = (y0 + y) * width + x0 + x
      if (!mask[i]) continue
      const p = i * 4
      const q = (y * cropW + x) * 4
      target.data[p] = patch[q]; target.data[p + 1] = patch[q + 1]; target.data[p + 2] = patch[q + 2]; target.data[p + 3] = 255
    }
  }
  ctx.putImageData(target, 0, 0)
}

/* -------------------------------------------------------------- upscale */

/**
 * Super Zoom: a super-resolution network doubles the picture, tile by tile
 * (the tiles overlap and the overlap is discarded, so no seams show). Run
 * twice for x4.
 */
export async function runUpscale(runner: Runner, spec: ModelSpec, canvas: HTMLCanvasElement, onProgress?: (done: number, total: number) => void, tile = spec.size, overlap = 8): Promise<HTMLCanvasElement> {
  const { width, height } = canvas
  const out = createCanvas(width * 2, height * 2)
  const octx = context2d(out)
  const step = tile - overlap * 2
  const total = Math.ceil(height / step) * Math.ceil(width / step)
  let done = 0
  for (let ty = 0; ty < height; ty += step) {
    for (let tx = 0; tx < width; tx += step) {
      onProgress?.(done, total)
      done += 1
      // The tile with its overlap, padded at the picture's edge to a multiple of 8.
      const x0 = Math.max(0, tx - overlap)
      const y0 = Math.max(0, ty - overlap)
      const x1 = Math.min(width, tx + step + overlap)
      const y1 = Math.min(height, ty + step + overlap)
      const w = Math.ceil((x1 - x0) / 8) * 8
      const h = Math.ceil((y1 - y0) / 8) * 8
      const piece = createCanvas(w, h)
      const pctx = context2d(piece)
      pctx.drawImage(canvas, x0, y0, x1 - x0, y1 - y0, 0, 0, x1 - x0, y1 - y0)
      // Padding is a mirror of the edge, which the network likes better than black.
      if (w > x1 - x0) { pctx.save(); pctx.translate(2 * (x1 - x0), 0); pctx.scale(-1, 1); pctx.drawImage(piece, 0, 0, x1 - x0, h, 0, 0, x1 - x0, h); pctx.restore() }
      if (h > y1 - y0) { pctx.save(); pctx.translate(0, 2 * (y1 - y0)); pctx.scale(1, -1); pctx.drawImage(piece, 0, 0, w, y1 - y0, 0, 0, w, y1 - y0); pctx.restore() }
      const input = packPlanes(piece, w, h, spec.mean, spec.std)
      const outputs = await runner.run({ [runner.inputNames[0]]: input })
      const big = unpackPlanes(outputs[runner.outputNames[0]], 255)
      // Only the tile's own pixels, without the overlap, go into the result.
      const keepX = tx - x0
      const keepY = ty - y0
      const keepW = Math.min(step, width - tx)
      const keepH = Math.min(step, height - ty)
      octx.drawImage(big, keepX * 2, keepY * 2, keepW * 2, keepH * 2, tx * 2, ty * 2, keepW * 2, keepH * 2)
    }
  }
  return out
}
