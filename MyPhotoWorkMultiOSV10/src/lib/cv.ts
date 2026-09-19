import { context2d, createCanvas } from './canvas'
import { maskBounds } from './selection'
import type { Point, Selection } from './types'

/**
 * The commands that lean on OpenCV (compiled to WebAssembly, loaded on first
 * use so the editor's own bundle stays small): feature-based alignment and
 * stitching for Photomerge and Auto-Align, exposure fusion for Merge to HDR,
 * GrabCut for the Object Selection and Select Subject silhouettes, Telea
 * inpainting to seed Content-Aware Fill and the Remove tool, the photo finder
 * behind Crop and Straighten, and a bilateral denoiser.
 *
 * Every Mat OpenCV hands out is freed on the way out, whatever happens; the
 * `scope` helper below is what makes that bearable.
 */

/* ------------------------------------------------------------ the module */

// The bindings' own typings do not always agree with the build (the HDR
// classes take four arguments here, not two), so the module is typed loosely
// and each call site says what it expects.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Mat = any
type CvModule = any
/* eslint-enable @typescript-eslint/no-explicit-any */

let cvPromise: Promise<CvModule> | null = null

/** OpenCV, loaded once and shared; resolves when the runtime is ready. */
export function loadCv(): Promise<CvModule> {
  if (!cvPromise) {
    cvPromise = import('@techstark/opencv-js').then(async (loaded) => {
      const candidate = ((loaded as { default?: unknown }).default ?? loaded) as { then?: unknown; Mat?: unknown; onRuntimeInitialized?: () => void }
      const cv = typeof candidate.then === 'function' ? await (candidate as unknown as Promise<CvModule>) : candidate
      if (!cv.Mat) await new Promise<void>((resolve) => { cv.onRuntimeInitialized = resolve })
      return cv
    })
    cvPromise.catch(() => { cvPromise = null })
  }
  return cvPromise
}

/** Runs `fn` with a `keep` that registers Mats to delete when it returns. */
function scope<T>(fn: (keep: <M extends { delete(): void }>(mat: M) => M) => T): T {
  const owned: { delete(): void }[] = []
  const keep = <M extends { delete(): void }>(mat: M) => { owned.push(mat); return mat }
  try {
    return fn(keep)
  } finally {
    for (const mat of owned.reverse()) mat.delete()
  }
}

/* ------------------------------------------------------ canvas <-> mat */

function matFromCanvas(cv: CvModule, canvas: HTMLCanvasElement): Mat {
  const image = context2d(canvas).getImageData(0, 0, canvas.width, canvas.height)
  return cv.matFromImageData(image)
}

/** An 8-bit RGBA Mat drawn into a canvas (a new one unless `target` is given). */
function canvasFromMat(cv: CvModule, mat: Mat, target?: HTMLCanvasElement) {
  const canvas = target ?? createCanvas(mat.cols, mat.rows)
  const ctx = context2d(canvas)
  const image = ctx.createImageData(mat.cols, mat.rows)
  scope((keep) => {
    let rgba = mat
    if (mat.type() !== cv.CV_8UC4) {
      rgba = keep(new cv.Mat())
      if (mat.channels() === 1) cv.cvtColor(mat, rgba, cv.COLOR_GRAY2RGBA)
      else if (mat.channels() === 3) cv.cvtColor(mat, rgba, cv.COLOR_RGB2RGBA)
      else mat.convertTo(rgba, cv.CV_8UC4)
    }
    image.data.set(rgba.data)
  })
  ctx.putImageData(image, 0, 0)
  return canvas
}

/** A pixel-per-byte mask as a single-channel Mat. */
function matFromMask(cv: CvModule, mask: Uint8Array, width: number, height: number): Mat {
  return cv.matFromArray(height, width, cv.CV_8UC1, mask)
}

/** Shrinks a canvas so its longer side is at most `limit`, for the analysers. */
function shrink(canvas: HTMLCanvasElement, limit: number) {
  const scale = Math.min(1, limit / Math.max(canvas.width, canvas.height))
  if (scale >= 1) return { canvas, scale: 1 }
  const small = createCanvas(Math.max(1, Math.round(canvas.width * scale)), Math.max(1, Math.round(canvas.height * scale)))
  context2d(small).drawImage(canvas, 0, 0, small.width, small.height)
  return { canvas: small, scale }
}

/* ------------------------------------------------------------ inpainting */

/**
 * Telea inpainting: the masked pixels are grown in from their surroundings
 * along the isophotes. Right for a blemish or a wire; a large hole comes out
 * smooth, which is why Content-Aware Fill only uses this as its first guess.
 */
export async function inpaintCanvas(canvas: HTMLCanvasElement, mask: Uint8Array, radius = 5) {
  const cv = await loadCv()
  scope((keep) => {
    const source = keep(matFromCanvas(cv, canvas))
    const rgb = keep(new cv.Mat())
    cv.cvtColor(source, rgb, cv.COLOR_RGBA2RGB)
    const hole = keep(matFromMask(cv, mask, canvas.width, canvas.height))
    const filled = keep(new cv.Mat())
    cv.inpaint(rgb, hole, filled, radius, cv.INPAINT_TELEA)
    // The colour comes back from OpenCV; the alpha is the layer's own, made
    // solid inside the hole so a filled patch never stays see-through.
    const ctx = context2d(canvas)
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = filled.data
    for (let i = 0, p = 0; i < mask.length; i += 1, p += 4) {
      if (!mask[i]) continue
      image.data[p] = data[i * 3]
      image.data[p + 1] = data[i * 3 + 1]
      image.data[p + 2] = data[i * 3 + 2]
      image.data[p + 3] = 255
    }
    ctx.putImageData(image, 0, 0)
  })
}

/* ------------------------------------------------------------- alignment */

/** A 3x3 projective matrix, row-major. */
export type Homography = number[]

const identity: Homography = [1, 0, 0, 0, 1, 0, 0, 0, 1]

function multiply(a: Homography, b: Homography): Homography {
  const out = new Array<number>(9).fill(0)
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) for (let k = 0; k < 3; k += 1) out[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c]
  return out
}

export function invertHomography(m: Homography): Homography | null {
  const [a, b, c, d, e, f, g, h, i] = m
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  if (Math.abs(det) < 1e-12) return null
  return [
    (e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det,
    (f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det,
    (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det,
  ]
}

export function applyHomography(m: Homography, point: Point): Point {
  const w = m[6] * point.x + m[7] * point.y + m[8]
  return { x: (m[0] * point.x + m[1] * point.y + m[2]) / w, y: (m[3] * point.x + m[4] * point.y + m[5]) / w }
}

/** The ORB keypoints and descriptors of a picture, found on a reduced copy. */
function describe(cv: CvModule, canvas: HTMLCanvasElement, keep: <M extends { delete(): void }>(mat: M) => M) {
  const { canvas: small, scale } = shrink(canvas, 1200)
  const source = keep(matFromCanvas(cv, small))
  const grey = keep(new cv.Mat())
  cv.cvtColor(source, grey, cv.COLOR_RGBA2GRAY)
  const orb = keep(new cv.ORB(4000))
  const keypoints = keep(new cv.KeyPointVector())
  const descriptors = keep(new cv.Mat())
  orb.detectAndCompute(grey, keep(new cv.Mat()), keypoints, descriptors)
  return { keypoints, descriptors, scale }
}

export type AlignMode = 'perspective' | 'affine' | 'translation'

/**
 * The transform that takes `moving` onto `fixed`, from matched ORB features
 * and RANSAC, or null when the two pictures share too little. `translation`
 * keeps only the shift, `affine` drops the perspective terms.
 */
export async function findHomography(fixed: HTMLCanvasElement, moving: HTMLCanvasElement, mode: AlignMode = 'perspective'): Promise<Homography | null> {
  const cv = await loadCv()
  return scope((keep) => {
    const a = describe(cv, fixed, keep)
    const b = describe(cv, moving, keep)
    if (a.keypoints.size() < 8 || b.keypoints.size() < 8) return null
    const matcher = keep(new cv.BFMatcher(cv.NORM_HAMMING, true))
    const matches = keep(new cv.DMatchVector())
    matcher.match(b.descriptors, a.descriptors, matches)
    const pairs: { distance: number; from: Point; to: Point }[] = []
    for (let i = 0; i < matches.size(); i += 1) {
      const match = matches.get(i)
      const from = b.keypoints.get(match.queryIdx).pt
      const to = a.keypoints.get(match.trainIdx).pt
      pairs.push({ distance: match.distance, from: { x: from.x / b.scale, y: from.y / b.scale }, to: { x: to.x / a.scale, y: to.y / a.scale } })
    }
    pairs.sort((p, q) => p.distance - q.distance)
    const kept = pairs.slice(0, Math.max(8, Math.floor(pairs.length * 0.7)))
    if (kept.length < 8) return null
    const src = keep(cv.matFromArray(kept.length, 1, cv.CV_32FC2, kept.flatMap((p) => [p.from.x, p.from.y])))
    const dst = keep(cv.matFromArray(kept.length, 1, cv.CV_32FC2, kept.flatMap((p) => [p.to.x, p.to.y])))
    const inliers = keep(new cv.Mat())
    const found = keep(cv.findHomography(src, dst, cv.RANSAC, 4, inliers))
    if (found.empty() || cv.countNonZero(inliers) < 6) return null
    const h = [...found.data64F] as Homography
    if (mode === 'perspective') return h
    if (mode === 'affine') return [h[0], h[1], h[2], h[3], h[4], h[5], 0, 0, 1]
    // Translation: the shift the inliers agree on, not the matrix's own.
    let dx = 0
    let dy = 0
    let n = 0
    for (let i = 0; i < kept.length; i += 1) {
      if (!inliers.data[i]) continue
      dx += kept[i].to.x - kept[i].from.x
      dy += kept[i].to.y - kept[i].from.y
      n += 1
    }
    return [1, 0, dx / n, 0, 1, dy / n, 0, 0, 1]
  })
}

/**
 * Each picture's transform into the first one's frame, found by matching
 * every picture against its predecessor (neighbouring frames of a panorama
 * overlap; the first and last may not) and chaining the results. A frame
 * that matches nothing keeps the identity, so it is at least still there.
 */
export async function alignChain(canvases: HTMLCanvasElement[], mode: AlignMode = 'perspective'): Promise<Homography[]> {
  const out: Homography[] = [identity]
  for (let i = 1; i < canvases.length; i += 1) {
    const step = await findHomography(canvases[i - 1], canvases[i], mode)
    out.push(step ? multiply(out[i - 1], step) : out[i - 1])
  }
  return out
}

/** Warps a picture by `h` into a frame `width` x `height`, transparent outside. */
export async function warpCanvas(canvas: HTMLCanvasElement, h: Homography, width: number, height: number) {
  const cv = await loadCv()
  return scope((keep) => {
    const source = keep(matFromCanvas(cv, canvas))
    const matrix = keep(cv.matFromArray(3, 3, cv.CV_64F, h))
    const out = keep(new cv.Mat())
    cv.warpPerspective(source, out, matrix, new cv.Size(width, height), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(0, 0, 0, 0))
    return canvasFromMat(cv, out)
  })
}

/** The distance of each opaque pixel from the nearest transparent one. */
async function distanceInside(canvas: HTMLCanvasElement): Promise<Float32Array> {
  const cv = await loadCv()
  return scope((keep) => {
    const source = keep(matFromCanvas(cv, canvas))
    const channels = keep(new cv.MatVector())
    cv.split(source, channels)
    const alpha = keep(channels.get(3))
    const solid = keep(new cv.Mat())
    cv.threshold(alpha, solid, 8, 255, cv.THRESH_BINARY)
    const distance = keep(new cv.Mat())
    cv.distanceTransform(solid, distance, cv.DIST_L2, 3)
    return Float32Array.from(distance.data32F as Float32Array)
  })
}

/**
 * Lays aligned, same-sized pictures over one another so that where they
 * overlap each pixel is a blend weighted by how deep inside its own picture
 * it lies. Seams vanish because a picture's influence fades to nothing at
 * its edge. Returns the blend and, for Auto-Blend, each picture with the
 * alpha that made it up.
 */
export async function blendAligned(canvases: HTMLCanvasElement[], softness = 1) {
  const width = canvases[0].width
  const height = canvases[0].height
  const distances = await Promise.all(canvases.map((canvas) => distanceInside(canvas)))
  const planes = canvases.map((canvas) => context2d(canvas).getImageData(0, 0, width, height).data)
  const weights = distances.map((distance) => {
    const out = new Float32Array(distance.length)
    for (let i = 0; i < distance.length; i += 1) out[i] = Math.pow(distance[i], softness)
    return out
  })
  const merged = createCanvas(width, height)
  const image = context2d(merged).createImageData(width, height)
  const layers = canvases.map(() => new Uint8ClampedArray(width * height * 4))
  for (let i = 0, p = 0; i < width * height; i += 1, p += 4) {
    let total = 0
    for (let k = 0; k < planes.length; k += 1) if (planes[k][p + 3] > 8) total += weights[k][i]
    if (total <= 0) continue
    let r = 0
    let g = 0
    let b = 0
    for (let k = 0; k < planes.length; k += 1) {
      if (planes[k][p + 3] <= 8) continue
      const w = weights[k][i] / total
      r += planes[k][p] * w
      g += planes[k][p + 1] * w
      b += planes[k][p + 2] * w
      layers[k][p] = planes[k][p]
      layers[k][p + 1] = planes[k][p + 1]
      layers[k][p + 2] = planes[k][p + 2]
      layers[k][p + 3] = Math.round(w * 255)
    }
    image.data[p] = r
    image.data[p + 1] = g
    image.data[p + 2] = b
    image.data[p + 3] = 255
  }
  context2d(merged).putImageData(image, 0, 0)
  const perLayer = layers.map((data) => {
    const canvas = createCanvas(width, height)
    const out = context2d(canvas).createImageData(width, height)
    out.data.set(data)
    context2d(canvas).putImageData(out, 0, 0)
    return canvas
  })
  return { merged, perLayer }
}

/**
 * Photomerge: the frames matched feature to feature, each warped into the
 * first frame's plane, and the overlaps blended. The result is the panorama
 * and where each frame's box landed in it.
 */
export async function stitchCanvases(canvases: HTMLCanvasElement[], mode: AlignMode = 'perspective', blend = true) {
  if (canvases.length === 1) return { canvas: canvases[0], placements: [{ x: 0, y: 0 }] }
  const transforms = await alignChain(canvases, mode)
  // The panorama's extent is the union of every frame's warped corners.
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const boxes = canvases.map((canvas, index) => {
    const corners = [{ x: 0, y: 0 }, { x: canvas.width, y: 0 }, { x: canvas.width, y: canvas.height }, { x: 0, y: canvas.height }].map((corner) => applyHomography(transforms[index], corner))
    const box = {
      x: Math.min(...corners.map((c) => c.x)), y: Math.min(...corners.map((c) => c.y)),
      right: Math.max(...corners.map((c) => c.x)), bottom: Math.max(...corners.map((c) => c.y)),
    }
    minX = Math.min(minX, box.x); minY = Math.min(minY, box.y); maxX = Math.max(maxX, box.right); maxY = Math.max(maxY, box.bottom)
    return box
  })
  // A wildly wrong homography would ask for a gigantic canvas; cap it.
  const limit = 4 * Math.max(...canvases.map((c) => c.width + c.height))
  const width = Math.min(limit, Math.max(1, Math.ceil(maxX - minX)))
  const height = Math.min(limit, Math.max(1, Math.ceil(maxY - minY)))
  const shift: Homography = [1, 0, -minX, 0, 1, -minY, 0, 0, 1]
  const warped: HTMLCanvasElement[] = []
  for (let i = 0; i < canvases.length; i += 1) warped.push(await warpCanvas(canvases[i], multiply(shift, transforms[i]), width, height))
  const placements = boxes.map((box) => ({ x: Math.round(box.x - minX), y: Math.round(box.y - minY) }))
  if (!blend) {
    const canvas = createCanvas(width, height)
    const ctx = context2d(canvas)
    for (const frame of warped) ctx.drawImage(frame, 0, 0)
    return { canvas, placements }
  }
  const { merged } = await blendAligned(warped)
  return { canvas: merged, placements }
}

/* ------------------------------------------------------------------- HDR */

/**
 * Merge to HDR: Mertens exposure fusion of the aligned frames. Each pixel is
 * taken from the exposures that show it well — contrast, saturation and a
 * well-exposed midtone all count — and the blend is done on a Laplacian
 * pyramid so there are no seams between exposures.
 */
export async function exposureFusion(canvases: HTMLCanvasElement[]) {
  const cv = await loadCv()
  const width = canvases[0].width
  const height = canvases[0].height
  return scope((keep) => {
    const stack = keep(new cv.MatVector())
    for (const canvas of canvases) {
      const rgba = keep(matFromCanvas(cv, canvas))
      const rgb = keep(new cv.Mat())
      cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB)
      if (rgb.cols !== width || rgb.rows !== height) {
        const sized = keep(new cv.Mat())
        cv.resize(rgb, sized, new cv.Size(width, height), 0, 0, cv.INTER_AREA)
        stack.push_back(sized)
      } else {
        stack.push_back(rgb)
      }
    }
    const mertens = keep(new cv.MergeMertens())
    const fused = keep(new cv.Mat())
    // This build binds the four-argument form; the times and response are unused.
    mertens.process(stack, fused, keep(new cv.Mat()), keep(new cv.Mat()))
    const bytes = keep(new cv.Mat())
    fused.convertTo(bytes, cv.CV_8UC3, 255)
    return canvasFromMat(cv, bytes)
  })
}

/* --------------------------------------------------------------- GrabCut */

/**
 * GrabCut: the box says roughly where the object is; a colour model of the
 * inside against the outside is refined by graph cuts until the silhouette
 * settles. Photoshop's Object Selection did exactly this before it had a
 * network. `seed` may carry a mask instead: 255 for sure-foreground strokes,
 * 1 for sure-background, 0 for undecided.
 */
export async function grabCutSelection(canvas: HTMLCanvasElement, box: { x: number; y: number; width: number; height: number }, iterations = 5, seed?: Uint8Array): Promise<Selection> {
  const cv = await loadCv()
  const { canvas: small, scale } = shrink(canvas, 640)
  const width = small.width
  const height = small.height
  const x0 = Math.max(0, Math.floor(Math.min(box.x, box.x + box.width) * scale))
  const y0 = Math.max(0, Math.floor(Math.min(box.y, box.y + box.height) * scale))
  const x1 = Math.min(width - 1, Math.ceil(Math.max(box.x, box.x + box.width) * scale))
  const y1 = Math.min(height - 1, Math.ceil(Math.max(box.y, box.y + box.height) * scale))
  const mask = scope((keep) => {
    const rgba = keep(matFromCanvas(cv, small))
    const rgb = keep(new cv.Mat())
    cv.cvtColor(rgba, rgb, cv.COLOR_RGBA2RGB)
    const labels = keep(new cv.Mat(height, width, cv.CV_8UC1, new cv.Scalar(cv.GC_BGD)))
    const rect = new cv.Rect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0))
    const background = keep(new cv.Mat())
    const foreground = keep(new cv.Mat())
    cv.grabCut(rgb, labels, rect, background, foreground, iterations, cv.GC_INIT_WITH_RECT)
    if (seed) {
      // Strokes from the user override the box, and the model runs again.
      const data = labels.data as Uint8Array
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const source = seed[Math.min(canvas.height - 1, Math.floor(y / scale)) * canvas.width + Math.min(canvas.width - 1, Math.floor(x / scale))]
          if (source === 255) data[y * width + x] = cv.GC_FGD
          else if (source === 1) data[y * width + x] = cv.GC_BGD
        }
      }
      cv.grabCut(rgb, labels, rect, background, foreground, Math.max(1, iterations >> 1), cv.GC_INIT_WITH_MASK)
    }
    const out = new Uint8Array(width * height)
    const data = labels.data as Uint8Array
    for (let i = 0; i < out.length; i += 1) out[i] = data[i] === cv.GC_FGD || data[i] === cv.GC_PR_FGD ? 255 : 0
    return out
  })
  return upscaleMask(mask, width, height, canvas.width, canvas.height)
}

/** A reduced mask brought back to full size with a soft, then re-cut, edge. */
function upscaleMask(mask: Uint8Array, width: number, height: number, fullWidth: number, fullHeight: number): Selection {
  if (width === fullWidth && height === fullHeight) return { kind: 'mask', ...maskBounds(mask, width, height), mask }
  const small = createCanvas(width, height)
  const image = context2d(small).createImageData(width, height)
  for (let i = 0; i < mask.length; i += 1) { image.data[i * 4] = 255; image.data[i * 4 + 1] = 255; image.data[i * 4 + 2] = 255; image.data[i * 4 + 3] = mask[i] }
  context2d(small).putImageData(image, 0, 0)
  const full = createCanvas(fullWidth, fullHeight)
  const ctx = context2d(full)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(small, 0, 0, fullWidth, fullHeight)
  const data = ctx.getImageData(0, 0, fullWidth, fullHeight).data
  const out = new Uint8Array(fullWidth * fullHeight)
  for (let i = 0; i < out.length; i += 1) out[i] = data[i * 4 + 3] >= 128 ? 255 : 0
  return { kind: 'mask', ...maskBounds(out, fullWidth, fullHeight), mask: out }
}

/* --------------------------------------------------- crop and straighten */

/**
 * Crop and Straighten Photos: the pictures lying on a scanner bed. The bed's
 * colour is read from the border, everything that differs from it is a
 * candidate, and each large blob's tightest rotated rectangle is cut out and
 * turned upright. Returns the photos, largest first.
 */
export async function findPhotosOnScan(canvas: HTMLCanvasElement): Promise<HTMLCanvasElement[]> {
  const cv = await loadCv()
  const { canvas: small, scale } = shrink(canvas, 1000)
  const width = small.width
  const height = small.height
  const data = context2d(small).getImageData(0, 0, width, height).data
  // The bed colour: the median of the border pixels.
  const border: number[][] = [[], [], []]
  const rim = Math.max(2, Math.round(Math.min(width, height) * 0.02))
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= rim && x < width - rim && y >= rim && y < height - rim) continue
      const i = (y * width + x) * 4
      border[0].push(data[i]); border[1].push(data[i + 1]); border[2].push(data[i + 2])
    }
  }
  const bed = border.map((values) => values.sort((a, b) => a - b)[values.length >> 1])
  const different = new Uint8Array(width * height)
  for (let i = 0; i < different.length; i += 1) {
    const p = i * 4
    const distance = Math.abs(data[p] - bed[0]) + Math.abs(data[p + 1] - bed[1]) + Math.abs(data[p + 2] - bed[2])
    different[i] = distance > 60 || data[p + 3] < 128 ? 255 : 0
  }
  const rects = scope((keep) => {
    const mask = keep(matFromMask(cv, different, width, height))
    const kernel = keep(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5)))
    cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel)
    cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel)
    const contours = keep(new cv.MatVector())
    const hierarchy = keep(new cv.Mat())
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
    const found: { cx: number; cy: number; w: number; h: number; angle: number; area: number }[] = []
    for (let i = 0; i < contours.size(); i += 1) {
      const contour = keep(contours.get(i))
      const area = cv.contourArea(contour)
      if (area < width * height * 0.01) continue
      const rect = cv.minAreaRect(contour)
      found.push({ cx: rect.center.x / scale, cy: rect.center.y / scale, w: rect.size.width / scale, h: rect.size.height / scale, angle: rect.angle, area })
    }
    return found.sort((a, b) => b.area - a.area)
  })
  const photos: HTMLCanvasElement[] = []
  for (const rect of rects) {
    // minAreaRect reports the angle of one side, in (-90, 0] in this build
    // and [0, 90) in others; the smaller turn is the print's true tilt, and
    // the sides swap with it.
    let angle = rect.angle
    let w = rect.w
    let h = rect.h
    if (angle < -45) { angle += 90; [w, h] = [h, w] } else if (angle > 45) { angle -= 90; [w, h] = [h, w] }
    photos.push(await cutRotated(canvas, rect.cx, rect.cy, Math.round(w), Math.round(h), angle))
  }
  return photos
}

/** The `w` x `h` rectangle centred at (cx, cy) and tilted by `angle`, upright. */
async function cutRotated(canvas: HTMLCanvasElement, cx: number, cy: number, w: number, h: number, angle: number) {
  const cv = await loadCv()
  return scope((keep) => {
    const source = keep(matFromCanvas(cv, canvas))
    const rotation = keep(cv.getRotationMatrix2D(new cv.Point(cx, cy), angle, 1))
    // Shift so the rectangle's top-left lands at the origin of the output.
    rotation.data64F[2] += w / 2 - cx
    rotation.data64F[5] += h / 2 - cy
    const out = keep(new cv.Mat())
    cv.warpAffine(source, out, rotation, new cv.Size(Math.max(1, w), Math.max(1, h)), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(0, 0, 0, 0))
    return canvasFromMat(cv, out)
  })
}

/* --------------------------------------------------------------- denoise */

/**
 * Reduce Noise, the edge-preserving way: a bilateral filter smooths within
 * regions of similar colour and stops at the edges between them.
 */
export async function bilateralDenoise(canvas: HTMLCanvasElement, strength: number, selection: Uint8Array | null = null) {
  const cv = await loadCv()
  const k = Math.max(0, Math.min(1, strength / 100))
  scope((keep) => {
    const source = keep(matFromCanvas(cv, canvas))
    const rgb = keep(new cv.Mat())
    cv.cvtColor(source, rgb, cv.COLOR_RGBA2RGB)
    const smooth = keep(new cv.Mat())
    cv.bilateralFilter(rgb, smooth, Math.round(5 + k * 8), 20 + k * 80, 5 + k * 10, cv.BORDER_DEFAULT)
    const ctx = context2d(canvas)
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = smooth.data
    for (let i = 0, p = 0; i < canvas.width * canvas.height; i += 1, p += 4) {
      if (selection && !selection[i]) continue
      image.data[p] = data[i * 3]
      image.data[p + 1] = data[i * 3 + 1]
      image.data[p + 2] = data[i * 3 + 2]
    }
    ctx.putImageData(image, 0, 0)
  })
}
