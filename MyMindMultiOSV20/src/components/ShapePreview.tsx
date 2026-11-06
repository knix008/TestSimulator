import type { ShapeType } from '../types'
import { shapePath } from '../utils/shapePath'

// Not a node's wide proportions: at this size they flatten every shape, and a star or a heart should
// look like one. Drawn large and scaled down, as the corners of a shape are given in pixels.
const W = 66
const H = 44
const PAD = 5

/** A node shape in small, for picking it. */
export function ShapePreview({ shape }: { shape: ShapeType }) {
  return (
    <svg width="24" height="17" viewBox={`${-PAD} ${-PAD} ${W + PAD * 2} ${H + PAD * 2}`} aria-hidden>
      <path d={shapePath(shape, 0, 0, W, H)} fill="var(--accent-soft)" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
