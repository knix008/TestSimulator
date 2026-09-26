// CATIA Sheet Metal Design / FreeCAD SheetMetal: walls, flanges, bends, unfolding.
import type { Solid, Vec3 } from './model'
import { createSolid } from './model'
import { makeWire, type Wire } from './draftwb'

export interface SheetMetalParameters {
  /** mm */
  thickness: number
  /** inner bend radius, mm */
  bendRadius: number
  /** neutral axis position, 0..1 */
  kFactor: number
  /** deg */
  defaultBendAngle: number
}

export function defaultSheetMetal(): SheetMetalParameters {
  return { thickness: 2, bendRadius: 2, kFactor: 0.44, defaultBendAngle: 90 }
}

export interface SheetWall {
  id: string
  name: string
  /** mm */
  length: number
  width: number
  /** bend angle relative to the previous wall, deg */
  bendAngle: number
  bendRadius: number
}

export interface SheetPart {
  name: string
  parameters: SheetMetalParameters
  walls: SheetWall[]
}

export function createSheetPart(name: string, parameters = defaultSheetMetal()): SheetPart {
  return { name, parameters, walls: [] }
}

/** Sheet Metal > Wall: the base face of the part. */
export function addWall(part: SheetPart, id: string, length: number, width: number): SheetPart {
  return {
    ...part,
    walls: [...part.walls, { id, name: `Wall${part.walls.length + 1}`, length, width, bendAngle: 0, bendRadius: part.parameters.bendRadius }]
  }
}

/** Sheet Metal > Flange: a wall bent off the previous one. */
export function addFlange(part: SheetPart, id: string, length: number, angleDeg = part.parameters.defaultBendAngle, radius = part.parameters.bendRadius): SheetPart {
  const previous = part.walls[part.walls.length - 1]
  if (!previous) throw new Error('플랜지: 기준 월이 필요합니다.')
  return {
    ...part,
    walls: [...part.walls, { id, name: `Flange${part.walls.length}`, length, width: previous.width, bendAngle: angleDeg, bendRadius: radius }]
  }
}

/** Bend allowance (mm) for one bend, using the K-factor method. */
export function bendAllowance(thickness: number, radius: number, angleDeg: number, kFactor: number): number {
  const angle = (Math.abs(angleDeg) * Math.PI) / 180
  return angle * (radius + kFactor * thickness)
}

/** Bend deduction (mm): outside setback pair minus the allowance. */
export function bendDeduction(thickness: number, radius: number, angleDeg: number, kFactor: number): number {
  const angle = (Math.abs(angleDeg) * Math.PI) / 180
  const setback = (radius + thickness) * Math.tan(angle / 2)
  return 2 * setback - bendAllowance(thickness, radius, angleDeg, kFactor)
}

/** Minimum flange length that can still be formed on a press brake. */
export function minimumFlange(thickness: number, radius: number): number {
  return radius + thickness + thickness * 1.5
}

export interface UnfoldResult {
  /** total developed length, mm */
  flatLength: number
  width: number
  bends: Array<{ id: string; angle: number; allowance: number; deduction: number; position: number }>
  outline: Wire
}

/** Sheet Metal > Unfold: developed length and flat-pattern outline. */
export function unfold(part: SheetPart): UnfoldResult {
  const { thickness, kFactor } = part.parameters
  let flatLength = 0
  let position = 0
  const bends: UnfoldResult['bends'] = []
  part.walls.forEach((wall, index) => {
    flatLength += wall.length
    position += wall.length
    if (index < part.walls.length - 1) {
      const next = part.walls[index + 1]
      if (next.bendAngle !== 0) {
        const allowance = bendAllowance(thickness, next.bendRadius, next.bendAngle, kFactor)
        const deduction = bendDeduction(thickness, next.bendRadius, next.bendAngle, kFactor)
        bends.push({ id: next.id, angle: next.bendAngle, allowance, deduction, position })
        flatLength += allowance - thickness * 2 > 0 ? allowance - thickness * 2 : 0
      }
    }
  })
  const width = part.walls[0]?.width ?? 0
  const outline = makeWire(`${part.name}-flat`, `${part.name}-flat`, [
    { x: 0, y: 0, z: 0 },
    { x: flatLength, y: 0, z: 0 },
    { x: flatLength, y: width, z: 0 },
    { x: 0, y: width, z: 0 }
  ], true)
  return { flatLength, width, bends, outline }
}

/** Build the folded 3D solids for a sheet metal part (one box per wall). */
export function foldedSolids(part: SheetPart, nextId: () => string): Solid[] {
  const solids: Solid[] = []
  let cursor: Vec3 = { x: 0, y: 0, z: 0 }
  let heading = 0
  part.walls.forEach((wall) => {
    heading += (wall.bendAngle * Math.PI) / 180
    const dx = Math.cos(heading) * wall.length
    const dy = Math.sin(heading) * wall.length
    const solid = createSolid('box', nextId(), solids.length + 1)
    solid.name = wall.name
    solid.size = { ...solid.size, x: wall.length, y: part.parameters.thickness, z: wall.width }
    solid.position = { x: cursor.x + dx / 2, y: cursor.y + dy / 2, z: 0 }
    solid.rotation = { x: 0, y: 0, z: (heading * 180) / Math.PI }
    solid.color = '#b9c6d2'
    solids.push(solid)
    cursor = { x: cursor.x + dx, y: cursor.y + dy, z: cursor.z }
  })
  return solids
}

/** Sheet Metal > Hem: a 180° fold back on itself. */
export function addHem(part: SheetPart, id: string, length: number, open = true): SheetPart {
  const radius = open ? part.parameters.thickness : part.parameters.thickness * 0.25
  return addFlange(part, id, Math.max(minimumFlange(part.parameters.thickness, radius), length), 180, radius)
}

/** Sheet Metal > Corner relief diameter recommendation. */
export function cornerRelief(thickness: number, bendRadius: number): number {
  return Math.max(thickness * 1.5, (bendRadius + thickness) * 1.2)
}

export interface SheetMetalCheck {
  ok: boolean
  messages: string[]
}

/** Manufacturability checks for the part. */
export function checkSheetPart(part: SheetPart): SheetMetalCheck {
  const messages: string[] = []
  const minimum = minimumFlange(part.parameters.thickness, part.parameters.bendRadius)
  part.walls.forEach((wall) => {
    if (wall.bendAngle !== 0 && wall.length < minimum) {
      messages.push(`${wall.name}: 플랜지 길이 ${wall.length}mm < 최소 ${minimum.toFixed(2)}mm`)
    }
    if (wall.bendRadius < part.parameters.thickness * 0.5) {
      messages.push(`${wall.name}: 굽힘 반경이 두께의 절반보다 작습니다`)
    }
  })
  if (part.walls.length === 0) messages.push('월이 없습니다')
  return { ok: messages.length === 0, messages }
}

/** DXF flat pattern with bend lines, ready for laser cutting. */
export function flatPatternDxf(part: SheetPart): string {
  const result = unfold(part)
  const lines = ['0', 'SECTION', '2', 'ENTITIES']
  const rect = result.outline.points
  for (let i = 0; i < rect.length; i++) {
    const a = rect[i]
    const b = rect[(i + 1) % rect.length]
    lines.push('0', 'LINE', '8', 'OUTLINE', '10', String(a.x), '20', String(a.y), '11', String(b.x), '21', String(b.y))
  }
  for (const bend of result.bends) {
    lines.push('0', 'LINE', '8', 'BENDLINE', '10', String(bend.position), '20', '0', '11', String(bend.position), '21', String(result.width))
  }
  lines.push('0', 'ENDSEC', '0', 'EOF')
  return lines.join('\n')
}
