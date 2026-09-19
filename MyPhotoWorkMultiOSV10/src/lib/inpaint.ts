import { context2d, createCanvas } from './canvas'

/**
 * Two pieces of classical image maths that Photoshop's more famous commands
 * are built on.
 *
 * `patchFill` is PatchMatch inpainting (Barnes et al. 2009, in the form
 * Wexler et al. use for hole filling): the hole is rebuilt from patches of
 * the rest of the picture, so texture and structure continue into it instead
 * of smearing. It runs coarse to fine — the coarse levels settle the large
 * structure, the fine ones the grain — and each level alternates between
 * finding, for every patch that touches the hole, the most similar patch
 * elsewhere, and voting those patches' pixels into the hole. This is what
 * Content-Aware Fill is.
 *
 * `poissonBlend` is seamless cloning (Pérez et al. 2003): a pasted object's
 * gradients are kept but its colours are re-solved so that at its edge they
 * meet the background exactly. Lighting and colour cast flow in from the
 * surroundings, which is what Harmonize is for.
 */

/* ------------------------------------------------------------ PatchMatch */

type Level = {
  width: number
  height: number
  /** RGB, three floats per pixel. */
  rgb: Float32Array
  /** 1 inside the hole. */
  hole: Uint8Array
}

const PATCH = 7
const HALF = 3

function halve(level: Level): Level {
  const width = Math.max(1, level.width >> 1)
  const height = Math.max(1, level.height >> 1)
  const rgb = new Float32Array(width * height * 3)
  const hole = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      let holed = 0
      for (let dy = 0; dy < 2; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          const sx = Math.min(level.width - 1, x * 2 + dx)
          const sy = Math.min(level.height - 1, y * 2 + dy)
          const i = sy * level.width + sx
          if (level.hole[i]) { holed += 1; continue }
          r += level.rgb[i * 3]; g += level.rgb[i * 3 + 1]; b += level.rgb[i * 3 + 2]; n += 1
        }
      }
      const o = y * width + x
      // A coarse pixel is a hole when half or more of what it stands for is.
      hole[o] = holed >= 2 ? 1 : 0
      if (n) { rgb[o * 3] = r / n; rgb[o * 3 + 1] = g / n; rgb[o * 3 + 2] = b / n }
    }
  }
  return { width, height, rgb, hole }
}

/** Pixels whose patch overlaps the hole (the targets), and pixels whose patch is clear of it (the sources). */
function classify(level: Level) {
  const { width, height, hole } = level
  const target = new Uint8Array(width * height)
  const source = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let touches = false
      for (let dy = -HALF; dy <= HALF && !touches; dy += 1) {
        for (let dx = -HALF; dx <= HALF; dx += 1) {
          const sx = x + dx
          const sy = y + dy
          if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue
          if (hole[sy * width + sx]) { touches = true; break }
        }
      }
      const i = y * width + x
      target[i] = touches ? 1 : 0
      source[i] = !touches && x >= HALF && y >= HALF && x < width - HALF && y < height - HALF ? 1 : 0
    }
  }
  return { target, source }
}

/** Fills the hole by repeatedly averaging neighbours: the seed at the coarsest level. */
function diffuse(level: Level, passes: number) {
  const { width, height, rgb, hole } = level
  // Start from the mean of the known pixels next to the hole.
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x
      if (hole[i]) continue
      const near = (x > 0 && hole[i - 1]) || (x < width - 1 && hole[i + 1]) || (y > 0 && hole[i - width]) || (y < height - 1 && hole[i + width])
      if (!near) continue
      r += rgb[i * 3]; g += rgb[i * 3 + 1]; b += rgb[i * 3 + 2]; n += 1
    }
  }
  if (n) for (let i = 0; i < hole.length; i += 1) if (hole[i]) { rgb[i * 3] = r / n; rgb[i * 3 + 1] = g / n; rgb[i * 3 + 2] = b / n }
  for (let pass = 0; pass < passes; pass += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x
        if (!hole[i]) continue
        let sr = 0
        let sg = 0
        let sb = 0
        let m = 0
        if (x > 0) { sr += rgb[(i - 1) * 3]; sg += rgb[(i - 1) * 3 + 1]; sb += rgb[(i - 1) * 3 + 2]; m += 1 }
        if (x < width - 1) { sr += rgb[(i + 1) * 3]; sg += rgb[(i + 1) * 3 + 1]; sb += rgb[(i + 1) * 3 + 2]; m += 1 }
        if (y > 0) { sr += rgb[(i - width) * 3]; sg += rgb[(i - width) * 3 + 1]; sb += rgb[(i - width) * 3 + 2]; m += 1 }
        if (y < height - 1) { sr += rgb[(i + width) * 3]; sg += rgb[(i + width) * 3 + 1]; sb += rgb[(i + width) * 3 + 2]; m += 1 }
        rgb[i * 3] = sr / m; rgb[i * 3 + 1] = sg / m; rgb[i * 3 + 2] = sb / m
      }
    }
  }
}

/** A small deterministic generator, so a fill is repeatable. */
function rng(seed: number) {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13; state >>>= 0
    state ^= state >>> 17
    state ^= state << 5; state >>>= 0
    return state / 4294967296
  }
}

/** Sum of squared differences between the patches at (tx,ty) and (sx,sy), stopping past `limit`. */
function patchDistance(level: Level, tx: number, ty: number, sx: number, sy: number, limit: number) {
  const { width, height, rgb } = level
  let sum = 0
  for (let dy = -HALF; dy <= HALF; dy += 1) {
    const ty2 = ty + dy
    const sy2 = sy + dy
    if (ty2 < 0 || ty2 >= height) continue
    for (let dx = -HALF; dx <= HALF; dx += 1) {
      const tx2 = tx + dx
      if (tx2 < 0 || tx2 >= width) continue
      const t = (ty2 * width + tx2) * 3
      const s = (sy2 * width + sx + dx) * 3
      const dr = rgb[t] - rgb[s]
      const dg = rgb[t + 1] - rgb[s + 1]
      const db = rgb[t + 2] - rgb[s + 2]
      sum += dr * dr + dg * dg + db * db
    }
    if (sum > limit) return sum
  }
  return sum
}

type Field = { sx: Int32Array; sy: Int32Array; cost: Float32Array }

/** One level's fill: the nearest-neighbour field is searched, then voted into the hole, `rounds` times. */
function fillLevel(level: Level, field: Field, sourceList: Int32Array, rounds: number, iterations: number, random: () => number) {
  const { width, height, rgb, hole } = level
  const { target, source } = classify(level)
  const { sx, sy, cost } = field
  if (!sourceList.length) { diffuse(level, 20); return }
  const maxRadius = Math.max(width, height)

  const improve = (i: number, cx: number, cy: number) => {
    if (cx < HALF || cy < HALF || cx >= width - HALF || cy >= height - HALF || !source[cy * width + cx]) return
    const d = patchDistance(level, i % width, (i / width) | 0, cx, cy, cost[i])
    if (d < cost[i]) { cost[i] = d; sx[i] = cx; sy[i] = cy }
  }

  for (let round = 0; round < rounds; round += 1) {
    // Costs are stale once the hole's colours moved; re-measure them.
    for (let i = 0; i < target.length; i += 1) {
      if (!target[i]) continue
      if (!source[sy[i] * width + sx[i]]) {
        const pick = sourceList[(random() * sourceList.length) | 0]
        sx[i] = pick % width; sy[i] = (pick / width) | 0
      }
      cost[i] = patchDistance(level, i % width, (i / width) | 0, sx[i], sy[i], Infinity)
    }
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const forward = iteration % 2 === 0
      for (let yy = 0; yy < height; yy += 1) {
        const y = forward ? yy : height - 1 - yy
        for (let xx = 0; xx < width; xx += 1) {
          const x = forward ? xx : width - 1 - xx
          const i = y * width + x
          if (!target[i]) continue
          // Propagation: a neighbour's match, shifted by one, is a candidate.
          const step = forward ? -1 : 1
          if (x - step >= 0 && x - step < width) { const j = i - step; if (target[j]) improve(i, sx[j] + step, sy[j]) }
          if (y - step >= 0 && y - step < height) { const j = i - step * width; if (target[j]) improve(i, sx[j], sy[j] + step) }
          // Random search: around the current match, at shrinking radii.
          for (let radius = maxRadius; radius >= 1; radius = Math.floor(radius / 2)) {
            const cx = sx[i] + Math.round((random() * 2 - 1) * radius)
            const cy = sy[i] + Math.round((random() * 2 - 1) * radius)
            improve(i, cx, cy)
          }
        }
      }
    }
    // Voting: every patch that overlaps the hole contributes its match's pixels.
    const acc = new Float32Array(width * height * 3)
    const count = new Float32Array(width * height)
    for (let i = 0; i < target.length; i += 1) {
      if (!target[i]) continue
      const tx = i % width
      const ty = (i / width) | 0
      // Nearer matches count for more, so a good patch is not diluted by a poor one.
      const weight = 1 / (1 + cost[i] / (PATCH * PATCH * 3 * 400))
      for (let dy = -HALF; dy <= HALF; dy += 1) {
        const y = ty + dy
        if (y < 0 || y >= height) continue
        for (let dx = -HALF; dx <= HALF; dx += 1) {
          const x = tx + dx
          if (x < 0 || x >= width) continue
          const q = y * width + x
          if (!hole[q]) continue
          const s = ((sy[i] + dy) * width + sx[i] + dx) * 3
          acc[q * 3] += rgb[s] * weight; acc[q * 3 + 1] += rgb[s + 1] * weight; acc[q * 3 + 2] += rgb[s + 2] * weight
          count[q] += weight
        }
      }
    }
    for (let q = 0; q < count.length; q += 1) {
      if (!hole[q] || count[q] <= 0) continue
      rgb[q * 3] = acc[q * 3] / count[q]; rgb[q * 3 + 1] = acc[q * 3 + 1] / count[q]; rgb[q * 3 + 2] = acc[q * 3 + 2] / count[q]
    }
  }
}

function sourcesOf(level: Level) {
  const { source } = classify(level)
  const list: number[] = []
  for (let i = 0; i < source.length; i += 1) if (source[i]) list.push(i)
  return Int32Array.from(list)
}

/**
 * Content-Aware Fill: the masked pixels of `canvas` are replaced with
 * texture continued from the rest of the picture. `seed`, if given, is a
 * first guess for the hole (Telea inpainting, say) that the coarsest level
 * starts from instead of a flat colour.
 */
export function patchFill(canvas: HTMLCanvasElement, mask: Uint8Array, options: { seed?: HTMLCanvasElement; iterations?: number; randomSeed?: number } = {}) {
  const width = canvas.width
  const height = canvas.height
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, width, height)
  const base: Level = { width, height, rgb: new Float32Array(width * height * 3), hole: new Uint8Array(width * height) }
  let holePixels = 0
  const seed = options.seed ? context2d(options.seed).getImageData(0, 0, width, height).data : null
  for (let i = 0; i < width * height; i += 1) {
    const p = i * 4
    base.hole[i] = mask[i] ? 1 : 0
    if (mask[i]) holePixels += 1
    const from = seed && mask[i] ? seed : image.data
    base.rgb[i * 3] = from[p]; base.rgb[i * 3 + 1] = from[p + 1]; base.rgb[i * 3 + 2] = from[p + 2]
  }
  if (!holePixels) return
  // The pyramid stops when the hole is a few pixels or the picture is small.
  const levels: Level[] = [base]
  while (levels.length < 8) {
    const last = levels[levels.length - 1]
    const holeArea = last.hole.reduce((a, b) => a + b, 0)
    if (Math.min(last.width, last.height) <= 24 || holeArea <= 12) break
    levels.push(halve(last))
  }
  const random = rng(options.randomSeed ?? 1234567)
  const iterations = options.iterations ?? 4
  let previous: { level: Level; field: Field } | null = null
  for (let index = levels.length - 1; index >= 0; index -= 1) {
    const level = levels[index]
    const size = level.width * level.height
    const field: Field = { sx: new Int32Array(size), sy: new Int32Array(size), cost: new Float32Array(size).fill(Infinity) }
    const sourceList = sourcesOf(level)
    if (!previous) {
      if (!seed) diffuse(level, 60)
      for (let i = 0; i < size; i += 1) {
        const pick = sourceList.length ? sourceList[(random() * sourceList.length) | 0] : 0
        field.sx[i] = pick % level.width; field.sy[i] = (pick / level.width) | 0
      }
    } else {
      // The coarser level's answer, doubled, is this level's starting point:
      // its colours for the hole and its matches for the field.
      const coarse = previous.level
      for (let y = 0; y < level.height; y += 1) {
        for (let x = 0; x < level.width; x += 1) {
          const i = y * level.width + x
          const cx = Math.min(coarse.width - 1, x >> 1)
          const cy = Math.min(coarse.height - 1, y >> 1)
          const c = cy * coarse.width + cx
          field.sx[i] = Math.min(level.width - 1, previous.field.sx[c] * 2 + (x & 1))
          field.sy[i] = Math.min(level.height - 1, previous.field.sy[c] * 2 + (y & 1))
          if (!level.hole[i]) continue
          // Bilinear, so the coarse blocks do not show through.
          const fx = Math.min(coarse.width - 1, Math.max(0, (x + 0.5) / 2 - 0.5))
          const fy = Math.min(coarse.height - 1, Math.max(0, (y + 0.5) / 2 - 0.5))
          const x0 = Math.floor(fx)
          const y0 = Math.floor(fy)
          const x1 = Math.min(coarse.width - 1, x0 + 1)
          const y1 = Math.min(coarse.height - 1, y0 + 1)
          const tx = fx - x0
          const ty = fy - y0
          for (let ch = 0; ch < 3; ch += 1) {
            const a = coarse.rgb[(y0 * coarse.width + x0) * 3 + ch]
            const b = coarse.rgb[(y0 * coarse.width + x1) * 3 + ch]
            const cc = coarse.rgb[(y1 * coarse.width + x0) * 3 + ch]
            const d = coarse.rgb[(y1 * coarse.width + x1) * 3 + ch]
            level.rgb[i * 3 + ch] = (a * (1 - tx) + b * tx) * (1 - ty) + (cc * (1 - tx) + d * tx) * ty
          }
        }
      }
    }
    const finest = index === 0
    fillLevel(level, field, sourceList, finest ? 2 : 3, finest ? Math.max(2, iterations - 1) : iterations, random)
    previous = { level, field }
  }
  for (let i = 0; i < width * height; i += 1) {
    if (!mask[i]) continue
    const p = i * 4
    image.data[p] = base.rgb[i * 3]; image.data[p + 1] = base.rgb[i * 3 + 1]; image.data[p + 2] = base.rgb[i * 3 + 2]; image.data[p + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
}

/* ------------------------------------------------------- Poisson blending */

type Plane = { width: number; height: number; data: Float32Array }

function planeOf(canvas: HTMLCanvasElement): { rgb: Plane[]; alpha: Float32Array } {
  const { width, height } = canvas
  const data = context2d(canvas).getImageData(0, 0, width, height).data
  const rgb = [0, 1, 2].map(() => ({ width, height, data: new Float32Array(width * height) }))
  const alpha = new Float32Array(width * height)
  for (let i = 0; i < width * height; i += 1) {
    rgb[0].data[i] = data[i * 4]; rgb[1].data[i] = data[i * 4 + 1]; rgb[2].data[i] = data[i * 4 + 2]
    alpha[i] = data[i * 4 + 3] / 255
  }
  return { rgb, alpha }
}

function halvePlane(plane: Float32Array, width: number, height: number) {
  const w = Math.max(1, width >> 1)
  const h = Math.max(1, height >> 1)
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0
      let n = 0
      for (let dy = 0; dy < 2; dy += 1) for (let dx = 0; dx < 2; dx += 1) {
        const sx = Math.min(width - 1, x * 2 + dx)
        const sy = Math.min(height - 1, y * 2 + dy)
        sum += plane[sy * width + sx]; n += 1
      }
      out[y * w + x] = sum / n
    }
  }
  return { data: out, width: w, height: h }
}

function upsamplePlane(plane: Float32Array, width: number, height: number, toWidth: number, toHeight: number) {
  const out = new Float32Array(toWidth * toHeight)
  for (let y = 0; y < toHeight; y += 1) {
    const fy = Math.min(height - 1, Math.max(0, (y + 0.5) / 2 - 0.5))
    const y0 = Math.floor(fy)
    const y1 = Math.min(height - 1, y0 + 1)
    const ty = fy - y0
    for (let x = 0; x < toWidth; x += 1) {
      const fx = Math.min(width - 1, Math.max(0, (x + 0.5) / 2 - 0.5))
      const x0 = Math.floor(fx)
      const x1 = Math.min(width - 1, x0 + 1)
      const tx = fx - x0
      out[y * toWidth + x] = (plane[y0 * width + x0] * (1 - tx) + plane[y0 * width + x1] * tx) * (1 - ty) + (plane[y1 * width + x0] * (1 - tx) + plane[y1 * width + x1] * tx) * ty
    }
  }
  return out
}

/**
 * Solves the Poisson equation on the region for one channel: inside, the
 * result's Laplacian matches the guidance field's; on the rim, it equals the
 * background. Gauss-Seidel, warm-started from the coarser level, which is
 * what makes it converge in a handful of sweeps at full size.
 */
function solveChannel(source: Float32Array, background: Float32Array, region: Uint8Array, width: number, height: number, mixed: boolean, depth = 0): Float32Array {
  const inside = region.reduce((a, b) => a + b, 0)
  let result: Float32Array
  if (inside > 400 && Math.min(width, height) > 16 && depth < 8) {
    const coarseSource = halvePlane(source, width, height)
    const coarseBackground = halvePlane(background, width, height)
    const coarseRegionPlane = halvePlane(Float32Array.from(region), width, height)
    const coarseRegion = new Uint8Array(coarseRegionPlane.data.length)
    for (let i = 0; i < coarseRegion.length; i += 1) coarseRegion[i] = coarseRegionPlane.data[i] >= 0.5 ? 1 : 0
    const coarse = solveChannel(coarseSource.data, coarseBackground.data, coarseRegion, coarseSource.width, coarseSource.height, mixed, depth + 1)
    result = upsamplePlane(coarse, coarseSource.width, coarseSource.height, width, height)
  } else {
    result = Float32Array.from(background)
  }
  for (let i = 0; i < region.length; i += 1) if (!region[i]) result[i] = background[i]
  // The guidance: the source's gradients, or whichever of source and
  // background is the stronger at each pixel when mixing.
  const guide = (i: number, j: number) => {
    const s = source[i] - source[j]
    if (!mixed) return s
    const b = background[i] - background[j]
    return Math.abs(b) > Math.abs(s) ? b : s
  }
  const sweeps = depth === 0 ? 24 : depth < 3 ? 40 : 200
  for (let sweep = 0; sweep < sweeps; sweep += 1) {
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const i = y * width + x
        if (!region[i]) continue
        const sum = result[i - 1] + result[i + 1] + result[i - width] + result[i + width]
        const div = guide(i, i - 1) + guide(i, i + 1) + guide(i, i - width) + guide(i, i + width)
        result[i] = (sum + div) / 4
      }
    }
  }
  return result
}

/**
 * Seamless cloning of `layer` onto `background` (both document-sized): the
 * layer's opaque region is re-solved so its edge matches the background
 * exactly while its own gradients survive. With `mixed`, the background's
 * gradients win where they are stronger, so a texture shows through a flat
 * object. Returns a new canvas with the layer's alpha and the blended colour.
 */
export function poissonBlend(layer: HTMLCanvasElement, background: HTMLCanvasElement, mixed = false) {
  const { width, height } = layer
  const source = planeOf(layer)
  const target = planeOf(background)
  // The region is the opaque interior; its one-pixel rim is the boundary,
  // which stays the background's colour.
  const opaque = new Uint8Array(width * height)
  for (let i = 0; i < opaque.length; i += 1) opaque[i] = source.alpha[i] > 0.5 ? 1 : 0
  const region = new Uint8Array(width * height)
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x
      if (opaque[i] && opaque[i - 1] && opaque[i + 1] && opaque[i - width] && opaque[i + width]) region[i] = 1
    }
  }
  const out = createCanvas(width, height)
  const ctx = context2d(out)
  const image = ctx.createImageData(width, height)
  const solved = [0, 1, 2].map((ch) => solveChannel(source.rgb[ch].data, target.rgb[ch].data, region, width, height, mixed))
  const original = context2d(layer).getImageData(0, 0, width, height).data
  for (let i = 0; i < width * height; i += 1) {
    const p = i * 4
    if (opaque[i]) {
      image.data[p] = Math.max(0, Math.min(255, solved[0][i]))
      image.data[p + 1] = Math.max(0, Math.min(255, solved[1][i]))
      image.data[p + 2] = Math.max(0, Math.min(255, solved[2][i]))
    } else {
      image.data[p] = original[p]; image.data[p + 1] = original[p + 1]; image.data[p + 2] = original[p + 2]
    }
    image.data[p + 3] = original[p + 3]
  }
  ctx.putImageData(image, 0, 0)
  return out
}
