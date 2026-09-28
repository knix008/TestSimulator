// CATIA Assembly Design / FreeCAD Assembly: product tree, constraints, explode, BOM.
import type { Solid, Vec3 } from './model'
import { boundingBoxOf } from './primitives'
import { massProperties } from './materials'

export type ConstraintKind = 'coincident' | 'offset' | 'angle' | 'contact' | 'fix' | 'concentric' | 'parallel'

export interface AssemblyConstraint {
  id: string
  kind: ConstraintKind
  a: string
  b: string
  axis: 'x' | 'y' | 'z'
  value: number
}

export interface ProductNode {
  id: string
  name: string
  kind: 'product' | 'part'
  children: ProductNode[]
  solidId?: string
  quantity: number
}

export function createProduct(id: string, name: string): ProductNode {
  return { id, name, kind: 'product', children: [], quantity: 1 }
}

export function addPart(product: ProductNode, solid: Solid): ProductNode {
  return {
    ...product,
    children: [...product.children, { id: `part-${solid.id}`, name: solid.name, kind: 'part', children: [], solidId: solid.id, quantity: 1 }]
  }
}

export function addSubProduct(product: ProductNode, child: ProductNode): ProductNode {
  return { ...product, children: [...product.children, child] }
}

export function productTreeLines(product: ProductNode, depth = 0): string[] {
  const indent = '  '.repeat(depth)
  const lines = [`${indent}${product.kind === 'product' ? '▸' : '·'} ${product.name}${product.quantity > 1 ? ` x${product.quantity}` : ''}`]
  for (const child of product.children) lines.push(...productTreeLines(child, depth + 1))
  return lines
}

export function countParts(product: ProductNode): number {
  return product.children.reduce((acc, child) => acc + (child.kind === 'part' ? child.quantity : countParts(child)), 0)
}

export interface SolveReport {
  solids: Solid[]
  iterations: number
  residual: number
  converged: boolean
}

/**
 * Iteratively satisfy the constraint set by moving the non-fixed body of each
 * pair halfway towards the target: a small relaxation solver, enough for
 * placement constraints on rigid parts.
 */
export function solveConstraints(solids: Solid[], constraints: AssemblyConstraint[], maxIterations = 60, tolerance = 1e-4): SolveReport {
  const current = solids.map((solid) => ({ ...solid, position: { ...solid.position }, rotation: { ...solid.rotation } }))
  const byId = new Map(current.map((solid) => [solid.id, solid]))
  const fixed = new Set(constraints.filter((constraint) => constraint.kind === 'fix').map((constraint) => constraint.a))
  let residual = 0
  let iterations = 0
  for (iterations = 1; iterations <= maxIterations; iterations++) {
    residual = 0
    for (const constraint of constraints) {
      if (constraint.kind === 'fix') continue
      const a = byId.get(constraint.a)
      const b = byId.get(constraint.b)
      if (!a || !b) continue
      if (constraint.kind === 'angle') {
        const error = constraint.value - (b.rotation[constraint.axis] - a.rotation[constraint.axis])
        residual = Math.max(residual, Math.abs(error))
        if (!fixed.has(b.id)) b.rotation = { ...b.rotation, [constraint.axis]: b.rotation[constraint.axis] + error * 0.5 } as Vec3
        continue
      }
      if (constraint.kind === 'parallel') {
        const error = a.rotation[constraint.axis] - b.rotation[constraint.axis]
        residual = Math.max(residual, Math.abs(error))
        if (!fixed.has(b.id)) b.rotation = { ...b.rotation, [constraint.axis]: b.rotation[constraint.axis] + error * 0.5 } as Vec3
        continue
      }
      if (constraint.kind === 'concentric') {
        const dx = a.position.x - b.position.x
        const dz = a.position.z - b.position.z
        residual = Math.max(residual, Math.hypot(dx, dz))
        if (!fixed.has(b.id)) {
          b.position = { ...b.position, x: b.position.x + dx * 0.5, z: b.position.z + dz * 0.5 }
        }
        continue
      }
      const target = constraint.kind === 'coincident' ? 0
        : constraint.kind === 'contact'
          ? (halfSpan(a, constraint.axis) + halfSpan(b, constraint.axis))
          : constraint.value
      const delta = b.position[constraint.axis] - a.position[constraint.axis]
      const error = target - delta
      residual = Math.max(residual, Math.abs(error))
      if (!fixed.has(b.id)) {
        b.position = { ...b.position, [constraint.axis]: b.position[constraint.axis] + error * 0.5 } as Vec3
      } else if (!fixed.has(a.id)) {
        a.position = { ...a.position, [constraint.axis]: a.position[constraint.axis] - error * 0.5 } as Vec3
      }
    }
    if (residual <= tolerance) break
  }
  return { solids: current, iterations, residual, converged: residual <= tolerance }
}

function halfSpan(solid: Solid, axis: 'x' | 'y' | 'z'): number {
  const box = boundingBoxOf([solid])
  return (axis === 'x' ? box.size.x : axis === 'y' ? box.size.y : box.size.z) / 2
}

/** Assembly > Exploded view: push every part away from the assembly centre. */
export function explodeAssembly(solids: Solid[], factor = 1.6): Solid[] {
  const box = boundingBoxOf(solids)
  return solids.map((solid) => ({
    ...solid,
    position: {
      x: box.center.x + (solid.position.x - box.center.x) * factor,
      y: box.center.y + (solid.position.y - box.center.y) * factor,
      z: box.center.z + (solid.position.z - box.center.z) * factor
    }
  }))
}

export interface BomRow {
  item: number
  name: string
  quantity: number
  material: string
  massKg: number
}

/** Assembly > Bill of material with masses per line and a total. */
export function bom(solids: Solid[], materialOf: (solid: Solid) => string = () => 'steel'): { rows: BomRow[]; totalKg: number } {
  const grouped = new Map<string, { solid: Solid; quantity: number }>()
  for (const solid of solids) {
    const base = solid.name.replace(/[-_](copy|\d+|p\d+)$/i, '')
    const found = grouped.get(base)
    if (found) found.quantity += 1
    else grouped.set(base, { solid, quantity: 1 })
  }
  const rows: BomRow[] = []
  let totalKg = 0
  let item = 1
  grouped.forEach(({ solid, quantity }, name) => {
    const material = materialOf(solid)
    const properties = massProperties(solid, material)
    const massKg = properties.massKg * quantity
    totalKg += massKg
    rows.push({ item: item++, name, quantity, material: properties.material, massKg })
  })
  return { rows, totalKg }
}

export interface InertiaMatrix {
  ixx: number
  iyy: number
  izz: number
  ixy: number
  iyz: number
  izx: number
  centerOfGravity: Vec3
  massKg: number
}

/**
 * Assembly > Analysis: inertia tensor of the assembly about its centre of
 * gravity, treating each part as a point mass at its centroid plus a box term.
 */
export function inertiaMatrix(solids: Solid[], materialOf: (solid: Solid) => string = () => 'steel'): InertiaMatrix {
  let massKg = 0
  const weighted = { x: 0, y: 0, z: 0 }
  const parts = solids.map((solid) => {
    const properties = massProperties(solid, materialOf(solid))
    const box = boundingBoxOf([solid])
    massKg += properties.massKg
    weighted.x += box.center.x * properties.massKg
    weighted.y += box.center.y * properties.massKg
    weighted.z += box.center.z * properties.massKg
    return { mass: properties.massKg, box }
  })
  const cog = massKg > 0
    ? { x: weighted.x / massKg, y: weighted.y / massKg, z: weighted.z / massKg }
    : { x: 0, y: 0, z: 0 }
  let ixx = 0, iyy = 0, izz = 0, ixy = 0, iyz = 0, izx = 0
  for (const part of parts) {
    const { x: w, y: h, z: d } = part.box.size
    const own = {
      xx: (part.mass * (h * h + d * d)) / 12,
      yy: (part.mass * (w * w + d * d)) / 12,
      zz: (part.mass * (w * w + h * h)) / 12
    }
    const dx = part.box.center.x - cog.x
    const dy = part.box.center.y - cog.y
    const dz = part.box.center.z - cog.z
    ixx += own.xx + part.mass * (dy * dy + dz * dz)
    iyy += own.yy + part.mass * (dx * dx + dz * dz)
    izz += own.zz + part.mass * (dx * dx + dy * dy)
    ixy -= part.mass * dx * dy
    iyz -= part.mass * dy * dz
    izx -= part.mass * dz * dx
  }
  return { ixx, iyy, izz, ixy, iyz, izx, centerOfGravity: cog, massKg }
}

/** Assembly > Measure between two parts (centre distance and box clearance). */
export function measureBetween(a: Solid, b: Solid): { centerDistance: number; clearance: number } {
  const boxA = boundingBoxOf([a])
  const boxB = boundingBoxOf([b])
  const centerDistance = Math.hypot(
    boxA.center.x - boxB.center.x,
    boxA.center.y - boxB.center.y,
    boxA.center.z - boxB.center.z
  )
  const gapX = Math.max(boxA.min.x - boxB.max.x, boxB.min.x - boxA.max.x)
  const gapY = Math.max(boxA.min.y - boxB.max.y, boxB.min.y - boxA.max.y)
  const gapZ = Math.max(boxA.min.z - boxB.max.z, boxB.min.z - boxA.max.z)
  return { centerDistance, clearance: Math.max(gapX, gapY, gapZ) }
}
