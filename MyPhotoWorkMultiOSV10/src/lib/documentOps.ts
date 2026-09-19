import { clamp, hexToRgb } from './color'
import { cloneCanvas, context2d, createCanvas, resizeCanvasContent } from './canvas'
import { medianCutPalette } from './gif'
import { pathNode, simplifyPoints } from './paths'
import { gaussianBlur } from './filters'
import type { PathNode, PathShape, Point } from './types'

/**
 * Operations on whole layers and stacks of layers that the menus need:
 * aligning and distributing, matting, tracing pixels into paths, the
 * automation commands (Photomerge, Auto-Align, Auto-Blend, Merge to HDR,
 * Contact Sheet), and the colour modes that have no RGB equivalent.
 */

/* ------------------------------------------------------------- bounds */

export function layerBounds(canvas: HTMLCanvasElement) {
  const { width, height } = canvas
  const data = context2d(canvas).getImageData(0, 0, width, height).data
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

export function shiftCanvas(canvas: HTMLCanvasElement, dx: number, dy: number) {
  const out = createCanvas(canvas.width, canvas.height)
  context2d(out).drawImage(canvas, Math.round(dx), Math.round(dy))
  return out
}

export type AlignEdge = 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom'

/** The offset that moves each layer so its content lines up on `edge`. */
export function alignOffsets(canvases: HTMLCanvasElement[], edge: AlignEdge, docWidth: number, docHeight: number) {
  const boxes = canvases.map((canvas) => layerBounds(canvas))
  const present = boxes.filter((box): box is NonNullable<typeof box> => Boolean(box))
  // With one layer the target is the document; with several it is the group.
  const target = present.length > 1
    ? {
      x: Math.min(...present.map((b) => b.x)),
      y: Math.min(...present.map((b) => b.y)),
      right: Math.max(...present.map((b) => b.x + b.width)),
      bottom: Math.max(...present.map((b) => b.y + b.height)),
    }
    : { x: 0, y: 0, right: docWidth, bottom: docHeight }
  return boxes.map((box) => {
    if (!box) return { dx: 0, dy: 0 }
    switch (edge) {
      case 'left': return { dx: target.x - box.x, dy: 0 }
      case 'right': return { dx: target.right - (box.x + box.width), dy: 0 }
      case 'centerH': return { dx: (target.x + target.right) / 2 - (box.x + box.width / 2), dy: 0 }
      case 'top': return { dx: 0, dy: target.y - box.y }
      case 'bottom': return { dx: 0, dy: target.bottom - (box.y + box.height) }
      default: return { dx: 0, dy: (target.y + target.bottom) / 2 - (box.y + box.height / 2) }
    }
  })
}

/** Spaces the layers' centres evenly between the two outermost. */
export function distributeOffsets(canvases: HTMLCanvasElement[], axis: 'x' | 'y') {
  const boxes = canvases.map((canvas) => layerBounds(canvas))
  const order = boxes
    .map((box, index) => ({ box, index }))
    .filter((item): item is { box: NonNullable<typeof item.box>; index: number } => Boolean(item.box))
    .map((item) => ({ ...item, centre: axis === 'x' ? item.box.x + item.box.width / 2 : item.box.y + item.box.height / 2 }))
    .sort((a, b) => a.centre - b.centre)
  const offsets = canvases.map(() => ({ dx: 0, dy: 0 }))
  if (order.length < 3) return offsets
  const first = order[0].centre
  const last = order[order.length - 1].centre
  const step = (last - first) / (order.length - 1)
  order.forEach((item, at) => {
    const target = first + step * at
    if (axis === 'x') offsets[item.index] = { dx: target - item.centre, dy: 0 }
    else offsets[item.index] = { dx: 0, dy: target - item.centre }
  })
  return offsets
}

/** Turns the layer by a quarter, a half or three quarters about its centre. */
export function rotateLayerCanvas(canvas: HTMLCanvasElement, quarters: number) {
  const out = createCanvas(canvas.width, canvas.height)
  const ctx = context2d(out)
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((quarters * Math.PI) / 2)
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2)
  return out
}

/* ------------------------------------------------------------- matting */

/** Defringe: edge pixels take the colour of the nearest interior pixels. */
export function defringe(canvas: HTMLCanvasElement, width = 1) {
  const { width: w, height: h } = canvas
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, w, h)
  const src = new Uint8ClampedArray(image.data)
  const r = Math.max(1, Math.round(width))
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4
      const a = src[i + 3]
      if (a === 0 || a === 255) continue
      let sr = 0
      let sg = 0
      let sb = 0
      let n = 0
      for (let dy = -r - 1; dy <= r + 1; dy += 1) {
        for (let dx = -r - 1; dx <= r + 1; dx += 1) {
          const xx = x + dx
          const yy = y + dy
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
          const j = (yy * w + xx) * 4
          if (src[j + 3] !== 255) continue
          sr += src[j]; sg += src[j + 1]; sb += src[j + 2]; n += 1
        }
      }
      if (!n) continue
      image.data[i] = sr / n; image.data[i + 1] = sg / n; image.data[i + 2] = sb / n
    }
  }
  ctx.putImageData(image, 0, 0)
}

/** Removes a black or white fringe: the matte colour is un-blended from soft edges. */
export function removeMatte(canvas: HTMLCanvasElement, matte: 'black' | 'white') {
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const m = matte === 'black' ? 0 : 255
  for (let i = 0; i < image.data.length; i += 4) {
    const a = image.data[i + 3] / 255
    if (a === 0 || a === 1) continue
    for (let c = 0; c < 3; c += 1) {
      // The stored colour is c*a + m*(1-a); solve for c.
      image.data[i + c] = clamp((image.data[i + c] - m * (1 - a)) / a, 0, 255)
    }
  }
  ctx.putImageData(image, 0, 0)
}

/* ------------------------------------------------------- pixels to paths */

/**
 * Traces the opaque pixels of a canvas into closed polygon paths: the outer
 * boundary of every connected region, followed pixel by pixel and then
 * simplified. What Create Work Path and Convert to Shape are built on.
 */
export function traceCanvasToPaths(canvas: HTMLCanvasElement, name: string, tolerance = 1.5): PathShape[] {
  const { width, height } = canvas
  const data = context2d(canvas).getImageData(0, 0, width, height).data
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && data[(y * width + x) * 4 + 3] > 127
  const visited = new Uint8Array((width + 1) * (height + 1))
  const paths: PathShape[] = []
  // Walk the boundary between solid and empty pixels using the square-tracing
  // rule: keep the solid region on the left.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!solid(x, y) || solid(x - 1, y)) continue
      // A left edge of the region at (x, y): the boundary passes corner (x, y) heading down.
      if (visited[y * (width + 1) + x]) continue
      const points: Point[] = []
      let cx = x
      let cy = y
      let dir = 1 // 0 right, 1 down, 2 left, 3 up — moving along corners
      const start = { x: cx, y: cy }
      let guard = 0
      do {
        visited[cy * (width + 1) + cx] = 1
        points.push({ x: cx, y: cy })
        // The pixel to the left of travel must be solid, the one to the right empty.
        const tries = [(dir + 3) % 4, dir, (dir + 1) % 4, (dir + 2) % 4]
        let moved = false
        for (const next of tries) {
          const dx = next === 0 ? 1 : next === 2 ? -1 : 0
          const dy = next === 1 ? 1 : next === 3 ? -1 : 0
          // Cells either side of the edge from (cx, cy) to (cx+dx, cy+dy).
          let leftCell: [number, number]
          let rightCell: [number, number]
          if (next === 0) { leftCell = [cx, cy - 1]; rightCell = [cx, cy] }
          else if (next === 1) { leftCell = [cx, cy]; rightCell = [cx - 1, cy] }
          else if (next === 2) { leftCell = [cx - 1, cy]; rightCell = [cx - 1, cy - 1] }
          else { leftCell = [cx - 1, cy - 1]; rightCell = [cx, cy - 1] }
          if (solid(leftCell[0], leftCell[1]) && !solid(rightCell[0], rightCell[1])) {
            cx += dx
            cy += dy
            dir = next
            moved = true
            break
          }
        }
        if (!moved) break
        guard += 1
      } while ((cx !== start.x || cy !== start.y) && guard < width * height * 4)
      if (points.length >= 3) {
        const simplified = dropCollinear(simplifyPoints(points, tolerance))
        if (simplified.length >= 3) {
          paths.push({ id: `path-${Math.random().toString(36).slice(2, 10)}`, name: `${name} ${paths.length + 1}`, nodes: simplified.map((p) => pathNode(p.x, p.y)), closed: true })
        }
      }
    }
  }
  return paths
}

/** Removes every point that sits on the straight line between its neighbours. */
function dropCollinear(points: Point[]) {
  if (points.length < 4) return points
  const out: Point[] = []
  for (let i = 0; i < points.length; i += 1) {
    const previous = points[(i - 1 + points.length) % points.length]
    const current = points[i]
    const next = points[(i + 1) % points.length]
    const cross = (current.x - previous.x) * (next.y - current.y) - (current.y - previous.y) * (next.x - current.x)
    if (Math.abs(cross) > 0.5) out.push(current)
  }
  return out.length >= 3 ? out : points
}

/** A path's anchors as fractions of its box, which is what a custom shape stores. */
export function normaliseOutline(path: PathShape): { outline: PathNode[]; box: { x: number; y: number; width: number; height: number } } {
  const xs = path.nodes.flatMap((n) => [n.x, n.inX, n.outX])
  const ys = path.nodes.flatMap((n) => [n.y, n.inY, n.outY])
  const box = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(1, Math.max(...xs) - Math.min(...xs)), height: Math.max(1, Math.max(...ys) - Math.min(...ys)) }
  const outline = path.nodes.map((n) => ({
    x: (n.x - box.x) / box.width, y: (n.y - box.y) / box.height,
    inX: (n.inX - box.x) / box.width, inY: (n.inY - box.y) / box.height,
    outX: (n.outX - box.x) / box.width, outY: (n.outY - box.y) / box.height,
  }))
  return { outline, box }
}

/* ------------------------------------------------------------- alignment */

function luminancePlane(canvas: HTMLCanvasElement, scale: number) {
  const w = Math.max(8, Math.round(canvas.width * scale))
  const h = Math.max(8, Math.round(canvas.height * scale))
  const small = resizeCanvasContent(canvas, w, h)
  const data = context2d(small).getImageData(0, 0, w, h).data
  const out = new Float32Array(w * h)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = data[i * 4 + 3] > 8 ? 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2] : -1
  }
  return { data: out, width: w, height: h }
}

/**
 * The shift that best lays `moving` over `fixed`: a coarse-to-fine search of
 * the mean absolute difference over the overlap. Enough to line up a hand-held
 * bracket or the shared edge of two panorama frames.
 */
export function findAlignment(fixed: HTMLCanvasElement, moving: HTMLCanvasElement, maxShift = 0.5): { dx: number; dy: number } {
  let best = { dx: 0, dy: 0 }
  // Coarse to fine, but never so coarse that the picture's features vanish:
  // the smallest plane is about 48 pixels across, the largest about 200.
  const longest = Math.max(fixed.width, fixed.height)
  const scales = [48, 96, 200].map((side) => Math.min(1, side / longest)).filter((scale, index, all) => all.indexOf(scale) === index)
  let range = maxShift
  for (const scale of scales) {
    const a = luminancePlane(fixed, scale)
    const b = luminancePlane(moving, scale)
    const reach = Math.max(2, Math.round(Math.max(a.width, a.height) * range))
    const centreX = Math.round(best.dx * scale)
    const centreY = Math.round(best.dy * scale)
    let bestScore = Infinity
    let bestShift = { x: centreX, y: centreY }
    const step = Math.max(1, Math.round(reach / 12))
    const expected = Math.ceil(a.width / 2) * Math.ceil(a.height / 2)
    for (let sy = centreY - reach; sy <= centreY + reach; sy += step) {
      for (let sx = centreX - reach; sx <= centreX + reach; sx += step) {
        let sum = 0
        let n = 0
        for (let y = 0; y < a.height; y += 2) {
          const by = y - sy
          if (by < 0 || by >= b.height) continue
          for (let x = 0; x < a.width; x += 2) {
            const bx = x - sx
            if (bx < 0 || bx >= b.width) continue
            const va = a.data[y * a.width + x]
            const vb = b.data[by * b.width + bx]
            if (va < 0 || vb < 0) continue
            sum += Math.abs(va - vb)
            n += 1
          }
        }
        // Less than half the picture overlapping is not a match; and a small
        // overlap of plain background must not beat a large overlap of detail.
        if (n < expected * 0.6) continue
        const score = (sum / n) * (1 + 0.5 * (1 - n / expected)) + (1 - n / expected) * 4
        if (score < bestScore) { bestScore = score; bestShift = { x: sx, y: sy } }
      }
    }
    best = { dx: bestShift.x / scale, dy: bestShift.y / scale }
    range = (step * 2) / Math.max(a.width, a.height) + 0.02
  }
  return { dx: Math.round(best.dx), dy: Math.round(best.dy) }
}

/** Auto-Align: every layer shifted so it lines up with the first. */
export function autoAlignLayers(canvases: HTMLCanvasElement[]) {
  if (canvases.length < 2) return canvases.map(() => ({ dx: 0, dy: 0 }))
  return canvases.map((canvas, index) => (index === 0 ? { dx: 0, dy: 0 } : findAlignment(canvases[0], canvas)))
}

/**
 * Auto-Blend: where layers overlap, each fades in from its own edge, so the
 * seams disappear. The result is one canvas per layer with soft alpha.
 */
export function autoBlendLayers(canvases: HTMLCanvasElement[], feather = 24) {
  return canvases.map((canvas, index) => {
    if (index === 0) return cloneCanvas(canvas)
    const out = cloneCanvas(canvas)
    const box = layerBounds(out)
    if (!box) return out
    // A soft mask across the layer's own bounds, blurred at the edge.
    const mask = createCanvas(out.width, out.height)
    const mctx = context2d(mask)
    mctx.fillStyle = '#ffffff'
    mctx.fillRect(box.x + feather / 2, box.y + feather / 2, Math.max(1, box.width - feather), Math.max(1, box.height - feather))
    gaussianBlur(mask, feather / 2, null)
    const octx = context2d(out)
    octx.globalCompositeOperation = 'destination-in'
    octx.drawImage(mask, 0, 0)
    return out
  })
}

/**
 * Merge to HDR: exposure fusion. Each pixel is a weighted blend of the layers,
 * favouring the exposure where that pixel is neither clipped nor crushed.
 */
export function mergeToHdr(canvases: HTMLCanvasElement[]) {
  const width = canvases[0].width
  const height = canvases[0].height
  const planes = canvases.map((canvas) => context2d(resizeCanvasContent(canvas, width, height)).getImageData(0, 0, width, height).data)
  const out = createCanvas(width, height)
  const ctx = context2d(out)
  const image = ctx.createImageData(width, height)
  for (let i = 0; i < image.data.length; i += 4) {
    let r = 0
    let g = 0
    let b = 0
    let total = 0
    for (const plane of planes) {
      const l = (0.299 * plane[i] + 0.587 * plane[i + 1] + 0.114 * plane[i + 2]) / 255
      // Well-exposedness: a Gaussian around mid-grey.
      const w = Math.exp(-((l - 0.5) ** 2) / 0.08) + 0.02
      r += plane[i] * w; g += plane[i + 1] * w; b += plane[i + 2] * w
      total += w
    }
    image.data[i] = r / total; image.data[i + 1] = g / total; image.data[i + 2] = b / total; image.data[i + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return out
}

/**
 * Photomerge: frames laid side by side, each aligned to the last along the
 * chosen axis, the overlaps feathered. Returns the panorama and each frame's
 * placement in it.
 */
export function photomerge(canvases: HTMLCanvasElement[], layout: 'auto' | 'horizontal' | 'vertical', blend = true) {
  if (!canvases.length) return { canvas: createCanvas(1, 1), placements: [] as { x: number; y: number }[] }
  const horizontal = layout === 'vertical' ? false : layout === 'horizontal' ? true : canvases[0].width >= canvases[0].height
  const placements: { x: number; y: number }[] = [{ x: 0, y: 0 }]
  for (let i = 1; i < canvases.length; i += 1) {
    const previous = canvases[i - 1]
    const current = canvases[i]
    // Compare the trailing strip of the previous frame with the leading strip of this one.
    const overlap = horizontal ? Math.round(previous.width * 0.4) : Math.round(previous.height * 0.4)
    const strip = createCanvas(horizontal ? overlap : previous.width, horizontal ? previous.height : overlap)
    context2d(strip).drawImage(previous, horizontal ? -(previous.width - overlap) : 0, horizontal ? 0 : -(previous.height - overlap))
    const lead = createCanvas(strip.width, strip.height)
    context2d(lead).drawImage(current, 0, 0)
    const shift = findAlignment(strip, lead, 0.6)
    const last = placements[i - 1]
    placements.push({
      x: last.x + (horizontal ? previous.width - overlap : 0) + shift.dx,
      y: last.y + (horizontal ? 0 : previous.height - overlap) + shift.dy,
    })
  }
  const minX = Math.min(...placements.map((p) => p.x))
  const minY = Math.min(...placements.map((p) => p.y))
  const maxX = Math.max(...placements.map((p, i) => p.x + canvases[i].width))
  const maxY = Math.max(...placements.map((p, i) => p.y + canvases[i].height))
  const canvas = createCanvas(maxX - minX, maxY - minY)
  const ctx = context2d(canvas)
  canvases.forEach((frame, index) => {
    const at = { x: placements[index].x - minX, y: placements[index].y - minY }
    placements[index] = at
    if (!blend || index === 0) {
      ctx.drawImage(frame, at.x, at.y)
      return
    }
    const soft = cloneCanvas(frame)
    const feather = Math.round(Math.min(frame.width, frame.height) * 0.08)
    const mask = createCanvas(frame.width, frame.height)
    const mctx = context2d(mask)
    const gradient = horizontal
      ? mctx.createLinearGradient(0, 0, feather, 0)
      : mctx.createLinearGradient(0, 0, 0, feather)
    gradient.addColorStop(0, 'rgba(255,255,255,0)')
    gradient.addColorStop(1, 'rgba(255,255,255,1)')
    mctx.fillStyle = gradient
    mctx.fillRect(0, 0, frame.width, frame.height)
    const sctx = context2d(soft)
    sctx.globalCompositeOperation = 'destination-in'
    sctx.drawImage(mask, 0, 0)
    ctx.drawImage(soft, at.x, at.y)
  })
  return { canvas, placements }
}

/** Contact Sheet: thumbnails on a grid with their names beneath. */
export function contactSheet(items: { name: string; canvas: HTMLCanvasElement }[], columns: number, thumb: number) {
  const cols = Math.max(1, columns)
  const rows = Math.max(1, Math.ceil(items.length / cols))
  const pad = Math.round(thumb * 0.08)
  const labelHeight = Math.round(thumb * 0.12) + 8
  const cell = thumb + pad
  const sheet = createCanvas(cols * cell + pad, rows * (cell + labelHeight) + pad)
  const ctx = context2d(sheet)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, sheet.width, sheet.height)
  ctx.fillStyle = '#111111'
  ctx.font = `${Math.max(9, Math.round(thumb * 0.09))}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  items.forEach((item, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const scale = Math.min(thumb / item.canvas.width, thumb / item.canvas.height)
    const w = item.canvas.width * scale
    const h = item.canvas.height * scale
    const x = pad + col * cell + (thumb - w) / 2
    const y = pad + row * (cell + labelHeight) + (thumb - h) / 2
    ctx.drawImage(item.canvas, x, y, w, h)
    ctx.fillText(item.name, pad + col * cell + thumb / 2, pad + row * (cell + labelHeight) + thumb + labelHeight - 6, thumb)
  })
  return sheet
}

/** Fit Image: scaled to fit inside the box, never enlarged past it. */
export function fitImage(canvas: HTMLCanvasElement, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / canvas.width, maxHeight / canvas.height, 1)
  return resizeCanvasContent(canvas, Math.max(1, Math.round(canvas.width * scale)), Math.max(1, Math.round(canvas.height * scale)))
}

/* ---------------------------------------------------------- colour modes */

/** Duotone: the greys reprinted in two inks, dark and light. */
export function duotone(canvas: HTMLCanvasElement, ink1: string, ink2: string) {
  const a = hexToRgb(ink1)
  const b = hexToRgb(ink2)
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < image.data.length; i += 4) {
    const l = (0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2]) / 255
    image.data[i] = a.r + (b.r - a.r) * l
    image.data[i + 1] = a.g + (b.g - a.g) * l
    image.data[i + 2] = a.b + (b.b - a.b) * l
  }
  ctx.putImageData(image, 0, 0)
}

/** Indexed colour: the picture reduced to a palette, dithered or not. */
export function indexedColor(canvas: HTMLCanvasElement, colors: number, dither: boolean) {
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const palette = medianCutPalette(image.data, clamp(Math.round(colors), 2, 256))
  const { width, height } = canvas
  const nearest = (r: number, g: number, b: number) => {
    let best = palette[0]
    let bestD = Infinity
    for (const entry of palette) {
      const d = (entry[0] - r) ** 2 + (entry[1] - g) ** 2 + (entry[2] - b) ** 2
      if (d < bestD) { bestD = d; best = entry }
    }
    return best
  }
  const work = new Float32Array(image.data.length)
  for (let i = 0; i < image.data.length; i += 1) work[i] = image.data[i]
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4
      const chosen = nearest(clamp(work[i], 0, 255), clamp(work[i + 1], 0, 255), clamp(work[i + 2], 0, 255))
      const errors = [work[i] - chosen[0], work[i + 1] - chosen[1], work[i + 2] - chosen[2]]
      image.data[i] = chosen[0]; image.data[i + 1] = chosen[1]; image.data[i + 2] = chosen[2]
      if (!dither) continue
      // Floyd–Steinberg: the error is pushed onto the neighbours not yet visited.
      const spread = (xx: number, yy: number, k: number) => {
        if (xx < 0 || xx >= width || yy >= height) return
        const j = (yy * width + xx) * 4
        work[j] += errors[0] * k; work[j + 1] += errors[1] * k; work[j + 2] += errors[2] * k
      }
      spread(x + 1, y, 7 / 16); spread(x - 1, y + 1, 3 / 16); spread(x, y + 1, 5 / 16); spread(x + 1, y + 1, 1 / 16)
    }
  }
  ctx.putImageData(image, 0, 0)
}

/** Bitmap mode: pure black and white, diffusion-dithered. */
export function bitmapMode(canvas: HTMLCanvasElement) {
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const { width, height } = canvas
  const grey = new Float32Array(width * height)
  for (let p = 0; p < grey.length; p += 1) grey[p] = 0.299 * image.data[p * 4] + 0.587 * image.data[p * 4 + 1] + 0.114 * image.data[p * 4 + 2]
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x
      const v = grey[p] < 128 ? 0 : 255
      const error = grey[p] - v
      image.data[p * 4] = v; image.data[p * 4 + 1] = v; image.data[p * 4 + 2] = v
      const push = (xx: number, yy: number, k: number) => {
        if (xx < 0 || xx >= width || yy >= height) return
        grey[yy * width + xx] += error * k
      }
      push(x + 1, y, 7 / 16); push(x - 1, y + 1, 3 / 16); push(x, y + 1, 5 / 16); push(x + 1, y + 1, 1 / 16)
    }
  }
  ctx.putImageData(image, 0, 0)
}

/**
 * Whether a colour lies outside what four process inks can print. The four-ink
 * maths here round-trips every colour, so this judges the way a press does:
 * the vivid greens, cyans and blues, and anything at full chroma, are out.
 */
export function outOfCmykGamut(r: number, g: number, b: number) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const chroma = (max - min) / 255
  if (chroma < 0.7) return false
  let hue: number
  if (max === min) hue = 0
  else if (max === r) hue = ((g - b) / (max - min)) % 6
  else if (max === g) hue = (b - r) / (max - min) + 2
  else hue = (r - g) / (max - min) + 4
  hue = ((hue * 60) + 360) % 360
  const lightness = (max + min) / 510
  if (hue >= 75 && hue <= 285 && chroma > 0.72 && lightness > 0.2) return true
  return chroma > 0.93 && lightness > 0.25 && lightness < 0.75
}

/** Gamut warning: pixels CMYK cannot reproduce are painted the warning grey. */
export function gamutWarning(canvas: HTMLCanvasElement, warningColor = '#808080') {
  const rgb = hexToRgb(warningColor)
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < image.data.length; i += 4) {
    if (outOfCmykGamut(image.data[i], image.data[i + 1], image.data[i + 2])) {
      image.data[i] = rgb.r; image.data[i + 1] = rgb.g; image.data[i + 2] = rgb.b
    }
  }
  ctx.putImageData(image, 0, 0)
}

/** Proof Colors: out-of-gamut colours pulled back to what the inks can reach. */
export function proofCmyk(canvas: HTMLCanvasElement) {
  const ctx = context2d(canvas)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < image.data.length; i += 4) {
    const r = image.data[i]
    const g = image.data[i + 1]
    const b = image.data[i + 2]
    if (!outOfCmykGamut(r, g, b)) continue
    // Chroma is reduced towards the printable limit, lightness kept.
    const mean = (r + g + b) / 3
    image.data[i] = mean + (r - mean) * 0.72
    image.data[i + 1] = mean + (g - mean) * 0.72
    image.data[i + 2] = mean + (b - mean) * 0.72
  }
  ctx.putImageData(image, 0, 0)
}

/* ------------------------------------------------------------- spelling */

const commonWords = new Set(('the of and to in a is that for it as with was on be by this are or from at an have not but had were which you one all their there been has when who will more if no out so what up its about into than them can only other new some could time these two may then do first any my now such like our over man me even most made after also did many before must through back years where much your way well down should because each just those people mr how too little state good very make world still own see men work long get here between both life being under never day same another know while last might us great old year off come since against go came right used take three states himself few house use during without again place american around however home small found mrs thought went say part once general high upon school every don does got united left number course war until always away something fact though water less public put think almost hand enough far took head yet government system better set told nothing night end why called didn eyes find going look asked later knew point next program city business give group toward young days let room president side social given present several order national possible rather second face per among form important often things looked early white case become large big need four within felt along children saw best church ever least power development light thing seemed family interest want members mind country area others turned although open god service certain kind problem began door different thousands help means sense music mother whole house photo image text layer color colour black red green blue yellow orange purple pink brown grey gray light dark sky sun moon star tree flower river mountain sea beach summer winter spring autumn love happy sad hello welcome thanks thank please sorry yes no design art print poster title sample test draft final').split(' '))

/** A modest check: words the built-in list does not know, with a nearby suggestion where one exists. */
export function checkSpelling(texts: { layer: string; text: string }[]) {
  const suspects: { word: string; layer: string; suggestion?: string }[] = []
  const seen = new Set<string>()
  for (const item of texts) {
    for (const raw of item.text.split(/[^A-Za-z']+/)) {
      const word = raw.replace(/^'+|'+$/g, '')
      if (word.length < 3 || /[A-Z]/.test(word.slice(1))) continue
      const lower = word.toLowerCase()
      if (commonWords.has(lower) || seen.has(lower)) continue
      seen.add(lower)
      // Only English-looking words are judged; anything else is left alone.
      if (!/^[a-z']+$/.test(lower)) continue
      const suspicious = /(.)\1\1/.test(lower) || !/[aeiouy]/.test(lower) || lower.length > 14
      if (!suspicious) continue
      let suggestion: string | undefined
      for (const known of commonWords) {
        if (Math.abs(known.length - lower.length) > 1) continue
        let diff = 0
        for (let i = 0; i < Math.min(known.length, lower.length); i += 1) if (known[i] !== lower[i]) diff += 1
        if (diff + Math.abs(known.length - lower.length) <= 1) { suggestion = known; break }
      }
      suspects.push({ word, layer: item.layer, suggestion })
    }
  }
  return suspects
}
