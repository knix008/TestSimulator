import type { Feature, Sketch } from './part'
import type { DesignParameter, Mate } from './catia'

export type SolidKind = 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus' | 'plane' | 'mesh'
export type ViewPreset = 'iso' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'
export type ShadeMode = 'shaded' | 'wireframe'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Solid {
  id: string
  name: string
  kind: SolidKind
  position: Vec3
  rotation: Vec3
  scale: Vec3
  size: { x: number; y: number; z: number; radius: number; tube: number }
  color: string
  metalness: number
  roughness: number
  visible: boolean
  locked: boolean
  mesh?: { positions: number[]; normals: number[] }
}

export interface CadDocument {
  id: string
  name: string
  filePath?: string
  solids: Solid[]
  selection: string[]
  preset: ViewPreset
  shade: ShadeMode
  dirty: boolean
  sketches: Sketch[]
  features: Feature[]
  section: boolean
  parameters: DesignParameter[]
  mates: Mate[]
}

export interface ClipboardPayload {
  kind: 'mycad-solids'
  solids: Solid[]
}

export function vec(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z }
}

export function cloneSolid(solid: Solid, id: string): Solid {
  return {
    ...solid,
    id,
    name: solid.name,
    position: { ...solid.position },
    rotation: { ...solid.rotation },
    scale: { ...solid.scale },
    size: { ...solid.size },
    mesh: solid.mesh
      ? { positions: solid.mesh.positions.slice(), normals: solid.mesh.normals.slice() }
      : undefined
  }
}

const DEFAULT_SIZE = { x: 40, y: 40, z: 40, radius: 20, tube: 6 }

export function createSolid(kind: SolidKind, id: string, index: number): Solid {
  const colors = ['#4cc2ff', '#f0a35e', '#7dcea0', '#d98bff', '#f5d76e', '#f1948a', '#aeb6bf']
  const size = { ...DEFAULT_SIZE }
  if (kind === 'sphere') size.radius = 22
  if (kind === 'cylinder' || kind === 'cone') {
    size.radius = 16
    size.y = 48
  }
  if (kind === 'torus') {
    size.radius = 22
    size.tube = 7
  }
  if (kind === 'plane') {
    size.x = 80
    size.z = 80
    size.y = 1
  }
  return {
    id,
    name: `${kind}-${index}`,
    kind,
    position: vec((index % 5) * 50, kind === 'plane' ? 0 : size.y / 2, Math.floor(index / 5) * 50),
    rotation: vec(),
    scale: vec(1, 1, 1),
    size,
    color: colors[index % colors.length],
    metalness: 0.15,
    roughness: 0.45,
    visible: true,
    locked: false
  }
}

export function createDocument(id: string, name: string): CadDocument {
  return {
    id,
    name,
    solids: [],
    selection: [],
    preset: 'iso',
    shade: 'shaded',
    dirty: false,
    sketches: [],
    features: [],
    section: false,
    parameters: [],
    mates: []
  }
}

export function distance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

export function selectedSolids(doc: CadDocument): Solid[] {
  const ids = new Set(doc.selection)
  return doc.solids.filter((solid) => ids.has(solid.id))
}
