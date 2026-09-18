import type { PathNode, PathShape, Point, TextData } from './types'

/**
 * Setting type: the paragraph measurements, the letter-by-letter drawing that
 * letter spacing and vertical type need, and running a line of text along a
 * path.
 *
 * Nothing here touches a canvas of its own — everything draws into the context
 * it is handed, so the same code serves the layer rasteriser and any preview.
 */

export const defaultLineHeight = 1.2

export function textFont(text: TextData) {
  return `${text.italic ? 'italic ' : ''}${text.bold ? '700' : '500'} ${text.fontSize}px ${text.fontFamily}`
}

/** The paragraphs of a text layer, in the order they are drawn. */
export function textLines(text: TextData) {
  return text.text.split(/\r?\n/)
}

/** How far down each line sits from the one above it. */
export function lineStep(text: TextData) {
  return text.fontSize * (text.lineHeight ?? defaultLineHeight)
}

/**
 * Draws one line with a gap after every character.
 *
 * `ctx.letterSpacing` exists in newer browsers but not everywhere this runs, so
 * the characters are placed by hand. The alignment is applied to the measured
 * width of the whole line, which is what keeps a centred line centred.
 */
export function drawSpacedText(ctx: CanvasRenderingContext2D, line: string, x: number, y: number, spacing: number, align: TextData['align']) {
  if (!spacing) {
    ctx.fillText(line, x, y)
    return
  }
  const characters = [...line]
  const width = characters.reduce((total, character) => total + ctx.measureText(character).width + spacing, -spacing)
  let cursor = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x
  const previous = ctx.textAlign
  ctx.textAlign = 'left'
  for (const character of characters) {
    ctx.fillText(character, cursor, y)
    cursor += ctx.measureText(character).width + spacing
  }
  ctx.textAlign = previous
}

/** Straight or vertical type, with paragraphs, indents and letter spacing. */
export function drawTextBlock(ctx: CanvasRenderingContext2D, text: TextData) {
  const spacing = text.letterSpacing ?? 0
  const step = lineStep(text)
  const indent = text.indent ?? 0
  const paragraphGap = text.paragraphSpacing ?? 0

  if (text.vertical) {
    // Vertical type stacks the characters of each line into its own column.
    const columns = textLines(text)
    columns.forEach((line, columnIndex) => {
      const x = text.x - columnIndex * step
      ;[...line].forEach((character, index) => {
        ctx.fillText(character, x, text.y + index * (text.fontSize + spacing))
      })
    })
    return
  }

  let y = text.y
  let startOfParagraph = true
  for (const line of textLines(text)) {
    if (line === '') {
      // A blank line ends the paragraph; the next one is indented again.
      y += step + paragraphGap
      startOfParagraph = true
      continue
    }
    drawSpacedText(ctx, line, text.x + (startOfParagraph ? indent : 0), y, spacing, text.align)
    y += step
    startOfParagraph = false
  }
}

/* --------------------------------------------------------- text on a path */

function cubic(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const s = 1 - t
  return {
    x: s * s * s * a.x + 3 * s * s * t * b.x + 3 * s * t * t * c.x + t * t * t * d.x,
    y: s * s * s * a.y + 3 * s * s * t * b.y + 3 * s * t * t * c.y + t * t * t * d.y,
  }
}

/** The path as a dense run of points, which is what a walk along it needs. */
export function flattenPath(path: PathShape, perSegment = 24): Point[] {
  const nodes = path.nodes
  if (nodes.length < 2) {
    return nodes.map((node) => ({ x: node.x, y: node.y }))
  }
  const points: Point[] = []
  const segments = path.closed ? nodes.length : nodes.length - 1
  for (let i = 0; i < segments; i += 1) {
    const from: PathNode = nodes[i]
    const to: PathNode = nodes[(i + 1) % nodes.length]
    for (let step = 0; step < perSegment; step += 1) {
      points.push(cubic(
        { x: from.x, y: from.y },
        { x: from.outX, y: from.outY },
        { x: to.inX, y: to.inY },
        { x: to.x, y: to.y },
        step / perSegment,
      ))
    }
  }
  const last = path.closed ? nodes[0] : nodes[nodes.length - 1]
  points.push({ x: last.x, y: last.y })
  return points
}

/** Distance along the flattened path to each of its points. */
function arcLengths(points: Point[]) {
  const lengths = [0]
  for (let i = 1; i < points.length; i += 1) {
    lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y))
  }
  return lengths
}

/** Where along the path a given distance falls, and which way it is heading. */
export function pointAtDistance(points: Point[], lengths: number[], distance: number) {
  const total = lengths[lengths.length - 1]
  if (total <= 0) {
    return null
  }
  if (distance < 0 || distance > total) {
    return null
  }
  let index = 1
  while (index < lengths.length - 1 && lengths[index] < distance) {
    index += 1
  }
  const before = points[index - 1]
  const after = points[index]
  const span = lengths[index] - lengths[index - 1] || 1
  const t = (distance - lengths[index - 1]) / span
  return {
    x: before.x + (after.x - before.x) * t,
    y: before.y + (after.y - before.y) * t,
    angle: Math.atan2(after.y - before.y, after.x - before.x),
  }
}

/**
 * Lays the text along a path, one character at a time: each is placed at its
 * own distance along the curve and turned to face along it. Characters that
 * would run off the end are simply not drawn, which is what a type tool does.
 */
export function drawTextOnPath(ctx: CanvasRenderingContext2D, text: TextData, path: PathShape) {
  const points = flattenPath(path)
  if (points.length < 2) {
    return
  }
  const lengths = arcLengths(points)
  const spacing = text.letterSpacing ?? 0
  let distance = text.pathOffset ?? 0
  const previousAlign = ctx.textAlign
  const previousBaseline = ctx.textBaseline
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  for (const character of [...text.text]) {
    const advance = ctx.measureText(character).width
    const at = pointAtDistance(points, lengths, distance + advance / 2)
    if (at) {
      ctx.save()
      ctx.translate(at.x, at.y)
      ctx.rotate(at.angle)
      ctx.fillText(character, -advance / 2, 0)
      ctx.restore()
    }
    distance += advance + spacing
  }
  ctx.textAlign = previousAlign
  ctx.textBaseline = previousBaseline
}
