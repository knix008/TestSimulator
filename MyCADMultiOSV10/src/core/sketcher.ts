// FreeCAD Sketcher workbench: 2D geometry, constraints, iterative solver, DoF.

export interface Point2 {
  x: number
  y: number
  fixed?: boolean
}

export type GeometryKind = 'point' | 'line' | 'circle' | 'arc'

export interface SketchGeometry {
  id: string
  kind: GeometryKind
  /** indices into the sketch point list */
  points: number[]
  /** circles and arcs */
  radius?: number
  construction?: boolean
}

export type ConstraintType =
  | 'coincident' | 'horizontal' | 'vertical' | 'distance' | 'distanceX' | 'distanceY'
  | 'radius' | 'diameter' | 'parallel' | 'perpendicular' | 'equal' | 'symmetric'
  | 'angle' | 'pointOnObject' | 'tangent' | 'block' | 'lock'

export interface SketchConstraintDef {
  id: string
  type: ConstraintType
  /** point indices or geometry ids depending on the type */
  points: number[]
  geometry?: string[]
  value?: number
}

export interface Sketch2D {
  name: string
  points: Point2[]
  geometry: SketchGeometry[]
  constraints: SketchConstraintDef[]
}

export function createSketch2D(name = 'Sketch'): Sketch2D {
  return { name, points: [], geometry: [], constraints: [] }
}

export function addPoint(sketch: Sketch2D, x: number, y: number, fixed = false): number {
  sketch.points.push({ x, y, fixed })
  return sketch.points.length - 1
}

export function addLine(sketch: Sketch2D, id: string, from: [number, number], to: [number, number], construction = false): SketchGeometry {
  const a = addPoint(sketch, from[0], from[1])
  const b = addPoint(sketch, to[0], to[1])
  const geometry: SketchGeometry = { id, kind: 'line', points: [a, b], construction }
  sketch.geometry.push(geometry)
  return geometry
}

export function addCircle(sketch: Sketch2D, id: string, center: [number, number], radius: number, construction = false): SketchGeometry {
  const c = addPoint(sketch, center[0], center[1])
  const geometry: SketchGeometry = { id, kind: 'circle', points: [c], radius, construction }
  sketch.geometry.push(geometry)
  return geometry
}

export function addArc(sketch: Sketch2D, id: string, center: [number, number], radius: number, start: [number, number], end: [number, number]): SketchGeometry {
  const c = addPoint(sketch, center[0], center[1])
  const s = addPoint(sketch, start[0], start[1])
  const e = addPoint(sketch, end[0], end[1])
  const geometry: SketchGeometry = { id, kind: 'arc', points: [c, s, e], radius }
  sketch.geometry.push(geometry)
  return geometry
}

export function addRectangle(sketch: Sketch2D, id: string, width: number, height: number): SketchGeometry[] {
  const w = width / 2
  const h = height / 2
  const corners: Array<[number, number]> = [[-w, -h], [w, -h], [w, h], [-w, h]]
  const indices = corners.map(([x, y]) => addPoint(sketch, x, y))
  const lines: SketchGeometry[] = []
  for (let i = 0; i < 4; i++) {
    const geometry: SketchGeometry = { id: `${id}-${i}`, kind: 'line', points: [indices[i], indices[(i + 1) % 4]] }
    sketch.geometry.push(geometry)
    lines.push(geometry)
  }
  // Rectangles come pre-constrained in FreeCAD: alternating horizontal / vertical.
  lines.forEach((line, index) => {
    sketch.constraints.push({
      id: `${id}-c${index}`,
      type: index % 2 === 0 ? 'horizontal' : 'vertical',
      points: line.points
    })
  })
  return lines
}

export function addConstraint(sketch: Sketch2D, constraint: SketchConstraintDef): Sketch2D {
  sketch.constraints.push(constraint)
  return sketch
}

function geometryOf(sketch: Sketch2D, id?: string): SketchGeometry | undefined {
  return id ? sketch.geometry.find((item) => item.id === id) : undefined
}

/** One residual per constraint; the solver drives these to zero. */
export function residuals(sketch: Sketch2D): number[] {
  const p = sketch.points
  const out: number[] = []
  for (const constraint of sketch.constraints) {
    const [i, j, k, l] = constraint.points
    switch (constraint.type) {
      case 'coincident':
        out.push(p[i].x - p[j].x, p[i].y - p[j].y)
        break
      case 'horizontal':
        out.push(p[i].y - p[j].y)
        break
      case 'vertical':
        out.push(p[i].x - p[j].x)
        break
      case 'distance':
        out.push(Math.hypot(p[j].x - p[i].x, p[j].y - p[i].y) - (constraint.value ?? 0))
        break
      case 'distanceX':
        out.push(p[j].x - p[i].x - (constraint.value ?? 0))
        break
      case 'distanceY':
        out.push(p[j].y - p[i].y - (constraint.value ?? 0))
        break
      case 'lock':
      case 'block':
        out.push(0)
        break
      case 'radius': {
        const geometry = geometryOf(sketch, constraint.geometry?.[0])
        out.push((geometry?.radius ?? 0) - (constraint.value ?? 0))
        break
      }
      case 'diameter': {
        const geometry = geometryOf(sketch, constraint.geometry?.[0])
        out.push((geometry?.radius ?? 0) * 2 - (constraint.value ?? 0))
        break
      }
      case 'parallel': {
        const cross = (p[j].x - p[i].x) * (p[l].y - p[k].y) - (p[j].y - p[i].y) * (p[l].x - p[k].x)
        out.push(cross)
        break
      }
      case 'perpendicular': {
        const dot = (p[j].x - p[i].x) * (p[l].x - p[k].x) + (p[j].y - p[i].y) * (p[l].y - p[k].y)
        out.push(dot)
        break
      }
      case 'equal': {
        const a = Math.hypot(p[j].x - p[i].x, p[j].y - p[i].y)
        const b = Math.hypot(p[l].x - p[k].x, p[l].y - p[k].y)
        out.push(a - b)
        break
      }
      case 'symmetric':
        out.push((p[i].x + p[j].x) / 2 - p[k].x, (p[i].y + p[j].y) / 2 - p[k].y)
        break
      case 'angle': {
        const a1 = Math.atan2(p[j].y - p[i].y, p[j].x - p[i].x)
        const a2 = Math.atan2(p[l].y - p[k].y, p[l].x - p[k].x)
        const target = ((constraint.value ?? 0) * Math.PI) / 180
        out.push(normalizeAngle(a2 - a1) - normalizeAngle(target))
        break
      }
      case 'pointOnObject': {
        // point i on the line j-k
        const cross = (p[k].x - p[j].x) * (p[i].y - p[j].y) - (p[k].y - p[j].y) * (p[i].x - p[j].x)
        const length = Math.hypot(p[k].x - p[j].x, p[k].y - p[j].y) || 1
        out.push(cross / length)
        break
      }
      case 'tangent': {
        const circle = geometryOf(sketch, constraint.geometry?.[0])
        const radius = circle?.radius ?? 0
        const center = p[i]
        const cross = (p[k].x - p[j].x) * (center.y - p[j].y) - (p[k].y - p[j].y) * (center.x - p[j].x)
        const length = Math.hypot(p[k].x - p[j].x, p[k].y - p[j].y) || 1
        out.push(Math.abs(cross / length) - radius)
        break
      }
      default:
        out.push(0)
    }
  }
  return out
}

function normalizeAngle(angle: number): number {
  let value = angle
  while (value > Math.PI) value -= Math.PI * 2
  while (value < -Math.PI) value += Math.PI * 2
  return value
}

export interface SolveResult {
  sketch: Sketch2D
  iterations: number
  error: number
  converged: boolean
  dof: number
}

/**
 * Solve the constraint system with damped Gauss-Newton on numerical gradients.
 * Fixed points and radius values driven by radius/diameter constraints are
 * respected; the residual norm reports how well the system is satisfied.
 */
export function solveSketch(input: Sketch2D, maxIterations = 200, tolerance = 1e-8): SolveResult {
  const sketch: Sketch2D = {
    ...input,
    points: input.points.map((point) => ({ ...point })),
    geometry: input.geometry.map((geometry) => ({ ...geometry, points: geometry.points.slice() })),
    constraints: input.constraints.map((constraint) => ({ ...constraint, points: constraint.points.slice() }))
  }
  // Radius and diameter constraints set the value directly.
  for (const constraint of sketch.constraints) {
    if (constraint.type !== 'radius' && constraint.type !== 'diameter') continue
    const geometry = geometryOf(sketch, constraint.geometry?.[0])
    if (!geometry) continue
    geometry.radius = constraint.type === 'radius' ? (constraint.value ?? geometry.radius) : (constraint.value ?? 0) / 2
  }
  const freeIndices: number[] = []
  sketch.points.forEach((point, index) => { if (!point.fixed) freeIndices.push(index) })
  const variables = freeIndices.length * 2
  const errorNorm = () => {
    const values = residuals(sketch)
    return Math.sqrt(values.reduce((acc, value) => acc + value * value, 0))
  }
  let error = errorNorm()
  let iterations = 0
  const step = 1e-5
  let damping = 0.6
  for (iterations = 1; iterations <= maxIterations && error > tolerance && variables > 0; iterations++) {
    const gradient = new Array(variables).fill(0)
    for (let v = 0; v < variables; v++) {
      const pointIndex = freeIndices[Math.floor(v / 2)]
      const axis = v % 2 === 0 ? 'x' : 'y'
      const original = sketch.points[pointIndex][axis]
      sketch.points[pointIndex][axis] = original + step
      const forward = errorNorm()
      sketch.points[pointIndex][axis] = original - step
      const backward = errorNorm()
      sketch.points[pointIndex][axis] = original
      gradient[v] = (forward - backward) / (2 * step)
    }
    const magnitude = Math.sqrt(gradient.reduce((acc, value) => acc + value * value, 0))
    if (magnitude < 1e-12) break
    const saved = sketch.points.map((point) => ({ ...point }))
    for (let v = 0; v < variables; v++) {
      const pointIndex = freeIndices[Math.floor(v / 2)]
      const axis = v % 2 === 0 ? 'x' : 'y'
      sketch.points[pointIndex][axis] -= (damping * error * gradient[v]) / magnitude
    }
    const next = errorNorm()
    if (next >= error) {
      sketch.points = saved
      damping *= 0.5
      if (damping < 1e-6) break
    } else {
      error = next
      damping = Math.min(1.2, damping * 1.1)
    }
  }
  return { sketch, iterations, error, converged: error <= Math.max(tolerance, 1e-6), dof: degreesOfFreedom(sketch) }
}

/** Sketcher status bar: remaining degrees of freedom. */
export function degreesOfFreedom(sketch: Sketch2D): number {
  const free = sketch.points.filter((point) => !point.fixed).length * 2
  let removed = 0
  for (const constraint of sketch.constraints) {
    switch (constraint.type) {
      case 'coincident':
      case 'symmetric':
        removed += 2
        break
      case 'block':
      case 'lock':
        removed += 2
        break
      default:
        removed += 1
    }
  }
  return Math.max(0, free - removed)
}

export function isFullyConstrained(sketch: Sketch2D): boolean {
  return degreesOfFreedom(sketch) === 0
}

/** Detect constraints that cannot all hold (redundant / conflicting). */
export function checkConstraints(sketch: Sketch2D): { redundant: string[]; conflicting: string[] } {
  const base = solveSketch(sketch, 120)
  const redundant: string[] = []
  const conflicting: string[] = []
  if (!base.converged) {
    for (const constraint of sketch.constraints) {
      const trimmed: Sketch2D = { ...sketch, constraints: sketch.constraints.filter((item) => item.id !== constraint.id) }
      const attempt = solveSketch(trimmed, 120)
      if (attempt.converged) conflicting.push(constraint.id)
    }
  }
  for (const constraint of sketch.constraints) {
    const trimmed: Sketch2D = { ...sketch, constraints: sketch.constraints.filter((item) => item.id !== constraint.id) }
    const attempt = solveSketch(trimmed, 120)
    if (attempt.converged && base.converged && Math.abs(attempt.dof - base.dof) === 0) redundant.push(constraint.id)
  }
  return { redundant, conflicting }
}

/** Convert the solved sketch into closed loops for padding / extruding. */
export function sketchLoops(sketch: Sketch2D): Array<Array<{ x: number; y: number }>> {
  const lines = sketch.geometry.filter((geometry) => geometry.kind === 'line' && !geometry.construction)
  const used = new Set<string>()
  const loops: Array<Array<{ x: number; y: number }>> = []
  for (const start of lines) {
    if (used.has(start.id)) continue
    const loop: Array<{ x: number; y: number }> = []
    let current = start
    let guard = 0
    let tail = current.points[1]
    loop.push({ ...sketch.points[current.points[0]] })
    used.add(current.id)
    while (guard++ < lines.length + 1) {
      loop.push({ ...sketch.points[tail] })
      const next = lines.find((line) => !used.has(line.id) && (line.points[0] === tail || line.points[1] === tail))
      if (!next) break
      used.add(next.id)
      tail = next.points[0] === tail ? next.points[1] : next.points[0]
      current = next
    }
    if (loop.length >= 3) loops.push(loop)
  }
  return loops
}

export function sketchExtent(sketch: Sketch2D): { width: number; height: number } {
  if (sketch.points.length === 0) return { width: 0, height: 0 }
  const xs = sketch.points.map((point) => point.x)
  const ys = sketch.points.map((point) => point.y)
  return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
}
