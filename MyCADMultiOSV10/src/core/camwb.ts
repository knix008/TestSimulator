// FreeCAD CAM/Path workbench: tools, operations, post processors.
import type { Solid, Vec3 } from './model'
import { boundingBoxOf } from './primitives'

export interface Tool {
  number: number
  name: string
  type: 'endmill' | 'ballend' | 'drill' | 'vbit' | 'chamfer'
  diameter: number
  flutes: number
  /** mm/min */
  feed: number
  /** mm/min */
  plunge: number
  /** rpm */
  spindle: number
}

export const TOOL_LIBRARY: Tool[] = [
  { number: 1, name: '6mm 2F endmill', type: 'endmill', diameter: 6, flutes: 2, feed: 600, plunge: 200, spindle: 12000 },
  { number: 2, name: '3mm 2F endmill', type: 'endmill', diameter: 3, flutes: 2, feed: 400, plunge: 150, spindle: 16000 },
  { number: 3, name: '6mm ball nose', type: 'ballend', diameter: 6, flutes: 2, feed: 500, plunge: 180, spindle: 14000 },
  { number: 4, name: '5mm drill', type: 'drill', diameter: 5, flutes: 2, feed: 120, plunge: 120, spindle: 2000 },
  { number: 5, name: '60° V-bit', type: 'vbit', diameter: 6, flutes: 1, feed: 350, plunge: 150, spindle: 18000 }
]

export type MoveKind = 'rapid' | 'feed' | 'plunge' | 'arc'

export interface PathMove {
  kind: MoveKind
  x: number
  y: number
  z: number
  feed?: number
}

export interface Operation {
  name: string
  kind: 'profile' | 'pocket' | 'drill' | 'surface' | 'engrave' | 'adaptive' | 'helix'
  tool: Tool
  moves: PathMove[]
}

export type Dialect = 'grbl' | 'linuxcnc' | 'mach3' | 'marlin' | 'fanuc'

function rapid(x: number, y: number, z: number): PathMove {
  return { kind: 'rapid', x, y, z }
}

function feedMove(x: number, y: number, z: number, feed: number): PathMove {
  return { kind: 'feed', x, y, z, feed }
}

/** CAM > Profile: contour the outside of a rectangle in depth steps. */
export function profileOperation(width: number, height: number, depth: number, tool: Tool, stepDown = 1, offsetOutside = true): Operation {
  const r = tool.diameter / 2
  const x = Math.abs(width) / 2 + (offsetOutside ? r : -r)
  const y = Math.abs(height) / 2 + (offsetOutside ? r : -r)
  const passes = Math.max(1, Math.ceil(Math.abs(depth) / Math.max(0.1, stepDown)))
  const moves: PathMove[] = [rapid(-x, -y, 5)]
  for (let pass = 1; pass <= passes; pass++) {
    const z = -Math.min(Math.abs(depth), pass * stepDown)
    moves.push({ kind: 'plunge', x: -x, y: -y, z, feed: tool.plunge })
    moves.push(feedMove(x, -y, z, tool.feed))
    moves.push(feedMove(x, y, z, tool.feed))
    moves.push(feedMove(-x, y, z, tool.feed))
    moves.push(feedMove(-x, -y, z, tool.feed))
  }
  moves.push(rapid(-x, -y, 5))
  return { name: 'Profile', kind: 'profile', tool, moves }
}

/** CAM > Pocket: zig-zag clearing with stepover. */
export function pocketOperation(width: number, height: number, depth: number, tool: Tool, stepDown = 1, stepOver = 0.5): Operation {
  const r = tool.diameter / 2
  const x = Math.max(0.5, Math.abs(width) / 2 - r)
  const y = Math.max(0.5, Math.abs(height) / 2 - r)
  const lanes = Math.max(1, Math.ceil((y * 2) / Math.max(0.2, tool.diameter * stepOver)))
  const passes = Math.max(1, Math.ceil(Math.abs(depth) / Math.max(0.1, stepDown)))
  const moves: PathMove[] = [rapid(-x, -y, 5)]
  for (let pass = 1; pass <= passes; pass++) {
    const z = -Math.min(Math.abs(depth), pass * stepDown)
    moves.push({ kind: 'plunge', x: -x, y: -y, z, feed: tool.plunge })
    for (let lane = 0; lane <= lanes; lane++) {
      const laneY = -y + ((y * 2) * lane) / lanes
      const goRight = lane % 2 === 0
      moves.push(feedMove(goRight ? x : -x, laneY, z, tool.feed))
      if (lane < lanes) moves.push(feedMove(goRight ? x : -x, -y + ((y * 2) * (lane + 1)) / lanes, z, tool.feed))
    }
  }
  moves.push(rapid(-x, -y, 5))
  return { name: 'Pocket', kind: 'pocket', tool, moves }
}

/** CAM > Drilling with optional peck cycles. */
export function drillOperation(points: Vec3[], depth: number, tool: Tool, peck = 0): Operation {
  const moves: PathMove[] = []
  for (const point of points) {
    moves.push(rapid(point.x, point.z, 5))
    if (peck > 0) {
      let z = 0
      while (z > -Math.abs(depth)) {
        z = Math.max(-Math.abs(depth), z - peck)
        moves.push({ kind: 'plunge', x: point.x, y: point.z, z, feed: tool.plunge })
        moves.push(rapid(point.x, point.z, 1))
      }
    } else {
      moves.push({ kind: 'plunge', x: point.x, y: point.z, z: -Math.abs(depth), feed: tool.plunge })
    }
    moves.push(rapid(point.x, point.z, 5))
  }
  return { name: 'Drilling', kind: 'drill', tool, moves }
}

/** CAM > 3D surface: raster the top of the bounding box. */
export function surfaceOperation(solids: Solid[], tool: Tool, stepOver = 0.4): Operation {
  const box = boundingBoxOf(solids)
  const lanes = Math.max(1, Math.ceil((box.size.z || 1) / Math.max(0.2, tool.diameter * stepOver)))
  const moves: PathMove[] = [rapid(box.min.x, box.min.z, box.max.y + 5)]
  for (let lane = 0; lane <= lanes; lane++) {
    const z = box.min.z + ((box.size.z || 1) * lane) / lanes
    const goRight = lane % 2 === 0
    moves.push(feedMove(goRight ? box.max.x : box.min.x, z, box.max.y, tool.feed))
    moves.push(feedMove(goRight ? box.max.x : box.min.x, z, box.max.y, tool.feed))
  }
  moves.push(rapid(box.min.x, box.min.z, box.max.y + 5))
  return { name: 'Surface', kind: 'surface', tool, moves }
}

/** CAM > Helix: ramp down a circular bore. */
export function helixOperation(diameter: number, depth: number, tool: Tool, pitch = 0.5): Operation {
  const radius = Math.max(0.2, diameter / 2 - tool.diameter / 2)
  const turns = Math.max(1, Math.ceil(Math.abs(depth) / Math.max(0.05, pitch)))
  const steps = turns * 24
  const moves: PathMove[] = [rapid(radius, 0, 5)]
  for (let i = 0; i <= steps; i++) {
    const angle = (Math.PI * 2 * i) / 24
    const z = -Math.min(Math.abs(depth), (Math.abs(depth) * i) / steps)
    moves.push(feedMove(Math.cos(angle) * radius, Math.sin(angle) * radius, z, tool.feed))
  }
  moves.push(rapid(radius, 0, 5))
  return { name: 'Helix', kind: 'helix', tool, moves }
}

/** CAM > Engrave a wire path at a fixed depth. */
export function engraveOperation(points: Vec3[], depth: number, tool: Tool): Operation {
  const moves: PathMove[] = []
  if (points.length > 0) moves.push(rapid(points[0].x, points[0].z, 5))
  points.forEach((point, index) => {
    if (index === 0) moves.push({ kind: 'plunge', x: point.x, y: point.z, z: -Math.abs(depth), feed: tool.plunge })
    else moves.push(feedMove(point.x, point.z, -Math.abs(depth), tool.feed))
  })
  if (points.length > 0) moves.push(rapid(points[points.length - 1].x, points[points.length - 1].z, 5))
  return { name: 'Engrave', kind: 'engrave', tool, moves }
}

/** CAM > Adaptive clearing: spiral-out trochoidal passes. */
export function adaptiveOperation(width: number, height: number, depth: number, tool: Tool, stepDown = 2): Operation {
  const passes = Math.max(1, Math.ceil(Math.abs(depth) / Math.max(0.1, stepDown)))
  const rings = Math.max(1, Math.floor(Math.min(width, height) / Math.max(0.5, tool.diameter)))
  const moves: PathMove[] = [rapid(0, 0, 5)]
  for (let pass = 1; pass <= passes; pass++) {
    const z = -Math.min(Math.abs(depth), pass * stepDown)
    moves.push({ kind: 'plunge', x: 0, y: 0, z, feed: tool.plunge })
    for (let ring = 1; ring <= rings; ring++) {
      const radius = (Math.min(width, height) / 2) * (ring / rings)
      for (let i = 0; i <= 16; i++) {
        const angle = (Math.PI * 2 * i) / 16
        moves.push(feedMove(Math.cos(angle) * radius, Math.sin(angle) * radius, z, tool.feed))
      }
    }
  }
  moves.push(rapid(0, 0, 5))
  return { name: 'Adaptive', kind: 'adaptive', tool, moves }
}

export interface JobStats {
  moves: number
  cutLength: number
  rapidLength: number
  /** minutes */
  minutes: number
}

export function jobStats(operations: Operation[]): JobStats {
  let cutLength = 0
  let rapidLength = 0
  let minutes = 0
  for (const operation of operations) {
    let previous: PathMove | null = null
    for (const move of operation.moves) {
      if (previous) {
        const distance = Math.hypot(move.x - previous.x, move.y - previous.y, move.z - previous.z)
        if (move.kind === 'rapid') {
          rapidLength += distance
          minutes += distance / 3000
        } else {
          cutLength += distance
          minutes += distance / Math.max(1, move.feed ?? operation.tool.feed)
        }
      }
      previous = move
    }
  }
  return { moves: operations.reduce((acc, op) => acc + op.moves.length, 0), cutLength, rapidLength, minutes }
}

/** CAM > Post process: emit G-code for the selected controller dialect. */
export function postProcess(operations: Operation[], dialect: Dialect = 'grbl', programName = 'MYCAD'): string {
  const lines: string[] = []
  const decimals = dialect === 'marlin' ? 2 : 3
  const fmt = (value: number) => value.toFixed(decimals)
  if (dialect === 'fanuc') lines.push(`%`, `O0001 (${programName})`)
  else lines.push(`( ${programName} - MyCAD post: ${dialect} )`)
  lines.push('G21', 'G90', 'G17')
  if (dialect !== 'marlin') lines.push('G94')
  for (const operation of operations) {
    lines.push(`( ${operation.name} T${operation.tool.number} ${operation.tool.name} )`)
    if (dialect !== 'marlin') {
      lines.push(`T${operation.tool.number} M6`)
      lines.push(`S${operation.tool.spindle} M3`)
    } else {
      lines.push(`M3 S${operation.tool.spindle}`)
    }
    for (const move of operation.moves) {
      if (move.kind === 'rapid') lines.push(`G0 X${fmt(move.x)} Y${fmt(move.y)} Z${fmt(move.z)}`)
      else lines.push(`G1 X${fmt(move.x)} Y${fmt(move.y)} Z${fmt(move.z)} F${Math.round(move.feed ?? operation.tool.feed)}`)
    }
    lines.push('M5')
  }
  lines.push(dialect === 'marlin' ? 'M2' : 'M30')
  if (dialect === 'fanuc') lines.push('%')
  return lines.join('\n')
}
