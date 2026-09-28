// Draws the application and document icons.
//
// Everything is rendered at 4x and box-filtered down, so edges stay smooth at
// every size instead of showing the staircase artefacts of direct rasterising.
import fs from 'fs'
import path from 'path'
import { PNG } from 'pngjs'
import pngToIco from 'png-to-ico'

const root = path.resolve(import.meta.dirname, '..')
const SUPERSAMPLE = 4

/* ─────────────────────────────── canvas ─────────────────────────────────── */

function createCanvas(size) {
  return { width: size, height: size, data: new Float64Array(size * size * 4) }
}

function blendPixel(canvas, x, y, [r, g, b], alpha) {
  if (alpha <= 0 || x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return
  const i = (canvas.width * y + x) * 4
  const sa = Math.min(1, alpha)
  const da = canvas.data[i + 3]
  const out = sa + da * (1 - sa)
  if (out <= 0) return
  canvas.data[i] = (r * sa + canvas.data[i] * da * (1 - sa)) / out
  canvas.data[i + 1] = (g * sa + canvas.data[i + 1] * da * (1 - sa)) / out
  canvas.data[i + 2] = (b * sa + canvas.data[i + 2] * da * (1 - sa)) / out
  canvas.data[i + 3] = out
}

/** Paint every pixel whose coverage function returns > 0. */
function paint(canvas, bounds, coverage, shade) {
  const x0 = Math.max(0, Math.floor(bounds[0]))
  const y0 = Math.max(0, Math.floor(bounds[1]))
  const x1 = Math.min(canvas.width - 1, Math.ceil(bounds[2]))
  const y1 = Math.min(canvas.height - 1, Math.ceil(bounds[3]))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const alpha = coverage(x + 0.5, y + 0.5)
      if (alpha <= 0) continue
      const paintColor = shade(x + 0.5, y + 0.5)
      if (!paintColor) continue
      blendPixel(canvas, x, y, paintColor, alpha * (paintColor[3] ?? 1))
    }
  }
}

function solid(color) {
  return () => color
}

/** Linear gradient between two points, used for the icon body. */
function gradient(from, to, colorA, colorB) {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const lengthSquared = dx * dx + dy * dy || 1
  return (x, y) => {
    const t = Math.max(0, Math.min(1, ((x - from[0]) * dx + (y - from[1]) * dy) / lengthSquared))
    return [
      colorA[0] + (colorB[0] - colorA[0]) * t,
      colorA[1] + (colorB[1] - colorA[1]) * t,
      colorA[2] + (colorB[2] - colorA[2]) * t,
      (colorA[3] ?? 1) + ((colorB[3] ?? 1) - (colorA[3] ?? 1)) * t
    ]
  }
}

/* ─────────────────────────────── shapes ─────────────────────────────────── */

/** Signed distance to a rounded rectangle; negative inside. */
function roundedRectDistance(x, y, cx, cy, halfWidth, halfHeight, radius) {
  const qx = Math.abs(x - cx) - (halfWidth - radius)
  const qy = Math.abs(y - cy) - (halfHeight - radius)
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  return outside + Math.min(Math.max(qx, qy), 0) - radius
}

function fillRoundedRect(canvas, cx, cy, halfWidth, halfHeight, radius, shade) {
  paint(
    canvas,
    [cx - halfWidth - 2, cy - halfHeight - 2, cx + halfWidth + 2, cy + halfHeight + 2],
    (x, y) => Math.max(0, Math.min(1, 0.5 - roundedRectDistance(x, y, cx, cy, halfWidth, halfHeight, radius))),
    shade
  )
}

function polygonCoverage(points) {
  return (x, y) => {
    let inside = false
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i]
      const [xj, yj] = points[j]
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
    return inside ? 1 : 0
  }
}

function polygonBounds(points) {
  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  return [Math.min(...xs) - 2, Math.min(...ys) - 2, Math.max(...xs) + 2, Math.max(...ys) + 2]
}

function fillPolygon(canvas, points, shade, clip) {
  const inside = polygonCoverage(points)
  paint(canvas, polygonBounds(points), (x, y) => (clip && clip(x, y) > 0 ? 0 : inside(x, y)), shade)
}

/** Cut a shape out of what has been drawn so far (used for the dog-ear). */
function clearPolygon(canvas, points) {
  const inside = polygonCoverage(points)
  const bounds = polygonBounds(points)
  const x0 = Math.max(0, Math.floor(bounds[0]))
  const y0 = Math.max(0, Math.floor(bounds[1]))
  const x1 = Math.min(canvas.width - 1, Math.ceil(bounds[2]))
  const y1 = Math.min(canvas.height - 1, Math.ceil(bounds[3]))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue
      const i = (canvas.width * y + x) * 4
      canvas.data[i] = 0
      canvas.data[i + 1] = 0
      canvas.data[i + 2] = 0
      canvas.data[i + 3] = 0
    }
  }
}

function fillCircle(canvas, cx, cy, radius, shade) {
  paint(
    canvas,
    [cx - radius - 2, cy - radius - 2, cx + radius + 2, cy + radius + 2],
    (x, y) => Math.max(0, Math.min(1, 0.5 + radius - Math.hypot(x - cx, y - cy))),
    shade
  )
}

/** Soft radial light, brightest in the middle. */
function radialGlow(canvas, cx, cy, radius, color, strength, clip) {
  paint(
    canvas,
    [cx - radius, cy - radius, cx + radius, cy + radius],
    (x, y) => {
      if (clip && clip(x, y) > 0) return 0
      const d = Math.hypot(x - cx, y - cy) / radius
      return d >= 1 ? 0 : Math.pow(1 - d, 2.2) * strength
    },
    solid(color)
  )
}

function strokeLine(canvas, from, to, width, color, clip) {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const lengthSquared = dx * dx + dy * dy || 1
  const half = width / 2
  paint(
    canvas,
    [Math.min(from[0], to[0]) - width, Math.min(from[1], to[1]) - width, Math.max(from[0], to[0]) + width, Math.max(from[1], to[1]) + width],
    (x, y) => {
      if (clip && clip(x, y) > 0) return 0
      const t = Math.max(0, Math.min(1, ((x - from[0]) * dx + (y - from[1]) * dy) / lengthSquared))
      const distance = Math.hypot(x - (from[0] + dx * t), y - (from[1] + dy * t))
      return Math.max(0, Math.min(1, 0.5 + half - distance))
    },
    solid(color)
  )
}

function strokePolygon(canvas, points, width, color, clip) {
  for (let i = 0; i < points.length; i++) {
    strokeLine(canvas, points[i], points[(i + 1) % points.length], width, color, clip)
  }
}

/* ─────────────────────────────── artwork ────────────────────────────────── */

const INK = {
  bodyTop: [38, 92, 178],
  bodyBottom: [12, 32, 68],
  rim: [140, 190, 255],
  grid: [130, 180, 240],
  faceTop: [168, 214, 255],
  faceLeft: [92, 156, 228],
  faceRight: [44, 92, 158],
  chamfer: [158, 202, 246],
  edge: [236, 246, 255],
  accent: [255, 176, 64],
  shadow: [4, 12, 28],
  barrelTop: [255, 206, 104],
  barrelMid: [240, 172, 52],
  barrelDark: [196, 124, 24],
  woodTop: [246, 226, 188],
  woodMid: [222, 192, 142],
  woodDark: [184, 148, 100],
  lead: [46, 48, 58],
  ferrule: [206, 216, 226],
  ferruleDark: [146, 160, 176],
  eraser: [242, 138, 152],
  textFront: [240, 248, 255],
  textSide: [96, 150, 214],
  textDeep: [30, 66, 122]
}

/** Extrude a flat outline towards the viewer-down-right, giving it a body. */
function extrudePolygon(canvas, points, depth, frontShade, sideShade, clip) {
  const back = points.map(([x, y]) => [x + depth[0], y + depth[1]])
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    fillPolygon(canvas, [points[i], points[j], back[j], back[i]], sideShade, clip)
  }
  fillPolygon(canvas, points, frontShade, clip)
}

/**
 * Elliptical annulus sector, used for the C and the bowl of the D so both can
 * be drawn to the same glyph width whatever the stroke thickness is.
 */
function arcOutline(cx, cy, rxOuter, ryOuter, rxInner, ryInner, fromDeg, toDeg, steps = 28) {
  const points = []
  for (let i = 0; i <= steps; i++) {
    const a = ((fromDeg + (toDeg - fromDeg) * (i / steps)) * Math.PI) / 180
    points.push([cx + Math.cos(a) * rxOuter, cy - Math.sin(a) * ryOuter])
  }
  for (let i = steps; i >= 0; i--) {
    const a = ((fromDeg + (toDeg - fromDeg) * (i / steps)) * Math.PI) / 180
    points.push([cx + Math.cos(a) * rxInner, cy - Math.sin(a) * ryInner])
  }
  return points
}

function rectOutline(x, y, w, h) {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
}

/**
 * Vector letterforms for C, A and D. Every glyph is exactly `glyphWidth(height)`
 * wide, so the wordmark has an even rhythm.
 */
function glyphWidth(height) {
  return height * 0.74
}

function glyphOutlines(char, x, baseline, height) {
  const h = height
  const th = h * 0.22
  const w = glyphWidth(h)
  const cy = baseline - h / 2
  if (char === 'C') {
    return [arcOutline(x + w / 2, cy, w / 2, h / 2, w / 2 - th, h / 2 - th, 40, 320)]
  }
  if (char === 'D') {
    const bowlCx = x + th * 0.5
    return [
      rectOutline(x, baseline - h, th, h),
      arcOutline(bowlCx, cy, w - th * 0.5, h / 2, w - th * 1.5, h / 2 - th, -90, 90)
    ]
  }
  // A: two legs leaning in to the apex, plus a crossbar.
  const apexX = x + w / 2
  const legWidth = th * 0.98
  return [
    [[x, baseline], [x + legWidth, baseline], [apexX + legWidth / 2, baseline - h], [apexX - legWidth / 2, baseline - h]],
    [[x + w - legWidth, baseline], [x + w, baseline], [apexX + legWidth / 2, baseline - h], [apexX - legWidth / 2, baseline - h]],
    rectOutline(x + w * 0.17, baseline - h * 0.34, w * 0.66, th * 0.7)
  ]
}

/** Extruded "CAD" wordmark. */
function drawWordmark(canvas, text, centerX, baseline, height, clip) {
  const h = height
  const advance = glyphWidth(h) * 1.2
  const total = text.length * advance - (advance - glyphWidth(h))
  const depth = [h * 0.12, h * 0.12]
  const glyphs = text.split('').map((char, index) => glyphOutlines(char, centerX - total / 2 + index * advance, baseline, h))

  // Sides first for every glyph so neighbours never punch through each other.
  for (const outlines of glyphs) {
    for (const outline of outlines) {
      const back = outline.map(([x, y]) => [x + depth[0], y + depth[1]])
      for (let i = 0; i < outline.length; i++) {
        const j = (i + 1) % outline.length
        fillPolygon(canvas, [outline[i], outline[j], back[j], back[i]], gradient(
          [centerX, baseline - h], [centerX, baseline + h * 0.3], INK.textSide, INK.textDeep
        ), clip)
      }
    }
  }
  for (const outlines of glyphs) {
    for (const outline of outlines) {
      fillPolygon(canvas, outline, gradient(
        [centerX, baseline - h], [centerX, baseline], [255, 255, 255], INK.textFront
      ), clip)
    }
  }
}

/** A 3D pencil: hexagonal barrel, sharpened wood tip, ferrule and eraser. */
function drawPencil(canvas, from, to, width, clip) {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const length = Math.hypot(dx, dy) || 1
  const d = [dx / length, dy / length]
  const n = [-d[1], d[0]]
  const w = width / 2
  const at = (along, across) => [
    from[0] + d[0] * along + n[0] * across,
    from[1] + d[1] * along + n[1] * across
  ]
  const tipLength = length * 0.18
  const leadLength = tipLength * 0.34
  const ferruleLength = length * 0.1
  const eraserLength = length * 0.07
  const barrelStart = ferruleLength + eraserLength
  const barrelEnd = length - tipLength

  const band = (a, b, c0, c1, shade) => fillPolygon(canvas, [at(a, c0), at(b, c0), at(b, c1), at(a, c1)], shade, clip)

  // Eraser and metal ferrule at the blunt end.
  band(0, eraserLength, -w, w, gradient(at(0, -w), at(0, w), [250, 176, 188], INK.eraser))
  band(eraserLength, barrelStart, -w, w, gradient(at(0, -w), at(0, w), INK.ferrule, INK.ferruleDark))
  band(eraserLength + ferruleLength * 0.35, eraserLength + ferruleLength * 0.5, -w, w, solid([...INK.ferruleDark, 0.8]))

  // Three long faces fake the hexagonal barrel.
  band(barrelStart, barrelEnd, -w, -w * 0.15, solid(INK.barrelTop))
  band(barrelStart, barrelEnd, -w * 0.15, w * 0.5, solid(INK.barrelMid))
  band(barrelStart, barrelEnd, w * 0.5, w, solid(INK.barrelDark))

  // Sharpened cone: the same three tones converging on the point.
  const tip = at(length, 0)
  fillPolygon(canvas, [at(barrelEnd, -w), tip, at(barrelEnd, -w * 0.15)], solid(INK.woodTop), clip)
  fillPolygon(canvas, [at(barrelEnd, -w * 0.15), tip, at(barrelEnd, w * 0.5)], solid(INK.woodMid), clip)
  fillPolygon(canvas, [at(barrelEnd, w * 0.5), tip, at(barrelEnd, w)], solid(INK.woodDark), clip)

  // Graphite.
  const leadBase = length - leadLength
  const leadHalf = (w * leadLength) / tipLength
  fillPolygon(canvas, [at(leadBase, -leadHalf), tip, at(leadBase, leadHalf)], solid(INK.lead), clip)
  fillPolygon(canvas, [at(leadBase, -leadHalf), tip, at(leadBase, 0)], solid([86, 90, 104]), clip)

  // Highlight running along the top edge.
  strokeLine(canvas, at(barrelStart, -w * 0.62), at(barrelEnd, -w * 0.62), Math.max(1, width * 0.09), [255, 246, 214, 0.7], clip)
}

/**
 * Isometric part: a cube with one chamfered vertical edge, its silhouette
 * picked out with light edges and a highlighted vertex - a modelled solid.
 */
function drawIsoPart(canvas, cx, cy, radius, clip) {
  const cos30 = Math.cos(Math.PI / 6)
  const sin30 = Math.sin(Math.PI / 6)
  const s = radius * 0.62
  const at = (x, y, z) => [cx + (x - y) * cos30 * s, cy + ((x + y) * sin30 - z) * s]
  const k = 0.45 // chamfer width on the near vertical edge

  const top = [at(-1, -1, 1), at(1, -1, 1), at(1, 1 - k, 1), at(1 - k, 1, 1), at(-1, 1, 1)]
  const leftFace = [at(-1, 1, 1), at(1 - k, 1, 1), at(1 - k, 1, -1), at(-1, 1, -1)]
  const rightFace = [at(1, -1, 1), at(1, 1 - k, 1), at(1, 1 - k, -1), at(1, -1, -1)]
  const chamfer = [at(1, 1 - k, 1), at(1 - k, 1, 1), at(1 - k, 1, -1), at(1, 1 - k, -1)]

  // Contact shadow under the part.
  radialGlow(canvas, cx, cy + s * 1.85, s * 1.5, INK.shadow, 0.5, clip)

  fillPolygon(canvas, leftFace, gradient(at(-1, 1, 1), at(-1, 1, -1), INK.faceLeft, [50, 102, 172]), clip)
  fillPolygon(canvas, rightFace, gradient(at(1, -1, 1), at(1, -1, -1), INK.faceRight, [20, 48, 94]), clip)
  fillPolygon(canvas, chamfer, gradient(at(1, 1 - k, 1), at(1 - k, 1, -1), INK.chamfer, [88, 138, 200]), clip)
  fillPolygon(canvas, top, gradient(at(-1, -1, 1), at(1, 1, 1), [226, 242, 255], INK.faceTop), clip)

  const line = Math.max(1, radius * 0.045)
  strokePolygon(canvas, top, line, [...INK.edge, 0.85], clip)
  strokeLine(canvas, at(-1, 1, 1), at(-1, 1, -1), line, [...INK.edge, 0.5], clip)
  strokeLine(canvas, at(1, -1, 1), at(1, -1, -1), line, [...INK.edge, 0.5], clip)
  strokeLine(canvas, at(1, 1 - k, 1), at(1, 1 - k, -1), line, [...INK.edge, 0.7], clip)
  strokeLine(canvas, at(1 - k, 1, 1), at(1 - k, 1, -1), line, [...INK.edge, 0.7], clip)
  strokeLine(canvas, at(-1, 1, -1), at(1 - k, 1, -1), line, [...INK.edge, 0.45], clip)
  strokeLine(canvas, at(1, -1, -1), at(1, 1 - k, -1), line, [...INK.edge, 0.45], clip)

  // Picked vertex, the way a CAD kernel highlights a selected point.
  const marker = at(-1, -1, 1)
  fillCircle(canvas, marker[0], marker[1], radius * 0.115, solid(INK.accent))
  fillCircle(canvas, marker[0], marker[1], radius * 0.05, solid([255, 250, 236]))
}

function drawAppArt(canvas, size) {
  const center = size / 2
  const half = size * 0.44
  const radius = size * 0.235
  const inside = (x, y) => roundedRectDistance(x, y, center, center, half, half, radius)
  const clip = (x, y) => inside(x, y) // > 0 means outside the body
  const detailed = size >= 32

  fillRoundedRect(canvas, center, center, half, half, radius, gradient(
    [0, center - half], [0, center + half], INK.bodyTop, INK.bodyBottom
  ))

  const step = size * 0.086
  const hairline = Math.max(1, size * 0.006)
  for (let offset = -half; offset <= half; offset += step) {
    strokeLine(canvas, [center + offset, center - half], [center + offset, center + half], hairline, [...INK.grid, 0.12], clip)
    strokeLine(canvas, [center - half, center + offset], [center + half, center + offset], hairline, [...INK.grid, 0.12], clip)
  }

  radialGlow(canvas, size * 0.24, size * 0.2, size * 0.34, [186, 226, 255], 0.5, clip)
  radialGlow(canvas, size * 0.82, size * 0.86, size * 0.36, INK.shadow, 0.42, clip)

  // Modelled part, with the pencil drawing across it.
  drawIsoPart(canvas, size * 0.47, size * 0.41, size * (detailed ? 0.2 : 0.25), clip)
  drawPencil(canvas, [size * 0.79, size * 0.17], [size * 0.5, size * 0.46], size * (detailed ? 0.068 : 0.085), clip)

  if (detailed) drawWordmark(canvas, 'CAD', center, size * 0.885, size * 0.135, clip)

  paint(
    canvas,
    [0, 0, size, size],
    (x, y) => {
      const d = inside(x, y)
      return Math.max(0, Math.min(1, 1 - Math.abs(d + size * 0.012) / (size * 0.012)))
    },
    (x, y) => {
      const t = Math.max(0, Math.min(1, (y - (center - half)) / (half * 2)))
      return [
        INK.rim[0] * (1 - t) + 8 * t,
        INK.rim[1] * (1 - t) + 20 * t,
        INK.rim[2] * (1 - t) + 44 * t,
        0.75 * (1 - t) + 0.5 * t
      ]
    }
  )
}

function drawFileArt(canvas, size) {
  const left = size * 0.2
  const right = size * 0.8
  const top = size * 0.1
  const bottom = size * 0.9
  const fold = size * 0.24
  const cx = (left + right) / 2
  const cy = (top + bottom) / 2
  const halfWidth = (right - left) / 2
  const halfHeight = (bottom - top) / 2
  const radius = size * 0.07
  const page = (x, y) => roundedRectDistance(x, y, cx, cy, halfWidth, halfHeight, radius)

  // Drop shadow, then the sheet itself.
  fillRoundedRect(canvas, cx + size * 0.022, cy + size * 0.028, halfWidth, halfHeight, radius, solid([...INK.shadow, 0.28]))
  fillRoundedRect(canvas, cx, cy, halfWidth, halfHeight, radius, gradient(
    [0, top], [0, bottom], [252, 253, 255], [214, 226, 242]
  ))

  // Dog-ear: the corner is really cut away, then the flap is laid back on.
  const overshoot = size * 0.2
  clearPolygon(canvas, [
    [right - fold, top - overshoot],
    [right + overshoot, top - overshoot],
    [right + overshoot, top + fold]
  ])
  fillPolygon(canvas, [[right - fold, top], [right, top + fold], [right - fold, top + fold]], gradient(
    [right - fold, top], [right - fold, top + fold], [236, 242, 250], [186, 202, 224]
  ))
  strokeLine(canvas, [right - fold, top], [right, top + fold], Math.max(1, size * 0.012), [150, 170, 198, 0.9])

  // Spine stripe in the app colour.
  fillRoundedRect(canvas, left + size * 0.035, cy, size * 0.035, halfHeight - size * 0.02, size * 0.018, gradient(
    [0, top], [0, bottom], [70, 140, 226], [26, 70, 140]
  ))

  drawIsoPart(canvas, cx - size * 0.04, cy - size * 0.06, size * 0.16, null)
  drawPencil(canvas, [right - size * 0.05, top + size * 0.2], [cx - size * 0.04, cy + size * 0.06], size * 0.058, null)
  drawWordmark(canvas, 'CAD', cx, bottom - size * 0.08, size * 0.11, null)

}

/* ─────────────────────────── render + downsample ────────────────────────── */

function render(size, draw) {
  const scale = size >= 128 ? 2 : SUPERSAMPLE
  const canvas = createCanvas(size * scale)
  draw(canvas, size * scale)
  const png = new PNG({ width: size, height: size })
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const i = (canvas.width * (y * scale + sy) + (x * scale + sx)) * 4
          const alpha = canvas.data[i + 3]
          r += canvas.data[i] * alpha
          g += canvas.data[i + 1] * alpha
          b += canvas.data[i + 2] * alpha
          a += alpha
        }
      }
      const out = (png.width * y + x) << 2
      if (a <= 0) {
        png.data[out] = 0
        png.data[out + 1] = 0
        png.data[out + 2] = 0
        png.data[out + 3] = 0
        continue
      }
      png.data[out] = Math.round(Math.min(255, r / a))
      png.data[out + 1] = Math.round(Math.min(255, g / a))
      png.data[out + 2] = Math.round(Math.min(255, b / a))
      png.data[out + 3] = Math.round(Math.min(255, (a / (scale * scale)) * 255))
    }
  }
  return png
}

export function drawAppIcon(size) {
  return render(size, drawAppArt)
}

export function drawFileIcon(size) {
  return render(size, drawFileArt)
}

function writePng(file, png) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, PNG.sync.write(png))
}

// assets/ holds every icon the project uses: the window and executable icon,
// the document icon, the Linux icon set and the favicon the web build serves.
// electron-builder, the NSIS installer and the shortcuts all read them there.
const assets = path.join(root, 'assets')
const sizes = [16, 24, 32, 48, 64, 128, 256, 512]
writePng(path.join(assets, 'icon.png'), drawAppIcon(256))
writePng(path.join(assets, 'file-icon.png'), drawFileIcon(256))
for (const size of sizes) {
  writePng(path.join(assets, 'icons', `${size}x${size}.png`), drawAppIcon(size))
}
const icoBuffers = [16, 32, 48, 64, 128, 256].map((size) => PNG.sync.write(drawAppIcon(size)))
const fileIco = [16, 32, 48, 256].map((size) => PNG.sync.write(drawFileIcon(size)))
fs.mkdirSync(assets, { recursive: true })
fs.writeFileSync(path.join(assets, 'icon.ico'), await pngToIco(icoBuffers))
fs.writeFileSync(path.join(assets, 'file-icon.ico'), await pngToIco(fileIco))

// The web build serves its favicon from public/, so it gets a copy of the
// same file rather than a second drawing.
writePng(path.join(root, 'public', 'favicon.png'), drawAppIcon(256))

console.log(`icons written to assets/ (${sizes.length + 4} files)`)
