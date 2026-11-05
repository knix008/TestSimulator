import type { DiagramNode } from '../types'

export type ExportFormat = 'png' | 'jpeg' | 'webp' | 'svg' | 'gif' | 'avif' | 'bmp' | 'tiff' | 'tga' | 'ico' | 'ppm' | 'qoi' | 'ff' | 'exr' | 'hdr'

/** All of them; the page encodes the first four, the shell the others from a PNG. */
export const EXPORT_FORMATS: ExportFormat[] = ['png', 'jpeg', 'webp', 'avif', 'gif', 'svg', 'bmp', 'tiff', 'tga', 'ico', 'ppm', 'qoi', 'ff', 'exr', 'hdr']
export const WEB_EXPORT_FORMATS: ExportFormat[] = ['png', 'jpeg', 'webp', 'svg']
/** These hold no transparency. */
export const OPAQUE_FORMATS: ExportFormat[] = ['jpeg', 'bmp', 'ppm', 'hdr']
const needsShell = (format: ExportFormat) => !WEB_EXPORT_FORMATS.includes(format)

export type ExportResult =
  | { kind: 'svg'; text: string; ext: string; mime: string }
  | { kind: 'raster'; dataUrl: string; ext: string; mime: string; convert?: ExportFormat }

const CSS_VARS = ['--spine', '--node-stroke', '--accent', '--grid-line', '--grid-line-major']

function resolveVar(name: string): string {
  const root = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (root) return root
  return getComputedStyle(document.body).getPropertyValue(name).trim()
}

// The tightest box that contains every shape, plus a small margin — so exports
// are always cropped to the diagram's minimum size.
function contentBounds(items: { x: number; y: number; width: number; height: number }[], pad: number) {
  if (items.length === 0) return { minX: 0, minY: 0, width: 800, height: 600 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of items) {
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.width)
    maxY = Math.max(maxY, n.y + n.height)
  }
  return { minX: minX - pad, minY: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 }
}

/**
 * Serialize the live diagram SVG into a standalone SVG string, cropped to the
 * content. Pass `background` to paint a solid backdrop rect; omit it to keep the
 * canvas transparent.
 */
export function buildSvgString(
  svg: SVGSVGElement,
  nodes: DiagramNode[],
  background?: string,
  /** Colours to use instead of the theme's. */
  overrides: Record<string, string> = {},
): { svg: string; width: number; height: number } {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.querySelector('.canvas-grid')?.remove()
  // Reset the pan/zoom transform so the export is at 1:1 in content coordinates.
  const g = clone.querySelector('g[transform]')
  g?.removeAttribute('transform')
  clone.querySelector('.marquee-rect')?.remove()

  // Memos stand beside the shapes, so they count for the crop as well.
  const memoBoxes = [...svg.querySelectorAll('[data-memo-box]')].map((element) => {
    const [x, y, boxWidth, boxHeight] = (element.getAttribute('data-memo-box') ?? '').split(' ').map(Number)
    return { x, y, width: boxWidth, height: boxHeight }
  })
  const { minX, minY, width, height } = contentBounds([...nodes, ...memoBoxes], 48)
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  clone.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

  let str = new XMLSerializer().serializeToString(clone)
  for (const v of CSS_VARS) {
    const val = overrides[v] ?? resolveVar(v)
    if (val) str = str.split(`var(${v})`).join(val)
  }
  if (background) {
    const rect = `<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${background}"/>`
    str = str.replace(/(<svg[^>]*>)/, `$1${rect}`)
  }
  return { svg: str, width, height }
}

/** Export the diagram to the requested format, optionally with a transparent bg. */
export async function exportDiagram(
  svg: SVGSVGElement,
  nodes: DiagramNode[],
  opts: { format: ExportFormat; transparent: boolean; scale?: number },
): Promise<ExportResult> {
  const { format, transparent, scale = 2 } = opts
  const solidBg = resolveVar('--bg') || '#ffffff'

  if (format === 'svg') {
    const { svg: str } = buildSvgString(svg, nodes, transparent ? undefined : solidBg)
    return { kind: 'svg', text: str, ext: 'svg', mime: 'image/svg+xml' }
  }

  // Rasterize the (transparent) SVG onto a canvas, painting a backdrop unless the
  // user asked for transparency. JPEG has no alpha, so it always gets a backdrop.
  const { svg: str, width, height } = buildSvgString(svg, nodes)
  const url = URL.createObjectURL(new Blob([str], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = reject
      image.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d context unavailable')
    ctx.scale(scale, scale)
    const isJpeg = format === 'jpeg'
    if (!transparent || OPAQUE_FORMATS.includes(format)) {
      ctx.fillStyle = solidBg
      ctx.fillRect(0, 0, width, height)
    }
    ctx.drawImage(img, 0, 0, width, height)
    const mime = isJpeg ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png'
    const dataUrl = canvas.toDataURL(mime, 0.95)
    if (needsShell(format)) return { kind: 'raster', dataUrl, ext: format === 'tiff' ? 'tif' : format, mime, convert: format }
    return { kind: 'raster', dataUrl, ext: isJpeg ? 'jpg' : format, mime }
  } finally {
    URL.revokeObjectURL(url)
  }
}
