import { clamp } from './color'
import { context2d } from './canvas'
import { maskBounds } from './selection'
import type { Point, Selection } from './types'

/**
 * Selections that come from looking at the picture rather than from a drag:
 * Object Selection, Select Subject, Sky, Focus Area and Select and Mask's
 * edge refinement. None of these is a neural network — they are colour and
 * texture statistics, which is honest about what runs on this machine — but
 * they are built the way a segmenter is built: seeds, a model of the
 * background, a per-pixel decision, and morphology to clean the result up.
 */

type Rgb = { r: number; g: number; b: number }

/** A handful of colour clusters (k-means) describing a set of sample pixels. */
export function colorClusters(samples: Rgb[], k = 4, rounds = 6): Rgb[] {
  if (!samples.length) return []
  const centres: Rgb[] = []
  const step = Math.max(1, Math.floor(samples.length / k))
  for (let i = 0; i < k && i * step < samples.length; i += 1) centres.push({ ...samples[i * step] })
  for (let round = 0; round < rounds; round += 1) {
    const sums = centres.map(() => ({ r: 0, g: 0, b: 0, n: 0 }))
    for (const s of samples) {
      let best = 0
      let bestD = Infinity
      centres.forEach((c, i) => {
        const d = (c.r - s.r) ** 2 + (c.g - s.g) ** 2 + (c.b - s.b) ** 2
        if (d < bestD) { bestD = d; best = i }
      })
      sums[best].r += s.r; sums[best].g += s.g; sums[best].b += s.b; sums[best].n += 1
    }
    sums.forEach((sum, i) => {
      if (sum.n) centres[i] = { r: sum.r / sum.n, g: sum.g / sum.n, b: sum.b / sum.n }
    })
  }
  return centres
}

function nearestDistance(centres: Rgb[], r: number, g: number, b: number) {
  let best = Infinity
  for (const c of centres) {
    const d = Math.sqrt((c.r - r) ** 2 + (c.g - g) ** 2 + (c.b - b) ** 2)
    if (d < best) best = d
  }
  return best
}

/* ------------------------------------------------------------ morphology */

export function dilateMask(mask: Uint8Array, width: number, height: number, radius: number) {
  const out = new Uint8Array(mask)
  const r = Math.max(0, Math.round(radius))
  if (!r) return out
  // Two separable passes of a max filter: a square structuring element.
  const tmp = new Uint8Array(mask.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let v = 0
      for (let k = -r; k <= r; k += 1) {
        const xx = x + k
        if (xx < 0 || xx >= width) continue
        v = Math.max(v, mask[y * width + xx])
        if (v === 255) break
      }
      tmp[y * width + x] = v
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let v = 0
      for (let k = -r; k <= r; k += 1) {
        const yy = y + k
        if (yy < 0 || yy >= height) continue
        v = Math.max(v, tmp[yy * width + x])
        if (v === 255) break
      }
      out[y * width + x] = v
    }
  }
  return out
}

export function erodeMask(mask: Uint8Array, width: number, height: number, radius: number) {
  const inverted = new Uint8Array(mask.length)
  for (let i = 0; i < mask.length; i += 1) inverted[i] = 255 - mask[i]
  const grown = dilateMask(inverted, width, height, radius)
  for (let i = 0; i < grown.length; i += 1) grown[i] = 255 - grown[i]
  return grown
}

export function closeMask(mask: Uint8Array, width: number, height: number, radius: number) {
  return erodeMask(dilateMask(mask, width, height, radius), width, height, radius)
}

export function openMask(mask: Uint8Array, width: number, height: number, radius: number) {
  return dilateMask(erodeMask(mask, width, height, radius), width, height, radius)
}

/** Labels 4-connected components; returns labels and each component's size. */
export function labelComponents(mask: Uint8Array, width: number, height: number) {
  const labels = new Int32Array(mask.length)
  const sizes: number[] = [0]
  let next = 1
  const stack: number[] = []
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || labels[start]) continue
    const label = next
    next += 1
    let size = 0
    stack.push(start)
    labels[start] = label
    while (stack.length) {
      const index = stack.pop() as number
      size += 1
      const x = index % width
      const y = (index - x) / width
      const neighbours = [index - 1, index + 1, index - width, index + width]
      const valid = [x > 0, x < width - 1, y > 0, y < height - 1]
      for (let n = 0; n < 4; n += 1) {
        const j = neighbours[n]
        if (!valid[n] || !mask[j] || labels[j]) continue
        labels[j] = label
        stack.push(j)
      }
    }
    sizes.push(size)
  }
  return { labels, sizes }
}

/** Drops every component smaller than `minSize` pixels. */
export function removeSmallComponents(mask: Uint8Array, width: number, height: number, minSize: number) {
  const { labels, sizes } = labelComponents(mask, width, height)
  const out = new Uint8Array(mask.length)
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] && sizes[labels[i]] >= minSize) out[i] = 255
  }
  return out
}

/** Fills enclosed holes: anything unselected that cannot reach the border. */
export function fillHoles(mask: Uint8Array, width: number, height: number) {
  const outside = new Uint8Array(mask.length)
  const stack: number[] = []
  const push = (i: number) => {
    if (!mask[i] && !outside[i]) { outside[i] = 1; stack.push(i) }
  }
  for (let x = 0; x < width; x += 1) { push(x); push((height - 1) * width + x) }
  for (let y = 0; y < height; y += 1) { push(y * width); push(y * width + width - 1) }
  while (stack.length) {
    const index = stack.pop() as number
    const x = index % width
    const y = (index - x) / width
    if (x > 0) push(index - 1)
    if (x < width - 1) push(index + 1)
    if (y > 0) push(index - width)
    if (y < height - 1) push(index + width)
  }
  const out = new Uint8Array(mask.length)
  for (let i = 0; i < mask.length; i += 1) out[i] = mask[i] || !outside[i] ? 255 : 0
  return out
}

/** A box blur over a byte mask, for soft edges. */
export function blurMask(mask: Uint8Array, width: number, height: number, radius: number) {
  const r = Math.max(0, Math.round(radius))
  if (!r) return new Uint8Array(mask)
  const tmp = new Float32Array(mask.length)
  const out = new Uint8Array(mask.length)
  const span = r * 2 + 1
  for (let y = 0; y < height; y += 1) {
    let sum = 0
    for (let k = -r; k <= r; k += 1) sum += mask[y * width + clamp(k, 0, width - 1)]
    for (let x = 0; x < width; x += 1) {
      tmp[y * width + x] = sum / span
      const leaving = mask[y * width + clamp(x - r, 0, width - 1)]
      const entering = mask[y * width + clamp(x + r + 1, 0, width - 1)]
      sum += entering - leaving
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0
    for (let k = -r; k <= r; k += 1) sum += tmp[clamp(k, 0, height - 1) * width + x]
    for (let y = 0; y < height; y += 1) {
      out[y * width + x] = Math.round(sum / span)
      const leaving = tmp[clamp(y - r, 0, height - 1) * width + x]
      const entering = tmp[clamp(y + r + 1, 0, height - 1) * width + x]
      sum += entering - leaving
    }
  }
  return out
}

function toSelection(mask: Uint8Array, width: number, height: number): Selection {
  return { kind: 'mask', ...maskBounds(mask, width, height), mask }
}

/* ------------------------------------------------------ object selection */

/**
 * Object Selection: the box is the hint. Its rim is taken to be background,
 * clustered into a few colours; everything inside that is far from all of
 * them is the object. Holes are filled and specks dropped so a hand-drawn
 * box gives a clean silhouette.
 */
export function objectSelectRect(canvas: HTMLCanvasElement, rect: { x: number; y: number; width: number; height: number }, tolerance = 40): Selection {
  const { width, height } = canvas
  const data = context2d(canvas).getImageData(0, 0, width, height).data
  const x0 = clamp(Math.floor(Math.min(rect.x, rect.x + rect.width)), 0, width - 1)
  const y0 = clamp(Math.floor(Math.min(rect.y, rect.y + rect.height)), 0, height - 1)
  const x1 = clamp(Math.ceil(Math.max(rect.x, rect.x + rect.width)), 0, width - 1)
  const y1 = clamp(Math.ceil(Math.max(rect.y, rect.y + rect.height)), 0, height - 1)
  const rim = Math.max(1, Math.round(Math.min(x1 - x0, y1 - y0) * 0.06))
  const samples: Rgb[] = []
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const onRim = x - x0 < rim || x1 - x < rim || y - y0 < rim || y1 - y < rim
      if (!onRim) continue
      const i = (y * width + x) * 4
      if (data[i + 3] < 8) continue
      samples.push({ r: data[i], g: data[i + 1], b: data[i + 2] })
    }
  }
  const centres = colorClusters(samples, 5)
  let mask = new Uint8Array(width * height)
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const i = (y * width + x) * 4
      if (data[i + 3] < 8) continue
      if (nearestDistance(centres, data[i], data[i + 1], data[i + 2]) > tolerance) mask[y * width + x] = 255
    }
  }
  const scale = Math.max(1, Math.round(Math.min(x1 - x0, y1 - y0) / 120))
  mask = closeMask(mask, width, height, scale)
  mask = fillHoles(mask, width, height)
  mask = openMask(mask, width, height, scale)
  mask = removeSmallComponents(mask, width, height, Math.max(16, ((x1 - x0) * (y1 - y0)) / 200))
  return toSelection(mask, width, height)
}

/**
 * Select Subject with no box: the whole frame is the box, and the object is
 * whatever stands out from the border, weighted towards the centre and kept
 * to the largest connected pieces. The threshold adapts to the picture — the
 * median distance from the background model — so a busy background does not
 * select everything.
 */
export function selectSubjectAuto(canvas: HTMLCanvasElement): Selection {
  const { width, height } = canvas
  const data = context2d(canvas).getImageData(0, 0, width, height).data
  const rim = Math.max(2, Math.round(Math.min(width, height) * 0.08))
  const samples: Rgb[] = []
  const stride = Math.max(1, Math.round(Math.sqrt((width * height) / 20000)))
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const onRim = x < rim || width - x <= rim || y < rim || height - y <= rim
      if (!onRim) continue
      const i = (y * width + x) * 4
      if (data[i + 3] < 8) continue
      samples.push({ r: data[i], g: data[i + 1], b: data[i + 2] })
    }
  }
  const centres = colorClusters(samples, 6)
  const distances = new Float32Array(width * height)
  const sorted: number[] = []
  const cx = width / 2
  const cy = height / 2
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      if (data[i + 3] < 8) continue
      const d = nearestDistance(centres, data[i], data[i + 1], data[i + 2])
      // A gentle pull to the middle: the subject of a photo is rarely in a corner.
      const centred = 1 - 0.35 * Math.hypot((x - cx) / cx, (y - cy) / cy)
      distances[y * width + x] = d * centred
      if ((x + y) % stride === 0) sorted.push(d * centred)
    }
  }
  sorted.sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0
  const threshold = Math.max(24, median * 1.2)
  let mask = new Uint8Array(width * height)
  for (let i = 0; i < mask.length; i += 1) if (distances[i] > threshold) mask[i] = 255
  const scale = Math.max(1, Math.round(Math.min(width, height) / 160))
  mask = closeMask(mask, width, height, scale)
  mask = fillHoles(mask, width, height)
  mask = openMask(mask, width, height, scale)
  // Keep the big pieces only: the subject and anything of comparable size.
  const { labels, sizes } = labelComponents(mask, width, height)
  const largest = Math.max(0, ...sizes.slice(1))
  const keep = new Uint8Array(mask.length)
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] && sizes[labels[i]] >= largest * 0.15) keep[i] = 255
  }
  return toSelection(keep, width, height)
}

/* -------------------------------------------------------------------- sky */

/** Sky: the bright, blue-leaning region that touches the top edge. */
export function selectSky(canvas: HTMLCanvasElement): Selection {
  const { width, height } = canvas
  const data = context2d(canvas).getImageData(0, 0, width, height).data
  const looksLikeSky = (i: number) => {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const bright = (r + g + b) / 3
    const blueish = b >= r && b >= g - 12
    const pale = bright > 170 && Math.max(r, g, b) - Math.min(r, g, b) < 40
    return data[i + 3] > 8 && (blueish && bright > 70 || pale)
  }
  const candidate = new Uint8Array(width * height)
  for (let i = 0; i < candidate.length; i += 1) if (looksLikeSky(i * 4)) candidate[i] = 255
  // Only what connects to the top edge counts: a blue shirt does not.
  const mask = new Uint8Array(width * height)
  const stack: number[] = []
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < Math.min(height, 4); y += 1) {
      const index = y * width + x
      if (candidate[index] && !mask[index]) { mask[index] = 255; stack.push(index) }
    }
  }
  while (stack.length) {
    const index = stack.pop() as number
    const x = index % width
    const y = (index - x) / width
    const next = [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, y > 0 ? index - width : -1, y < height - 1 ? index + width : -1]
    for (const j of next) {
      if (j < 0 || mask[j] || !candidate[j]) continue
      mask[j] = 255
      stack.push(j)
    }
  }
  const scale = Math.max(1, Math.round(Math.min(width, height) / 200))
  return toSelection(blurMask(closeMask(mask, width, height, scale), width, height, scale), width, height)
}

/* ------------------------------------------------------------ focus area */

/** Focus Area: where the picture is sharp, measured by local contrast. */
export function selectFocusArea(canvas: HTMLCanvasElement, sensitivity = 1): Selection {
  const { width, height } = canvas
  const data = context2d(canvas).getImageData(0, 0, width, height).data
  const luma = new Float32Array(width * height)
  for (let i = 0; i < luma.length; i += 1) {
    luma[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
  }
  // Laplacian energy, then averaged over a window so texture reads as a region.
  const energy = new Uint8Array(width * height)
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x
      const lap = Math.abs(4 * luma[i] - luma[i - 1] - luma[i + 1] - luma[i - width] - luma[i + width])
      energy[i] = clamp(lap * 4 * sensitivity, 0, 255)
    }
  }
  const smooth = blurMask(energy, width, height, Math.max(3, Math.round(Math.min(width, height) / 60)))
  // Otsu's threshold on the smoothed energy.
  const hist = new Uint32Array(256)
  for (let i = 0; i < smooth.length; i += 1) hist[smooth[i]] += 1
  let total = smooth.length
  let sum = 0
  for (let i = 0; i < 256; i += 1) sum += i * hist[i]
  let sumB = 0
  let wB = 0
  let best = 0
  let threshold = 0
  for (let i = 0; i < 256; i += 1) {
    wB += hist[i]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += i * hist[i]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) ** 2
    if (between > best) { best = between; threshold = i }
  }
  total = 0
  let mask = new Uint8Array(width * height)
  for (let i = 0; i < mask.length; i += 1) if (smooth[i] > threshold && data[i * 4 + 3] > 8) mask[i] = 255
  const scale = Math.max(1, Math.round(Math.min(width, height) / 150))
  mask = closeMask(mask, width, height, scale * 2)
  mask = fillHoles(mask, width, height)
  mask = removeSmallComponents(mask, width, height, (width * height) / 400)
  return toSelection(mask, width, height)
}

/* ----------------------------------------------------------- refine edge */

export type RefineOptions = {
  /** Rounds the outline; pixels. */
  smooth: number
  /** Softens the edge; pixels. */
  feather: number
  /** Hardens a soft edge back up; 0..100. */
  contrast: number
  /** Moves the edge in (negative) or out; -100..100 as a share of the feather. */
  shift: number
  /** Blurs the edge by the local colour edge strength, for hair. */
  radius: number
}

/** Select and Mask's Global Refinements, applied to a byte mask. */
export function refineMask(mask: Uint8Array, width: number, height: number, options: RefineOptions, canvas?: HTMLCanvasElement) {
  let out = new Uint8Array(mask)
  if (options.smooth > 0) {
    const r = Math.round(options.smooth)
    out = blurMask(out, width, height, r)
    for (let i = 0; i < out.length; i += 1) out[i] = out[i] >= 128 ? 255 : 0
  }
  if (options.radius > 0 && canvas) {
    // Edge-aware softening: near strong colour edges the mask follows the
    // picture's own transitions instead of the selection's hard line.
    const data = context2d(canvas).getImageData(0, 0, width, height).data
    const soft = blurMask(out, width, height, Math.round(options.radius))
    const band = dilateMask(out, width, height, Math.round(options.radius))
    const inner = erodeMask(out, width, height, Math.round(options.radius))
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const i = y * width + x
        if (!band[i] || inner[i]) continue
        const p = i * 4
        const gx = Math.abs(data[p + 4] - data[p - 4]) + Math.abs(data[p + 5] - data[p - 3]) + Math.abs(data[p + 6] - data[p - 2])
        const gy = Math.abs(data[p + width * 4] - data[p - width * 4]) + Math.abs(data[p + width * 4 + 1] - data[p - width * 4 + 1]) + Math.abs(data[p + width * 4 + 2] - data[p - width * 4 + 2])
        const edge = clamp((gx + gy) / 6, 0, 1)
        out[i] = Math.round(soft[i] * (1 - edge) + (soft[i] >= 128 ? 255 : 0) * edge)
      }
    }
  }
  if (options.feather > 0) {
    out = blurMask(out, width, height, Math.round(options.feather))
  }
  if (options.shift) {
    // A shift moves the 50% point of the soft edge, which is what pushing
    // the edge in or out amounts to.
    const k = options.shift / 100
    for (let i = 0; i < out.length; i += 1) {
      out[i] = clamp(Math.round(out[i] + k * 128), 0, 255)
    }
  }
  if (options.contrast > 0) {
    const c = 1 + options.contrast / 25
    for (let i = 0; i < out.length; i += 1) {
      out[i] = clamp(Math.round((out[i] - 128) * c + 128), 0, 255)
    }
  }
  return out
}

/**
 * Decontaminate colours: pixels in the soft edge take the colour of the
 * nearest fully selected pixels, so fringes of the old background go.
 */
export function decontaminateEdge(canvas: HTMLCanvasElement, mask: Uint8Array, radius = 4) {
  const { width, height } = canvas
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, width, height)
  const src = new Uint8ClampedArray(image.data)
  const r = Math.max(1, Math.round(radius))
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x
      if (mask[i] === 0 || mask[i] === 255) continue
      let sr = 0
      let sg = 0
      let sb = 0
      let n = 0
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const xx = x + dx
          const yy = y + dy
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue
          const j = yy * width + xx
          if (mask[j] !== 255) continue
          sr += src[j * 4]; sg += src[j * 4 + 1]; sb += src[j * 4 + 2]; n += 1
        }
      }
      if (!n) continue
      const t = 1 - mask[i] / 255
      image.data[i * 4] = src[i * 4] * (1 - t) + (sr / n) * t
      image.data[i * 4 + 1] = src[i * 4 + 1] * (1 - t) + (sg / n) * t
      image.data[i * 4 + 2] = src[i * 4 + 2] * (1 - t) + (sb / n) * t
    }
  }
  ctx.putImageData(image, 0, 0)
}

/** Which pixels a byte mask covers, as a rectangle; used by Transform Selection. */
export function maskRect(mask: Uint8Array, width: number, height: number) {
  return maskBounds(mask, width, height)
}

/** The centre of a selection, for rotating it about itself. */
export function selectionCentre(selection: Selection): Point {
  return { x: selection.x + selection.width / 2, y: selection.y + selection.height / 2 }
}
