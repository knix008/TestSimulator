// @ts-nocheck
import * as THREE from 'three'
import type { Solid, Vec3 } from './model'
import { cloneSolid, createSolid, vec } from './model'
import { booleanSolids, holeTool, meshFromGeometry, padSketch, revolveSketch, solidVolume, type Sketch } from './part'

export interface DesignParameter {
  name: string
  value: number
  formula: string
}

export interface Mate {
  id: string
  kind: 'coincidence' | 'offset' | 'fix' | 'angle'
  a: string
  b: string
  value: number
}

export function evaluateFormula(formula: string, parameters: DesignParameter[]): number {
  const scope = new Map(parameters.map((item) => [item.name, item.value]))
  const tokens = formula.match(/[A-Za-z_][A-Za-z0-9_]*|\d+\.?\d*|[()+\-*/]/g) || []
  const values = tokens.map((token) => (scope.has(token) ? String(scope.get(token)) : token))
  const output: string[] = []
  const ops: string[] = []
  const rank: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 }
  const flush = (limit: number) => {
    while (ops.length && ops[ops.length - 1] !== '(' && rank[ops[ops.length - 1]] >= limit) output.push(ops.pop() as string)
  }
  for (const token of values) {
    if (!Number.isNaN(Number(token))) output.push(token)
    else if (token === '(') ops.push(token)
    else if (token === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') output.push(ops.pop() as string)
      ops.pop()
    } else if (rank[token]) {
      flush(rank[token])
      ops.push(token)
    } else throw new Error(`알 수 없는 파라미터: ${token}`)
  }
  while (ops.length) output.push(ops.pop() as string)
  const stack: number[] = []
  for (const token of output) {
    if (!Number.isNaN(Number(token)) && token !== '+' && token !== '-') {
      stack.push(Number(token))
      continue
    }
    const right = stack.pop() ?? 0
    const left = stack.pop() ?? 0
    if (token === '+') stack.push(left + right)
    else if (token === '-') stack.push(left - right)
    else if (token === '*') stack.push(left * right)
    else if (token === '/') stack.push(right === 0 ? 0 : left / right)
  }
  return stack[0] ?? 0
}

export function updateSketchFromParameters(sketch: Sketch, parameters: DesignParameter[]): Sketch {
  const width = parameters.find((item) => item.name === 'Width')
  const height = parameters.find((item) => item.name === 'Height')
  const length = parameters.find((item) => item.name === 'Length')
  return {
    ...sketch,
    width: width ? (width.formula ? evaluateFormula(width.formula, parameters) : width.value) : sketch.width,
    height: height ? (height.formula ? evaluateFormula(height.formula, parameters) : height.value) : sketch.height,
    sides: length ? Math.max(3, sketch.sides) : sketch.sides
  }
}

export function shaft(sketch: Sketch, angle: number, id: string): Solid {
  const solid = revolveSketch(sketch, angle, id)
  solid.name = `Shaft.${sketch.name}`
  return solid
}

export function groove(target: Solid, sketch: Sketch, angle: number, id: string): Solid {
  const tool = shaft(sketch, angle, `${id}-tool`)
  const solid = booleanSolids(target, tool, 'cut', id)
  solid.name = `Groove.${target.name}`
  return solid
}

export function draftSolid(solid: Solid, angleDeg: number, id: string): Solid {
  const angle = Math.min(45, Math.max(0, angleDeg)) * Math.PI / 180
  const height = Math.max(1, solid.size.y)
  const inset = height * Math.tan(angle)
  const bottom = Math.max(1, solid.size.x)
  const depth = Math.max(1, solid.size.z)
  const topW = Math.max(1, bottom - inset * 2)
  const topD = Math.max(1, depth - inset * 2)
  const y = height / 2
  const vertices = [
    [-bottom / 2, -y, -depth / 2], [bottom / 2, -y, -depth / 2], [bottom / 2, -y, depth / 2], [-bottom / 2, -y, depth / 2],
    [-topW / 2, y, -topD / 2], [topW / 2, y, -topD / 2], [topW / 2, y, topD / 2], [-topW / 2, y, topD / 2]
  ]
  const faces = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1], [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0]]
  const positions: number[] = []
  for (const face of faces) for (const index of face) positions.push(...vertices[index])
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const mesh = meshFromGeometry(geometry)
  const next = cloneSolid(solid, id)
  next.kind = 'mesh'
  next.name = `Draft.${solid.name}`
  next.mesh = mesh
  next.size = { ...solid.size, x: bottom, y: height, z: depth }
  return next
}

export function shellSolid(solid: Solid, thickness: number, id: string): Solid {
  const inner = cloneSolid(solid, `${id}-inner`)
  const wall = Math.max(0.4, thickness)
  inner.scale = {
    x: Math.max(0.15, 1 - wall / Math.max(solid.size.x, 1)),
    y: Math.max(0.15, 1 - wall / Math.max(solid.size.y, 1)),
    z: Math.max(0.15, 1 - wall / Math.max(solid.size.z, 1))
  }
  const solidResult = booleanSolids(solid, inner, 'cut', id)
  solidResult.name = `Shell.${solid.name}`
  return solidResult
}

export function rectangularPattern(solid: Solid, countU: number, countV: number, spacingU: number, spacingV: number, nextId: () => string): Solid[] {
  const copies: Solid[] = []
  const uMax = Math.max(1, Math.min(8, Math.round(countU)))
  const vMax = Math.max(1, Math.min(8, Math.round(countV)))
  for (let v = 0; v < vMax; v++) {
    for (let u = 0; u < uMax; u++) {
      if (u === 0 && v === 0) continue
      const copy = cloneSolid(solid, nextId())
      copy.name = `RectPattern.${solid.name}.${u + 1}.${v + 1}`
      copy.position = { x: solid.position.x + u * spacingU, y: solid.position.y, z: solid.position.z + v * spacingV }
      copies.push(copy)
    }
  }
  return copies
}

export function transformSolid(solid: Solid, mode: 'translate' | 'rotate' | 'scale', axis: 'x' | 'y' | 'z', amount: number, id: string): Solid {
  const copy = cloneSolid(solid, id)
  copy.name = `${mode}.${solid.name}`
  if (mode === 'translate') copy.position = { ...copy.position, [axis]: copy.position[axis] + amount }
  if (mode === 'rotate') copy.rotation = { ...copy.rotation, [axis]: copy.rotation[axis] + amount }
  if (mode === 'scale') {
    const factor = Math.max(0.05, amount)
    copy.scale = { x: copy.scale.x * factor, y: copy.scale.y * factor, z: copy.scale.z * factor }
  }
  return copy
}

export function steppedHole(target: Solid, kind: 'counterbore' | 'countersink', diameter: number, depth: number, id: string): Solid {
  const pilot = holeTool(diameter, depth, target.position, `${id}-pilot`)
  let cut = booleanSolids(target, pilot, 'cut', `${id}-cut`)
  if (kind === 'counterbore') {
    const head = holeTool(diameter * 1.6, Math.max(1, depth * 0.35), { ...target.position, y: target.position.y + depth * 0.3 }, `${id}-head`)
    cut = booleanSolids(cut, head, 'cut', id)
  } else {
    const cone = createSolid('cone', `${id}-sink`, 1)
    cone.size = { ...cone.size, radius: diameter, y: diameter * 0.6 }
    cone.position = { ...target.position, y: target.position.y + depth * 0.35 }
    cut = booleanSolids(cut, cone, 'cut', id)
  }
  cut.name = `${kind}.${target.name}`
  return cut
}

export function referencePlane(plane: 'xy' | 'xz' | 'yz', offset: number, id: string): Solid {
  const solid = createSolid('plane', id, 1)
  solid.name = `Plane.${plane}.${offset}`
  solid.position = plane === 'xy' ? vec(0, offset, 0) : plane === 'xz' ? vec(0, 0, offset) : vec(offset, 0, 0)
  return solid
}

export function solveMate(first: Solid, second: Solid, mate: Mate): Solid {
  const copy = cloneSolid(second, second.id)
  if (mate.kind === 'coincidence') copy.position = { ...first.position }
  if (mate.kind === 'offset') copy.position = { x: first.position.x + mate.value, y: first.position.y, z: first.position.z }
  if (mate.kind === 'angle') copy.rotation = { ...copy.rotation, y: mate.value }
  if (mate.kind === 'fix') copy.locked = true
  return copy
}

export function inertiaOf(solid: Solid): { volume: number; area: number; cog: Vec3 } {
  const volume = solidVolume(solid)
  const area = solid.kind === 'sphere'
    ? 4 * Math.PI * solid.size.radius * solid.size.radius
    : 2 * (solid.size.x * solid.size.y + solid.size.y * solid.size.z + solid.size.z * solid.size.x)
  return { volume, area, cog: { ...solid.position } }
}

export function specTreeLines(features: { name: string; kind: string }[], parameters: DesignParameter[], mates: Mate[]): string[] {
  return [
    'Part1',
    '  PartBody',
    ...features.map((feature) => `    ${feature.kind}: ${feature.name}`),
    '  Geometrical Set.1',
    ...parameters.map((item) => `    ${item.name} = ${item.formula || item.value}`),
    '  Constraints',
    ...mates.map((mate) => `    ${mate.kind} ${mate.a}/${mate.b}`)
  ]
}
