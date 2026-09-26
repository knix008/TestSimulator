// FreeCAD FEM workbench: analysis container, constraints, solvers, results.
import type { Solid } from './model'
import { findMaterial } from './materials'
import { solidVolume } from './part'
import { boundingBoxOf, surfaceArea } from './primitives'

export type ConstraintKind = 'fixed' | 'force' | 'pressure' | 'displacement' | 'temperature' | 'heatflux' | 'contact'

export interface FemConstraint {
  id: string
  kind: ConstraintKind
  target: string
  value: number
  direction?: 'x' | 'y' | 'z'
}

export interface FemMeshStats {
  nodes: number
  elements: number
  elementType: 'Tet4' | 'Tet10' | 'Hex8'
  averageEdge: number
}

export interface FemAnalysis {
  id: string
  name: string
  materialId: string
  solver: 'CalculiX' | 'Elmer' | 'Z88' | 'internal'
  constraints: FemConstraint[]
  meshSize: number
}

export function createAnalysis(id: string, name = 'Analysis', materialId = 'steel'): FemAnalysis {
  return { id, name, materialId, solver: 'internal', constraints: [], meshSize: 5 }
}

export function addConstraint(analysis: FemAnalysis, constraint: FemConstraint): FemAnalysis {
  return { ...analysis, constraints: [...analysis.constraints, constraint] }
}

/** FEM > Mesh from shape: estimate node/element counts for a target edge length. */
export function meshStats(solid: Solid, targetEdge: number, elementType: FemMeshStats['elementType'] = 'Tet4'): FemMeshStats {
  const edge = Math.max(0.2, targetEdge)
  const volume = Math.max(1e-6, solidVolume(solid))
  const elementVolume = elementType === 'Hex8' ? Math.pow(edge, 3) : Math.pow(edge, 3) / 6
  const elements = Math.max(1, Math.round(volume / elementVolume))
  const nodesPerElement = elementType === 'Tet10' ? 10 : elementType === 'Hex8' ? 8 : 4
  const nodes = Math.max(4, Math.round(elements * nodesPerElement * 0.25))
  return { nodes, elements, elementType, averageEdge: edge }
}

export interface BarResult {
  stress: number
  displacement: number
  reaction: number
  safetyFactor: number
  yields: boolean
}

/** FEM > Linear static of a bar in tension/compression. */
export function solveBar(length: number, area: number, force: number, materialId = 'steel'): BarResult {
  const card = findMaterial(materialId)
  if (length <= 0 || area <= 0) return { stress: 0, displacement: 0, reaction: 0, safetyFactor: Infinity, yields: false }
  const stiffness = (card.youngsModulus * area) / length
  const displacement = force / stiffness
  const stress = force / area
  const safetyFactor = stress === 0 ? Infinity : card.yieldStrength / Math.abs(stress)
  return { stress, displacement, reaction: stiffness * displacement, safetyFactor, yields: safetyFactor < 1 }
}

export interface BeamResult {
  maxDeflection: number
  maxMoment: number
  maxStress: number
  safetyFactor: number
}

/**
 * FEM > Linear static of a beam. `support` picks the classic formulae for a
 * cantilever with an end load or a simply supported beam with a centre load.
 */
export function solveBeam(options: {
  length: number
  width: number
  height: number
  load: number
  support: 'cantilever' | 'simple'
  materialId?: string
}): BeamResult {
  const { length, width, height, load } = options
  const card = findMaterial(options.materialId ?? 'steel')
  if (length <= 0 || width <= 0 || height <= 0) return { maxDeflection: 0, maxMoment: 0, maxStress: 0, safetyFactor: Infinity }
  const inertia = (width * Math.pow(height, 3)) / 12
  const sectionModulus = inertia / (height / 2)
  const moment = options.support === 'cantilever' ? load * length : (load * length) / 4
  const deflection = options.support === 'cantilever'
    ? (load * Math.pow(length, 3)) / (3 * card.youngsModulus * inertia)
    : (load * Math.pow(length, 3)) / (48 * card.youngsModulus * inertia)
  const stress = moment / sectionModulus
  return {
    maxDeflection: deflection,
    maxMoment: moment,
    maxStress: stress,
    safetyFactor: stress === 0 ? Infinity : card.yieldStrength / Math.abs(stress)
  }
}

export interface TrussMember {
  from: number
  to: number
  area: number
}

export interface TrussResult {
  displacements: number[]
  memberForces: number[]
  maxForce: number
}

/**
 * FEM > 2D truss solved with the direct stiffness method.
 * `nodes` are [x, y] pairs in mm, `supports` lists the fixed dofs, `loads` the nodal loads in N.
 */
export function solveTruss(
  nodes: Array<[number, number]>,
  members: TrussMember[],
  supports: number[],
  loads: Record<number, number>,
  materialId = 'steel'
): TrussResult {
  const card = findMaterial(materialId)
  const dofCount = nodes.length * 2
  const K: number[][] = Array.from({ length: dofCount }, () => new Array(dofCount).fill(0))
  const directions: Array<{ c: number; s: number; length: number }> = []
  members.forEach((member) => {
    const [x1, y1] = nodes[member.from]
    const [x2, y2] = nodes[member.to]
    const length = Math.hypot(x2 - x1, y2 - y1) || 1e-9
    const c = (x2 - x1) / length
    const s = (y2 - y1) / length
    directions.push({ c, s, length })
    const k = (card.youngsModulus * member.area) / length
    const dofs = [member.from * 2, member.from * 2 + 1, member.to * 2, member.to * 2 + 1]
    const local = [
      [c * c, c * s, -c * c, -c * s],
      [c * s, s * s, -c * s, -s * s],
      [-c * c, -c * s, c * c, c * s],
      [-c * s, -s * s, c * s, s * s]
    ]
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) K[dofs[i]][dofs[j]] += k * local[i][j]
    }
  })
  const free: number[] = []
  for (let dof = 0; dof < dofCount; dof++) if (!supports.includes(dof)) free.push(dof)
  const size = free.length
  const A: number[][] = Array.from({ length: size }, (_, i) => free.map((dof) => K[free[i]][dof]))
  const b: number[] = free.map((dof) => loads[dof] ?? 0)
  const solution = gaussSolve(A, b)
  const displacements = new Array(dofCount).fill(0)
  free.forEach((dof, index) => { displacements[dof] = solution[index] })
  const memberForces = members.map((member, index) => {
    const { c, s, length } = directions[index]
    const du = displacements[member.to * 2] - displacements[member.from * 2]
    const dv = displacements[member.to * 2 + 1] - displacements[member.from * 2 + 1]
    return ((card.youngsModulus * member.area) / length) * (c * du + s * dv)
  })
  return { displacements, memberForces, maxForce: memberForces.reduce((acc, value) => Math.max(acc, Math.abs(value)), 0) }
}

function gaussSolve(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length
  const A = matrix.map((row, index) => [...row, rhs[index]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row
    if (Math.abs(A[pivot][col]) < 1e-12) continue
    const swap = A[col]
    A[col] = A[pivot]
    A[pivot] = swap
    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = A[row][col] / A[col][col]
      for (let k = col; k <= n; k++) A[row][k] -= factor * A[col][k]
    }
  }
  return Array.from({ length: n }, (_, i) => (Math.abs(A[i][i]) < 1e-12 ? 0 : A[i][n] / A[i][i]))
}

/** FEM > Frequency analysis: first bending mode of a cantilever (Hz). */
export function modalFrequency(length: number, width: number, height: number, materialId = 'steel'): number {
  const card = findMaterial(materialId)
  if (length <= 0 || width <= 0 || height <= 0) return 0
  const inertia = (width * Math.pow(height, 3)) / 12
  const areaMm2 = width * height
  const massPerLength = (areaMm2 * card.density) / 1000 / 1000 // kg/mm
  const eiNmm2 = card.youngsModulus * inertia
  return (1.875 * 1.875) / (2 * Math.PI) * Math.sqrt(eiNmm2 / (massPerLength * Math.pow(length, 4)))
}

/** FEM > Thermomechanical: steady 1D conduction through a wall. */
export function thermalFlux(thickness: number, area: number, hotSide: number, coldSide: number, materialId = 'steel'): { flux: number; power: number } {
  const card = findMaterial(materialId)
  if (thickness <= 0) return { flux: 0, power: 0 }
  const flux = (card.thermalConductivity * (hotSide - coldSide)) / (thickness / 1000)
  return { flux, power: (flux * area) / 1e6 }
}

export function vonMises(sx: number, sy: number, sz: number, txy = 0, tyz = 0, tzx = 0): number {
  return Math.sqrt(0.5 * (Math.pow(sx - sy, 2) + Math.pow(sy - sz, 2) + Math.pow(sz - sx, 2)) + 3 * (txy * txy + tyz * tyz + tzx * tzx))
}

export interface FemReport {
  lines: string[]
  worstSafety: number
}

/** Run the analysis over one solid and summarise it for the status bar / report. */
export function runAnalysis(analysis: FemAnalysis, solid: Solid): FemReport {
  const box = boundingBoxOf([solid])
  const mesh = meshStats(solid, analysis.meshSize)
  const force = analysis.constraints.filter((c) => c.kind === 'force').reduce((acc, c) => acc + c.value, 0) || 1000
  const area = Math.max(1, (box.size.x || 1) * (box.size.z || 1))
  const bar = solveBar(Math.max(1, box.size.y), area, force, analysis.materialId)
  const beam = solveBeam({
    length: Math.max(1, box.size.x),
    width: Math.max(1, box.size.z),
    height: Math.max(1, box.size.y),
    load: force,
    support: 'cantilever',
    materialId: analysis.materialId
  })
  const frequency = modalFrequency(Math.max(1, box.size.x), Math.max(1, box.size.z), Math.max(1, box.size.y), analysis.materialId)
  const worstSafety = Math.min(bar.safetyFactor, beam.safetyFactor)
  return {
    worstSafety,
    lines: [
      `${analysis.name} (${analysis.solver}) · ${findMaterial(analysis.materialId).name}`,
      `Mesh ${mesh.elementType}: ${mesh.elements} elements / ${mesh.nodes} nodes`,
      `Surface ${surfaceArea(solid).toFixed(1)} mm² · Volume ${solidVolume(solid).toFixed(1)} mm³`,
      `Axial: σ ${bar.stress.toFixed(2)} MPa · δ ${bar.displacement.toFixed(4)} mm`,
      `Bending: σ ${beam.maxStress.toFixed(2)} MPa · δ ${beam.maxDeflection.toFixed(4)} mm`,
      `Mode 1: ${frequency.toFixed(1)} Hz`,
      `Safety factor ${Number.isFinite(worstSafety) ? worstSafety.toFixed(2) : '∞'}`
    ]
  }
}
