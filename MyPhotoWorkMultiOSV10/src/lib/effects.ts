import { colorWithAlpha, hexToRgb } from './color'
import { context2d, createCanvas } from './canvas'
import { drawTextBlock, drawTextOnPath, textFont } from './typeset'
import { warpCanvas } from './warp'
import { patternKey } from './patterns'
import type { LayerEffects, PathShape, ShapeData, TextData } from './types'

/** True when any style is switched on, so a plain layer costs nothing. */
export function hasEffects(effects: LayerEffects) {
  return Boolean(
    effects.dropShadow || effects.stroke || effects.colorOverlay || effects.innerGlow || effects.outerGlow || effects.bevel
    || effects.innerShadow || effects.satin || effects.gradientOverlay || effects.patternOverlay,
  )
}

/** The layer's own coverage, as a canvas: white where it has pixels. */
function silhouette(source: HTMLCanvasElement, color = '#ffffff') {
  const out = createCanvas(source.width, source.height)
  const ctx = context2d(out)
  ctx.drawImage(source, 0, 0)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, out.width, out.height)
  return out
}

/** Everything outside the layer, filled with `color`. */
function inverseSilhouette(source: HTMLCanvasElement, color = '#ffffff') {
  const out = createCanvas(source.width, source.height)
  const ctx = context2d(out)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.globalCompositeOperation = 'destination-out'
  ctx.drawImage(source, 0, 0)
  return out
}

/** Grows the coverage by `radius` pixels: the shape drawn at every offset round a circle. */
function dilate(shape: HTMLCanvasElement, radius: number) {
  const out = createCanvas(shape.width, shape.height)
  const ctx = context2d(out)
  const r = Math.max(0, radius)
  if (r === 0) {
    ctx.drawImage(shape, 0, 0)
    return out
  }
  const steps = Math.max(8, Math.round(r * 4))
  for (let ring = r; ring > 0; ring -= Math.max(1, r / 3)) {
    for (let i = 0; i < steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2
      ctx.drawImage(shape, Math.cos(angle) * ring, Math.sin(angle) * ring)
    }
  }
  ctx.drawImage(shape, 0, 0)
  return out
}

function blurred(canvas: HTMLCanvasElement, radius: number) {
  const out = createCanvas(canvas.width, canvas.height)
  const ctx = context2d(out)
  if (radius > 0) ctx.filter = `blur(${radius}px)`
  ctx.drawImage(canvas, 0, 0)
  return out
}

function angleVector(degrees: number) {
  const rad = (degrees * Math.PI) / 180
  // Photoshop measures the light's angle anticlockwise from the right.
  return { x: Math.cos(rad), y: -Math.sin(rad) }
}

/**
 * Applies the layer's styles, in the order Photoshop stacks them: the effects
 * that sit under the layer first (shadow, outer glow), the layer itself,
 * then the overlays and the effects that sit on top of it, then the stroke.
 */
export function applyLayerEffects(source: HTMLCanvasElement, effects: LayerEffects, canvases?: Map<string, HTMLCanvasElement>) {
  if (!hasEffects(effects)) {
    return source
  }
  const width = source.width
  const height = source.height
  const out = createCanvas(width, height)
  const ctx = context2d(out)

  /* ---- beneath the layer ---- */
  if (effects.dropShadow) {
    let shape: HTMLCanvasElement = source
    if ((effects.shadowSpread ?? 0) > 0) shape = dilate(silhouette(source), effects.shadowSpread ?? 0)
    ctx.save()
    ctx.globalAlpha = effects.shadowOpacity ?? 0.75
    ctx.shadowColor = effects.shadowColor
    ctx.shadowBlur = effects.shadowBlur
    ctx.shadowOffsetX = effects.shadowX + width * 2
    ctx.shadowOffsetY = effects.shadowY
    // Drawn far off-canvas so only the shadow lands, not the shape itself.
    ctx.drawImage(shape, -width * 2, 0)
    ctx.restore()
  }
  if (effects.outerGlow) {
    ctx.save()
    ctx.globalAlpha = effects.glowOpacity ?? 0.9
    ctx.shadowColor = colorWithAlpha(effects.glowColor ?? '#7dd3fc', 1)
    ctx.shadowBlur = effects.glowSize ?? 18
    ctx.shadowOffsetX = width * 2
    ctx.drawImage(source, -width * 2, 0)
    ctx.drawImage(source, -width * 2, 0)
    ctx.restore()
  }
  if (effects.stroke && effects.strokePosition !== 'inside') {
    // An outside (or centred) stroke is under the layer: the grown shape in
    // the stroke colour, and the layer covers its inner half.
    const size = effects.strokePosition === 'center' ? effects.strokeWidth / 2 : effects.strokeWidth
    const grown = dilate(silhouette(source, effects.strokeColor), size)
    ctx.save()
    ctx.globalAlpha = effects.strokeOpacity ?? 1
    ctx.drawImage(grown, 0, 0)
    ctx.restore()
  }

  /* ---- the layer ---- */
  ctx.drawImage(source, 0, 0)

  /* ---- on top of the layer, clipped to it ---- */
  const atop = (paint: (pctx: CanvasRenderingContext2D) => void, opacity = 1, mode: GlobalCompositeOperation = 'source-over') => {
    const layerOnly = createCanvas(width, height)
    const lctx = context2d(layerOnly)
    paint(lctx)
    lctx.globalCompositeOperation = 'destination-in'
    lctx.drawImage(source, 0, 0)
    ctx.save()
    ctx.globalAlpha = opacity
    ctx.globalCompositeOperation = mode
    ctx.drawImage(layerOnly, 0, 0)
    ctx.restore()
  }

  if (effects.patternOverlay) {
    const tile = effects.patternId && canvases ? canvases.get(patternKey(effects.patternId)) : undefined
    if (tile) {
      atop((pctx) => {
        const scale = effects.patternScale ?? 1
        const pattern = pctx.createPattern(tile, 'repeat')
        if (pattern) {
          pctx.save()
          pctx.scale(scale, scale)
          pctx.fillStyle = pattern
          pctx.fillRect(0, 0, width / scale, height / scale)
          pctx.restore()
        }
      }, effects.patternOpacity ?? 1)
    }
  }
  if (effects.gradientOverlay) {
    atop((pctx) => {
      const angle = angleVector(effects.gradientAngle ?? 90)
      const half = Math.hypot(width, height) / 2
      const cx = width / 2
      const cy = height / 2
      const gradient = effects.gradientStyle === 'radial'
        ? pctx.createRadialGradient(cx, cy, 0, cx, cy, half)
        : pctx.createLinearGradient(cx - angle.x * half, cy - angle.y * half, cx + angle.x * half, cy + angle.y * half)
      gradient.addColorStop(0, effects.gradientFrom ?? '#000000')
      gradient.addColorStop(1, effects.gradientTo ?? '#ffffff')
      pctx.fillStyle = gradient
      pctx.fillRect(0, 0, width, height)
    }, effects.gradientOpacity ?? 1)
  }
  if (effects.colorOverlay) {
    atop((pctx) => {
      pctx.fillStyle = effects.overlayColor
      pctx.fillRect(0, 0, width, height)
    }, effects.overlayOpacity, (effects.overlayBlend ?? 'source-over') as GlobalCompositeOperation)
  }
  if (effects.satin) {
    // Two copies of the layer's own inverse, blurred and pushed apart; where
    // they disagree the satin colour shows: the folded-cloth sheen.
    const inverse = inverseSilhouette(source, effects.satinColor ?? '#000000')
    const soft = blurred(inverse, effects.satinSize ?? 12)
    const d = effects.satinDistance ?? 8
    atop((pctx) => {
      pctx.drawImage(soft, d, d)
      pctx.globalCompositeOperation = 'difference'
      pctx.drawImage(soft, -d, -d)
    }, effects.satinOpacity ?? 0.5, 'multiply')
  }
  if (effects.innerGlow) {
    const inverse = inverseSilhouette(source, effects.innerGlowColor ?? '#ffffbe')
    const glow = blurred(inverse, effects.innerGlowSize ?? 7)
    atop((pctx) => pctx.drawImage(glow, 0, 0), effects.innerGlowOpacity ?? 0.75, 'screen')
  }
  if (effects.innerShadow) {
    const inverse = inverseSilhouette(source, effects.innerShadowColor ?? '#000000')
    const shadow = blurred(inverse, effects.innerShadowBlur ?? 8)
    atop((pctx) => pctx.drawImage(shadow, effects.innerShadowX ?? 4, effects.innerShadowY ?? 4), effects.innerShadowOpacity ?? 0.75, 'multiply')
  }
  if (effects.bevel) {
    applyBevel(ctx, source, effects)
  }
  if (effects.stroke && effects.strokePosition === 'inside') {
    // The layer minus a shrunk copy of itself, in the stroke colour.
    const shrunk = inverseSilhouette(dilate(inverseSilhouette(source), effects.strokeWidth))
    atop((pctx) => {
      pctx.drawImage(silhouette(source, effects.strokeColor), 0, 0)
      pctx.globalCompositeOperation = 'destination-out'
      pctx.drawImage(shrunk, 0, 0)
    }, effects.strokeOpacity ?? 1)
  } else if (effects.stroke && effects.strokePosition === 'center') {
    const shrunk = inverseSilhouette(dilate(inverseSilhouette(source), effects.strokeWidth / 2))
    atop((pctx) => {
      pctx.drawImage(silhouette(source, effects.strokeColor), 0, 0)
      pctx.globalCompositeOperation = 'destination-out'
      pctx.drawImage(shrunk, 0, 0)
    }, effects.strokeOpacity ?? 1)
  }
  return out
}

/**
 * Bevel and Emboss: the layer's coverage, blurred, is a height map; the slope
 * of that map towards the light is the highlight, away from it the shadow.
 */
function applyBevel(ctx: CanvasRenderingContext2D, source: HTMLCanvasElement, effects: LayerEffects) {
  const width = source.width
  const height = source.height
  const size = Math.max(1, effects.bevelSize ?? 6)
  const style = effects.bevelStyle ?? 'inner'
  const depth = (effects.bevelDepth ?? 100) / 100
  const light = angleVector(effects.bevelAngle ?? 120)
  const shape = silhouette(source)
  const heightMap = blurred(style === 'outer' ? dilate(shape, size) : shape, size + (effects.bevelSoften ?? 0))
  const cover = context2d(source).getImageData(0, 0, width, height).data
  const grown = style === 'outer' || style === 'emboss' ? context2d(dilate(shape, size)).getImageData(0, 0, width, height).data : null
  const hm = context2d(heightMap).getImageData(0, 0, width, height).data
  const hi = hexToRgb(effects.bevelHighlight ?? '#ffffff')
  const lo = hexToRgb(effects.bevelShadow ?? '#000000')
  const paint = createCanvas(width, height)
  const pctx = context2d(paint)
  const image = pctx.createImageData(width, height)
  const flip = style === 'pillow' ? -1 : 1
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = (y * width + x) * 4
      const inside = cover[i + 3] > 0
      const region = style === 'inner' || style === 'pillow' ? inside : style === 'outer' ? !inside && Boolean(grown && grown[i + 3] > 0) : Boolean(grown && grown[i + 3] > 0)
      if (!region) continue
      const gx = (hm[i + 4 + 3] - hm[i - 4 + 3]) / 255
      const gy = (hm[i + width * 4 + 3] - hm[i - width * 4 + 3]) / 255
      // The surface normal of a height map is (-dh/dx, -dh/dy, 1): a slope
      // rising towards the light faces it.
      const lit = -(gx * light.x + gy * light.y) * depth * 3 * flip
      const strength = Math.min(1, Math.abs(lit))
      const color = lit > 0 ? hi : lo
      image.data[i] = color.r
      image.data[i + 1] = color.g
      image.data[i + 2] = color.b
      image.data[i + 3] = Math.round(strength * 200)
    }
  }
  pctx.putImageData(image, 0, 0)
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.drawImage(paint, 0, 0)
  ctx.restore()
}

/**
 * Draws a text layer: paragraphs with their own line height and indents, type
 * running along a path when one is named, and the whole thing bent afterwards
 * if the layer carries a warp.
 */
export function rasterizeTextLayer(width: number, height: number, text: TextData, paths: PathShape[] = []) {
  const canvas = createCanvas(width, height)
  const ctx = context2d(canvas)
  ctx.font = textFont(text)
  ctx.fillStyle = text.color
  ctx.textAlign = text.align
  ctx.textBaseline = 'top'

  const path = text.pathId ? paths.find((item) => item.id === text.pathId) : undefined
  if (path) {
    drawTextOnPath(ctx, text, path)
  } else {
    drawTextBlock(ctx, text)
  }

  const warp = text.warp
  if (!warp || warp.style === 'none' || (!warp.bend && !warp.horizontal && !warp.vertical)) {
    return canvas
  }
  // Warping the drawn glyphs is what gives the same shapes as the layer Warp
  // command; the two share the maths in warp.ts.
  return warpCanvas(canvas, warp.style, warp.bend, warp.horizontal, warp.vertical)
}

/** Traces the shape's outline into the context, without filling it. */
export function traceShape(ctx: CanvasRenderingContext2D, shape: ShapeData) {
  const x = shape.x
  const y = shape.y
  const w = shape.width
  const h = shape.height
  ctx.beginPath()
  if (shape.kind === 'rect') {
    ctx.rect(x, y, w, h)
  } else if (shape.kind === 'roundRect') {
    const r = Math.min(shape.radius, Math.abs(w) / 2, Math.abs(h) / 2)
    ctx.roundRect(x, y, w, h, r)
  } else if (shape.kind === 'ellipse') {
    ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2)
  } else if (shape.kind === 'line') {
    ctx.moveTo(x, y)
    ctx.lineTo(x + w, y + h)
  } else if (shape.kind === 'triangle') {
    ctx.moveTo(x + w / 2, y)
    ctx.lineTo(x + w, y + h)
    ctx.lineTo(x, y + h)
    ctx.closePath()
  } else if (shape.kind === 'polygon' || shape.kind === 'star') {
    const sides = Math.max(3, shape.sides)
    const cx = x + w / 2
    const cy = y + h / 2
    const rx = Math.abs(w) / 2
    const ry = Math.abs(h) / 2
    const points = shape.kind === 'star' ? sides * 2 : sides
    for (let i = 0; i < points; i += 1) {
      const angle = (Math.PI * 2 * i) / points - Math.PI / 2
      const scale = shape.kind === 'star' && i % 2 ? 0.45 : 1
      const px = cx + Math.cos(angle) * rx * scale
      const py = cy + Math.sin(angle) * ry * scale
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
  } else if (shape.kind === 'heart') {
    const cx = x + w / 2
    const top = y + h * 0.3
    ctx.moveTo(cx, y + h)
    ctx.bezierCurveTo(x, y + h * 0.6, x, top, cx, top)
    ctx.bezierCurveTo(x + w, top, x + w, y + h * 0.6, cx, y + h)
  } else if (shape.kind === 'arrow') {
    ctx.moveTo(x, y + h * 0.35)
    ctx.lineTo(x + w * 0.62, y + h * 0.35)
    ctx.lineTo(x + w * 0.62, y)
    ctx.lineTo(x + w, y + h / 2)
    ctx.lineTo(x + w * 0.62, y + h)
    ctx.lineTo(x + w * 0.62, y + h * 0.65)
    ctx.lineTo(x, y + h * 0.65)
    ctx.closePath()
  } else if (shape.kind === 'custom' && shape.outline?.length) {
    // A defined shape: its anchors and handles scaled into the box.
    const nodes = shape.outline
    const sx = (u: number) => x + u * w
    const sy = (v: number) => y + v * h
    ctx.moveTo(sx(nodes[0].x), sy(nodes[0].y))
    for (let i = 1; i < nodes.length; i += 1) {
      const a = nodes[i - 1]
      const b = nodes[i]
      ctx.bezierCurveTo(sx(a.outX), sy(a.outY), sx(b.inX), sy(b.inY), sx(b.x), sy(b.y))
    }
    if (shape.outlineClosed !== false && nodes.length > 2) {
      const a = nodes[nodes.length - 1]
      const b = nodes[0]
      ctx.bezierCurveTo(sx(a.outX), sy(a.outY), sx(b.inX), sy(b.inY), sx(b.x), sy(b.y))
      ctx.closePath()
    }
  }
}

export function rasterizeShape(width: number, height: number, shape: ShapeData) {
  const canvas = createCanvas(width, height)
  const ctx = context2d(canvas)
  ctx.fillStyle = shape.fill
  ctx.strokeStyle = shape.stroke
  ctx.lineWidth = shape.strokeWidth
  traceShape(ctx, shape)
  if (shape.kind !== 'line') ctx.fill()
  if (shape.strokeWidth > 0) ctx.stroke()
  return canvas
}
