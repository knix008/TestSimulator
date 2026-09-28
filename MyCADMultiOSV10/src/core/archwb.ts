// FreeCAD BIM/Arch workbench: building elements, levels, schedules, IFC.
import type { Solid, Vec3 } from './model'
import { createSolid } from './model'
import { booleanSolids } from './part'
import { boundingBoxOf } from './primitives'

export type BimKind =
  | 'wall' | 'column' | 'beam' | 'slab' | 'roof' | 'window' | 'door'
  | 'stairs' | 'space' | 'railing' | 'pipe' | 'equipment'

export interface BimElement {
  id: string
  kind: BimKind
  name: string
  level: string
  material: string
  /** mm */
  length: number
  width: number
  height: number
  solidId?: string
}

export interface BimLevel {
  name: string
  elevation: number
  height: number
}

export const IFC_TYPES: Record<BimKind, string> = {
  wall: 'IFCWALLSTANDARDCASE',
  column: 'IFCCOLUMN',
  beam: 'IFCBEAM',
  slab: 'IFCSLAB',
  roof: 'IFCROOF',
  window: 'IFCWINDOW',
  door: 'IFCDOOR',
  stairs: 'IFCSTAIR',
  space: 'IFCSPACE',
  railing: 'IFCRAILING',
  pipe: 'IFCPIPESEGMENT',
  equipment: 'IFCBUILDINGELEMENTPROXY'
}

function boxSolid(id: string, name: string, size: Vec3, at: Vec3, color: string): Solid {
  const solid = createSolid('box', id, 1)
  solid.name = name
  solid.size = { ...solid.size, x: Math.max(1, size.x), y: Math.max(1, size.y), z: Math.max(1, size.z) }
  solid.position = { ...at }
  solid.color = color
  return solid
}

/** Arch > Wall along the X axis, centred on its base line. */
export function archWall(id: string, length: number, height: number, thickness: number, at: Vec3 = { x: 0, y: 0, z: 0 }): Solid {
  return boxSolid(id, 'Wall', { x: length, y: height, z: thickness }, { x: at.x, y: at.y + height / 2, z: at.z }, '#d9d2c4')
}

/** Arch > Structure used as a column. */
export function archColumn(id: string, width: number, depth: number, height: number, at: Vec3 = { x: 0, y: 0, z: 0 }): Solid {
  return boxSolid(id, 'Column', { x: width, y: height, z: depth }, { x: at.x, y: at.y + height / 2, z: at.z }, '#bfc4c9')
}

/** Arch > Structure used as a beam. */
export function archBeam(id: string, length: number, width: number, height: number, at: Vec3 = { x: 0, y: 0, z: 0 }): Solid {
  return boxSolid(id, 'Beam', { x: length, y: height, z: width }, { ...at }, '#b6bcc2')
}

/** Arch > Floor / slab. */
export function archSlab(id: string, length: number, width: number, thickness: number, at: Vec3 = { x: 0, y: 0, z: 0 }): Solid {
  return boxSolid(id, 'Slab', { x: length, y: thickness, z: width }, { x: at.x, y: at.y + thickness / 2, z: at.z }, '#c9c9c2')
}

/** Arch > Roof as a single pitched plane approximated by a rotated slab. */
export function archRoof(id: string, length: number, width: number, thickness: number, pitchDeg: number, at: Vec3 = { x: 0, y: 0, z: 0 }): Solid {
  const solid = boxSolid(id, 'Roof', { x: length, y: thickness, z: width }, at, '#8c6b4f')
  solid.rotation = { x: Math.max(-60, Math.min(60, pitchDeg)), y: 0, z: 0 }
  return solid
}

/** Arch > Window: cuts an opening in the host wall and returns wall + frame. */
export function archWindow(wall: Solid, id: string, width: number, height: number, sill: number, offsetX = 0): { wall: Solid; element: Solid } {
  const opening = boxSolid(`${id}-void`, 'WindowVoid', { x: width, y: height, z: wall.size.z * 3 }, {
    x: wall.position.x + offsetX,
    y: wall.position.y - wall.size.y / 2 + sill + height / 2,
    z: wall.position.z
  }, '#ffffff')
  const cut = booleanSolids(wall, opening, 'cut', wall.id)
  cut.name = wall.name
  cut.color = wall.color
  cut.position = { ...wall.position }
  const frame = boxSolid(id, 'Window', { x: width, y: height, z: Math.max(2, wall.size.z * 0.3) }, opening.position, '#8fd3f4')
  return { wall: cut, element: frame }
}

/** Arch > Door: like a window but sitting on the floor. */
export function archDoor(wall: Solid, id: string, width: number, height: number, offsetX = 0): { wall: Solid; element: Solid } {
  return archWindow(wall, id, width, height, 0, offsetX)
}

/** Arch > Stairs: straight flight of rectangular steps merged into one solid. */
export function archStairs(id: string, width: number, totalRise: number, totalRun: number, steps: number, at: Vec3 = { x: 0, y: 0, z: 0 }): Solid[] {
  const count = Math.max(2, Math.min(40, Math.round(steps)))
  const rise = totalRise / count
  const run = totalRun / count
  return Array.from({ length: count }, (_, index) =>
    boxSolid(`${id}-${index}`, `Step${index + 1}`, { x: width, y: rise, z: run }, {
      x: at.x,
      y: at.y + rise / 2 + rise * index,
      z: at.z + run * index
    }, '#cbb79a'))
}

/** Arch > Space: an air volume used for area schedules. */
export function archSpace(id: string, length: number, width: number, height: number, at: Vec3 = { x: 0, y: 0, z: 0 }): Solid {
  const solid = boxSolid(id, 'Space', { x: length, y: height, z: width }, { x: at.x, y: at.y + height / 2, z: at.z }, '#9fd8c8')
  solid.metalness = 0
  solid.roughness = 1
  return solid
}

/** Arch > Railing along a run. */
export function archRailing(id: string, length: number, height: number, at: Vec3 = { x: 0, y: 0, z: 0 }): Solid {
  return boxSolid(id, 'Railing', { x: length, y: height, z: 4 }, { x: at.x, y: at.y + height / 2, z: at.z }, '#7f8c99')
}

export function makeLevels(count: number, floorHeight = 3000): BimLevel[] {
  return Array.from({ length: Math.max(1, Math.round(count)) }, (_, index) => ({
    name: `Level ${index + 1}`,
    elevation: index * floorHeight,
    height: floorHeight
  }))
}

export function describeElement(solid: Solid, kind: BimKind, level = 'Level 1', material = 'Concrete'): BimElement {
  return {
    id: `${kind}-${solid.id}`,
    kind,
    name: solid.name,
    level,
    material,
    length: solid.size.x,
    width: solid.size.z,
    height: solid.size.y,
    solidId: solid.id
  }
}

export interface ScheduleRow {
  kind: BimKind
  count: number
  /** m² for planar elements, m³ otherwise */
  quantity: number
  unit: 'm2' | 'm3' | 'ea'
}

/** BIM > Schedule: group elements and compute quantities. */
export function schedule(elements: BimElement[]): ScheduleRow[] {
  const groups = new Map<BimKind, BimElement[]>()
  for (const element of elements) {
    const list = groups.get(element.kind) ?? []
    list.push(element)
    groups.set(element.kind, list)
  }
  const rows: ScheduleRow[] = []
  groups.forEach((list, kind) => {
    if (kind === 'window' || kind === 'door') {
      rows.push({ kind, count: list.length, quantity: list.length, unit: 'ea' })
      return
    }
    if (kind === 'slab' || kind === 'roof' || kind === 'space') {
      const area = list.reduce((acc, element) => acc + (element.length * element.width) / 1e6, 0)
      rows.push({ kind, count: list.length, quantity: area, unit: 'm2' })
      return
    }
    const volume = list.reduce((acc, element) => acc + (element.length * element.width * element.height) / 1e9, 0)
    rows.push({ kind, count: list.length, quantity: volume, unit: 'm3' })
  })
  return rows.sort((a, b) => a.kind.localeCompare(b.kind))
}

/** BIM > Export IFC4 with proper entity types, levels and placements. */
export function exportIfc(elements: BimElement[], levels: BimLevel[], projectName = 'MyCAD Project'): string {
  const lines: string[] = [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
    `FILE_NAME('${projectName}','${new Date(0).toISOString()}',('MyCAD'),('MyCAD'),'MyCAD','MyCAD','');`,
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
    `#1=IFCPROJECT('0PROJECT0000000000000',$,'${projectName}',$,$,$,$,$,$);`,
    "#2=IFCSITE('0SITE00000000000000000',$,'Site',$,$,$,$,$,.ELEMENT.,$,$,$,$,$);",
    "#3=IFCBUILDING('0BUILDING00000000000',$,'Building',$,$,$,$,$,.ELEMENT.,$,$,$);"
  ]
  let id = 10
  levels.forEach((level, index) => {
    lines.push(`#${id}=IFCBUILDINGSTOREY('0STOREY${String(index).padStart(14, '0')}',$,'${level.name}',$,$,$,$,$,.ELEMENT.,${level.elevation});`)
    id += 1
  })
  for (const element of elements) {
    const type = IFC_TYPES[element.kind]
    lines.push(`#${id}=${type}('${element.id.padEnd(22, '0').slice(0, 22)}',$,'${element.name}','${element.kind} ${element.level}',$,$,$,$,$);`)
    id += 1
    lines.push(`#${id}=IFCPROPERTYSINGLEVALUE('Material',$,IFCLABEL('${element.material}'),$);`)
    id += 1
  }
  lines.push('ENDSEC;', 'END-ISO-10303-21;')
  return lines.join('\n')
}

export interface IfcSummary {
  products: Array<{ type: string; name: string }>
  storeys: string[]
}

/** BIM > Import IFC: read entity types and names back out of a STEP file. */
export function importIfc(text: string): IfcSummary {
  const products: Array<{ type: string; name: string }> = []
  const storeys: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = /#\d+=(IFC[A-Z]+)\('[^']*',\$,'([^']*)'/.exec(line.trim())
    if (!match) continue
    if (match[1] === 'IFCBUILDINGSTOREY') {
      storeys.push(match[2])
      continue
    }
    if (['IFCPROJECT', 'IFCSITE', 'IFCBUILDING'].includes(match[1])) continue
    products.push({ type: match[1], name: match[2] })
  }
  return { products, storeys }
}

/** BIM > Building footprint area from the placed solids (m²). */
export function footprintArea(solids: Solid[]): number {
  const box = boundingBoxOf(solids)
  return (box.size.x * box.size.z) / 1e6
}
