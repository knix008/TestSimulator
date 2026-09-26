// @ts-nocheck
// FreeCAD Part workbench: primitives and shape operations.
import * as THREE from 'three'
import type { Solid, Vec3 } from './model'
import { vec } from './model'
import { booleanSolids, meshFromGeometry, solidVolume } from './part'
import { solidGeometry } from './stl'

export type PrimitiveKind =
  | 'wedge'
  | 'prism'
  | 'ellipsoid'
  | 'tube'
  | 'spiral'
  | 'ring'
  | 'pyramid'

export function meshSolidFrom(id: string, name: string, geometry: THREE.BufferGeometry, color = '#7ec8ff'): Solid {
  const mesh = meshFromGeometry(geometry)
  geometry.dispose?.()
  return {
    id,
    name,
    kind: 'mesh',
    position: vec(),
    rotation: vec(),
    scale: vec(1, 1, 1),
    size: { x: 1, y: 1, z: 1, radius: 1, tube: 0.2 },
    color,
    metalness: 0.14,
    roughness: 0.44,
    visible: true,
    locked: false,
    mesh
  }
}

function geometryFromTriangles(positions: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

/** Part > Primitives > Wedge. Box with independently tapered top face. */
export function wedgeSolid(width: number, height: number, depth: number, taper: number, id: string): Solid {
  const w = Math.max(0.2, width) / 2
  const h = Math.max(0.2, height)
  const d = Math.max(0.2, depth) / 2
  const t = Math.max(0, Math.min(1, taper))
  const tw = w * (1 - t)
  const td = d * (1 - t)
  const bottom = [
    [-w, 0, -d], [w, 0, -d], [w, 0, d], [-w, 0, d]
  ]
  const top = [
    [-tw, h, -td], [tw, h, -td], [tw, h, td], [-tw, h, td]
  ]
  const positions: number[] = []
  const quad = (a: number[], b: number[], c: number[], e: number[]) => {
    positions.push(...a, ...b, ...c, ...a, ...c, ...e)
  }
  quad(bottom[0], bottom[2], bottom[1], bottom[3])
  quad(top[0], top[1], top[2], top[3])
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4
    quad(bottom[i], bottom[j], top[j], top[i])
  }
  return meshSolidFrom(id, 'Wedge', geometryFromTriangles(positions), '#f0c060')
}

/** Part > Primitives > Prism (regular n-gon extruded). */
export function prismSolid(sides: number, circumradius: number, height: number, id: string): Solid {
  const n = Math.max(3, Math.min(64, Math.round(sides)))
  const r = Math.max(0.2, circumradius)
  const h = Math.max(0.2, height)
  const shape = new THREE.Shape()
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false })
  geometry.translate(0, 0, -h / 2)
  geometry.rotateX(-Math.PI / 2)
  return meshSolidFrom(id, `Prism${n}`, geometry, '#8fd18f')
}

/** Part > Primitives > Ellipsoid. */
export function ellipsoidSolid(rx: number, ry: number, rz: number, id: string): Solid {
  const geometry = new THREE.SphereGeometry(1, 32, 20)
  geometry.scale(Math.max(0.2, rx), Math.max(0.2, ry), Math.max(0.2, rz))
  return meshSolidFrom(id, 'Ellipsoid', geometry, '#d98bff')
}

/** Part > Primitives > Tube (hollow cylinder). */
export function tubeSolid(outer: number, inner: number, height: number, id: string): Solid {
  const ro = Math.max(0.4, outer)
  const ri = Math.max(0.1, Math.min(inner, ro - 0.2))
  const h = Math.max(0.2, height)
  const shape = new THREE.Shape()
  shape.absarc(0, 0, ro, 0, Math.PI * 2, false)
  const hole = new THREE.Path()
  hole.absarc(0, 0, ri, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 32 })
  geometry.translate(0, 0, -h / 2)
  geometry.rotateX(-Math.PI / 2)
  return meshSolidFrom(id, 'Tube', geometry, '#9ec5ff')
}

/** Part > Primitives > Spiral (flat archimedean spiral swept as a tube). */
export function spiralSolid(radius: number, growth: number, turns: number, id: string): Solid {
  const coils = Math.max(1, Math.min(16, Math.round(turns)))
  const steps = coils * 24
  const points: THREE.Vector3[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const angle = t * Math.PI * 2 * coils
    const r = Math.max(0.2, radius) + growth * t * coils
    points.push(new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r))
  }
  const curve = new THREE.CatmullRomCurve3(points)
  const geometry = new THREE.TubeGeometry(curve, steps, Math.max(0.3, radius * 0.12), 8, false)
  return meshSolidFrom(id, 'Spiral', geometry, '#f5d76e')
}

/** Part > Primitives > Ring / annulus face given thickness 0.4. */
export function ringSolid(outer: number, inner: number, id: string): Solid {
  return { ...tubeSolid(outer, inner, 0.4, id), name: 'Ring' }
}

/** Part > Primitives > Pyramid over a regular base. */
export function pyramidSolid(sides: number, radius: number, height: number, id: string): Solid {
  const n = Math.max(3, Math.min(32, Math.round(sides)))
  const r = Math.max(0.2, radius)
  const h = Math.max(0.2, height)
  const base: number[][] = []
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2
    base.push([Math.cos(a) * r, 0, Math.sin(a) * r])
  }
  const apex = [0, h, 0]
  const positions: number[] = []
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    positions.push(...base[i], ...base[j], ...apex)
  }
  for (let i = 1; i < n - 1; i++) positions.push(...base[0], ...base[i + 1], ...base[i])
  return meshSolidFrom(id, `Pyramid${n}`, geometryFromTriangles(positions), '#f1948a')
}

export function makePrimitive(kind: PrimitiveKind, id: string, params: Partial<Record<string, number>> = {}): Solid {
  const p = (key: string, fallback: number) => (Number.isFinite(params[key]) ? (params[key] as number) : fallback)
  switch (kind) {
    case 'wedge':
      return wedgeSolid(p('width', 40), p('height', 30), p('depth', 30), p('taper', 0.4), id)
    case 'prism':
      return prismSolid(p('sides', 6), p('radius', 20), p('height', 30), id)
    case 'ellipsoid':
      return ellipsoidSolid(p('rx', 24), p('ry', 14), p('rz', 18), id)
    case 'tube':
      return tubeSolid(p('outer', 20), p('inner', 12), p('height', 30), id)
    case 'spiral':
      return spiralSolid(p('radius', 14), p('growth', 3), p('turns', 4), id)
    case 'ring':
      return ringSolid(p('outer', 24), p('inner', 16), id)
    default:
      return pyramidSolid(p('sides', 4), p('radius', 22), p('height', 34), id)
  }
}

/** Part > Boolean > XOR: symmetric difference of two solids. */
export function xorSolids(a: Solid, b: Solid, id: string): Solid {
  const union = booleanSolids(a, b, 'union', `${id}-u`)
  const common = booleanSolids(a, b, 'common', `${id}-i`)
  const result = booleanSolids(union, common, 'cut', id)
  result.name = `XOR-${a.name}`
  return result
}

/**
 * Part > Boolean > Split (Boolean fragments): the three disjoint pieces
 * A\B, A∩B and B\A, skipping empty ones.
 */
export function booleanFragments(a: Solid, b: Solid, nextId: () => string): Solid[] {
  const pieces: Solid[] = []
  const push = (solid: Solid, name: string) => {
    if (solidVolume(solid) > 1e-6) {
      solid.name = name
      pieces.push(solid)
    }
  }
  push(booleanSolids(a, b, 'cut', nextId()), `${a.name}-only`)
  push(booleanSolids(a, b, 'common', nextId()), `${a.name}∩${b.name}`)
  push(booleanSolids(b, a, 'cut', nextId()), `${b.name}-only`)
  return pieces
}

function scaledCopy(solid: Solid, factor: number, id: string): Solid {
  const copy: Solid = {
    ...solid,
    id,
    position: { ...solid.position },
    rotation: { ...solid.rotation },
    scale: { x: solid.scale.x * factor, y: solid.scale.y * factor, z: solid.scale.z * factor },
    size: { ...solid.size },
    mesh: solid.mesh ? { positions: solid.mesh.positions.slice(), normals: solid.mesh.normals.slice() } : undefined
  }
  return copy
}

/** Part > Thickness: hollow the solid leaving a wall of the given thickness. */
export function thicknessSolid(solid: Solid, thickness: number, id: string): Solid {
  const span = Math.max(solid.size.x, solid.size.y, solid.size.z, solid.size.radius * 2, 1)
  const wall = Math.max(0.2, Math.min(thickness, span / 2 - 0.2))
  const factor = Math.max(0.05, (span - wall * 2) / span)
  const inner = scaledCopy(solid, factor, `${id}-in`)
  const result = booleanSolids(solid, inner, 'cut', id)
  result.name = `Thickness-${solid.name}`
  return result
}

/** Part > 3D offset: uniform grow/shrink of the shape. */
export function offsetSolid(solid: Solid, offset: number, id: string): Solid {
  const span = Math.max(solid.size.x, solid.size.y, solid.size.z, solid.size.radius * 2, 1)
  const factor = Math.max(0.05, (span + offset * 2) / span)
  const result = scaledCopy(solid, factor, id)
  result.name = `Offset-${solid.name}`
  return result
}

/** Part > Ruled surface between two closed loops. */
export function ruledSurface(loopA: Vec3[], loopB: Vec3[], id: string): Solid {
  const count = Math.min(loopA.length, loopB.length)
  if (count < 3) throw new Error('룰드 서피스: 점이 부족합니다.')
  const positions: number[] = []
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count
    const a0 = loopA[i], a1 = loopA[j], b0 = loopB[i], b1 = loopB[j]
    positions.push(a0.x, a0.y, a0.z, b0.x, b0.y, b0.z, a1.x, a1.y, a1.z)
    positions.push(a1.x, a1.y, a1.z, b0.x, b0.y, b0.z, b1.x, b1.y, b1.z)
  }
  return meshSolidFrom(id, 'RuledSurface', geometryFromTriangles(positions), '#9fe6c8')
}

export interface CrossSection {
  height: number
  segments: Array<[Vec3, Vec3]>
}

/** Part > Cross-sections: slice a solid with planes normal to an axis. */
export function crossSections(solid: Solid, axis: 'x' | 'y' | 'z', count: number): CrossSection[] {
  const positions = trianglePositions(solid)
  const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2
  let min = Infinity
  let max = -Infinity
  for (let i = index; i < positions.length; i += 3) {
    min = Math.min(min, positions[i])
    max = Math.max(max, positions[i])
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return []
  const slices = Math.max(1, Math.min(64, Math.round(count)))
  const out: CrossSection[] = []
  for (let s = 0; s < slices; s++) {
    const level = min + ((max - min) * (s + 1)) / (slices + 1)
    const segments: Array<[Vec3, Vec3]> = []
    for (let i = 0; i < positions.length; i += 9) {
      const tri = [
        { x: positions[i], y: positions[i + 1], z: positions[i + 2] },
        { x: positions[i + 3], y: positions[i + 4], z: positions[i + 5] },
        { x: positions[i + 6], y: positions[i + 7], z: positions[i + 8] }
      ]
      const hits: Vec3[] = []
      for (let e = 0; e < 3; e++) {
        const a = tri[e]
        const b = tri[(e + 1) % 3]
        const av = axis === 'x' ? a.x : axis === 'y' ? a.y : a.z
        const bv = axis === 'x' ? b.x : axis === 'y' ? b.y : b.z
        if ((av - level) * (bv - level) > 0) continue
        if (Math.abs(bv - av) < 1e-9) continue
        const t = (level - av) / (bv - av)
        hits.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })
      }
      if (hits.length >= 2) segments.push([hits[0], hits[1]])
    }
    out.push({ height: level, segments })
  }
  return out
}

export function trianglePositions(solid: Solid): number[] {
  if (solid.kind === 'mesh' && solid.mesh) return solid.mesh.positions
  const geometry = solidGeometry(solid)
  const baked = geometry.index ? geometry.toNonIndexed() : geometry
  const attribute = baked.getAttribute('position')
  const out = Array.from(attribute.array as ArrayLike<number>)
  geometry.dispose?.()
  return out
}

/**
 * The solid's triangles where they actually sit: position, rotation and scale
 * applied. `trianglePositions` is the local geometry, which is what the scene
 * graph wants; a file written to disk has to carry the placed geometry.
 */
export function worldTriangles(solid: Solid): number[] {
  const local = trianglePositions(solid)
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(solid.position.x, solid.position.y, solid.position.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(solid.rotation.x),
      THREE.MathUtils.degToRad(solid.rotation.y),
      THREE.MathUtils.degToRad(solid.rotation.z)
    )),
    new THREE.Vector3(solid.scale.x, solid.scale.y, solid.scale.z)
  )
  const out = new Array<number>(local.length)
  const point = new THREE.Vector3()
  for (let i = 0; i + 2 < local.length; i += 3) {
    point.set(local[i], local[i + 1], local[i + 2]).applyMatrix4(matrix)
    out[i] = point.x
    out[i + 1] = point.y
    out[i + 2] = point.z
  }
  return out
}

export interface BoundingBox {
  min: Vec3
  max: Vec3
  size: Vec3
  center: Vec3
}

export function boundingBoxOf(solids: Solid[]): BoundingBox {
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (const solid of solids) {
    const positions = trianglePositions(solid)
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i] * solid.scale.x + solid.position.x
      const y = positions[i + 1] * solid.scale.y + solid.position.y
      const z = positions[i + 2] * solid.scale.z + solid.position.z
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minY = Math.min(minY, y); maxY = Math.max(maxY, y)
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z)
    }
  }
  if (!Number.isFinite(minX)) {
    return { min: vec(), max: vec(), size: vec(), center: vec() }
  }
  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 }
  }
}

/** Part > Compound: merge several solids into one mesh without a boolean. */
export function compoundSolids(solids: Solid[], id: string): Solid {
  const positions: number[] = []
  for (const solid of solids) {
    const tri = trianglePositions(solid)
    for (let i = 0; i < tri.length; i += 3) {
      positions.push(
        tri[i] * solid.scale.x + solid.position.x,
        tri[i + 1] * solid.scale.y + solid.position.y,
        tri[i + 2] * solid.scale.z + solid.position.z
      )
    }
  }
  if (positions.length < 9) throw new Error('컴파운드: 솔리드를 선택하세요.')
  const solid = meshSolidFrom(id, 'Compound', geometryFromTriangles(positions), solids[0]?.color || '#7ec8ff')
  return solid
}

export function surfaceArea(solid: Solid): number {
  const positions = trianglePositions(solid)
  let area = 0
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i + 3] - positions[i]
    const ay = positions[i + 4] - positions[i + 1]
    const az = positions[i + 5] - positions[i + 2]
    const bx = positions[i + 6] - positions[i]
    const by = positions[i + 7] - positions[i + 1]
    const bz = positions[i + 8] - positions[i + 2]
    const cx = ay * bz - az * by
    const cy = az * bx - ax * bz
    const cz = ax * by - ay * bx
    area += Math.hypot(cx, cy, cz) / 2
  }
  return area
}
