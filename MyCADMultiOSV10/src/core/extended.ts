// @ts-nocheck
import type { Vec3, Solid } from './model'
import { createSolid } from './model'
import { booleanSolids, padSketch, solidVolume, type Sketch } from './part'

export interface SketchPoint {
  x: number
  y: number
}

export interface SketchConstraint {
  kind: 'horizontal' | 'vertical' | 'coincident' | 'distance' | 'equal'
  a: number
  b: number
  value?: number
}

export function solveSketchConstraints(points: SketchPoint[], constraints: SketchConstraint[]): SketchPoint[] {
  const next = points.map((point) => ({ ...point }))
  for (let pass = 0; pass < 12; pass++) {
    for (const constraint of constraints) {
      const start = next[constraint.a]
      const end = next[constraint.b]
      if (!start || !end) continue
      if (constraint.kind === 'horizontal') {
        const y = (start.y + end.y) / 2
        start.y = y
        end.y = y
      } else if (constraint.kind === 'vertical') {
        const x = (start.x + end.x) / 2
        start.x = x
        end.x = x
      } else if (constraint.kind === 'coincident') {
        const x = (start.x + end.x) / 2
        const y = (start.y + end.y) / 2
        start.x = end.x = x
        start.y = end.y = y
      } else if (constraint.kind === 'distance' || constraint.kind === 'equal') {
        const target = constraint.kind === 'equal'
          ? Math.hypot(next[1].x - next[0].x, next[1].y - next[0].y)
          : constraint.value ?? Math.hypot(end.x - start.x, end.y - start.y)
        placeApart(start, end, target)
      }
    }
  }
  return next
}

function placeApart(start: SketchPoint, end: SketchPoint, target: number) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy) || 1
  const scale = target / length
  const midX = (start.x + end.x) / 2
  const midY = (start.y + end.y) / 2
  start.x = midX - (dx * scale) / 2
  start.y = midY - (dy * scale) / 2
  end.x = midX + (dx * scale) / 2
  end.y = midY + (dy * scale) / 2
}

export function parsePoints(text: string): Vec3[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')).map((line) => {
    const [x, y, z] = line.split(/[\s,]+/).map(Number)
    return { x: x || 0, y: y || 0, z: z || 0 }
  })
}

export function pointCloudSolid(points: Vec3[], id: string): Solid {
  const positions: number[] = []
  const normals: number[] = []
  const size = 2
  for (const point of points) {
    positions.push(
      point.x, point.y, point.z, point.x + size, point.y, point.z, point.x, point.y + size, point.z,
      point.x + size, point.y, point.z, point.x + size, point.y + size, point.z, point.x, point.y + size, point.z
    )
    for (let index = 0; index < 6; index++) normals.push(0, 0, 1)
  }
  const solid = createSolid('mesh', id, 1)
  solid.kind = 'mesh'
  solid.name = 'Points'
  solid.position = { x: 0, y: 0, z: 0 }
  solid.mesh = { positions, normals }
  return solid
}

export function surfaceFromSketch(sketch: Sketch, id: string): Solid {
  const solid = padSketch(sketch, 0.2, id)
  solid.name = `Surface.${sketch.name}`
  return solid
}

export function forwardKinematics(lengths: number[], anglesDeg: number[]): Vec3 {
  let x = 0
  let y = 0
  let heading = 0
  lengths.forEach((length, index) => {
    heading += ((anglesDeg[index] ?? 0) * Math.PI) / 180
    x += length * Math.cos(heading)
    y += length * Math.sin(heading)
  })
  return { x, y, z: 0 }
}

type ScadNode =
  | { kind: 'cube'; size: [number, number, number] }
  | { kind: 'sphere'; radius: number }
  | { kind: 'cylinder'; height: number; radius: number }
  | { kind: 'translate'; offset: [number, number, number]; child: ScadNode }
  | { kind: 'union' | 'difference'; children: ScadNode[] }

export function compileOpenScad(source: string): Solid {
  const tokens = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ').match(/\[|\]|\{|\}|,|[A-Za-z_][A-Za-z0-9_]*|\d+\.?\d*|\(|\)|=|;/g) || []
  let cursor = 0
  const peek = () => tokens[cursor]
  const eat = (expected?: string) => {
    const token = tokens[cursor]
    if (expected && token !== expected) throw new Error(`OpenSCAD: ${expected}`)
    cursor += 1
    return token
  }
  const number = () => Number(eat())
  const vector = (): [number, number, number] => {
    eat('[')
    const x = number()
    eat(',')
    const y = number()
    eat(',')
    const z = number()
    eat(']')
    return [x, y, z]
  }
  const args = () => {
    eat('(')
    const named = new Map<string, number | [number, number, number]>()
    let index = 0
    while (peek() && peek() !== ')') {
      if (/^[A-Za-z_]/.test(peek() || '') && tokens[cursor + 1] === '=') {
        const key = eat()
        eat('=')
        named.set(key, peek() === '[' ? vector() : number())
      } else {
        named.set(String(index), peek() === '[' ? vector() : number())
        index += 1
      }
      if (peek() === ',') eat(',')
    }
    eat(')')
    if (peek() === ';') eat(';')
    return named
  }
  const block = (): ScadNode[] => {
    eat('{')
    const children: ScadNode[] = []
    while (peek() && peek() !== '}') children.push(statement())
    eat('}')
    return children
  }
  const statement = (): ScadNode => {
    const word = eat()
    if (word === 'cube') {
      const values = args()
      const size = values.get('size') || values.get('0')
      const box = Array.isArray(size) ? size : [Number(size) || 10, Number(size) || 10, Number(size) || 10]
      return { kind: 'cube', size: box as [number, number, number] }
    }
    if (word === 'sphere') {
      const values = args()
      return { kind: 'sphere', radius: Number(values.get('r') ?? values.get('0') ?? 5) }
    }
    if (word === 'cylinder') {
      const values = args()
      return { kind: 'cylinder', height: Number(values.get('h') ?? values.get('0') ?? 10), radius: Number(values.get('r') ?? values.get('1') ?? 4) }
    }
    if (word === 'translate') {
      eat('(')
      const offset = vector()
      eat(')')
      return { kind: 'translate', offset, child: statement() }
    }
    if (word === 'union' || word === 'difference') {
      eat('(')
      eat(')')
      return { kind: word, children: block() }
    }
    throw new Error(`OpenSCAD: ${word}`)
  }
  const nodes: ScadNode[] = []
  while (cursor < tokens.length) nodes.push(statement())
  if (!nodes.length) throw new Error('OpenSCAD')
  const combined = nodes.length === 1 ? nodes[0] : { kind: 'union' as const, children: nodes }
  return solidFromNode(combined, 'scad')
}

function solidFromNode(node: ScadNode, id: string): Solid {
  if (node.kind === 'cube') {
    const solid = createSolid('box', id, 1)
    solid.size = { ...solid.size, x: node.size[0], y: node.size[2], z: node.size[1] }
    solid.position = { x: 0, y: node.size[2] / 2, z: 0 }
    solid.name = 'cube'
    return solid
  }
  if (node.kind === 'sphere') {
    const solid = createSolid('sphere', id, 1)
    solid.size = { ...solid.size, radius: node.radius }
    solid.position = { x: 0, y: 0, z: 0 }
    solid.name = 'sphere'
    return solid
  }
  if (node.kind === 'cylinder') {
    const solid = createSolid('cylinder', id, 1)
    solid.size = { ...solid.size, radius: node.radius, y: node.height }
    solid.position = { x: 0, y: node.height / 2, z: 0 }
    solid.name = 'cylinder'
    return solid
  }
  if (node.kind === 'translate') {
    const solid = solidFromNode(node.child, id)
    solid.position = {
      x: solid.position.x + node.offset[0],
      y: solid.position.y + node.offset[2],
      z: solid.position.z + node.offset[1]
    }
    return solid
  }
  const parts = node.children.map((child, index) => solidFromNode(child, `${id}-${index}`))
  let acc = parts[0]
  for (let index = 1; index < parts.length; index++) {
    acc = booleanSolids(acc, parts[index], node.kind === 'union' ? 'union' : 'cut', `${id}-${index}`)
  }
  acc.name = node.kind
  return acc
}

export function inspectSolids(first: Solid, second: Solid): { volumeDelta: number; centerDistance: number } {
  return {
    volumeDelta: Math.abs(solidVolume(first) - solidVolume(second)),
    centerDistance: Math.hypot(first.position.x - second.position.x, first.position.y - second.position.y, first.position.z - second.position.z)
  }
}

export function toIfc(solids: Solid[]): string {
  const products = solids.map((solid, index) => `#${30 + index}=IFCWALL('${solid.id}',$,'${solid.name}',$,$,$,$,$);`)
  return [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
    "#1=IFCPROJECT('proj',$,'MyCAD',$,$,$,$,$,$);",
    ...products,
    'ENDSEC;',
    'END-ISO-10303-21;'
  ].join('\n')
}

export function parseIfc(text: string): { products: string[] } {
  return { products: [...text.matchAll(/IFC(WALL|SLAB|DOOR|WINDOW|BUILDINGELEMENTPROXY)\(/g)].map((match) => match[1]) }
}

export function pocketGcode(width: number, height: number, toolDiameter: number, depth: number, stepDown = 1): string {
  const passes = Math.max(1, Math.ceil(depth / Math.max(0.1, stepDown)))
  const x = Math.max(0.5, Math.abs(width) / 2 - toolDiameter / 2)
  const y = Math.max(0.5, Math.abs(height) / 2 - toolDiameter / 2)
  const lines = ['G21', 'G90', 'G17']
  for (let pass = 1; pass <= passes; pass++) {
    const z = -Math.min(depth, pass * stepDown)
    lines.push('G0 Z2', `G0 X${-x} Y${-y}`, `G1 Z${z} F120`, `G1 X${x} Y${-y} F280`, `G1 X${x} Y${y}`, `G1 X${-x} Y${y}`, `G1 X${-x} Y${-y}`)
  }
  lines.push('G0 Z5', 'M30')
  return lines.join('\n')
}

export function femBar(length: number, area: number, force: number, modulus: number): { stress: number; displacement: number; reaction: number } {
  if (length <= 0 || area <= 0 || modulus <= 0) return { stress: 0, displacement: 0, reaction: 0 }
  const stiffness = (modulus * area) / length
  const displacement = force / stiffness
  return { stress: force / area, displacement, reaction: stiffness * displacement }
}
