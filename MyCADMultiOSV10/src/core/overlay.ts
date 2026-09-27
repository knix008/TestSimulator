// Wireframe overlay: the Draft, GSD and SketchUp tools that produce curves and
// annotations rather than solids write them into `doc.extras`. This module
// turns that data into the flat vertex arrays and label placements the viewport
// feeds to three.js, so the geometry can be tested without a WebGL context.
import type { Annotation, Wire } from './draftwb'
import type { Vec3 } from './model'
import { vec } from './model'
import type { BoundingBox } from './primitives'

/** A piece of text the viewport draws as a sprite at a world position. */
export interface OverlayLabel {
  id: string
  text: string
  at: Vec3
  /** sprite side length in world units */
  size: number
}

export interface Overlay {
  /** Flat x,y,z triples, two points per segment, for one LineSegments. */
  wires: number[]
  /** The same, for dimension and leader lines. */
  annotations: number[]
  labels: OverlayLabel[]
}

/** The empty box `boundingBoxOf` returns for an empty scene. */
function emptyBox(): BoundingBox {
  return { min: vec(), max: vec(), size: vec(), center: vec() }
}

/**
 * Line segments for one wire: a pair of points per span, plus the closing span
 * when the wire is closed. A wire of fewer than two points draws nothing.
 */
export function wireSegments(wire: Wire): number[] {
  const points = wire.points
  if (points.length < 2) return []
  const out: number[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    out.push(a.x, a.y, a.z, b.x, b.y, b.z)
  }
  // A two-point wire is a single line whichever way it is flagged: closing it
  // would only draw the same span back on itself.
  if (wire.closed && points.length > 2) {
    const last = points[points.length - 1]
    const first = points[0]
    out.push(last.x, last.y, last.z, first.x, first.y, first.z)
  }
  return out
}

/** A unit vector across the span, used for the witness ticks of a dimension. */
function acrossSpan(from: Vec3, to: Vec3): Vec3 {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  // d × Y, which is zero only when the span itself runs along Y.
  let px = -dz
  let py = 0
  let pz = dx
  if (Math.hypot(px, py, pz) < 1e-6) {
    // d × Z instead, so a vertical dimension still gets its ticks.
    px = dy
    py = -dx
    pz = 0
  }
  const length = Math.hypot(px, py, pz)
  if (length < 1e-9) return vec(1, 0, 0)
  return { x: px / length, y: py / length, z: pz / length }
}

export function midpoint(a: Vec3, b: Vec3): Vec3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }
}

/**
 * Line segments for one annotation. A dimension gets its span plus a witness
 * tick at each end; an angle, radius, label or leader gets the span alone; a
 * text note is its label and nothing more.
 */
export function annotationSegments(annotation: Annotation, tick: number): number[] {
  const { a, b, kind } = annotation
  if (kind === 'text') return []
  const span = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
  if (span < 1e-9) return []
  const out = [a.x, a.y, a.z, b.x, b.y, b.z]
  if (kind !== 'dimension') return out
  const across = acrossSpan(a, b)
  const half = Math.max(0.01, tick) / 2
  for (const end of [a, b]) {
    out.push(
      end.x - across.x * half, end.y - across.y * half, end.z - across.z * half,
      end.x + across.x * half, end.y + across.y * half, end.z + across.z * half
    )
  }
  return out
}

/** Where an annotation's text sits: over the middle of its span. */
export function annotationLabel(annotation: Annotation, size: number): OverlayLabel {
  const at = annotation.kind === 'text' ? { ...annotation.a } : midpoint(annotation.a, annotation.b)
  return { id: annotation.id, text: annotation.text, at, size }
}

/**
 * Tick and label sizes scale with the model, so a 4 m wall and a 40 mm cube
 * both get annotations that read at the distance the camera frames them from.
 */
export function overlayScale(radius: number): { tick: number; label: number } {
  const span = Math.max(20, radius)
  return { tick: span * 0.06, label: span * 0.09 }
}

/** Everything the viewport needs to draw the wires and annotations of a document. */
export function buildOverlay(wires: Wire[], annotations: Annotation[], radius: number): Overlay {
  const { tick, label } = overlayScale(radius)
  const overlay: Overlay = { wires: [], annotations: [], labels: [] }
  for (const wire of wires) overlay.wires.push(...wireSegments(wire))
  for (const annotation of annotations) {
    overlay.annotations.push(...annotationSegments(annotation, tick))
    if (annotation.text) overlay.labels.push(annotationLabel(annotation, label))
  }
  return overlay
}

/** The box around the wire and annotation points, in the shape `boundingBoxOf` returns. */
export function overlayBounds(wires: Wire[], annotations: Annotation[]): BoundingBox {
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  const include = (point: Vec3) => {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y)
    minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z)
  }
  for (const wire of wires) for (const point of wire.points) include(point)
  for (const annotation of annotations) {
    include(annotation.a)
    include(annotation.b)
  }
  if (!Number.isFinite(minX)) return emptyBox()
  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 }
  }
}

/** The box that holds both, so a drawing with no solids still frames itself. */
export function mergeBounds(first: BoundingBox, second: BoundingBox): BoundingBox {
  const min = {
    x: Math.min(first.min.x, second.min.x),
    y: Math.min(first.min.y, second.min.y),
    z: Math.min(first.min.z, second.min.z)
  }
  const max = {
    x: Math.max(first.max.x, second.max.x),
    y: Math.max(first.max.y, second.max.y),
    z: Math.max(first.max.z, second.max.z)
  }
  return {
    min,
    max,
    size: { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z },
    center: { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 }
  }
}

/**
 * The framing key for the overlay: the viewport re-frames the camera when the
 * shapes change size, and a drawing counts as a shape.
 */
export function overlayFramingKey(wires: Wire[], annotations: Annotation[]): string {
  const box = overlayBounds(wires, annotations)
  if (wires.length === 0 && annotations.length === 0) return ''
  return `w${wires.length}a${annotations.length}:${box.size.x},${box.size.y},${box.size.z}`
}
