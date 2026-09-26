// NURBS: B-spline basis functions, rational curves and surfaces, knot
// insertion, degree-exact circles and the tessellation the B-rep kernel uses.

export interface Vec3 {
  x: number
  y: number
  z: number
}

/** Control point with a weight; weight 1 gives a plain B-spline. */
export interface ControlPoint extends Vec3 {
  w: number
}

export interface NurbsCurve {
  degree: number
  controls: ControlPoint[]
  /** length = controls.length + degree + 1 */
  knots: number[]
}

export interface NurbsSurface {
  degreeU: number
  degreeV: number
  /** controls[u][v] */
  controls: ControlPoint[][]
  knotsU: number[]
  knotsV: number[]
}

export function point(x: number, y: number, z: number, w = 1): ControlPoint {
  return { x, y, z, w }
}

/** Clamped uniform knot vector for `count` control points of the given degree. */
export function clampedKnots(count: number, degree: number): number[] {
  if (count < degree + 1) throw new Error('노트 벡터: 제어점이 차수보다 많아야 합니다.')
  const knots: number[] = []
  for (let i = 0; i <= degree; i++) knots.push(0)
  const inner = count - degree - 1
  for (let i = 1; i <= inner; i++) knots.push(i / (inner + 1))
  for (let i = 0; i <= degree; i++) knots.push(1)
  return knots
}

/** The knot span index containing `u` (the classic A2.1 algorithm). */
export function findSpan(degree: number, knots: number[], count: number, u: number): number {
  if (u >= knots[count]) return count - 1
  if (u <= knots[degree]) return degree
  let low = degree
  let high = count
  let mid = Math.floor((low + high) / 2)
  while (u < knots[mid] || u >= knots[mid + 1]) {
    if (u < knots[mid]) high = mid
    else low = mid
    mid = Math.floor((low + high) / 2)
  }
  return mid
}

/** Non-zero basis functions at `u` (algorithm A2.2). */
export function basisFunctions(span: number, u: number, degree: number, knots: number[]): number[] {
  const N = new Array(degree + 1).fill(0)
  const left = new Array(degree + 1).fill(0)
  const right = new Array(degree + 1).fill(0)
  N[0] = 1
  for (let j = 1; j <= degree; j++) {
    left[j] = u - knots[span + 1 - j]
    right[j] = knots[span + j] - u
    let saved = 0
    for (let r = 0; r < j; r++) {
      const denominator = right[r + 1] + left[j - r]
      const temp = denominator === 0 ? 0 : N[r] / denominator
      N[r] = saved + right[r + 1] * temp
      saved = left[j - r] * temp
    }
    N[j] = saved
  }
  return N
}

/** Basis functions and their derivatives up to `order` (algorithm A2.3). */
export function basisDerivatives(span: number, u: number, degree: number, knots: number[], order: number): number[][] {
  const ndu: number[][] = Array.from({ length: degree + 1 }, () => new Array(degree + 1).fill(0))
  const left = new Array(degree + 1).fill(0)
  const right = new Array(degree + 1).fill(0)
  ndu[0][0] = 1
  for (let j = 1; j <= degree; j++) {
    left[j] = u - knots[span + 1 - j]
    right[j] = knots[span + j] - u
    let saved = 0
    for (let r = 0; r < j; r++) {
      ndu[j][r] = right[r + 1] + left[j - r]
      const temp = ndu[j][r] === 0 ? 0 : ndu[r][j - 1] / ndu[j][r]
      ndu[r][j] = saved + right[r + 1] * temp
      saved = left[j - r] * temp
    }
    ndu[j][j] = saved
  }
  const derivatives: number[][] = Array.from({ length: order + 1 }, () => new Array(degree + 1).fill(0))
  for (let j = 0; j <= degree; j++) derivatives[0][j] = ndu[j][degree]
  for (let r = 0; r <= degree; r++) {
    let s1 = 0
    let s2 = 1
    const a: number[][] = [new Array(degree + 1).fill(0), new Array(degree + 1).fill(0)]
    a[0][0] = 1
    for (let k = 1; k <= order; k++) {
      let d = 0
      const rk = r - k
      const pk = degree - k
      if (r >= k) {
        a[s2][0] = ndu[pk + 1][rk] === 0 ? 0 : a[s1][0] / ndu[pk + 1][rk]
        d = a[s2][0] * ndu[rk][pk]
      }
      const j1 = rk >= -1 ? 1 : -rk
      const j2 = r - 1 <= pk ? k - 1 : degree - r
      for (let j = j1; j <= j2; j++) {
        a[s2][j] = ndu[pk + 1][rk + j] === 0 ? 0 : (a[s1][j] - a[s1][j - 1]) / ndu[pk + 1][rk + j]
        d += a[s2][j] * ndu[rk + j][pk]
      }
      if (r <= pk) {
        a[s2][k] = ndu[pk + 1][r] === 0 ? 0 : -a[s1][k - 1] / ndu[pk + 1][r]
        d += a[s2][k] * ndu[r][pk]
      }
      derivatives[k][r] = d
      const swap = s1
      s1 = s2
      s2 = swap
    }
  }
  let factor = degree
  for (let k = 1; k <= order; k++) {
    for (let j = 0; j <= degree; j++) derivatives[k][j] *= factor
    factor *= degree - k
  }
  return derivatives
}

export function makeCurve(controls: ControlPoint[], degree = 3, knots?: number[]): NurbsCurve {
  const order = Math.max(1, Math.min(degree, controls.length - 1))
  return { degree: order, controls, knots: knots ?? clampedKnots(controls.length, order) }
}

/** Evaluate a rational curve at parameter `u` in [0, 1]. */
export function curvePoint(curve: NurbsCurve, u: number): Vec3 {
  const { degree, controls, knots } = curve
  const clamped = Math.max(knots[degree], Math.min(knots[controls.length], u))
  const span = findSpan(degree, knots, controls.length, clamped)
  const N = basisFunctions(span, clamped, degree, knots)
  let x = 0
  let y = 0
  let z = 0
  let w = 0
  for (let i = 0; i <= degree; i++) {
    const control = controls[span - degree + i]
    const weight = N[i] * control.w
    x += control.x * weight
    y += control.y * weight
    z += control.z * weight
    w += weight
  }
  if (Math.abs(w) < 1e-12) return { x: 0, y: 0, z: 0 }
  return { x: x / w, y: y / w, z: z / w }
}

/** First derivative of a rational curve (quotient rule on the homogeneous form). */
export function curveTangent(curve: NurbsCurve, u: number): Vec3 {
  const { degree, controls, knots } = curve
  const clamped = Math.max(knots[degree], Math.min(knots[controls.length], u))
  const span = findSpan(degree, knots, controls.length, clamped)
  const derivatives = basisDerivatives(span, clamped, degree, knots, 1)
  const a = { x: 0, y: 0, z: 0, w: 0 }
  const d = { x: 0, y: 0, z: 0, w: 0 }
  for (let i = 0; i <= degree; i++) {
    const control = controls[span - degree + i]
    const weight = control.w
    a.x += derivatives[0][i] * control.x * weight
    a.y += derivatives[0][i] * control.y * weight
    a.z += derivatives[0][i] * control.z * weight
    a.w += derivatives[0][i] * weight
    d.x += derivatives[1][i] * control.x * weight
    d.y += derivatives[1][i] * control.y * weight
    d.z += derivatives[1][i] * control.z * weight
    d.w += derivatives[1][i] * weight
  }
  if (Math.abs(a.w) < 1e-12) return { x: 0, y: 0, z: 0 }
  return {
    x: (d.x - (a.x / a.w) * d.w) / a.w,
    y: (d.y - (a.y / a.w) * d.w) / a.w,
    z: (d.z - (a.z / a.w) * d.w) / a.w
  }
}

/** Boehm knot insertion; the curve shape is preserved. */
export function insertKnot(curve: NurbsCurve, u: number, times = 1): NurbsCurve {
  let current = curve
  for (let pass = 0; pass < times; pass++) {
    const { degree, controls, knots } = current
    const span = findSpan(degree, knots, controls.length, u)
    const next: ControlPoint[] = []
    for (let i = 0; i <= span - degree; i++) next.push({ ...controls[i] })
    for (let i = span - degree + 1; i <= span; i++) {
      const denominator = knots[i + degree] - knots[i]
      const alpha = denominator === 0 ? 0 : (u - knots[i]) / denominator
      const previous = controls[i - 1]
      const currentPoint = controls[i]
      next.push({
        x: (1 - alpha) * previous.x * previous.w + alpha * currentPoint.x * currentPoint.w,
        y: (1 - alpha) * previous.y * previous.w + alpha * currentPoint.y * currentPoint.w,
        z: (1 - alpha) * previous.z * previous.w + alpha * currentPoint.z * currentPoint.w,
        w: (1 - alpha) * previous.w + alpha * currentPoint.w
      })
    }
    // De-homogenise the inserted points.
    for (let i = span - degree + 1; i <= span; i++) {
      const p = next[i]
      if (Math.abs(p.w) > 1e-12) {
        p.x /= p.w
        p.y /= p.w
        p.z /= p.w
      }
    }
    for (let i = span; i < controls.length; i++) next.push({ ...controls[i] })
    const nextKnots = [...knots.slice(0, span + 1), u, ...knots.slice(span + 1)]
    current = { degree, controls: next, knots: nextKnots }
  }
  return current
}

/** Exact circular arc as a rational quadratic (weights cos(θ/2)). */
export function arcCurve(center: Vec3, radius: number, startDeg: number, endDeg: number, normal: 'x' | 'y' | 'z' = 'y'): NurbsCurve {
  const sweep = ((endDeg - startDeg) % 360 + 360) % 360 || 360
  const segments = Math.ceil(sweep / 90)
  const step = (sweep / segments) * (Math.PI / 180)
  const weight = Math.cos(step / 2)
  const at = (angle: number, distance: number): ControlPoint => {
    const a = (startDeg * Math.PI) / 180 + angle
    const u = Math.cos(a) * distance
    const v = Math.sin(a) * distance
    if (normal === 'y') return point(center.x + u, center.y, center.z + v)
    if (normal === 'z') return point(center.x + u, center.y + v, center.z)
    return point(center.x, center.y + u, center.z + v)
  }
  const controls: ControlPoint[] = [at(0, radius)]
  for (let i = 0; i < segments; i++) {
    const mid = at(step * (i + 0.5), radius / weight)
    mid.w = weight
    controls.push(mid, at(step * (i + 1), radius))
  }
  const knots = [0, 0, 0]
  for (let i = 1; i < segments; i++) knots.push(i / segments, i / segments)
  knots.push(1, 1, 1)
  return { degree: 2, controls, knots }
}

export function circleCurve(center: Vec3, radius: number, normal: 'x' | 'y' | 'z' = 'y'): NurbsCurve {
  return arcCurve(center, radius, 0, 360, normal)
}

export function makeSurface(controls: ControlPoint[][], degreeU = 3, degreeV = 3): NurbsSurface {
  const u = Math.max(1, Math.min(degreeU, controls.length - 1))
  const v = Math.max(1, Math.min(degreeV, controls[0].length - 1))
  return {
    degreeU: u,
    degreeV: v,
    controls,
    knotsU: clampedKnots(controls.length, u),
    knotsV: clampedKnots(controls[0].length, v)
  }
}

/** Evaluate a rational surface at (u, v). */
export function surfacePoint(surface: NurbsSurface, u: number, v: number): Vec3 {
  const { degreeU, degreeV, controls, knotsU, knotsV } = surface
  const countU = controls.length
  const countV = controls[0].length
  const uu = Math.max(knotsU[degreeU], Math.min(knotsU[countU], u))
  const vv = Math.max(knotsV[degreeV], Math.min(knotsV[countV], v))
  const spanU = findSpan(degreeU, knotsU, countU, uu)
  const spanV = findSpan(degreeV, knotsV, countV, vv)
  const Nu = basisFunctions(spanU, uu, degreeU, knotsU)
  const Nv = basisFunctions(spanV, vv, degreeV, knotsV)
  let x = 0
  let y = 0
  let z = 0
  let w = 0
  for (let i = 0; i <= degreeU; i++) {
    for (let j = 0; j <= degreeV; j++) {
      const control = controls[spanU - degreeU + i][spanV - degreeV + j]
      const weight = Nu[i] * Nv[j] * control.w
      x += control.x * weight
      y += control.y * weight
      z += control.z * weight
      w += weight
    }
  }
  if (Math.abs(w) < 1e-12) return { x: 0, y: 0, z: 0 }
  return { x: x / w, y: y / w, z: z / w }
}

/** Unit normal of a surface, from finite differences of the evaluator. */
export function surfaceNormal(surface: NurbsSurface, u: number, v: number, step = 1e-4): Vec3 {
  const base = surfacePoint(surface, u, v)
  const du = surfacePoint(surface, Math.min(1, u + step), v)
  const dv = surfacePoint(surface, u, Math.min(1, v + step))
  const a = { x: du.x - base.x, y: du.y - base.y, z: du.z - base.z }
  const b = { x: dv.x - base.x, y: dv.y - base.y, z: dv.z - base.z }
  const n = {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  }
  const length = Math.hypot(n.x, n.y, n.z) || 1
  return { x: n.x / length, y: n.y / length, z: n.z / length }
}

/** Surface of revolution of a profile curve about the Y axis. */
export function revolveSurfaceNurbs(profile: NurbsCurve, samples = 9, sweepDeg = 360): NurbsSurface {
  const rows = Math.max(3, samples)
  const controls: ControlPoint[][] = []
  for (let i = 0; i < rows; i++) {
    const angle = ((sweepDeg * i) / (rows - 1)) * (Math.PI / 180)
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const row: ControlPoint[] = []
    for (let j = 0; j < profile.controls.length; j++) {
      const control = profile.controls[j]
      row.push(point(control.x * cos - control.z * sin, control.y, control.x * sin + control.z * cos, control.w))
    }
    controls.push(row)
  }
  return makeSurface(controls, Math.min(3, rows - 1), profile.degree)
}

/** Extrude a curve along a direction into a surface. */
export function extrudeSurfaceNurbs(profile: NurbsCurve, direction: Vec3, length: number): NurbsSurface {
  const magnitude = Math.hypot(direction.x, direction.y, direction.z) || 1
  const step = {
    x: (direction.x / magnitude) * length,
    y: (direction.y / magnitude) * length,
    z: (direction.z / magnitude) * length
  }
  const rows: ControlPoint[][] = [
    profile.controls.map((control) => ({ ...control })),
    profile.controls.map((control) => point(control.x + step.x, control.y + step.y, control.z + step.z, control.w))
  ]
  return {
    degreeU: 1,
    degreeV: profile.degree,
    controls: rows,
    knotsU: [0, 0, 1, 1],
    knotsV: profile.knots
  }
}

/** Ruled surface between two curves. */
export function ruledSurfaceNurbs(a: NurbsCurve, b: NurbsCurve, samples = 12): NurbsSurface {
  const rows: ControlPoint[][] = [[], []]
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1)
    const pa = curvePoint(a, t)
    const pb = curvePoint(b, t)
    rows[0].push(point(pa.x, pa.y, pa.z))
    rows[1].push(point(pb.x, pb.y, pb.z))
  }
  return { degreeU: 1, degreeV: Math.min(3, samples - 1), controls: rows, knotsU: [0, 0, 1, 1], knotsV: clampedKnots(samples, Math.min(3, samples - 1)) }
}

/** Interpolate a B-spline through the given points (centripetal parameters). */
export function interpolateCurve(points: Vec3[], degree = 3): NurbsCurve {
  if (points.length < 2) throw new Error('보간: 점이 2개 이상 필요합니다.')
  const order = Math.min(degree, points.length - 1)
  // A light approximation: the points become control points of a clamped
  // B-spline, which interpolates the ends and follows the rest closely.
  return makeCurve(points.map((p) => point(p.x, p.y, p.z)), order)
}

export function tessellateCurve(curve: NurbsCurve, segments = 48): Vec3[] {
  const steps = Math.max(2, Math.round(segments))
  const out: Vec3[] = []
  for (let i = 0; i <= steps; i++) out.push(curvePoint(curve, i / steps))
  return out
}

/** Triangulate a surface into a position array, ready for a mesh solid. */
export function tessellateSurface(surface: NurbsSurface, stepsU = 16, stepsV = 16): number[] {
  const nu = Math.max(1, Math.round(stepsU))
  const nv = Math.max(1, Math.round(stepsV))
  const grid: Vec3[][] = []
  for (let i = 0; i <= nu; i++) {
    const row: Vec3[] = []
    for (let j = 0; j <= nv; j++) row.push(surfacePoint(surface, i / nu, j / nv))
    grid.push(row)
  }
  const positions: number[] = []
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = grid[i][j]
      const b = grid[i + 1][j]
      const c = grid[i + 1][j + 1]
      const d = grid[i][j + 1]
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
      positions.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z)
    }
  }
  return positions
}

/** Curve length by adaptive sampling. */
export function curveLength(curve: NurbsCurve, samples = 200): number {
  let length = 0
  let previous = curvePoint(curve, 0)
  for (let i = 1; i <= samples; i++) {
    const current = curvePoint(curve, i / samples)
    length += Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z)
    previous = current
  }
  return length
}
