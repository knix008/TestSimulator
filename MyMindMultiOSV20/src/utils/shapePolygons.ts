// The shapes that are defined by their outline alone: shapePath draws exactly what connectors.ts
// ends lines on. In a box of 1 by 1, so each fits whatever size its node has. Pure.
import type { ShapeType } from '../types'

type Unit = [number, number]

const sampled = (steps: number, at: (t: number) => Unit): Unit[] => Array.from({ length: steps }, (_, i) => at(i / steps))

/** Scaled to fill the box exactly, for what is easier to write in other numbers. */
const fitted = (points: Unit[]): Unit[] => {
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  return points.map(([x, y]) => [(x - left) / (right - left), (y - top) / (bottom - top)])
}

const star = (): Unit[] =>
  fitted(Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5
    const radius = i % 2 ? 0.45 : 1
    return [Math.cos(angle) * radius, Math.sin(angle) * radius]
  }))

const heart = (): Unit[] =>
  fitted(sampled(72, (t) => {
    const a = t * Math.PI * 2
    return [16 * Math.sin(a) ** 3, -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a))]
  }))

const cloud = (): Unit[] =>
  fitted(sampled(96, (t) => {
    const a = t * Math.PI * 2
    const radius = 0.8 + 0.2 * Math.abs(Math.cos(4 * a))
    return [Math.cos(a) * radius, Math.sin(a) * radius]
  }))

const shield = (): Unit[] => {
  const side = (from: Unit, control: Unit, to: Unit) =>
    sampled(16, (t) => [(1 - t) ** 2 * from[0] + 2 * (1 - t) * t * control[0] + t * t * to[0], (1 - t) ** 2 * from[1] + 2 * (1 - t) * t * control[1] + t * t * to[1]])
  return [[0, 0], [1, 0], ...side([1, 0.45], [1, 0.82], [0.5, 1]), ...side([0.5, 1], [0, 0.82], [0, 0.45])]
}

const document_ = (): Unit[] => [[0, 0], [1, 0], ...sampled(24, (t): Unit => [1 - t, 0.86 + 0.14 * Math.sin((1 - t) * Math.PI * 2)])]

const wave = (): Unit[] => [
  ...sampled(24, (t): Unit => [t, 0.14 - 0.14 * Math.sin(t * Math.PI * 2)]),
  [1, 0.14],
  ...sampled(24, (t): Unit => [1 - t, 0.86 - 0.14 * Math.sin((1 - t) * Math.PI * 2)]),
  [0, 0.86],
]

const plaque = (): Unit[] => {
  const r = 0.2
  const corner = (cx: number, cy: number, from: number) => sampled(8, (t): Unit => [cx + r * Math.cos(from - (t * Math.PI) / 2), cy + r * Math.sin(from - (t * Math.PI) / 2)])
  return [...corner(0, 0, Math.PI / 2), ...corner(1, 0, Math.PI), ...corner(1, 1, -Math.PI / 2), ...corner(0, 1, 0)]
}

const OUTLINES: Partial<Record<ShapeType, () => Unit[]>> = {
  triangle: () => [[0.5, 0], [1, 1], [0, 1]],
  triangleDown: () => [[0, 0], [1, 0], [0.5, 1]],
  pentagon: () => [[0.5, 0], [1, 0.38], [0.81, 1], [0.19, 1], [0, 0.38]],
  star,
  cross: () => [[0.3, 0], [0.7, 0], [0.7, 0.3], [1, 0.3], [1, 0.7], [0.7, 0.7], [0.7, 1], [0.3, 1], [0.3, 0.7], [0, 0.7], [0, 0.3], [0.3, 0.3]],
  heart,
  cloud,
  shield,
  callout: () => [[0, 0], [1, 0], [1, 0.76], [0.42, 0.76], [0.22, 1], [0.24, 0.76], [0, 0.76]],
  document: document_,
  tag: () => [[0.16, 0], [1, 0], [1, 1], [0.16, 1], [0, 0.5]],
  arrowRight: () => [[0, 0.25], [0.72, 0.25], [0.72, 0], [1, 0.5], [0.72, 1], [0.72, 0.75], [0, 0.75]],
  arrowLeft: () => [[1, 0.25], [1, 0.75], [0.28, 0.75], [0.28, 1], [0, 0.5], [0.28, 0], [0.28, 0.25]],
  arrowBoth: () => [[0, 0.5], [0.2, 0], [0.2, 0.25], [0.8, 0.25], [0.8, 0], [1, 0.5], [0.8, 1], [0.8, 0.75], [0.2, 0.75], [0.2, 1]],
  snip: () => [[0, 0], [0.86, 0], [1, 0.3], [1, 1], [0.14, 1], [0, 0.7]],
  folder: () => [[0, 0], [0.4, 0], [0.48, 0.2], [1, 0.2], [1, 1], [0, 1]],
  plaque,
  wave,
}

/** The outline of a shape in this box, or null when shapePath draws that shape in its own way. */
export function polygonOutline(shape: ShapeType, x: number, y: number, w: number, h: number): { x: number; y: number }[] | null {
  const outline = OUTLINES[shape]
  return outline ? outline().map(([px, py]) => ({ x: x + px * w, y: y + py * h })) : null
}
