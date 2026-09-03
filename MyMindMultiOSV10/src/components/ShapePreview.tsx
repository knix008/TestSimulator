import type { ShapeType } from '../types'
import { shapePath } from '../utils/shapePath'

/** A tiny outlined preview of a node shape, for dropdown option icons. */
export function ShapePreview({ shape }: { shape: ShapeType }) {
  // Draw in a wide box so shapes match how nodes actually look.
  return (
    <svg width="26" height="16" viewBox="0 0 26 16" aria-hidden>
      <path
        d={shapePath(shape, 1.5, 1.5, 23, 13)}
        fill="var(--accent-soft)"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}
