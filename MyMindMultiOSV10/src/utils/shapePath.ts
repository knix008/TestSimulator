import type { ShapeType } from '../types'

/** SVG path for a node shape within the box (x, y, w, h). */
export function shapePath(shape: ShapeType, x: number, y: number, w: number, h: number): string {
  const min = (...v: number[]) => Math.min(...v)
  switch (shape) {
    case 'ellipse':
      return `M ${x + w / 2} ${y} A ${w / 2} ${h / 2} 0 1 1 ${x + w / 2 - 0.01} ${y}`
    case 'diamond':
      return `M ${x + w / 2} ${y} L ${x + w} ${y + h / 2} L ${x + w / 2} ${y + h} L ${x} ${y + h / 2} Z`
    case 'parallelogram':
      return `M ${x + 16} ${y} L ${x + w} ${y} L ${x + w - 16} ${y + h} L ${x} ${y + h} Z`
    case 'rect':
      return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`
    case 'hexagon': {
      const c = min(w * 0.25, h * 0.6, 26)
      return `M ${x + c} ${y} H ${x + w - c} L ${x + w} ${y + h / 2} L ${x + w - c} ${y + h} H ${x + c} L ${x} ${y + h / 2} Z`
    }
    case 'octagon': {
      const cx = min(w * 0.2, 26)
      const cy = min(h * 0.35, 16)
      return `M ${x + cx} ${y} H ${x + w - cx} L ${x + w} ${y + cy} V ${y + h - cy} L ${x + w - cx} ${y + h} H ${x + cx} L ${x} ${y + h - cy} V ${y + cy} Z`
    }
    case 'stadium': {
      const r = h / 2
      return `M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`
    }
    case 'cylinder': {
      const ry = min(h * 0.22, 16)
      return `M ${x} ${y + ry} C ${x} ${y}, ${x + w} ${y}, ${x + w} ${y + ry} V ${y + h - ry} C ${x + w} ${y + h}, ${x} ${y + h}, ${x} ${y + h - ry} Z M ${x} ${y + ry} C ${x} ${y + 2 * ry}, ${x + w} ${y + 2 * ry}, ${x + w} ${y + ry}`
    }
    case 'trapezoid': {
      const c = min(w * 0.22, 30)
      return `M ${x + c} ${y} H ${x + w - c} L ${x + w} ${y + h} H ${x} Z`
    }
    case 'chevron': {
      const c = min(w * 0.24, 28)
      return `M ${x} ${y} H ${x + w - c} L ${x + w} ${y + h / 2} L ${x + w - c} ${y + h} H ${x} L ${x + c} ${y + h / 2} Z`
    }
    case 'note': {
      const f = min(w * 0.14, h * 0.45, 18)
      return `M ${x} ${y} H ${x + w - f} L ${x + w} ${y + f} V ${y + h} H ${x} Z M ${x + w - f} ${y} V ${y + f} H ${x + w}`
    }
    case 'rounded':
    default: {
      const r = 12
      return `M ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} H ${x + r} Q ${x} ${y + h} ${x} ${y + h - r} V ${y + r} Q ${x} ${y} ${x + r} ${y} Z`
    }
  }
}
