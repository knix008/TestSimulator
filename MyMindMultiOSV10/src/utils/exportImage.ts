import type { DiagramNode, ThemeMode } from '../types'

const CSS_VARS = ['--spine', '--node-stroke', '--accent', '--grid-line', '--grid-line-major']

function resolveVar(name: string): string {
  const root = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (root) return root
  return getComputedStyle(document.body).getPropertyValue(name).trim()
}

function contentBounds(nodes: DiagramNode[], pad: number) {
  if (nodes.length === 0) return { minX: 0, minY: 0, width: 800, height: 600 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.width)
    maxY = Math.max(maxY, n.y + n.height)
  }
  return { minX: minX - pad, minY: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 }
}

/** Serialize the live diagram SVG into a standalone, self-contained SVG string. */
export function buildSvgString(svg: SVGSVGElement, nodes: DiagramNode[]): {
  svg: string
  width: number
  height: number
} {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.querySelector('.canvas-grid')?.remove()
  // Reset the pan/zoom transform so the export is at 1:1 in content coordinates.
  const g = clone.querySelector('g[transform]')
  g?.removeAttribute('transform')
  // Drop any transient overlay (marquee rectangle).
  clone.querySelector('.marquee-rect')?.remove()

  const { minX, minY, width, height } = contentBounds(nodes, 48)
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  clone.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

  let str = new XMLSerializer().serializeToString(clone)
  for (const v of CSS_VARS) {
    const val = resolveVar(v)
    if (val) str = str.split(`var(${v})`).join(val)
  }
  return { svg: str, width, height }
}

/** Rasterize the diagram to a PNG data URL (2x for crispness). */
export async function exportPngDataUrl(
  svg: SVGSVGElement,
  nodes: DiagramNode[],
  theme: ThemeMode,
): Promise<string> {
  const { svg: svgStr, width, height } = buildSvgString(svg, nodes)
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = reject
      image.src = url
    })
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d context unavailable')
    ctx.scale(scale, scale)
    // Use the active theme's solid background so every theme exports correctly.
    ctx.fillStyle = resolveVar('--bg') || (theme === 'dark' ? '#1a1d23' : '#ffffff')
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    return canvas.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}
