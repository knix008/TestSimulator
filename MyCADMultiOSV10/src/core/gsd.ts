// CATIA Generative Shape Design / FreeCAD Surface workbench:
// wireframe curves and surface features.
import type { Solid, Vec3 } from './model'
import { meshSolidFrom, trianglePositions } from './primitives'
import { makeWire, type Wire } from './draftwb'
import * as THREE from 'three'

function geometryFrom(positions: number[]) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

function pushQuad(out: number[], a: Vec3, b: Vec3, c: Vec3, d: Vec3) {
  out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  out.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z)
}

/** GSD > Extrude: sweep a curve along a direction. */
export function extrudeSurface(wire: Wire, direction: Vec3, length: number, id: string): Solid {
  const unit = normalize(direction)
  const offset = { x: unit.x * length, y: unit.y * length, z: unit.z * length }
  const positions: number[] = []
  const total = wire.closed ? wire.points.length : wire.points.length - 1
  for (let i = 0; i < total; i++) {
    const a = wire.points[i]
    const b = wire.points[(i + 1) % wire.points.length]
    pushQuad(positions, a, b, add(b, offset), add(a, offset))
  }
  return meshSolidFrom(id, `Extrude-${wire.name}`, geometryFrom(positions), '#9fd8ff')
}

/** GSD > Revolve: rotate a curve about an axis. */
export function revolveSurface(wire: Wire, axis: 'x' | 'y' | 'z', angleDeg: number, segments: number, id: string): Solid {
  const steps = Math.max(3, Math.min(180, Math.round(segments)))
  const sweep = (Math.max(1, Math.min(360, angleDeg)) * Math.PI) / 180
  const positions: number[] = []
  const rotate = (point: Vec3, angle: number): Vec3 => {
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    if (axis === 'y') return { x: point.x * cos + point.z * sin, y: point.y, z: -point.x * sin + point.z * cos }
    if (axis === 'z') return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos, z: point.z }
    return { x: point.x, y: point.y * cos - point.z * sin, z: point.y * sin + point.z * cos }
  }
  for (let s = 0; s < steps; s++) {
    const a0 = (sweep * s) / steps
    const a1 = (sweep * (s + 1)) / steps
    for (let i = 0; i < wire.points.length - 1; i++) {
      const p0 = wire.points[i]
      const p1 = wire.points[i + 1]
      pushQuad(positions, rotate(p0, a0), rotate(p1, a0), rotate(p1, a1), rotate(p0, a1))
    }
  }
  return meshSolidFrom(id, `Revolve-${wire.name}`, geometryFrom(positions), '#f2b76b')
}

/** GSD > Sweep: move a profile along a spine curve. */
export function sweepSurface(profile: Wire, spine: Wire, id: string): Solid {
  if (spine.points.length < 2) throw new Error('스윕: 스파인 점이 부족합니다.')
  const rings: Vec3[][] = spine.points.map((point, index) => {
    const next = spine.points[Math.min(spine.points.length - 1, index + 1)]
    const previous = spine.points[Math.max(0, index - 1)]
    const tangent = normalize({ x: next.x - previous.x, y: next.y - previous.y, z: next.z - previous.z })
    const up = Math.abs(tangent.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
    const side = normalize(cross(tangent, up))
    const local = cross(side, tangent)
    return profile.points.map((p) => ({
      x: point.x + side.x * p.x + local.x * p.y,
      y: point.y + side.y * p.x + local.y * p.y,
      z: point.z + side.z * p.x + local.z * p.y
    }))
  })
  const positions: number[] = []
  const count = profile.points.length
  for (let i = 0; i < rings.length - 1; i++) {
    const limit = profile.closed ? count : count - 1
    for (let j = 0; j < limit; j++) {
      const k = (j + 1) % count
      pushQuad(positions, rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j])
    }
  }
  return meshSolidFrom(id, `Sweep-${profile.name}`, geometryFrom(positions), '#c9a0ff')
}

/** GSD > Multi-section surface (loft) through several sections. */
export function multiSectionSurface(sections: Wire[], id: string): Solid {
  if (sections.length < 2) throw new Error('멀티섹션: 단면이 2개 이상 필요합니다.')
  const count = Math.min(...sections.map((section) => section.points.length))
  const resample = (wire: Wire): Vec3[] =>
    Array.from({ length: count }, (_, i) => wire.points[Math.round((i * (wire.points.length - 1)) / Math.max(1, count - 1))])
  const rings = sections.map(resample)
  const positions: number[] = []
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < count; j++) {
      const k = (j + 1) % count
      pushQuad(positions, rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j])
    }
  }
  return meshSolidFrom(id, 'MultiSection', geometryFrom(positions), '#8fd18f')
}

/** GSD > Fill: cap a closed boundary curve with a fan surface. */
export function fillSurface(boundary: Wire, id: string): Solid {
  if (boundary.points.length < 3) throw new Error('필: 경계 점이 3개 이상 필요합니다.')
  const n = boundary.points.length
  const center = boundary.points.reduce((acc, point) => ({
    x: acc.x + point.x / n, y: acc.y + point.y / n, z: acc.z + point.z / n
  }), { x: 0, y: 0, z: 0 })
  const positions: number[] = []
  for (let i = 0; i < n; i++) {
    const a = boundary.points[i]
    const b = boundary.points[(i + 1) % n]
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, center.x, center.y, center.z)
  }
  return meshSolidFrom(id, `Fill-${boundary.name}`, geometryFrom(positions), '#9fe6c8')
}

/** GSD > Blend: ruled transition between two curves. */
export function blendSurface(a: Wire, b: Wire, id: string): Solid {
  const count = Math.min(a.points.length, b.points.length)
  const positions: number[] = []
  for (let i = 0; i < count - 1; i++) {
    pushQuad(positions, a.points[i], a.points[i + 1], b.points[i + 1], b.points[i])
  }
  return meshSolidFrom(id, 'Blend', geometryFrom(positions), '#a6d8ff')
}

/** GSD > Offset a surface along its normals. */
export function offsetSurface(solid: Solid, distance: number, id: string): Solid {
  const positions = trianglePositions(solid)
  const out: number[] = []
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const a = [positions[i], positions[i + 1], positions[i + 2]]
    const b = [positions[i + 3], positions[i + 4], positions[i + 5]]
    const c = [positions[i + 6], positions[i + 7], positions[i + 8]]
    const n = normalize(toVec(cross(toVec(sub(b, a)), toVec(sub(c, a)))))
    for (const point of [a, b, c]) out.push(point[0] + n.x * distance, point[1] + n.y * distance, point[2] + n.z * distance)
  }
  const result = meshSolidFrom(id, `Offset-${solid.name}`, geometryFrom(out), solid.color)
  result.position = { ...solid.position }
  return result
}

/** GSD > Join: merge several surfaces into a single skin. */
export function joinSurfaces(solids: Solid[], id: string): Solid {
  const positions: number[] = []
  for (const solid of solids) {
    const tri = trianglePositions(solid)
    for (let i = 0; i + 2 < tri.length; i += 3) {
      positions.push(
        tri[i] * solid.scale.x + solid.position.x,
        tri[i + 1] * solid.scale.y + solid.position.y,
        tri[i + 2] * solid.scale.z + solid.position.z
      )
    }
  }
  if (positions.length < 9) throw new Error('조인: 서피스를 선택하세요.')
  return meshSolidFrom(id, 'Join', geometryFrom(positions), solids[0].color)
}

/** GSD > Split / Trim: keep the part of a surface on one side of a plane. */
export function splitSurface(solid: Solid, axis: 'x' | 'y' | 'z', level: number, keep: 'below' | 'above', id: string): Solid {
  const positions = trianglePositions(solid)
  const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2
  const out: number[] = []
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const values = [positions[i + index], positions[i + 3 + index], positions[i + 6 + index]]
    const center = (values[0] + values[1] + values[2]) / 3
    const inside = keep === 'below' ? center <= level : center >= level
    if (inside) out.push(...positions.slice(i, i + 9))
  }
  if (out.length < 9) throw new Error('분할: 남는 면이 없습니다.')
  const result = meshSolidFrom(id, `Split-${solid.name}`, geometryFrom(out), solid.color)
  result.position = { ...solid.position }
  return result
}

/** GSD > Extract boundary: the free edges of a surface as a wire. */
export function extractBoundary(solid: Solid, id: string): Wire {
  const positions = trianglePositions(solid)
  const edges = new Map<string, { count: number; a: Vec3; b: Vec3 }>()
  const key = (point: Vec3) => `${point.x.toFixed(4)},${point.y.toFixed(4)},${point.z.toFixed(4)}`
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const tri: Vec3[] = [
      { x: positions[i], y: positions[i + 1], z: positions[i + 2] },
      { x: positions[i + 3], y: positions[i + 4], z: positions[i + 5] },
      { x: positions[i + 6], y: positions[i + 7], z: positions[i + 8] }
    ]
    for (let e = 0; e < 3; e++) {
      const a = tri[e]
      const b = tri[(e + 1) % 3]
      const ka = key(a)
      const kb = key(b)
      const edgeKey = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
      const found = edges.get(edgeKey)
      if (found) found.count += 1
      else edges.set(edgeKey, { count: 1, a, b })
    }
  }
  const points: Vec3[] = []
  edges.forEach((entry) => {
    if (entry.count !== 1) return
    points.push(entry.a, entry.b)
  })
  return makeWire(id, `Boundary-${solid.name}`, points, false)
}

export interface HealReport {
  freeEdges: number
  gaps: number
  healed: boolean
}

/** GSD > Healing: report free edges and whether the skin can be closed. */
export function healReport(solid: Solid, tolerance = 0.01): HealReport {
  const boundary = extractBoundary(solid, 'heal')
  let gaps = 0
  for (let i = 0; i + 1 < boundary.points.length; i += 2) {
    const a = boundary.points[i]
    const b = boundary.points[i + 1]
    if (Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) > tolerance) gaps += 1
  }
  return { freeEdges: boundary.points.length / 2, gaps, healed: gaps === 0 }
}

/** GSD > Isoparametric curve: sample a surface along one parameter line. */
export function isoCurve(solid: Solid, axis: 'x' | 'z', level: number, id: string): Wire {
  const positions = trianglePositions(solid)
  const points: Vec3[] = []
  const index = axis === 'x' ? 0 : 2
  for (let i = 0; i + 8 < positions.length; i += 9) {
    for (let e = 0; e < 3; e++) {
      const a = i + e * 3
      const b = i + ((e + 1) % 3) * 3
      const av = positions[a + index]
      const bv = positions[b + index]
      if ((av - level) * (bv - level) > 0 || Math.abs(bv - av) < 1e-9) continue
      const t = (level - av) / (bv - av)
      points.push({
        x: positions[a] + (positions[b] - positions[a]) * t,
        y: positions[a + 1] + (positions[b + 1] - positions[a + 1]) * t,
        z: positions[a + 2] + (positions[b + 2] - positions[a + 2]) * t
      })
    }
  }
  points.sort((p, q) => (axis === 'x' ? p.z - q.z : p.x - q.x))
  return makeWire(id, 'IsoCurve', points, false)
}

/** GSD > Helix curve (wireframe). */
export function helixCurve(radius: number, pitch: number, turns: number, id: string): Wire {
  const coils = Math.max(1, Math.min(40, turns))
  const steps = Math.round(coils * 32)
  const points: Vec3[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const angle = t * Math.PI * 2 * coils
    points.push({ x: Math.cos(angle) * radius, y: t * pitch * coils, z: Math.sin(angle) * radius })
  }
  return makeWire(id, 'Helix', points, false)
}

/** GSD > Spine / 3D spline through points. */
export function spline3d(points: Vec3[], perSpan: number, id: string): Wire {
  if (points.length < 2) throw new Error('스플라인: 점이 부족합니다.')
  const out: Vec3[] = []
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(point.x, point.y, point.z)))
  const total = Math.max(2, (points.length - 1) * Math.max(2, perSpan))
  for (let i = 0; i <= total; i++) {
    const point = curve.getPoint(i / total)
    out.push({ x: point.x, y: point.y, z: point.z })
  }
  return makeWire(id, 'Spline3D', out, false)
}

/** GSD > Conic curve (parabola / ellipse arc controlled by a conic parameter). */
export function conicCurve(width: number, height: number, ratio: number, steps: number, id: string): Wire {
  const k = Math.max(0.05, Math.min(0.95, ratio))
  const n = Math.max(4, Math.round(steps))
  const points: Vec3[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const weight = (2 * k * (1 - t) * t) / (Math.pow(1 - t, 2) + 2 * k * (1 - t) * t + Math.pow(t, 2))
    const x = -width / 2 + width * t
    const y = height * weight
    points.push({ x, y, z: 0 })
  }
  return makeWire(id, 'Conic', points, false)
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / length, y: v.y / length, z: v.z / length }
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }
}

function sub(a: number[], b: number[]): number[] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function toVec(values: number[] | Vec3): Vec3 {
  return Array.isArray(values) ? { x: values[0], y: values[1], z: values[2] } : values
}
