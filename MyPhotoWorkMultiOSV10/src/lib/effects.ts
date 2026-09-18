import { colorWithAlpha } from './color'
import { context2d, createCanvas } from './canvas'
import { drawTextBlock, drawTextOnPath, textFont } from './typeset'
import { warpCanvas } from './warp'
import type { LayerEffects, PathShape, ShapeData, TextData } from './types'

export function applyLayerEffects(source: HTMLCanvasElement, effects: LayerEffects) {
  if (!effects.dropShadow && !effects.stroke && !effects.colorOverlay && !effects.innerGlow && !effects.outerGlow && !effects.bevel) {
    return source
  }
  const out = createCanvas(source.width, source.height)
  const ctx = context2d(out)
  if (effects.dropShadow) {
    ctx.save()
    ctx.shadowColor = effects.shadowColor
    ctx.shadowBlur = effects.shadowBlur
    ctx.shadowOffsetX = effects.shadowX
    ctx.shadowOffsetY = effects.shadowY
    ctx.drawImage(source, 0, 0)
    ctx.restore()
  }
  if (effects.outerGlow) {
    ctx.save()
    ctx.shadowColor = colorWithAlpha('#7dd3fc', 0.9)
    ctx.shadowBlur = 18
    ctx.drawImage(source, 0, 0)
    ctx.restore()
  }
  ctx.drawImage(source, 0, 0)
  if (effects.colorOverlay) {
    ctx.save()
    ctx.globalAlpha = effects.overlayOpacity
    ctx.globalCompositeOperation = 'source-atop'
    ctx.fillStyle = effects.overlayColor
    ctx.fillRect(0, 0, out.width, out.height)
    ctx.restore()
  }
  if (effects.innerGlow) {
    // Punch the layer's own silhouette out of a filled block and blur what is
    // left: the soft edge that bleeds back inward becomes the glow. Stroking the
    // canvas border instead would miss any layer whose pixels stop short of it.
    const halo = createCanvas(out.width, out.height)
    const haloCtx = context2d(halo)
    haloCtx.fillStyle = '#ffffff'
    haloCtx.fillRect(0, 0, out.width, out.height)
    haloCtx.globalCompositeOperation = 'destination-out'
    haloCtx.drawImage(source, 0, 0)

    const glow = createCanvas(out.width, out.height)
    const glowCtx = context2d(glow)
    glowCtx.filter = 'blur(7px)'
    glowCtx.drawImage(halo, 0, 0)

    ctx.save()
    ctx.globalCompositeOperation = 'source-atop'
    ctx.drawImage(glow, 0, 0)
    ctx.restore()
  }
  if (effects.bevel) {
    ctx.save()
    ctx.globalCompositeOperation = 'overlay'
    const gradient = ctx.createLinearGradient(0, 0, 0, out.height)
    gradient.addColorStop(0, 'rgba(255,255,255,0.35)')
    gradient.addColorStop(1, 'rgba(0,0,0,0.28)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, out.width, out.height)
    ctx.restore()
  }
  if (effects.stroke) {
    ctx.save()
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = effects.strokeColor
    ctx.lineWidth = effects.strokeWidth
    ctx.strokeRect(effects.strokeWidth / 2, effects.strokeWidth / 2, out.width - effects.strokeWidth, out.height - effects.strokeWidth)
    ctx.restore()
  }
  return out
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

export function rasterizeShape(width: number, height: number, shape: ShapeData) {
  const canvas = createCanvas(width, height)
  const ctx = context2d(canvas)
  ctx.fillStyle = shape.fill
  ctx.strokeStyle = shape.stroke
  ctx.lineWidth = shape.strokeWidth
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
  } else if (shape.kind === 'polygon' || shape.kind === 'star') {
    const sides = Math.max(3, shape.sides)
    const cx = x + w / 2
    const cy = y + h / 2
    const rx = Math.abs(w) / 2
    const ry = Math.abs(h) / 2
    for (let i = 0; i < sides; i += 1) {
      const angle = (Math.PI * 2 * i) / sides - Math.PI / 2
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
  }
  if (shape.kind !== 'line') ctx.fill()
  ctx.stroke()
  return canvas
}
