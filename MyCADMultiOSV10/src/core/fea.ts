// Volume finite element analysis: voxel meshing, linear elastic tetrahedra,
// a conjugate-gradient solve and von Mises post-processing.
//
// This is the real solver behind the FEM workbench - not a closed-form
// approximation - so the results converge towards the analytic values as the
// mesh is refined, which the tests check.
import type { Solid, Vec3 } from './model'
import { boundingBoxOf, trianglePositions } from './primitives'
import { findMaterial } from './materials'

export interface VolumeMesh {
  /** node coordinates, three numbers per node */
  nodes: number[]
  /** four node indices per tetrahedron */
  elements: number[]
  /** edge length of the voxels the mesh was built from */
  cellSize: number
  nodeCount: number
  elementCount: number
}

export type Axis = 'x' | 'y' | 'z'

export interface FixedSupport {
  kind: 'fixed'
  axis: Axis
  /** side of the bounding box that is clamped */
  side: 'min' | 'max'
}

export interface LoadCase {
  kind: 'force'
  axis: Axis
  side: 'min' | 'max'
  /** total force in newtons, spread over the nodes of that face */
  force: Vec3
}

export interface VolumeResult {
  mesh: VolumeMesh
  /** displacement per node, three numbers per node (mm) */
  displacements: number[]
  /** von Mises stress per element (MPa) */
  vonMises: number[]
  maxDisplacement: number
  maxStress: number
  /** minimum safety factor against the material's yield strength */
  safetyFactor: number
  iterations: number
  residual: number
  converged: boolean
}

/* ────────────────────────────── meshing ─────────────────────────────────── */

interface Triangle {
  a: Vec3
  b: Vec3
  c: Vec3
}

/** World-space triangles of a solid, matching how boundingBoxOf places it. */
function triangles(solid: Solid): Triangle[] {
  const positions = trianglePositions(solid)
  const at = (index: number): Vec3 => ({
    x: positions[index] * solid.scale.x + solid.position.x,
    y: positions[index + 1] * solid.scale.y + solid.position.y,
    z: positions[index + 2] * solid.scale.z + solid.position.z
  })
  const out: Triangle[] = []
  for (let i = 0; i + 8 < positions.length; i += 9) {
    out.push({ a: at(i), b: at(i + 3), c: at(i + 6) })
  }
  return out
}

/** Möller–Trumbore ray/triangle intersection, used for the inside test. */
function rayHits(origin: Vec3, direction: Vec3, tri: Triangle): boolean {
  const edge1 = { x: tri.b.x - tri.a.x, y: tri.b.y - tri.a.y, z: tri.b.z - tri.a.z }
  const edge2 = { x: tri.c.x - tri.a.x, y: tri.c.y - tri.a.y, z: tri.c.z - tri.a.z }
  const h = {
    x: direction.y * edge2.z - direction.z * edge2.y,
    y: direction.z * edge2.x - direction.x * edge2.z,
    z: direction.x * edge2.y - direction.y * edge2.x
  }
  const a = edge1.x * h.x + edge1.y * h.y + edge1.z * h.z
  if (Math.abs(a) < 1e-12) return false
  const f = 1 / a
  const s = { x: origin.x - tri.a.x, y: origin.y - tri.a.y, z: origin.z - tri.a.z }
  const u = f * (s.x * h.x + s.y * h.y + s.z * h.z)
  if (u < 0 || u > 1) return false
  const q = {
    x: s.y * edge1.z - s.z * edge1.y,
    y: s.z * edge1.x - s.x * edge1.z,
    z: s.x * edge1.y - s.y * edge1.x
  }
  const v = f * (direction.x * q.x + direction.y * q.y + direction.z * q.z)
  if (v < 0 || u + v > 1) return false
  return f * (edge2.x * q.x + edge2.y * q.y + edge2.z * q.z) > 1e-9
}

/** Odd/even ray casting along +X. */
export function isInsideSolid(point: Vec3, mesh: Triangle[]): boolean {
  const direction = { x: 1, y: 0.0001234, z: 0.0004321 }
  let hits = 0
  for (const tri of mesh) if (rayHits(point, direction, tri)) hits += 1
  return hits % 2 === 1
}

/**
 * Voxelise the solid and split every filled cell into five tetrahedra.
 * `divisions` is the number of cells along the longest edge.
 */
export function volumeMesh(solid: Solid, divisions = 8): VolumeMesh {
  const box = boundingBoxOf([solid])
  const span = Math.max(box.size.x, box.size.y, box.size.z) || 1
  const n = Math.max(1, Math.min(40, Math.round(divisions)))
  const target = span / n
  // Each axis gets its own cell size so the grid covers the bounding box
  // exactly; thin parts still get at least two cells across.
  const counts = {
    x: Math.max(2, Math.round((box.size.x || target) / target)),
    y: Math.max(2, Math.round((box.size.y || target) / target)),
    z: Math.max(2, Math.round((box.size.z || target) / target))
  }
  const cellSizes = {
    x: (box.size.x || target) / counts.x,
    y: (box.size.y || target) / counts.y,
    z: (box.size.z || target) / counts.z
  }
  const mesh = triangles(solid)
  const origin = { x: box.min.x, y: box.min.y, z: box.min.z }
  const nodeIndex = new Map<string, number>()
  const nodes: number[] = []
  const elements: number[] = []
  const nodeAt = (i: number, j: number, k: number): number => {
    const id = `${i},${j},${k}`
    const found = nodeIndex.get(id)
    if (found !== undefined) return found
    const index = nodes.length / 3
    nodes.push(origin.x + i * cellSizes.x, origin.y + j * cellSizes.y, origin.z + k * cellSizes.z)
    nodeIndex.set(id, index)
    return index
  }
  // A 5-tetrahedron split of each cell, alternating so neighbouring cells share faces.
  const even = [
    [0, 1, 2, 4], [1, 2, 3, 7], [1, 4, 5, 7], [2, 4, 6, 7], [1, 2, 4, 7]
  ]
  const odd = [
    [0, 1, 3, 5], [0, 2, 3, 6], [0, 4, 5, 6], [3, 5, 6, 7], [0, 3, 5, 6]
  ]
  for (let i = 0; i < counts.x; i++) {
    for (let j = 0; j < counts.y; j++) {
      for (let k = 0; k < counts.z; k++) {
        const center = {
          x: origin.x + (i + 0.5) * cellSizes.x,
          y: origin.y + (j + 0.5) * cellSizes.y,
          z: origin.z + (k + 0.5) * cellSizes.z
        }
        if (!isInsideSolid(center, mesh)) continue
        const corners = [
          nodeAt(i, j, k), nodeAt(i + 1, j, k), nodeAt(i, j + 1, k), nodeAt(i + 1, j + 1, k),
          nodeAt(i, j, k + 1), nodeAt(i + 1, j, k + 1), nodeAt(i, j + 1, k + 1), nodeAt(i + 1, j + 1, k + 1)
        ]
        const pattern = (i + j + k) % 2 === 0 ? even : odd
        for (const tet of pattern) {
          elements.push(corners[tet[0]], corners[tet[1]], corners[tet[2]], corners[tet[3]])
        }
      }
    }
  }
  return {
    nodes,
    elements,
    cellSize: Math.min(cellSizes.x, cellSizes.y, cellSizes.z),
    nodeCount: nodes.length / 3,
    elementCount: elements.length / 4
  }
}

export function meshVolume(mesh: VolumeMesh): number {
  let volume = 0
  for (let e = 0; e < mesh.elementCount; e++) {
    volume += Math.abs(tetVolume(mesh, e))
  }
  return volume
}

function tetVolume(mesh: VolumeMesh, element: number): number {
  const [n0, n1, n2, n3] = mesh.elements.slice(element * 4, element * 4 + 4)
  const p = (n: number) => ({ x: mesh.nodes[n * 3], y: mesh.nodes[n * 3 + 1], z: mesh.nodes[n * 3 + 2] })
  const a = p(n0)
  const b = p(n1)
  const c = p(n2)
  const d = p(n3)
  const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }
  const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z }
  const ad = { x: d.x - a.x, y: d.y - a.y, z: d.z - a.z }
  return (
    ab.x * (ac.y * ad.z - ac.z * ad.y) -
    ab.y * (ac.x * ad.z - ac.z * ad.x) +
    ab.z * (ac.x * ad.y - ac.y * ad.x)
  ) / 6
}

/* ─────────────────────────── element stiffness ──────────────────────────── */

/** Strain-displacement matrix of a constant-strain tetrahedron. */
function strainMatrix(mesh: VolumeMesh, element: number): { B: number[][]; volume: number } {
  const indices = mesh.elements.slice(element * 4, element * 4 + 4)
  const x = indices.map((n) => mesh.nodes[n * 3])
  const y = indices.map((n) => mesh.nodes[n * 3 + 1])
  const z = indices.map((n) => mesh.nodes[n * 3 + 2])
  const volume = tetVolume(mesh, element)
  const sixV = 6 * volume
  const b: number[] = []
  const c: number[] = []
  const d: number[] = []
  for (let i = 0; i < 4; i++) {
    const [j, k, l] = [(i + 1) % 4, (i + 2) % 4, (i + 3) % 4]
    const sign = i % 2 === 0 ? -1 : 1
    b.push(sign * ((y[k] - y[j]) * (z[l] - z[j]) - (y[l] - y[j]) * (z[k] - z[j])) / sixV)
    c.push(sign * ((x[l] - x[j]) * (z[k] - z[j]) - (x[k] - x[j]) * (z[l] - z[j])) / sixV)
    d.push(sign * ((x[k] - x[j]) * (y[l] - y[j]) - (x[l] - x[j]) * (y[k] - y[j])) / sixV)
  }
  const B: number[][] = Array.from({ length: 6 }, () => new Array(12).fill(0))
  for (let i = 0; i < 4; i++) {
    B[0][i * 3] = b[i]
    B[1][i * 3 + 1] = c[i]
    B[2][i * 3 + 2] = d[i]
    B[3][i * 3] = c[i]
    B[3][i * 3 + 1] = b[i]
    B[4][i * 3 + 1] = d[i]
    B[4][i * 3 + 2] = c[i]
    B[5][i * 3] = d[i]
    B[5][i * 3 + 2] = b[i]
  }
  return { B, volume: Math.abs(volume) }
}

/** Isotropic elasticity matrix. */
export function elasticityMatrix(youngsModulus: number, poissonRatio: number): number[][] {
  const e = youngsModulus
  const v = poissonRatio
  const factor = e / ((1 + v) * (1 - 2 * v))
  const shear = factor * (1 - 2 * v) / 2
  return [
    [factor * (1 - v), factor * v, factor * v, 0, 0, 0],
    [factor * v, factor * (1 - v), factor * v, 0, 0, 0],
    [factor * v, factor * v, factor * (1 - v), 0, 0, 0],
    [0, 0, 0, shear, 0, 0],
    [0, 0, 0, 0, shear, 0],
    [0, 0, 0, 0, 0, shear]
  ]
}

/* ──────────────────────────────── solver ────────────────────────────────── */

interface SparseMatrix {
  rows: Map<number, number>[]
}

function addEntry(matrix: SparseMatrix, row: number, column: number, value: number) {
  const map = matrix.rows[row]
  map.set(column, (map.get(column) ?? 0) + value)
}

function multiply(matrix: SparseMatrix, vector: number[]): number[] {
  const out = new Array(vector.length).fill(0)
  for (let row = 0; row < matrix.rows.length; row++) {
    let sum = 0
    matrix.rows[row].forEach((value, column) => { sum += value * vector[column] })
    out[row] = sum
  }
  return out
}

/** Preconditioned conjugate gradients for the symmetric positive definite system. */
export function conjugateGradient(matrix: SparseMatrix, rhs: number[], maxIterations: number, tolerance: number): { x: number[]; iterations: number; residual: number } {
  const n = rhs.length
  const x = new Array(n).fill(0)
  const jacobi = new Array(n).fill(1)
  for (let row = 0; row < n; row++) {
    const diagonal = matrix.rows[row].get(row) ?? 1
    jacobi[row] = Math.abs(diagonal) > 1e-12 ? 1 / diagonal : 1
  }
  let r = rhs.slice()
  let z = r.map((value, index) => value * jacobi[index])
  let p = z.slice()
  let rz = r.reduce((acc, value, index) => acc + value * z[index], 0)
  const rhsNorm = Math.sqrt(rhs.reduce((acc, value) => acc + value * value, 0)) || 1
  let iterations = 0
  let residual = Math.sqrt(r.reduce((acc, value) => acc + value * value, 0)) / rhsNorm
  for (; iterations < maxIterations && residual > tolerance; iterations++) {
    const ap = multiply(matrix, p)
    const denominator = p.reduce((acc, value, index) => acc + value * ap[index], 0)
    if (Math.abs(denominator) < 1e-30) break
    const alpha = rz / denominator
    for (let i = 0; i < n; i++) {
      x[i] += alpha * p[i]
      r[i] -= alpha * ap[i]
    }
    z = r.map((value, index) => value * jacobi[index])
    const rzNext = r.reduce((acc, value, index) => acc + value * z[index], 0)
    const beta = rzNext / (rz || 1e-30)
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i]
    rz = rzNext
    residual = Math.sqrt(r.reduce((acc, value) => acc + value * value, 0)) / rhsNorm
  }
  return { x, iterations, residual }
}

function faceNodes(mesh: VolumeMesh, axis: Axis, side: 'min' | 'max', tolerance: number): number[] {
  const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2
  let extreme = side === 'min' ? Infinity : -Infinity
  for (let n = 0; n < mesh.nodeCount; n++) {
    const value = mesh.nodes[n * 3 + index]
    extreme = side === 'min' ? Math.min(extreme, value) : Math.max(extreme, value)
  }
  const out: number[] = []
  for (let n = 0; n < mesh.nodeCount; n++) {
    if (Math.abs(mesh.nodes[n * 3 + index] - extreme) <= tolerance) out.push(n)
  }
  return out
}

/**
 * Linear static analysis of a solid: mesh it, assemble, apply the supports and
 * loads, solve and evaluate the stresses.
 */
export function solveVolume(
  solid: Solid,
  options: {
    divisions?: number
    materialId?: string
    support?: FixedSupport
    load?: LoadCase
    maxIterations?: number
    tolerance?: number
  } = {}
): VolumeResult {
  const material = findMaterial(options.materialId ?? 'steel')
  const mesh = volumeMesh(solid, options.divisions ?? 6)
  if (mesh.elementCount === 0) throw new Error('FEM: 메쉬를 만들지 못했습니다. 분할 수를 늘리세요.')
  const dofs = mesh.nodeCount * 3
  const matrix: SparseMatrix = { rows: Array.from({ length: dofs }, () => new Map<number, number>()) }
  const D = elasticityMatrix(material.youngsModulus, material.poissonRatio)

  const elementData: Array<{ B: number[][]; volume: number }> = []
  for (let e = 0; e < mesh.elementCount; e++) {
    const { B, volume } = strainMatrix(mesh, e)
    elementData.push({ B, volume })
    if (volume < 1e-12) continue
    // ke = Bᵀ D B V
    const DB: number[][] = Array.from({ length: 6 }, () => new Array(12).fill(0))
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 12; j++) {
        let sum = 0
        for (let k = 0; k < 6; k++) sum += D[i][k] * B[k][j]
        DB[i][j] = sum
      }
    }
    const indices = mesh.elements.slice(e * 4, e * 4 + 4)
    for (let i = 0; i < 12; i++) {
      for (let j = 0; j < 12; j++) {
        let sum = 0
        for (let k = 0; k < 6; k++) sum += B[k][i] * DB[k][j]
        const value = sum * volume
        if (Math.abs(value) < 1e-14) continue
        const row = indices[Math.floor(i / 3)] * 3 + (i % 3)
        const column = indices[Math.floor(j / 3)] * 3 + (j % 3)
        addEntry(matrix, row, column, value)
      }
    }
  }

  const tolerance = mesh.cellSize * 0.01 + 1e-6
  const support = options.support ?? { kind: 'fixed' as const, axis: 'y' as Axis, side: 'min' as const }
  const load = options.load ?? { kind: 'force' as const, axis: 'y' as Axis, side: 'max' as const, force: { x: 0, y: -1000, z: 0 } }
  const fixed = new Set<number>()
  for (const node of faceNodes(mesh, support.axis, support.side, tolerance)) {
    fixed.add(node * 3)
    fixed.add(node * 3 + 1)
    fixed.add(node * 3 + 2)
  }
  const loaded = faceNodes(mesh, load.axis, load.side, tolerance)
  const rhs = new Array(dofs).fill(0)
  if (loaded.length > 0) {
    const share = 1 / loaded.length
    for (const node of loaded) {
      rhs[node * 3] += load.force.x * share
      rhs[node * 3 + 1] += load.force.y * share
      rhs[node * 3 + 2] += load.force.z * share
    }
  }

  // Apply the supports by zeroing rows and columns.
  for (const dof of fixed) {
    matrix.rows[dof].clear()
    matrix.rows[dof].set(dof, 1)
    rhs[dof] = 0
  }
  for (let row = 0; row < dofs; row++) {
    if (fixed.has(row)) continue
    const map = matrix.rows[row]
    for (const dof of fixed) {
      if (map.has(dof)) map.delete(dof)
    }
  }

  const solved = conjugateGradient(matrix, rhs, options.maxIterations ?? 4000, options.tolerance ?? 1e-8)
  const displacements = solved.x

  const vonMisesPerElement: number[] = []
  let maxStress = 0
  for (let e = 0; e < mesh.elementCount; e++) {
    const { B, volume } = elementData[e]
    if (volume < 1e-12) {
      vonMisesPerElement.push(0)
      continue
    }
    const indices = mesh.elements.slice(e * 4, e * 4 + 4)
    const u: number[] = []
    for (const node of indices) u.push(displacements[node * 3], displacements[node * 3 + 1], displacements[node * 3 + 2])
    const strain = new Array(6).fill(0)
    for (let i = 0; i < 6; i++) {
      let sum = 0
      for (let j = 0; j < 12; j++) sum += B[i][j] * u[j]
      strain[i] = sum
    }
    const stress = new Array(6).fill(0)
    for (let i = 0; i < 6; i++) {
      let sum = 0
      for (let j = 0; j < 6; j++) sum += D[i][j] * strain[j]
      stress[i] = sum
    }
    const [sx, sy, sz, txy, tyz, tzx] = stress
    const value = Math.sqrt(
      0.5 * (Math.pow(sx - sy, 2) + Math.pow(sy - sz, 2) + Math.pow(sz - sx, 2)) +
      3 * (txy * txy + tyz * tyz + tzx * tzx)
    )
    vonMisesPerElement.push(value)
    maxStress = Math.max(maxStress, value)
  }

  let maxDisplacement = 0
  for (let n = 0; n < mesh.nodeCount; n++) {
    maxDisplacement = Math.max(maxDisplacement, Math.hypot(
      displacements[n * 3],
      displacements[n * 3 + 1],
      displacements[n * 3 + 2]
    ))
  }

  return {
    mesh,
    displacements,
    vonMises: vonMisesPerElement,
    maxDisplacement,
    maxStress,
    safetyFactor: maxStress > 0 ? material.yieldStrength / maxStress : Infinity,
    iterations: solved.iterations,
    residual: solved.residual,
    converged: solved.residual <= (options.tolerance ?? 1e-8) * 10
  }
}

/** Short report for the status bar and the report dialog. */
export function volumeReport(result: VolumeResult, materialId = 'steel'): string[] {
  const material = findMaterial(materialId)
  return [
    `Mesh: ${result.mesh.elementCount} tetrahedra / ${result.mesh.nodeCount} nodes (cell ${result.mesh.cellSize.toFixed(2)} mm)`,
    `Solver: conjugate gradient, ${result.iterations} iterations, residual ${result.residual.toExponential(2)}`,
    `Max displacement ${result.maxDisplacement.toFixed(5)} mm`,
    `Max von Mises ${result.maxStress.toFixed(2)} MPa (${material.name}, Rp ${material.yieldStrength} MPa)`,
    `Safety factor ${Number.isFinite(result.safetyFactor) ? result.safetyFactor.toFixed(2) : '∞'}`
  ]
}
