// A small boundary-representation kernel: faces carry a plane and an ordered
// loop, edges are derived from the shared vertices, and the modelling
// operations (chamfer by half-space clipping, constant-radius fillet as a
// Minkowski sum with a ball) are exact for convex solids rather than bevelled
// approximations.
import type { Solid, Vec3 } from './model'
import { trianglePositions } from './primitives'
import { tessellateSurface, type NurbsSurface } from './nurbs'

export interface Plane {
  normal: Vec3
  /** plane equation: normal · p = offset */
  offset: number
}

export interface BrepFace {
  id: string
  plane: Plane
  /** ordered loop, counter-clockwise seen from outside */
  loop: Vec3[]
}

export interface Brep {
  faces: BrepFace[]
}

export interface BrepEdge {
  a: Vec3
  b: Vec3
  faces: [number, number]
  /** exterior angle between the two faces, radians */
  angle: number
}

const EPS = 1e-7

/* ────────────────────────────── vector maths ────────────────────────────── */

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

export function scale(a: Vec3, factor: number): Vec3 {
  return { x: a.x * factor, y: a.y * factor, z: a.z * factor }
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }
}

export function length(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z)
}

export function normalize(a: Vec3): Vec3 {
  const size = length(a) || 1
  return { x: a.x / size, y: a.y / size, z: a.z / size }
}

function key(point: Vec3): string {
  return `${point.x.toFixed(5)},${point.y.toFixed(5)},${point.z.toFixed(5)}`
}

/** Flip any face that points inwards; exact for convex shells. */
export function orientOutward(brep: Brep): Brep {
  const vertices = brepVertices(brep)
  if (vertices.length === 0) return brep
  const centroid = vertices.reduce(
    (acc, vertex) => add(acc, scale(vertex, 1 / vertices.length)),
    { x: 0, y: 0, z: 0 }
  )
  return {
    faces: brep.faces.map((face) => {
      const center = face.loop.reduce((acc, point) => add(acc, scale(point, 1 / face.loop.length)), { x: 0, y: 0, z: 0 })
      if (dot(face.plane.normal, sub(center, centroid)) >= 0) return face
      const loop = [...face.loop].reverse()
      const normal = scale(face.plane.normal, -1)
      return { id: face.id, plane: { normal, offset: dot(normal, loop[0]) }, loop }
    })
  }
}

/* ────────────────────────────── construction ────────────────────────────── */

function faceFromLoop(id: string, loop: Vec3[]): BrepFace {
  const normal = normalize(cross(sub(loop[1], loop[0]), sub(loop[2], loop[0])))
  return { id, plane: { normal, offset: dot(normal, loop[0]) }, loop }
}

/** Axis-aligned box as a B-rep with six planar faces. */
export function brepBox(width: number, height: number, depth: number, center: Vec3 = { x: 0, y: 0, z: 0 }): Brep {
  const w = width / 2
  const h = height / 2
  const d = depth / 2
  const v = (x: number, y: number, z: number): Vec3 => ({ x: center.x + x * w, y: center.y + y * h, z: center.z + z * d })
  return {
    faces: [
      faceFromLoop('right', [v(1, -1, -1), v(1, 1, -1), v(1, 1, 1), v(1, -1, 1)]),
      faceFromLoop('left', [v(-1, -1, 1), v(-1, 1, 1), v(-1, 1, -1), v(-1, -1, -1)]),
      faceFromLoop('top', [v(-1, 1, -1), v(-1, 1, 1), v(1, 1, 1), v(1, 1, -1)]),
      faceFromLoop('bottom', [v(-1, -1, 1), v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1)]),
      faceFromLoop('front', [v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1)]),
      faceFromLoop('back', [v(1, -1, -1), v(-1, -1, -1), v(-1, 1, -1), v(1, 1, -1)])
    ]
  }
}

/** Regular prism (n-gon extruded along Y) as a B-rep. */
export function brepPrism(sides: number, radius: number, height: number, center: Vec3 = { x: 0, y: 0, z: 0 }): Brep {
  const n = Math.max(3, Math.round(sides))
  const h = height / 2
  const ring = (y: number): Vec3[] =>
    Array.from({ length: n }, (_, i) => {
      const a = (Math.PI * 2 * i) / n
      return { x: center.x + Math.cos(a) * radius, y: center.y + y, z: center.z + Math.sin(a) * radius }
    })
  const bottom = ring(-h)
  const top = ring(h)
  const faces: BrepFace[] = [
    faceFromLoop('top', top),
    faceFromLoop('bottom', bottom)
  ]
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    faces.push(faceFromLoop(`side-${i}`, [bottom[i], bottom[j], top[j], top[i]]))
  }
  return orientOutward({ faces })
}

/**
 * Sew a mesh solid into a B-rep by merging coplanar triangles into faces.
 * Works for the flat-faced solids the modeller produces; curved shapes keep
 * one face per triangle.
 */
export function brepFromSolid(solid: Solid): Brep {
  const positions = trianglePositions(solid)
  const groups = new Map<string, { plane: Plane; triangles: Vec3[][] }>()
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const tri: Vec3[] = [
      { x: positions[i], y: positions[i + 1], z: positions[i + 2] },
      { x: positions[i + 3], y: positions[i + 4], z: positions[i + 5] },
      { x: positions[i + 6], y: positions[i + 7], z: positions[i + 8] }
    ]
    const normal = normalize(cross(sub(tri[1], tri[0]), sub(tri[2], tri[0])))
    if (!Number.isFinite(normal.x)) continue
    const offset = dot(normal, tri[0])
    const planeKey = `${normal.x.toFixed(3)},${normal.y.toFixed(3)},${normal.z.toFixed(3)},${offset.toFixed(3)}`
    const found = groups.get(planeKey)
    if (found) found.triangles.push(tri)
    else groups.set(planeKey, { plane: { normal, offset }, triangles: [tri] })
  }
  const faces: BrepFace[] = []
  let index = 0
  groups.forEach((group) => {
    const loop = outerLoop(group.triangles, group.plane)
    if (loop.length >= 3) faces.push({ id: `face-${index++}`, plane: group.plane, loop })
  })
  return orientOutward({ faces })
}

/** Boundary of a coplanar triangle patch: edges that appear exactly once. */
function outerLoop(triangles: Vec3[][], plane: Plane): Vec3[] {
  const counts = new Map<string, { a: Vec3; b: Vec3; count: number }>()
  for (const tri of triangles) {
    for (let e = 0; e < 3; e++) {
      const a = tri[e]
      const b = tri[(e + 1) % 3]
      const ka = key(a)
      const kb = key(b)
      const id = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
      const found = counts.get(id)
      if (found) found.count += 1
      else counts.set(id, { a, b, count: 1 })
    }
  }
  const border: Array<{ a: Vec3; b: Vec3 }> = []
  counts.forEach((entry) => { if (entry.count === 1) border.push({ a: entry.a, b: entry.b }) })
  if (border.length < 3) return []
  // Walk the border edges into a loop.
  const byStart = new Map<string, Array<{ a: Vec3; b: Vec3 }>>()
  for (const edge of border) {
    const list = byStart.get(key(edge.a)) ?? []
    list.push(edge)
    byStart.set(key(edge.a), list)
    const reverse = byStart.get(key(edge.b)) ?? []
    reverse.push({ a: edge.b, b: edge.a })
    byStart.set(key(edge.b), reverse)
  }
  const loop: Vec3[] = [border[0].a]
  const used = new Set<string>()
  let current = border[0].a
  for (let guard = 0; guard < border.length + 1; guard++) {
    const options = byStart.get(key(current)) ?? []
    const next = options.find((edge) => !used.has(`${key(edge.a)}->${key(edge.b)}`) && !used.has(`${key(edge.b)}->${key(edge.a)}`))
    if (!next) break
    used.add(`${key(next.a)}->${key(next.b)}`)
    if (key(next.b) === key(loop[0])) break
    loop.push(next.b)
    current = next.b
  }
  // Orient counter-clockwise around the face normal.
  let area = 0
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]
    const b = loop[(i + 1) % loop.length]
    area += dot(plane.normal, cross(a, b)) / 2
  }
  return area < 0 ? loop.reverse() : loop
}

/* ────────────────────────────── topology ────────────────────────────────── */

export function brepVertices(brep: Brep): Vec3[] {
  const seen = new Map<string, Vec3>()
  for (const face of brep.faces) for (const point of face.loop) seen.set(key(point), point)
  return [...seen.values()]
}

/** Edges with their two adjacent faces and the exterior angle between them. */
export function brepEdges(brep: Brep): BrepEdge[] {
  const map = new Map<string, { a: Vec3; b: Vec3; faces: number[] }>()
  brep.faces.forEach((face, index) => {
    for (let i = 0; i < face.loop.length; i++) {
      const a = face.loop[i]
      const b = face.loop[(i + 1) % face.loop.length]
      const ka = key(a)
      const kb = key(b)
      const id = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
      const found = map.get(id)
      if (found) found.faces.push(index)
      else map.set(id, { a, b, faces: [index] })
    }
  })
  const edges: BrepEdge[] = []
  map.forEach((entry) => {
    if (entry.faces.length !== 2) return
    const n1 = brep.faces[entry.faces[0]].plane.normal
    const n2 = brep.faces[entry.faces[1]].plane.normal
    const angle = Math.acos(Math.max(-1, Math.min(1, dot(n1, n2))))
    edges.push({ a: entry.a, b: entry.b, faces: [entry.faces[0], entry.faces[1]], angle })
  })
  return edges
}

export interface BrepCheck {
  vertices: number
  edges: number
  faces: number
  eulerCharacteristic: number
  closed: boolean
  convex: boolean
  manifold: boolean
}

/** Validate the shell: Euler characteristic, manifoldness and convexity. */
export function checkBrep(brep: Brep): BrepCheck {
  const vertices = brepVertices(brep)
  const edges = brepEdges(brep)
  const halfEdges = brep.faces.reduce((acc, face) => acc + face.loop.length, 0)
  const manifold = edges.length * 2 === halfEdges
  let convex = true
  for (const face of brep.faces) {
    for (const vertex of vertices) {
      if (dot(face.plane.normal, vertex) > face.plane.offset + 1e-4) convex = false
    }
  }
  return {
    vertices: vertices.length,
    edges: edges.length,
    faces: brep.faces.length,
    eulerCharacteristic: vertices.length - edges.length + brep.faces.length,
    closed: manifold,
    convex,
    manifold
  }
}

/** Tessellate the B-rep into a triangle position array. */
export function tessellateBrep(brep: Brep): number[] {
  const positions: number[] = []
  for (const face of brep.faces) {
    for (let i = 1; i + 1 < face.loop.length; i++) {
      const a = face.loop[0]
      const b = face.loop[i]
      const c = face.loop[i + 1]
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
    }
  }
  return positions
}

/** Volume via the divergence theorem over the tessellation. */
export function brepVolume(brep: Brep): number {
  const positions = tessellateBrep(brep)
  let volume = 0
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const ax = positions[i], ay = positions[i + 1], az = positions[i + 2]
    const bx = positions[i + 3], by = positions[i + 4], bz = positions[i + 5]
    const cx = positions[i + 6], cy = positions[i + 7], cz = positions[i + 8]
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  return Math.abs(volume)
}

export function brepArea(brep: Brep): number {
  let area = 0
  for (const face of brep.faces) {
    for (let i = 1; i + 1 < face.loop.length; i++) {
      const ab = sub(face.loop[i], face.loop[0])
      const ac = sub(face.loop[i + 1], face.loop[0])
      area += length(cross(ab, ac)) / 2
    }
  }
  return area
}

/** Total edge length weighted by the exterior angle, the Steiner mean width term. */
export function meanCurvatureIntegral(brep: Brep): number {
  return brepEdges(brep).reduce((acc, edge) => acc + length(sub(edge.b, edge.a)) * edge.angle, 0) / 2
}

/* ───────────────────────────── modelling ops ────────────────────────────── */

/**
 * Clip a B-rep with a half-space (keeping `normal · p <= offset`).
 *
 * Every clipped face contributes one segment of the new cut face, and those
 * segments are chained into its loop, so the result stays a valid shell even
 * after a long cascade of cuts.
 */
export function clipConvex(brep: Brep, plane: Plane, id = 'cut'): Brep {
  const faces: BrepFace[] = []
  const segments: Array<[Vec3, Vec3]> = []
  for (const face of brep.faces) {
    const kept: Vec3[] = []
    const onPlane: Vec3[] = []
    for (let i = 0; i < face.loop.length; i++) {
      const current = face.loop[i]
      const next = face.loop[(i + 1) % face.loop.length]
      const dCurrent = dot(plane.normal, current) - plane.offset
      const dNext = dot(plane.normal, next) - plane.offset
      if (dCurrent <= EPS) {
        kept.push(current)
        if (dCurrent >= -EPS) onPlane.push(current)
      }
      if ((dCurrent > EPS && dNext < -EPS) || (dCurrent < -EPS && dNext > EPS)) {
        const t = dCurrent / (dCurrent - dNext)
        const crossing = add(current, scale(sub(next, current), t))
        kept.push(crossing)
        onPlane.push(crossing)
      }
    }
    const cleaned = cleanLoop(kept)
    if (cleaned.length >= 3) faces.push({ id: face.id, plane: face.plane, loop: cleaned })
    const border = cleanLoop(onPlane)
    if (border.length === 2) segments.push([border[0], border[1]])
  }
  const loop = chainSegments(segments)
  if (loop.length >= 3) faces.push({ id, plane, loop: orientLoop(loop, plane.normal) })
  return { faces }
}

/** Chain unordered segments that share endpoints into a single closed loop. */
function chainSegments(segments: Array<[Vec3, Vec3]>): Vec3[] {
  if (segments.length < 3) return []
  const remaining = segments.slice()
  const first = remaining.shift() as [Vec3, Vec3]
  const loop: Vec3[] = [first[0], first[1]]
  for (let guard = 0; guard < segments.length + 2 && remaining.length > 0; guard++) {
    const tail = loop[loop.length - 1]
    const index = remaining.findIndex((segment) =>
      length(sub(segment[0], tail)) < 1e-6 || length(sub(segment[1], tail)) < 1e-6)
    if (index < 0) break
    const [segment] = remaining.splice(index, 1)
    const next = length(sub(segment[0], tail)) < 1e-6 ? segment[1] : segment[0]
    if (length(sub(next, loop[0])) < 1e-6) break
    loop.push(next)
  }
  return loop.length >= 3 ? loop : []
}

/** Wind a planar loop counter-clockwise around `normal`. */
function orientLoop(loop: Vec3[], normal: Vec3): Vec3[] {
  let area = 0
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]
    const b = loop[(i + 1) % loop.length]
    area += dot(normal, cross(a, b)) / 2
  }
  return area < 0 ? [...loop].reverse() : loop
}

/** Drop consecutive duplicates from a face loop. */
function cleanLoop(loop: Vec3[], tolerance = 1e-6): Vec3[] {
  const out: Vec3[] = []
  for (const point of loop) {
    const last = out[out.length - 1]
    if (last && length(sub(last, point)) < tolerance) continue
    out.push(point)
  }
  while (out.length > 1 && length(sub(out[0], out[out.length - 1])) < tolerance) out.pop()
  return out
}

/**
 * Chamfer every edge of a convex solid by `distance`, measured along each of
 * the two faces. Each edge contributes one clipping half-space, so the result
 * is an exact polyhedron - not a bevelled extrusion.
 */
export function chamferBrep(brep: Brep, distance: number): Brep {
  const edges = brepEdges(brep)
  let current = brep
  edges.forEach((edge, index) => {
    if (edge.angle < 1e-6) return
    const n1 = brep.faces[edge.faces[0]].plane.normal
    const n2 = brep.faces[edge.faces[1]].plane.normal
    const sum = add(n1, n2)
    const magnitude = length(sum)
    if (magnitude < 1e-9) return
    const normal = scale(sum, 1 / magnitude)
    const offset = dot(normal, edge.a) - distance * (magnitude / 2)
    current = clipConvex(current, { normal, offset }, `chamfer-${index}`)
  })
  return current
}

/** Shrink a convex solid by moving every face plane inward by `distance`. */
export function offsetConvex(brep: Brep, distance: number): Brep {
  const planes = brep.faces.map((face) => ({
    normal: face.plane.normal,
    offset: face.plane.offset + distance
  }))
  return brepFromPlanes(planes, brep)
}

/** Rebuild a convex solid from its face planes by clipping a large cube. */
export function brepFromPlanes(planes: Plane[], reference: Brep): Brep {
  const vertices = brepVertices(reference)
  const extent = vertices.reduce((acc, vertex) => Math.max(acc, Math.abs(vertex.x), Math.abs(vertex.y), Math.abs(vertex.z)), 1)
  let current = brepBox(extent * 8, extent * 8, extent * 8)
  planes.forEach((plane, index) => {
    current = clipConvex(current, plane, `face-${index}`)
  })
  return current
}

/** Emit a triangle wound so that its normal points along `outward`. */
function pushTriangle(out: number[], a: Vec3, b: Vec3, c: Vec3, outward: Vec3) {
  const normal = cross(sub(b, a), sub(c, a))
  if (dot(normal, outward) >= 0) out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  else out.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z)
}

export interface FilletResult {
  positions: number[]
  /** the shrunk core the ball rolls over */
  core: Brep
  radius: number
}

/**
 * Constant-radius fillet of a convex solid: the result is the Minkowski sum of
 * the solid shrunk by `radius` with a ball of that radius, i.e. flat faces,
 * cylindrical edge blends and spherical corners. Its volume follows Steiner's
 * formula, which the tests check.
 */
export function filletBrep(brep: Brep, radius: number, segments = 8): FilletResult {
  const core = offsetConvex(brep, -radius)
  const positions: number[] = []
  const steps = Math.max(2, Math.round(segments))

  // Flat faces, pushed out along their normal.
  for (const face of core.faces) {
    const loop = face.loop.map((point) => add(point, scale(face.plane.normal, radius)))
    for (let i = 1; i + 1 < loop.length; i++) {
      pushTriangle(positions, loop[0], loop[i], loop[i + 1], face.plane.normal)
    }
  }

  // Cylindrical blends along every edge.
  const edges = brepEdges(core)
  for (const edge of edges) {
    const n1 = core.faces[edge.faces[0]].plane.normal
    const n2 = core.faces[edge.faces[1]].plane.normal
    const axis = normalize(sub(edge.b, edge.a))
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps
      const t1 = (s + 1) / steps
      const d0 = slerp(n1, n2, t0, axis)
      const d1 = slerp(n1, n2, t1, axis)
      const a0 = add(edge.a, scale(d0, radius))
      const a1 = add(edge.a, scale(d1, radius))
      const b0 = add(edge.b, scale(d0, radius))
      const b1 = add(edge.b, scale(d1, radius))
      const outward = normalize(add(d0, d1))
      pushTriangle(positions, a0, b0, b1, outward)
      pushTriangle(positions, a0, b1, a1, outward)
    }
  }

  // Spherical patches at the corners.
  const cornerNormals = new Map<string, { point: Vec3; normals: Vec3[] }>()
  core.faces.forEach((face) => {
    for (const vertex of face.loop) {
      const id = key(vertex)
      const found = cornerNormals.get(id)
      if (found) found.normals.push(face.plane.normal)
      else cornerNormals.set(id, { point: vertex, normals: [face.plane.normal] })
    }
  })
  cornerNormals.forEach((corner) => {
    if (corner.normals.length < 3) return
    const average = normalize(corner.normals.reduce((acc, normal) => add(acc, normal), { x: 0, y: 0, z: 0 }))
    for (let i = 0; i < corner.normals.length; i++) {
      const n1 = corner.normals[i]
      const n2 = corner.normals[(i + 1) % corner.normals.length]
      subdivideSpherical(positions, corner.point, radius, average, n1, n2, 2)
    }
  })

  return { positions, core, radius }
}

/** Great-circle interpolation between two unit normals around an axis. */
function slerp(a: Vec3, b: Vec3, t: number, axis: Vec3): Vec3 {
  const pa = normalize(sub(a, scale(axis, dot(a, axis))))
  const pb = normalize(sub(b, scale(axis, dot(b, axis))))
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(pa, pb))))
  if (angle < 1e-9) return pa
  const sinAngle = Math.sin(angle)
  return normalize(add(
    scale(pa, Math.sin((1 - t) * angle) / sinAngle),
    scale(pb, Math.sin(t * angle) / sinAngle)
  ))
}

function subdivideSpherical(out: number[], center: Vec3, radius: number, a: Vec3, b: Vec3, c: Vec3, depth: number) {
  if (depth <= 0) {
    const pa = add(center, scale(a, radius))
    const pb = add(center, scale(b, radius))
    const pc = add(center, scale(c, radius))
    pushTriangle(out, pa, pb, pc, normalize(add(add(a, b), c)))
    return
  }
  const ab = normalize(add(a, b))
  const bc = normalize(add(b, c))
  const ca = normalize(add(c, a))
  subdivideSpherical(out, center, radius, a, ab, ca, depth - 1)
  subdivideSpherical(out, center, radius, ab, b, bc, depth - 1)
  subdivideSpherical(out, center, radius, ca, bc, c, depth - 1)
  subdivideSpherical(out, center, radius, ab, bc, ca, depth - 1)
}

/**
 * Volume of the rounded solid predicted by Steiner's formula:
 * V(K ⊕ rB) = V + r·A + r²·M + (4/3)πr³.
 */
export function steinerVolume(core: Brep, radius: number): number {
  return brepVolume(core) + radius * brepArea(core) + radius * radius * meanCurvatureIntegral(core) + (4 / 3) * Math.PI * Math.pow(radius, 3)
}

/** Add a tessellated NURBS surface to a B-rep as one face per quad strip. */
export function positionsFromSurface(surface: NurbsSurface, stepsU = 16, stepsV = 16): number[] {
  return tessellateSurface(surface, stepsU, stepsV)
}
