// FreeCAD Mesh, Points and Reverse Engineering workbenches.
import * as THREE from 'three'
import type { Solid, Vec3 } from './model'
import { boundingBoxOf, meshSolidFrom, surfaceArea, trianglePositions } from './primitives'
import { solidVolume } from './part'

export interface MeshInfo {
  triangles: number
  vertices: number
  uniqueVertices: number
  boundaryEdges: number
  closed: boolean
  area: number
  volume: number
  degenerate: number
}

function key(x: number, y: number, z: number): string {
  return `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`
}

/** Mesh > Analyze > Evaluate & repair: topology report for a mesh solid. */
export function meshInfo(solid: Solid): MeshInfo {
  const positions = trianglePositions(solid)
  const triangles = Math.floor(positions.length / 9)
  const vertexKeys = new Set<string>()
  const edges = new Map<string, number>()
  let degenerate = 0
  for (let i = 0; i < triangles * 9; i += 9) {
    const points: Array<[number, number, number]> = [
      [positions[i], positions[i + 1], positions[i + 2]],
      [positions[i + 3], positions[i + 4], positions[i + 5]],
      [positions[i + 6], positions[i + 7], positions[i + 8]]
    ]
    const keys = points.map(([x, y, z]) => key(x, y, z))
    keys.forEach((k) => vertexKeys.add(k))
    if (keys[0] === keys[1] || keys[1] === keys[2] || keys[0] === keys[2]) degenerate += 1
    for (let e = 0; e < 3; e++) {
      const a = keys[e]
      const b = keys[(e + 1) % 3]
      const edge = a < b ? `${a}|${b}` : `${b}|${a}`
      edges.set(edge, (edges.get(edge) ?? 0) + 1)
    }
  }
  let boundaryEdges = 0
  edges.forEach((count) => { if (count === 1) boundaryEdges += 1 })
  return {
    triangles,
    vertices: triangles * 3,
    uniqueVertices: vertexKeys.size,
    boundaryEdges,
    closed: triangles > 0 && boundaryEdges === 0,
    area: surfaceArea(solid),
    volume: solidVolume(solid),
    degenerate
  }
}

/** Mesh > Decimation: drop triangles smaller than a share of the mean area. */
export function decimateMesh(solid: Solid, ratio: number, id: string): Solid {
  const positions = trianglePositions(solid)
  const triangles: Array<{ area: number; data: number[] }> = []
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const data = positions.slice(i, i + 9)
    triangles.push({ area: triangleArea(data), data })
  }
  const keep = Math.max(1, Math.round(triangles.length * Math.max(0.05, Math.min(1, ratio))))
  const sorted = [...triangles].sort((a, b) => b.area - a.area).slice(0, keep)
  const order = new Set(sorted.map((tri) => tri.data.join(',')))
  const out: number[] = []
  for (const tri of triangles) {
    if (order.has(tri.data.join(','))) out.push(...tri.data)
  }
  return rebuild(solid, out.length >= 9 ? out : positions, id, `Decimate-${solid.name}`)
}

/** Mesh > Refine: split every triangle into four. */
export function refineMesh(solid: Solid, id: string): Solid {
  const positions = trianglePositions(solid)
  const out: number[] = []
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const a = positions.slice(i, i + 3)
    const b = positions.slice(i + 3, i + 6)
    const c = positions.slice(i + 6, i + 9)
    const ab = mid(a, b)
    const bc = mid(b, c)
    const ca = mid(c, a)
    out.push(...a, ...ab, ...ca)
    out.push(...ab, ...b, ...bc)
    out.push(...ca, ...bc, ...c)
    out.push(...ab, ...bc, ...ca)
  }
  return rebuild(solid, out, id, `Refine-${solid.name}`)
}

/** Mesh > Harmonize normals: orient all faces away from the centroid. */
export function harmonizeNormals(solid: Solid, id: string): Solid {
  const positions = trianglePositions(solid)
  const center = centroid(positions)
  const out: number[] = []
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const a = positions.slice(i, i + 3)
    const b = positions.slice(i + 3, i + 6)
    const c = positions.slice(i + 6, i + 9)
    const normal = cross(sub(b, a), sub(c, a))
    const toOutside = sub([(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3], center)
    const flip = normal[0] * toOutside[0] + normal[1] * toOutside[1] + normal[2] * toOutside[2] < 0
    if (flip) out.push(...a, ...c, ...b)
    else out.push(...a, ...b, ...c)
  }
  return rebuild(solid, out, id, `Harmonize-${solid.name}`)
}

/** Mesh > Flip normals. */
export function flipNormals(solid: Solid, id: string): Solid {
  const positions = trianglePositions(solid)
  const out: number[] = []
  for (let i = 0; i + 8 < positions.length; i += 9) {
    out.push(...positions.slice(i, i + 3), ...positions.slice(i + 6, i + 9), ...positions.slice(i + 3, i + 6))
  }
  return rebuild(solid, out, id, `Flip-${solid.name}`)
}

/** Mesh > Scale. */
export function scaleMesh(solid: Solid, factor: number, id: string): Solid {
  const positions = trianglePositions(solid).map((value) => value * factor)
  return rebuild(solid, positions, id, `Scale-${solid.name}`)
}

/** Mesh > Smooth (Laplacian, one pass over shared vertices). */
export function smoothMesh(solid: Solid, strength: number, id: string): Solid {
  const positions = trianglePositions(solid)
  const neighbours = new Map<string, Vec3[]>()
  const at = (i: number): Vec3 => ({ x: positions[i], y: positions[i + 1], z: positions[i + 2] })
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const tri = [at(i), at(i + 3), at(i + 6)]
    for (let e = 0; e < 3; e++) {
      const k = key(tri[e].x, tri[e].y, tri[e].z)
      const list = neighbours.get(k) ?? []
      list.push(tri[(e + 1) % 3], tri[(e + 2) % 3])
      neighbours.set(k, list)
    }
  }
  const factor = Math.max(0, Math.min(1, strength))
  const out = positions.slice()
  for (let i = 0; i + 2 < out.length; i += 3) {
    const k = key(out[i], out[i + 1], out[i + 2])
    const list = neighbours.get(k)
    if (!list || list.length === 0) continue
    const avg = list.reduce((acc, point) => ({ x: acc.x + point.x / list.length, y: acc.y + point.y / list.length, z: acc.z + point.z / list.length }), { x: 0, y: 0, z: 0 })
    out[i] += (avg.x - out[i]) * factor
    out[i + 1] += (avg.y - out[i + 1]) * factor
    out[i + 2] += (avg.z - out[i + 2]) * factor
  }
  return rebuild(solid, out, id, `Smooth-${solid.name}`)
}

/** Mesh > Fill holes: fan-close every boundary loop found in the mesh. */
export function fillHoles(solid: Solid, id: string): Solid {
  const positions = trianglePositions(solid)
  const edges = new Map<string, { count: number; a: Vec3; b: Vec3 }>()
  const at = (i: number): Vec3 => ({ x: positions[i], y: positions[i + 1], z: positions[i + 2] })
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const tri = [at(i), at(i + 3), at(i + 6)]
    for (let e = 0; e < 3; e++) {
      const a = tri[e]
      const b = tri[(e + 1) % 3]
      const ka = key(a.x, a.y, a.z)
      const kb = key(b.x, b.y, b.z)
      const edge = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
      const found = edges.get(edge)
      if (found) found.count += 1
      else edges.set(edge, { count: 1, a, b })
    }
  }
  const border: Array<{ a: Vec3; b: Vec3 }> = []
  edges.forEach((entry) => { if (entry.count === 1) border.push({ a: entry.a, b: entry.b }) })
  if (border.length === 0) return rebuild(solid, positions, id, `Filled-${solid.name}`)
  const center = border.reduce((acc, edge) => ({
    x: acc.x + (edge.a.x + edge.b.x) / (border.length * 2),
    y: acc.y + (edge.a.y + edge.b.y) / (border.length * 2),
    z: acc.z + (edge.a.z + edge.b.z) / (border.length * 2)
  }), { x: 0, y: 0, z: 0 })
  const out = positions.slice()
  for (const edge of border) out.push(edge.a.x, edge.a.y, edge.a.z, edge.b.x, edge.b.y, edge.b.z, center.x, center.y, center.z)
  return rebuild(solid, out, id, `Filled-${solid.name}`)
}

/** Mesh > Cross-section as a polyline soup at a Y level. */
export function meshSection(solid: Solid, level: number): Array<[Vec3, Vec3]> {
  const positions = trianglePositions(solid)
  const segments: Array<[Vec3, Vec3]> = []
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const tri: Vec3[] = [
      { x: positions[i], y: positions[i + 1], z: positions[i + 2] },
      { x: positions[i + 3], y: positions[i + 4], z: positions[i + 5] },
      { x: positions[i + 6], y: positions[i + 7], z: positions[i + 8] }
    ]
    const hits: Vec3[] = []
    for (let e = 0; e < 3; e++) {
      const a = tri[e]
      const b = tri[(e + 1) % 3]
      if ((a.y - level) * (b.y - level) > 0 || Math.abs(b.y - a.y) < 1e-9) continue
      const t = (level - a.y) / (b.y - a.y)
      hits.push({ x: a.x + (b.x - a.x) * t, y: level, z: a.z + (b.z - a.z) * t })
    }
    if (hits.length >= 2) segments.push([hits[0], hits[1]])
  }
  return segments
}

function rebuild(source: Solid, positions: number[], id: string, name: string): Solid {
  const normals: number[] = []
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const a = positions.slice(i, i + 3)
    const b = positions.slice(i + 3, i + 6)
    const c = positions.slice(i + 6, i + 9)
    const n = normalizeArray(cross(sub(b, a), sub(c, a)))
    normals.push(...n, ...n, ...n)
  }
  return {
    ...source,
    id,
    name,
    kind: 'mesh',
    mesh: { positions, normals }
  }
}

function triangleArea(data: number[]): number {
  const n = cross(sub(data.slice(3, 6), data.slice(0, 3)), sub(data.slice(6, 9), data.slice(0, 3)))
  return Math.hypot(n[0], n[1], n[2]) / 2
}

function sub(a: number[], b: number[]): number[] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function cross(a: number[], b: number[]): number[] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function normalizeArray(v: number[]): number[] {
  const length = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / length, v[1] / length, v[2] / length]
}

function mid(a: number[], b: number[]): number[] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
}

function centroid(positions: number[]): number[] {
  let x = 0, y = 0, z = 0
  const count = Math.max(1, positions.length / 3)
  for (let i = 0; i + 2 < positions.length; i += 3) {
    x += positions[i]
    y += positions[i + 1]
    z += positions[i + 2]
  }
  return [x / count, y / count, z / count]
}

/** Points > Structure: keep every n-th point. */
export function downsamplePoints(points: Vec3[], step: number): Vec3[] {
  const n = Math.max(1, Math.round(step))
  return points.filter((_, index) => index % n === 0)
}

export function pointsBoundingBox(points: Vec3[]) {
  return boundingBoxOf([{
    id: 'tmp', name: 'tmp', kind: 'mesh', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 }, size: { x: 1, y: 1, z: 1, radius: 1, tube: 0 }, color: '#fff',
    metalness: 0, roughness: 1, visible: true, locked: false,
    mesh: { positions: points.flatMap((point) => [point.x, point.y, point.z]), normals: [] }
  } as Solid])
}

export interface PlaneFit {
  origin: Vec3
  normal: Vec3
  rms: number
}

/** Reverse Engineering > Fit plane (least squares through the centroid). */
export function fitPlane(points: Vec3[]): PlaneFit {
  if (points.length < 3) throw new Error('평면 근사: 점이 3개 이상 필요합니다.')
  const n = points.length
  const origin = points.reduce((acc, p) => ({ x: acc.x + p.x / n, y: acc.y + p.y / n, z: acc.z + p.z / n }), { x: 0, y: 0, z: 0 })
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0
  for (const point of points) {
    const dx = point.x - origin.x
    const dy = point.y - origin.y
    const dz = point.z - origin.z
    xx += dx * dx; xy += dx * dy; xz += dx * dz
    yy += dy * dy; yz += dy * dz; zz += dz * dz
  }
  const candidates: Vec3[] = [
    { x: yy * zz - yz * yz, y: xz * yz - xy * zz, z: xy * yz - xz * yy },
    { x: xz * yz - xy * zz, y: xx * zz - xz * xz, z: xy * xz - yz * xx },
    { x: xy * yz - xz * yy, y: xy * xz - yz * xx, z: xx * yy - xy * xy }
  ]
  let normal = candidates[0]
  let best = 0
  for (const candidate of candidates) {
    const magnitude = Math.hypot(candidate.x, candidate.y, candidate.z)
    if (magnitude > best) {
      best = magnitude
      normal = candidate
    }
  }
  const length = Math.hypot(normal.x, normal.y, normal.z) || 1
  const unit = { x: normal.x / length, y: normal.y / length, z: normal.z / length }
  let squares = 0
  for (const point of points) {
    const d = (point.x - origin.x) * unit.x + (point.y - origin.y) * unit.y + (point.z - origin.z) * unit.z
    squares += d * d
  }
  return { origin, normal: unit, rms: Math.sqrt(squares / n) }
}

export interface SphereFit {
  center: Vec3
  radius: number
  rms: number
}

/** Reverse Engineering > Fit sphere (algebraic fit, 4x4 normal equations). */
export function fitSphere(points: Vec3[]): SphereFit {
  if (points.length < 4) throw new Error('구 근사: 점이 4개 이상 필요합니다.')
  const n = points.length
  const center = points.reduce((acc, p) => ({ x: acc.x + p.x / n, y: acc.y + p.y / n, z: acc.z + p.z / n }), { x: 0, y: 0, z: 0 })
  let guess = center
  for (let iteration = 0; iteration < 40; iteration++) {
    let meanRadius = 0
    const gradient = { x: 0, y: 0, z: 0 }
    for (const point of points) {
      const dx = point.x - guess.x
      const dy = point.y - guess.y
      const dz = point.z - guess.z
      const distance = Math.hypot(dx, dy, dz) || 1e-9
      meanRadius += distance / n
      gradient.x += dx / distance / n
      gradient.y += dy / distance / n
      gradient.z += dz / distance / n
    }
    guess = { x: center.x - meanRadius * gradient.x, y: center.y - meanRadius * gradient.y, z: center.z - meanRadius * gradient.z }
    if (Math.abs(gradient.x) + Math.abs(gradient.y) + Math.abs(gradient.z) < 1e-12) break
  }
  let radius = 0
  for (const point of points) radius += Math.hypot(point.x - guess.x, point.y - guess.y, point.z - guess.z) / n
  let squares = 0
  for (const point of points) {
    const residual = Math.hypot(point.x - guess.x, point.y - guess.y, point.z - guess.z) - radius
    squares += residual * residual
  }
  return { center: guess, radius, rms: Math.sqrt(squares / n) }
}

/** Reverse Engineering > Approximate surface: grid-sampled height field over a point cloud. */
export function approximateSurface(points: Vec3[], divisions: number, id: string): Solid {
  if (points.length < 4) throw new Error('곡면 근사: 점이 4개 이상 필요합니다.')
  const n = Math.max(2, Math.min(40, Math.round(divisions)))
  const box = pointsBoundingBox(points)
  const spanX = box.size.x || 1
  const spanZ = box.size.z || 1
  const height = (gx: number, gz: number): number => {
    let weightSum = 0
    let value = 0
    for (const point of points) {
      const distance = Math.hypot(point.x - gx, point.z - gz)
      const weight = 1 / (distance * distance + 1e-3)
      weightSum += weight
      value += point.y * weight
    }
    return value / (weightSum || 1)
  }
  const positions: number[] = []
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x0 = box.min.x + (spanX * i) / n
      const x1 = box.min.x + (spanX * (i + 1)) / n
      const z0 = box.min.z + (spanZ * j) / n
      const z1 = box.min.z + (spanZ * (j + 1)) / n
      const y00 = height(x0, z0)
      const y10 = height(x1, z0)
      const y01 = height(x0, z1)
      const y11 = height(x1, z1)
      positions.push(x0, y00, z0, x1, y10, z0, x0, y01, z1)
      positions.push(x1, y10, z0, x1, y11, z1, x0, y01, z1)
    }
  }
  const solid = meshSolidFrom(id, 'ApproxSurface', geometry(positions), '#9fe6c8')
  return solid
}

function geometry(positions: number[]) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.computeVertexNormals()
  return geo
}
