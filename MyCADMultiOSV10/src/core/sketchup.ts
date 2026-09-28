// SketchUp-style modelling: push/pull, follow me, groups & components, tags,
// scenes, styles, shadows, section planes, sandbox terrain, solid tools.
import * as THREE from 'three'
import type { Solid, Vec3 } from './model'
import { cloneSolid } from './model'
import { booleanSolids } from './part'
import { boundingBoxOf, meshSolidFrom, trianglePositions } from './primitives'
import { makeWire, offsetWire, wireArea, wireLength, type Wire } from './draftwb'

function geometryFrom(positions: number[]) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

/**
 * Face normal from the loop itself (Newell's method), so a face drawn on any
 * plane is extruded perpendicular to itself.
 */
export function faceNormal(face: Wire): Vec3 {
  let x = 0
  let y = 0
  let z = 0
  const n = face.points.length
  for (let i = 0; i < n; i++) {
    const a = face.points[i]
    const b = face.points[(i + 1) % n]
    x += (a.y - b.y) * (a.z + b.z)
    y += (a.z - b.z) * (a.x + b.x)
    z += (a.x - b.x) * (a.y + b.y)
  }
  const length = Math.hypot(x, y, z)
  if (length < 1e-9) return { x: 0, y: 1, z: 0 }
  return { x: x / length, y: y / length, z: z / length }
}

/**
 * Push/Pull: extrude a closed face along its normal (SketchUp's core tool).
 * A negative distance pushes the face into the model. The direction defaults to
 * the face's own normal; pass `normal` to force another direction.
 */
export function pushPull(face: Wire, distance: number, id: string, normal?: Vec3): Solid {
  if (face.points.length < 3) throw new Error('푸시풀: 닫힌 면이 필요합니다.')
  const length = Math.abs(distance) < 1e-6 ? 1e-6 : distance
  const unit = normalize(normal ?? faceNormal(face))
  const offset = { x: unit.x * length, y: unit.y * length, z: unit.z * length }
  const positions: number[] = []
  const n = face.points.length
  for (let i = 0; i < n; i++) {
    const a = face.points[i]
    const b = face.points[(i + 1) % n]
    const a2 = add(a, offset)
    const b2 = add(b, offset)
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, b2.x, b2.y, b2.z)
    positions.push(a.x, a.y, a.z, b2.x, b2.y, b2.z, a2.x, a2.y, a2.z)
  }
  for (let i = 1; i < n - 1; i++) {
    const a = face.points[0]
    const b = face.points[i]
    const c = face.points[i + 1]
    positions.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z)
    const a2 = add(a, offset)
    const b2 = add(b, offset)
    const c2 = add(c, offset)
    positions.push(a2.x, a2.y, a2.z, b2.x, b2.y, b2.z, c2.x, c2.y, c2.z)
  }
  const solid = meshSolidFrom(id, `PushPull-${face.name}`, geometryFrom(positions), '#cfd8e3')
  return solid
}

/** Follow Me: sweep a closed profile along a path. */
export function followMe(profile: Wire, path: Vec3[], id: string): Solid {
  if (path.length < 2) throw new Error('폴로미: 경로가 필요합니다.')
  const rings = path.map((point, index) => {
    const next = path[Math.min(path.length - 1, index + 1)]
    const previous = path[Math.max(0, index - 1)]
    const tangent = normalize({ x: next.x - previous.x, y: next.y - previous.y, z: next.z - previous.z })
    const helper = Math.abs(tangent.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
    const side = normalize(cross(tangent, helper))
    const up = cross(side, tangent)
    return profile.points.map((p) => ({
      x: point.x + side.x * p.x + up.x * p.y,
      y: point.y + side.y * p.x + up.y * p.y,
      z: point.z + side.z * p.x + up.z * p.y
    }))
  })
  const positions: number[] = []
  const count = profile.points.length
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < count; j++) {
      const k = (j + 1) % count
      const a = rings[i][j], b = rings[i][k], c = rings[i + 1][k], d = rings[i + 1][j]
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
      positions.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z)
    }
  }
  const cap = (ring: Vec3[], flip: boolean) => {
    for (let i = 1; i < ring.length - 1; i++) {
      const a = ring[0], b = ring[i], c = ring[i + 1]
      if (flip) positions.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z)
      else positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
    }
  }
  cap(rings[0], true)
  cap(rings[rings.length - 1], false)
  return meshSolidFrom(id, `FollowMe-${profile.name}`, geometryFrom(positions), '#d7c3a5')
}

/** Offset tool on a face loop. */
export function offsetFace(face: Wire, distance: number): Wire {
  return offsetWire(face, distance)
}

/** Intersect Faces: the section polyline where two solids meet. */
export function intersectFaces(a: Solid, b: Solid, id: string): Wire {
  const boxA = boundingBoxOf([a])
  const boxB = boundingBoxOf([b])
  const level = (Math.max(boxA.min.y, boxB.min.y) + Math.min(boxA.max.y, boxB.max.y)) / 2
  const points: Vec3[] = []
  for (const solid of [a, b]) {
    const positions = trianglePositions(solid)
    for (let i = 0; i + 8 < positions.length; i += 9) {
      const tri: Vec3[] = [0, 3, 6].map((offset) => ({
        x: positions[i + offset] * solid.scale.x + solid.position.x,
        y: positions[i + offset + 1] * solid.scale.y + solid.position.y,
        z: positions[i + offset + 2] * solid.scale.z + solid.position.z
      }))
      for (let e = 0; e < 3; e++) {
        const p = tri[e]
        const q = tri[(e + 1) % 3]
        if ((p.y - level) * (q.y - level) > 0 || Math.abs(q.y - p.y) < 1e-9) continue
        const t = (level - p.y) / (q.y - p.y)
        const point = { x: p.x + (q.x - p.x) * t, y: level, z: p.z + (q.z - p.z) * t }
        const insideOther = solid === a
          ? point.x >= boxB.min.x && point.x <= boxB.max.x && point.z >= boxB.min.z && point.z <= boxB.max.z
          : point.x >= boxA.min.x && point.x <= boxA.max.x && point.z >= boxA.min.z && point.z <= boxA.max.z
        if (insideOther) points.push(point)
      }
    }
  }
  if (points.length === 0) throw new Error('교차 면: 두 솔리드가 겹치지 않습니다.')
  const center = points.reduce((acc, point) => ({
    x: acc.x + point.x / points.length, y: level, z: acc.z + point.z / points.length
  }), { x: 0, y: level, z: 0 })
  points.sort((p, q) => Math.atan2(p.z - center.z, p.x - center.x) - Math.atan2(q.z - center.z, q.x - center.x))
  return makeWire(id, 'Intersection', points, true)
}

/** Soften / Smooth Edges: average normals below the break angle. */
export function softenEdges(solid: Solid, breakAngleDeg: number, id: string): Solid {
  const positions = trianglePositions(solid)
  const limit = Math.cos((Math.max(0, Math.min(180, breakAngleDeg)) * Math.PI) / 180)
  const faceNormals: Vec3[] = []
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const a = { x: positions[i], y: positions[i + 1], z: positions[i + 2] }
    const b = { x: positions[i + 3], y: positions[i + 4], z: positions[i + 5] }
    const c = { x: positions[i + 6], y: positions[i + 7], z: positions[i + 8] }
    faceNormals.push(normalize(cross(sub(b, a), sub(c, a))))
  }
  const accumulator = new Map<string, Vec3[]>()
  const keyOf = (i: number) => `${positions[i].toFixed(4)},${positions[i + 1].toFixed(4)},${positions[i + 2].toFixed(4)}`
  for (let f = 0; f < faceNormals.length; f++) {
    for (let v = 0; v < 3; v++) {
      const k = keyOf(f * 9 + v * 3)
      const list = accumulator.get(k) ?? []
      list.push(faceNormals[f])
      accumulator.set(k, list)
    }
  }
  const normals: number[] = []
  for (let f = 0; f < faceNormals.length; f++) {
    for (let v = 0; v < 3; v++) {
      const k = keyOf(f * 9 + v * 3)
      const list = (accumulator.get(k) ?? [faceNormals[f]]).filter((normal) => dot(normal, faceNormals[f]) >= limit)
      const sum = list.reduce((acc, normal) => ({ x: acc.x + normal.x, y: acc.y + normal.y, z: acc.z + normal.z }), { x: 0, y: 0, z: 0 })
      const unit = normalize(sum.x || sum.y || sum.z ? sum : faceNormals[f])
      normals.push(unit.x, unit.y, unit.z)
    }
  }
  return { ...solid, id, name: `Soften-${solid.name}`, kind: 'mesh', mesh: { positions: positions.slice(), normals } }
}

export interface SuGroup {
  id: string
  name: string
  solidIds: string[]
  /** tag/layer name */
  tag: string
  locked: boolean
}

export interface ComponentDefinition {
  id: string
  name: string
  solids: Solid[]
  /** insertion point */
  origin: Vec3
}

export interface ComponentInstance {
  id: string
  definitionId: string
  name: string
  position: Vec3
  rotation: Vec3
  scale: Vec3
}

export function makeGroup(id: string, name: string, solids: Solid[], tag = 'Untagged'): SuGroup {
  return { id, name, solidIds: solids.map((solid) => solid.id), tag, locked: false }
}

export function explodeGroup(group: SuGroup): string[] {
  return group.solidIds.slice()
}

export function makeComponentDefinition(id: string, name: string, solids: Solid[]): ComponentDefinition {
  const box = boundingBoxOf(solids)
  return {
    id,
    name,
    origin: { x: box.center.x, y: box.min.y, z: box.center.z },
    solids: solids.map((solid) => cloneSolid(solid, `${id}-${solid.id}`))
  }
}

export function placeInstance(definition: ComponentDefinition, id: string, position: Vec3, rotationY = 0, scale = 1): ComponentInstance {
  return {
    id,
    definitionId: definition.id,
    name: `${definition.name}#${id}`,
    position: { ...position },
    rotation: { x: 0, y: rotationY, z: 0 },
    scale: { x: scale, y: scale, z: scale }
  }
}

/** Materialise a component instance into solids (what the viewport renders). */
export function instanceSolids(definition: ComponentDefinition, instance: ComponentInstance, nextId: () => string): Solid[] {
  const radians = (instance.rotation.y * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return definition.solids.map((solid) => {
    const local = {
      x: (solid.position.x - definition.origin.x) * instance.scale.x,
      y: (solid.position.y - definition.origin.y) * instance.scale.y,
      z: (solid.position.z - definition.origin.z) * instance.scale.z
    }
    const copy = cloneSolid(solid, nextId())
    copy.name = `${instance.name}/${solid.name}`
    copy.position = {
      x: instance.position.x + local.x * cos + local.z * sin,
      y: instance.position.y + local.y,
      z: instance.position.z + -local.x * sin + local.z * cos
    }
    copy.rotation = { ...solid.rotation, y: solid.rotation.y + instance.rotation.y }
    copy.scale = {
      x: solid.scale.x * instance.scale.x,
      y: solid.scale.y * instance.scale.y,
      z: solid.scale.z * instance.scale.z
    }
    return copy
  })
}

export interface Tag {
  name: string
  visible: boolean
  color: string
  /** dashes for the tag's edges */
  dashes: 'solid' | 'dash' | 'dot'
}

export function defaultTags(): Tag[] {
  return [
    { name: 'Untagged', visible: true, color: '#8fa0b0', dashes: 'solid' },
    { name: 'Structure', visible: true, color: '#7ec8ff', dashes: 'solid' },
    { name: 'Furniture', visible: true, color: '#f0a35e', dashes: 'dash' },
    { name: 'Site', visible: true, color: '#8fd18f', dashes: 'dot' }
  ]
}

export function visibleByTags(solids: Solid[], groups: SuGroup[], tags: Tag[]): Solid[] {
  const hidden = new Set(tags.filter((tag) => !tag.visible).map((tag) => tag.name))
  const hiddenSolids = new Set(groups.filter((group) => hidden.has(group.tag)).flatMap((group) => group.solidIds))
  return solids.filter((solid) => !hiddenSolids.has(solid.id))
}

export type StyleId = 'shaded' | 'shadedWithTextures' | 'hiddenLine' | 'wireframe' | 'monochrome' | 'xray' | 'sketchy'

export interface Style {
  id: StyleId
  name: string
  edges: boolean
  profiles: number
  background: string
  faceFront: string
  faceBack: string
  opacity: number
}

export const STYLES: Style[] = [
  { id: 'shaded', name: 'Shaded', edges: true, profiles: 2, background: '#e9eef3', faceFront: '#ffffff', faceBack: '#9fb4c7', opacity: 1 },
  { id: 'shadedWithTextures', name: 'Shaded with textures', edges: true, profiles: 2, background: '#eef2f6', faceFront: '#ffffff', faceBack: '#9fb4c7', opacity: 1 },
  { id: 'hiddenLine', name: 'Hidden line', edges: true, profiles: 3, background: '#ffffff', faceFront: '#ffffff', faceBack: '#ffffff', opacity: 1 },
  { id: 'wireframe', name: 'Wireframe', edges: true, profiles: 1, background: '#ffffff', faceFront: 'transparent', faceBack: 'transparent', opacity: 0 },
  { id: 'monochrome', name: 'Monochrome', edges: true, profiles: 2, background: '#f2f2f2', faceFront: '#dcdcdc', faceBack: '#b0b0b0', opacity: 1 },
  { id: 'xray', name: 'X-ray', edges: true, profiles: 2, background: '#eef2f6', faceFront: '#cfe3f2', faceBack: '#cfe3f2', opacity: 0.4 },
  { id: 'sketchy', name: 'Sketchy edges', edges: true, profiles: 4, background: '#fbf7ee', faceFront: '#ffffff', faceBack: '#e0d6c4', opacity: 1 }
]

export interface ShadowSettings {
  enabled: boolean
  /** 0..24 */
  timeOfDay: number
  /** 1..365 */
  dayOfYear: number
  /** deg */
  latitude: number
  light: number
  dark: number
}

export function defaultShadows(): ShadowSettings {
  return { enabled: true, timeOfDay: 14, dayOfYear: 172, latitude: 37.5, light: 80, dark: 45 }
}

/** Sun direction for the shadow settings (simplified solar position). */
export function sunDirection(settings: ShadowSettings): Vec3 {
  const declination = 23.45 * Math.sin((2 * Math.PI * (settings.dayOfYear - 81)) / 365)
  const hourAngle = (settings.timeOfDay - 12) * 15
  const lat = (settings.latitude * Math.PI) / 180
  const dec = (declination * Math.PI) / 180
  const ha = (hourAngle * Math.PI) / 180
  const altitude = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha))
  const azimuth = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(ha))
  return {
    x: Math.cos(altitude) * Math.sin(azimuth),
    y: Math.sin(altitude),
    z: Math.cos(altitude) * Math.cos(azimuth)
  }
}

export interface Camera {
  eye: Vec3
  target: Vec3
  up: Vec3
  /** deg, used in perspective mode */
  fieldOfView: number
  perspective: boolean
  /** parallel projection height, mm */
  height: number
}

export function defaultCamera(): Camera {
  return { eye: { x: 200, y: 160, z: 220 }, target: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, fieldOfView: 35, perspective: true, height: 300 }
}

/** Zoom Extents: fit the whole model in the view. */
export function zoomExtents(camera: Camera, solids: Solid[], aspect = 16 / 9): Camera {
  const box = boundingBoxOf(solids)
  const radius = Math.max(1, Math.hypot(box.size.x, box.size.y, box.size.z) / 2)
  const fov = (camera.fieldOfView * Math.PI) / 180
  const distance = (radius / Math.tan(fov / 2)) * 1.2
  const direction = normalize(sub(camera.eye, camera.target))
  return {
    ...camera,
    target: { ...box.center },
    eye: {
      x: box.center.x + direction.x * distance,
      y: box.center.y + direction.y * distance,
      z: box.center.z + direction.z * distance
    },
    height: Math.max(1, (radius * 2.4) / Math.min(1, aspect))
  }
}

/** Position Camera / Look Around: place the eye at a height and aim it. */
export function positionCamera(camera: Camera, at: Vec3, eyeHeight: number, lookAt: Vec3): Camera {
  return { ...camera, eye: { x: at.x, y: at.y + eyeHeight, z: at.z }, target: { ...lookAt } }
}

/** Walk: step the camera forward/sideways keeping its height. */
export function walkCamera(camera: Camera, forward: number, side: number): Camera {
  const direction = normalize(sub(camera.target, camera.eye))
  const right = normalize(cross(direction, camera.up))
  const delta = {
    x: direction.x * forward + right.x * side,
    y: 0,
    z: direction.z * forward + right.z * side
  }
  return {
    ...camera,
    eye: add(camera.eye, delta),
    target: add(camera.target, delta)
  }
}

export interface Scene {
  name: string
  camera: Camera
  style: StyleId
  shadows: ShadowSettings
  hiddenTags: string[]
  sectionPlaneId?: string
}

export function saveScene(name: string, camera: Camera, style: StyleId, shadows: ShadowSettings, tags: Tag[], sectionPlaneId?: string): Scene {
  return {
    name,
    camera: { ...camera, eye: { ...camera.eye }, target: { ...camera.target }, up: { ...camera.up } },
    style,
    shadows: { ...shadows },
    hiddenTags: tags.filter((tag) => !tag.visible).map((tag) => tag.name),
    sectionPlaneId
  }
}

export function applyScene(scene: Scene, tags: Tag[]): { camera: Camera; style: StyleId; shadows: ShadowSettings; tags: Tag[] } {
  const hidden = new Set(scene.hiddenTags)
  return {
    camera: scene.camera,
    style: scene.style,
    shadows: scene.shadows,
    tags: tags.map((tag) => ({ ...tag, visible: !hidden.has(tag.name) }))
  }
}

export interface SectionPlane {
  id: string
  name: string
  origin: Vec3
  normal: Vec3
  active: boolean
  /** hide the geometry in front of the plane */
  fill: boolean
}

export function makeSectionPlane(id: string, origin: Vec3, normal: Vec3, name = 'Section'): SectionPlane {
  return { id, name, origin, normal: normalize(normal), active: true, fill: true }
}

/** Section cut outline: the polyline where the plane crosses the solids. */
export function sectionCut(solids: Solid[], plane: SectionPlane, id: string): Wire {
  const points: Vec3[] = []
  for (const solid of solids) {
    const positions = trianglePositions(solid)
    for (let i = 0; i + 8 < positions.length; i += 9) {
      const tri: Vec3[] = [0, 3, 6].map((offset) => ({
        x: positions[i + offset] * solid.scale.x + solid.position.x,
        y: positions[i + offset + 1] * solid.scale.y + solid.position.y,
        z: positions[i + offset + 2] * solid.scale.z + solid.position.z
      }))
      const signed = tri.map((point) => dot(sub(point, plane.origin), plane.normal))
      for (let e = 0; e < 3; e++) {
        const f = (e + 1) % 3
        if (signed[e] * signed[f] > 0 || Math.abs(signed[f] - signed[e]) < 1e-9) continue
        const t = signed[e] / (signed[e] - signed[f])
        points.push({
          x: tri[e].x + (tri[f].x - tri[e].x) * t,
          y: tri[e].y + (tri[f].y - tri[e].y) * t,
          z: tri[e].z + (tri[f].z - tri[e].z) * t
        })
      }
    }
  }
  return makeWire(id, 'SectionCut', points, false)
}

export interface SuMaterial {
  name: string
  color: string
  /** 0..1, 1 = opaque */
  opacity: number
  texture?: string
}

export function defaultMaterials(): SuMaterial[] {
  return [
    { name: 'Default', color: '#cfd8e3', opacity: 1 },
    { name: 'Brick', color: '#9c5b4a', opacity: 1, texture: 'brick' },
    { name: 'Wood Floor', color: '#c08a4e', opacity: 1, texture: 'wood' },
    { name: 'Glass', color: '#bfe4f5', opacity: 0.35, texture: 'glass' },
    { name: 'Metal', color: '#b7bfc7', opacity: 1, texture: 'metal' },
    { name: 'Grass', color: '#6fae4e', opacity: 1, texture: 'grass' },
    { name: 'Concrete', color: '#b4b4ac', opacity: 1, texture: 'concrete' }
  ]
}

/** Paint Bucket: apply a material to a solid. */
export function paintSolid(solid: Solid, material: SuMaterial): Solid {
  return {
    ...solid,
    color: material.color,
    metalness: material.texture === 'metal' ? 0.8 : 0.1,
    roughness: material.texture === 'glass' ? 0.05 : 0.6
  }
}

export interface Measurement {
  kind: 'tape' | 'protractor' | 'dimension' | 'area' | 'perimeter'
  text: string
  value: number
}

/** Tape Measure between two points. */
export function tapeMeasure(a: Vec3, b: Vec3, unit = 'mm'): Measurement {
  const value = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
  return { kind: 'tape', text: `${value.toFixed(2)} ${unit}`, value }
}

/** Protractor angle at `center` between two legs. */
export function protractor(center: Vec3, a: Vec3, b: Vec3): Measurement {
  const v1 = sub(a, center)
  const v2 = sub(b, center)
  const cosine = dot(v1, v2) / ((Math.hypot(v1.x, v1.y, v1.z) || 1) * (Math.hypot(v2.x, v2.y, v2.z) || 1))
  const value = (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI
  return { kind: 'protractor', text: `${value.toFixed(1)}°`, value }
}

/** Entity Info: area and perimeter of a face. */
export function faceInfo(face: Wire): Measurement[] {
  return [
    { kind: 'area', text: `${(wireArea(face) / 1e6).toFixed(4)} m²`, value: wireArea(face) },
    { kind: 'perimeter', text: `${wireLength(face).toFixed(2)} mm`, value: wireLength(face) }
  ]
}

/** 3D Text: extruded glyph blocks, one solid per character. */
export function text3d(text: string, height: number, depth: number, nextId: () => string): Solid[] {
  const size = Math.max(1, height)
  const advance = size * 0.72
  const solids: Solid[] = []
  Array.from(text).forEach((char, index) => {
    if (char.trim() === '') return
    const x = index * advance
    const face = makeWire(`glyph-${index}`, `Glyph-${char}`, [
      { x, y: 0, z: 0 },
      { x: x + advance * 0.72, y: 0, z: 0 },
      { x: x + advance * 0.72, y: size, z: 0 },
      { x, y: size, z: 0 }
    ], true)
    const solid = pushPull(face, Math.max(0.2, depth), nextId())
    solid.name = `Text3D-${char}`
    solids.push(solid)
  })
  if (solids.length === 0) throw new Error('3D 텍스트: 문자를 입력하세요.')
  return solids
}

/** Move/Rotate/Scale with copies (SketchUp's ctrl-modifier behaviour). */
export function moveCopies(solid: Solid, delta: Vec3, count: number, nextId: () => string): Solid[] {
  const total = Math.max(1, Math.min(200, Math.round(count)))
  return Array.from({ length: total }, (_, index) => {
    const copy = cloneSolid(solid, nextId())
    copy.name = `${solid.name}-${index + 2}`
    copy.position = {
      x: solid.position.x + delta.x * (index + 1),
      y: solid.position.y + delta.y * (index + 1),
      z: solid.position.z + delta.z * (index + 1)
    }
    return copy
  })
}

export function rotateCopies(solid: Solid, center: Vec3, angleDeg: number, count: number, nextId: () => string): Solid[] {
  const total = Math.max(1, Math.min(200, Math.round(count)))
  return Array.from({ length: total }, (_, index) => {
    const angle = ((angleDeg * (index + 1)) * Math.PI) / 180
    const dx = solid.position.x - center.x
    const dz = solid.position.z - center.z
    const copy = cloneSolid(solid, nextId())
    copy.name = `${solid.name}-r${index + 2}`
    copy.position = {
      x: center.x + dx * Math.cos(angle) - dz * Math.sin(angle),
      y: solid.position.y,
      z: center.z + dx * Math.sin(angle) + dz * Math.cos(angle)
    }
    copy.rotation = { ...solid.rotation, y: solid.rotation.y + angleDeg * (index + 1) }
    return copy
  })
}

export type SolidToolKind = 'union' | 'subtract' | 'trim' | 'split' | 'intersect' | 'outerShell'

/** Solid Tools (SketchUp Pro): boolean operations on two solids. */
export function solidTool(kind: SolidToolKind, a: Solid, b: Solid, nextId: () => string): Solid[] {
  if (kind === 'union' || kind === 'outerShell') return [booleanSolids(a, b, 'union', nextId())]
  if (kind === 'subtract' || kind === 'trim') return [booleanSolids(a, b, 'cut', nextId())]
  if (kind === 'intersect') return [booleanSolids(a, b, 'common', nextId())]
  return [booleanSolids(a, b, 'cut', nextId()), booleanSolids(a, b, 'common', nextId()), booleanSolids(b, a, 'cut', nextId())]
}

/** Sandbox > From Scratch: a flat terrain grid. */
export function terrainFromScratch(width: number, depth: number, divisions: number, id: string): Solid {
  const n = Math.max(1, Math.min(60, Math.round(divisions)))
  const positions: number[] = []
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x0 = -width / 2 + (width * i) / n
      const x1 = -width / 2 + (width * (i + 1)) / n
      const z0 = -depth / 2 + (depth * j) / n
      const z1 = -depth / 2 + (depth * (j + 1)) / n
      positions.push(x0, 0, z0, x1, 0, z0, x0, 0, z1)
      positions.push(x1, 0, z0, x1, 0, z1, x0, 0, z1)
    }
  }
  return meshSolidFrom(id, 'Terrain', geometryFrom(positions), '#8fbf6a')
}

/** Sandbox > From Contours: triangulate a terrain from contour point rows. */
export function terrainFromContours(contours: Vec3[][], id: string): Solid {
  const rows = contours.filter((row) => row.length >= 2)
  if (rows.length < 2) throw new Error('컨투어: 등고선이 2개 이상 필요합니다.')
  const positions: number[] = []
  for (let r = 0; r < rows.length - 1; r++) {
    const count = Math.min(rows[r].length, rows[r + 1].length)
    for (let i = 0; i < count - 1; i++) {
      const a = rows[r][i]
      const b = rows[r][i + 1]
      const c = rows[r + 1][i + 1]
      const d = rows[r + 1][i]
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
      positions.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z)
    }
  }
  return meshSolidFrom(id, 'TerrainContours', geometryFrom(positions), '#8fbf6a')
}

/** Sandbox > Smoove: raise the terrain vertices inside a radius. */
export function smooveTerrain(solid: Solid, center: Vec3, radius: number, height: number, id: string): Solid {
  const positions = trianglePositions(solid).slice()
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const distance = Math.hypot(positions[i] - center.x, positions[i + 2] - center.z)
    if (distance > radius) continue
    const falloff = Math.cos((distance / Math.max(1e-6, radius)) * (Math.PI / 2))
    positions[i + 1] += height * falloff
  }
  return { ...solid, id, name: `Smoove-${solid.name}`, kind: 'mesh', mesh: { positions, normals: [] } }
}

/** Outliner: the model tree as SketchUp shows it. */
export function outlinerLines(groups: SuGroup[], instances: ComponentInstance[], solids: Solid[]): string[] {
  const lines: string[] = ['Model']
  const grouped = new Set(groups.flatMap((group) => group.solidIds))
  for (const group of groups) {
    lines.push(`  ▸ ${group.name} <${group.tag}>${group.locked ? ' (locked)' : ''}`)
    for (const solidId of group.solidIds) {
      const solid = solids.find((item) => item.id === solidId)
      if (solid) lines.push(`      ${solid.name}`)
    }
  }
  for (const instance of instances) lines.push(`  ◆ ${instance.name}`)
  for (const solid of solids) {
    if (!grouped.has(solid.id)) lines.push(`  · ${solid.name}`)
  }
  return lines
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / length, y: v.y / length, z: v.z / length }
}
