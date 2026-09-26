// @ts-nocheck
import * as THREE from 'three'
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg'
import type { Solid, Vec3 } from './model'
import { cloneSolid, vec } from './model'
import { solidGeometry } from './stl'

export type WorkPlane = 'xy' | 'xz' | 'yz'
export type SketchShape = 'rect' | 'circle' | 'polygon'
export type FeatureKind = 'sketch' | 'pad' | 'pocket' | 'revolve' | 'fillet' | 'chamfer' | 'union' | 'cut' | 'common' | 'mirror' | 'linear' | 'polar' | 'hole' | 'align' | 'shaft' | 'groove' | 'draft' | 'shell' | 'rectPattern' | 'translate' | 'rotate' | 'scale' | 'counterbore' | 'countersink' | 'parameter' | 'mate' | 'loft' | 'pipe' | 'helix'

export interface Sketch {
  id: string
  name: string
  plane: WorkPlane
  shape: SketchShape
  width: number
  height: number
  sides: number
}

export interface Feature {
  id: string
  name: string
  kind: FeatureKind
  solidIds: string[]
  length: number
  angle: number
  count: number
  radius: number
}

export function snap(value: number, step: number): number {
  if (!step) return value
  return Math.round(value / step) * step
}

export function makeSketch(input: Partial<Sketch> & { id: string }): Sketch {
  return {
    id: input.id,
    name: input.name || `sketch-${input.id}`,
    plane: input.plane || 'xy',
    shape: input.shape || 'rect',
    width: input.width ?? 40,
    height: input.height ?? 30,
    sides: Math.max(3, input.sides ?? 6)
  }
}

function shapeFromSketch(sketch: Sketch): THREE.Shape {
  const shape = new THREE.Shape()
  if (sketch.shape === 'circle') {
    shape.absarc(0, 0, Math.max(sketch.width, 1) / 2, 0, Math.PI * 2, false)
    return shape
  }
  if (sketch.shape === 'polygon') {
    const radius = Math.max(sketch.width, 1) / 2
    const sides = Math.max(3, sketch.sides)
    for (let i = 0; i < sides; i++) {
      const a = (Math.PI * 2 * i) / sides - Math.PI / 2
      const x = Math.cos(a) * radius
      const y = Math.sin(a) * radius
      if (i === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    }
    shape.closePath()
    return shape
  }
  const w = sketch.width / 2
  const h = sketch.height / 2
  shape.moveTo(-w, -h)
  shape.lineTo(w, -h)
  shape.lineTo(w, h)
  shape.lineTo(-w, h)
  shape.closePath()
  return shape
}

function orient(geometry: THREE.BufferGeometry, plane: WorkPlane) {
  if (plane === 'xz') geometry.rotateX(-Math.PI / 2)
  if (plane === 'yz') geometry.rotateY(Math.PI / 2)
  geometry.computeVertexNormals()
  return geometry
}

export function meshFromGeometry(geometry: THREE.BufferGeometry): { positions: number[]; normals: number[] } {
  const baked = geometry.index ? geometry.toNonIndexed() : geometry
  baked.computeVertexNormals()
  const position = baked.getAttribute('position')
  const normal = baked.getAttribute('normal')
  return {
    positions: Array.from(position.array as ArrayLike<number>),
    normals: Array.from(normal.array as ArrayLike<number>)
  }
}

function meshSolid(id: string, name: string, geometry: THREE.BufferGeometry, color = '#7ec8ff'): Solid {
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
    metalness: 0.12,
    roughness: 0.42,
    visible: true,
    locked: false,
    mesh
  }
}

export function padSketch(sketch: Sketch, length: number, id: string): Solid {
  const geometry = new THREE.ExtrudeGeometry(shapeFromSketch(sketch), {
    depth: Math.max(0.2, length),
    bevelEnabled: false
  })
  geometry.translate(0, 0, -length / 2)
  orient(geometry, sketch.plane)
  return meshSolid(id, `pad-${sketch.name}`, geometry, '#4cc2ff')
}

function ringPoints(sketch: Sketch, count: number): THREE.Vector2[] {
  const points = shapeFromSketch(sketch).getPoints(Math.max(count, 8))
  const ring: THREE.Vector2[] = []
  for (let i = 0; i < count; i++) ring.push(points[Math.min(points.length - 1, Math.round((i * (points.length - 1)) / count))])
  return ring
}

export function loftSketches(bottom: Sketch, top: Sketch, length: number, id: string): Solid {
  const count = 24
  const a = ringPoints(bottom, count)
  const b = ringPoints(top, count)
  const depth = Math.max(0.2, length)
  const positions: number[] = []
  const push = (x: number, y: number, z: number) => positions.push(x, y, z)
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count
    const z0 = -depth / 2
    const z1 = depth / 2
    push(a[i].x, a[i].y, z0); push(b[i].x, b[i].y, z1); push(a[j].x, a[j].y, z0)
    push(a[j].x, a[j].y, z0); push(b[i].x, b[i].y, z1); push(b[j].x, b[j].y, z1)
  }
  for (let i = 1; i < count - 1; i++) {
    push(a[0].x, a[0].y, -depth / 2); push(a[i].x, a[i].y, -depth / 2); push(a[i + 1].x, a[i + 1].y, -depth / 2)
    push(b[0].x, b[0].y, depth / 2); push(b[i + 1].x, b[i + 1].y, depth / 2); push(b[i].x, b[i].y, depth / 2)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  orient(geometry, bottom.plane)
  return meshSolid(id, `loft-${bottom.name}`, geometry, '#8fd18f')
}

export function pipeSketch(sketch: Sketch, length: number, id: string): Solid {
  const radius = Math.max(sketch.width, sketch.height, 1) / 2
  const depth = Math.max(0.2, length)
  const curve = new THREE.LineCurve3(new THREE.Vector3(0, 0, -depth / 2), new THREE.Vector3(0, 0, depth / 2))
  const geometry = new THREE.TubeGeometry(curve, 1, radius, 24, false)
  orient(geometry, sketch.plane)
  return meshSolid(id, `pipe-${sketch.name}`, geometry, '#d98bff')
}

export function helixSolid(radius: number, pitch: number, turns: number, id: string): Solid {
  const r = Math.max(1, radius)
  const coils = Math.max(1, Math.min(12, Math.round(turns)))
  const rise = Math.max(1, pitch)
  const points: THREE.Vector3[] = []
  const steps = coils * 16
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const angle = t * Math.PI * 2 * coils
    points.push(new THREE.Vector3(Math.cos(angle) * r, t * rise * coils, Math.sin(angle) * r))
  }
  const curve = new THREE.CatmullRomCurve3(points)
  const geometry = new THREE.TubeGeometry(curve, steps, Math.max(0.4, r * 0.18), 10, false)
  return meshSolid(id, 'helix', geometry, '#f5d76e')
}

export function rebuildFeatureSolid(feature: Feature, sketches: Sketch[]): Solid | null {
  const sketch = sketches[sketches.length - 1]
  if (!sketch) return null
  if (feature.kind === 'sketch') return padSketch(sketch, 0.4, feature.id)
  if (feature.kind === 'pad') return padSketch(sketch, feature.length || 1, feature.id)
  if (feature.kind === 'revolve' || feature.kind === 'shaft') return revolveSketch(sketch, feature.angle || 360, feature.id)
  if (feature.kind === 'loft') {
    const other = sketches[sketches.length - 2]
    if (!other) return null
    return loftSketches(other, sketch, feature.length || 1, feature.id)
  }
  if (feature.kind === 'pipe') return pipeSketch(sketch, feature.length || 1, feature.id)
  return null
}

export function revolveSketch(sketch: Sketch, angleDeg: number, id: string): Solid {
  const shape = shapeFromSketch(sketch)
  const points = shape.getPoints(sketch.shape === 'circle' ? 24 : 12)
  const radius = Math.max(...points.map((point) => Math.abs(point.x)), 1)
  const profile = points
    .map((point) => new THREE.Vector2(Math.abs(point.x) + radius * 0.15, point.y))
    .sort((a, b) => a.y - b.y)
  const unique: THREE.Vector2[] = []
  for (const point of profile) {
    const last = unique[unique.length - 1]
    if (!last || Math.abs(last.y - point.y) > 0.01) unique.push(point)
  }
  if (unique.length < 2) unique.push(new THREE.Vector2(radius, sketch.height / 2))
  const geometry = new THREE.LatheGeometry(unique, 32, 0, THREE.MathUtils.degToRad(Math.max(1, Math.min(360, angleDeg))))
  orient(geometry, sketch.plane)
  return meshSolid(id, `revolve-${sketch.name}`, geometry, '#f0a35e')
}

export function filletBox(solid: Solid, radius: number, id: string, chamfer = false): Solid {
  const width = Math.max(1, solid.size.x * solid.scale.x)
  const height = Math.max(1, solid.size.y * solid.scale.y)
  const shape = new THREE.Shape()
  const w = width / 2
  const d = Math.max(1, solid.size.z * solid.scale.z) / 2
  shape.moveTo(-w, -d)
  shape.lineTo(w, -d)
  shape.lineTo(w, d)
  shape.lineTo(-w, d)
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelThickness: Math.max(0.2, radius),
    bevelSize: Math.max(0.2, radius),
    bevelSegments: chamfer ? 1 : 4,
    bevelOffset: 0
  })
  geometry.translate(0, 0, -height / 2)
  geometry.rotateX(-Math.PI / 2)
  const next = meshSolid(id, `${chamfer ? 'chamfer' : 'fillet'}-${solid.name}`, geometry, solid.color)
  next.position = { ...solid.position }
  return next
}

function brushFromSolid(solid: Solid): Brush {
  const geometry = solid.kind === 'mesh' && solid.mesh
    ? new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(solid.mesh.positions, 3))
    : solidGeometry(solid)
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
  if (!geometry.getAttribute('uv')) {
    const count = geometry.getAttribute('position').count
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2))
  }
  const brush = new Brush(geometry)
  brush.position.set(solid.position.x, solid.position.y, solid.position.z)
  brush.rotation.set(
    THREE.MathUtils.degToRad(solid.rotation.x),
    THREE.MathUtils.degToRad(solid.rotation.y),
    THREE.MathUtils.degToRad(solid.rotation.z)
  )
  brush.scale.set(solid.scale.x, solid.scale.y, solid.scale.z)
  brush.updateMatrixWorld()
  return brush
}

export function booleanSolids(target: Solid, tool: Solid, operation: 'union' | 'cut' | 'common', id: string): Solid {
  const evaluator = new Evaluator()
  evaluator.useGroups = false
  const op = operation === 'union' ? ADDITION : operation === 'common' ? INTERSECTION : SUBTRACTION
  const result = evaluator.evaluate(brushFromSolid(target), brushFromSolid(tool), op)
  const solid = meshSolid(id, `${operation}-${target.name}`, result.geometry, target.color)
  return solid
}

export function mirrorSolid(solid: Solid, plane: WorkPlane, id: string): Solid {
  const copy = cloneSolid(solid, id)
  copy.name = `mirror-${solid.name}`
  const gap = Math.max(solid.size.x, solid.size.y, solid.size.z, 20)
  if (plane === 'xy') copy.position = { ...solid.position, z: solid.position.z + gap }
  if (plane === 'xz') copy.position = { ...solid.position, y: solid.position.y + gap }
  if (plane === 'yz') copy.position = { ...solid.position, x: solid.position.x + gap }
  if (copy.mesh) {
    const normals = copy.mesh.normals.slice()
    const positions = copy.mesh.positions.slice()
    const axis = plane === 'xy' ? 2 : plane === 'xz' ? 1 : 0
    for (let i = axis; i < positions.length; i += 3) {
      positions[i] *= -1
      normals[i] *= -1
    }
    copy.mesh = { positions, normals }
  } else {
    if (plane === 'xy') copy.scale = { ...copy.scale, z: -Math.abs(copy.scale.z) }
    if (plane === 'xz') copy.scale = { ...copy.scale, y: -Math.abs(copy.scale.y) }
    if (plane === 'yz') copy.scale = { ...copy.scale, x: -Math.abs(copy.scale.x) }
  }
  return copy
}

export function linearPattern(solid: Solid, count: number, spacing: number, axis: 'x' | 'y' | 'z', nextId: () => string): Solid[] {
  const copies: Solid[] = []
  const total = Math.max(2, Math.min(20, Math.round(count)))
  for (let i = 1; i < total; i++) {
    const copy = cloneSolid(solid, nextId())
    copy.name = `${solid.name}-${i + 1}`
    const delta = spacing * i
    copy.position = {
      x: solid.position.x + (axis === 'x' ? delta : 0),
      y: solid.position.y + (axis === 'y' ? delta : 0),
      z: solid.position.z + (axis === 'z' ? delta : 0)
    }
    copies.push(copy)
  }
  return copies
}

export function polarPattern(solid: Solid, count: number, radius: number, nextId: () => string): Solid[] {
  const copies: Solid[] = []
  const total = Math.max(2, Math.min(24, Math.round(count)))
  for (let i = 1; i < total; i++) {
    const angle = (Math.PI * 2 * i) / total
    const copy = cloneSolid(solid, nextId())
    copy.name = `${solid.name}-p${i + 1}`
    copy.position = {
      x: solid.position.x + Math.cos(angle) * radius,
      y: solid.position.y,
      z: solid.position.z + Math.sin(angle) * radius
    }
    copy.rotation = { ...solid.rotation, y: solid.rotation.y + (360 * i) / total }
    copies.push(copy)
  }
  return copies
}

export function holeTool(diameter: number, depth: number, at: Vec3, id: string): Solid {
  const geometry = new THREE.CylinderGeometry(Math.max(0.2, diameter) / 2, Math.max(0.2, diameter) / 2, Math.max(0.2, depth), 24)
  const solid = meshSolid(id, 'hole-tool', geometry, '#d0d7de')
  solid.position = { ...at }
  return solid
}

export function solidVolume(solid: Solid): number {
  if (solid.kind === 'box') return Math.abs(solid.size.x * solid.size.y * solid.size.z * solid.scale.x * solid.scale.y * solid.scale.z)
  if (solid.kind === 'sphere') {
    const r = solid.size.radius * Math.max(solid.scale.x, solid.scale.y, solid.scale.z)
    return (4 / 3) * Math.PI * r * r * r
  }
  if (solid.kind === 'cylinder' || solid.kind === 'cone') {
    const r = solid.size.radius * solid.scale.x
    const h = solid.size.y * solid.scale.y
    return solid.kind === 'cylinder' ? Math.PI * r * r * h : (Math.PI * r * r * h) / 3
  }
  if (!solid.mesh) return 0
  const p = solid.mesh.positions
  let volume = 0
  for (let i = 0; i < p.length; i += 9) {
    const ax = p[i], ay = p[i + 1], az = p[i + 2]
    const bx = p[i + 3], by = p[i + 4], bz = p[i + 5]
    const cx = p[i + 6], cy = p[i + 7], cz = p[i + 8]
    volume += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
  }
  return Math.abs(volume) / 6
}

export function toObj(solids: Solid[]): string {
  const lines = ['# MyCAD OBJ']
  let offset = 1
  solids.forEach((solid, index) => {
    lines.push(`o ${solid.name || `solid-${index}`}`)
    const geometry = solid.kind === 'mesh' && solid.mesh
      ? positionsToGeometry(solid.mesh.positions)
      : solidGeometry(solid)
    const position = geometry.getAttribute('position')
    for (let i = 0; i < position.count; i++) {
      lines.push(`v ${position.getX(i) + solid.position.x} ${position.getY(i) + solid.position.y} ${position.getZ(i) + solid.position.z}`)
    }
    if (geometry.getIndex()) {
      const indexAttr = geometry.getIndex()
      for (let i = 0; i < indexAttr.count; i += 3) {
        lines.push(`f ${indexAttr.getX(i) + offset} ${indexAttr.getX(i + 1) + offset} ${indexAttr.getX(i + 2) + offset}`)
      }
      offset += position.count
    } else {
      for (let i = 0; i < position.count; i += 3) lines.push(`f ${i + offset} ${i + offset + 1} ${i + offset + 2}`)
      offset += position.count
    }
  })
  return lines.join('\n')
}

function positionsToGeometry(positions: number[]) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geometry
}
