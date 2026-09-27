import { describe, expect, it } from 'vitest'
import { createSolid, sizeFieldsFor, type SolidKind } from '../src/core/model'
import { boundingBoxOf } from '../src/core/primitives'
import { solidVolume } from '../src/core/part'

const KINDS: SolidKind[] = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'plane']

/** The solid's extent along each axis, with its scale applied. */
const extent = (solid: ReturnType<typeof createSolid>) => boundingBoxOf([solid]).size

function scaled(kind: SolidKind, scale: { x: number; y: number; z: number }) {
  const solid = createSolid(kind, 's', 1)
  solid.scale = { ...scale }
  return solid
}

describe('scaling along the three axes', () => {
  it.each(KINDS)('[View] %s scales by the same rule on X, Y and Z', (kind) => {
    const base = extent(createSolid(kind, 's', 1))

    // One axis at a time: that axis doubles and the other two stand still.
    for (const axis of ['x', 'y', 'z'] as const) {
      const only = extent(scaled(kind, { x: 1, y: 1, z: 1, [axis]: 2 }))
      for (const other of ['x', 'y', 'z'] as const) {
        const want = other === axis ? base[other] * 2 : base[other]
        expect(only[other], `${kind} scale ${axis} -> ${other}`).toBeCloseTo(want, 6)
      }
    }
  })

  it.each(KINDS)('[View] %s grows the same amount on every axis at once', (kind) => {
    const base = extent(createSolid(kind, 's', 1))
    for (const factor of [0.5, 2, 3]) {
      const all = extent(scaled(kind, { x: factor, y: factor, z: factor }))
      for (const axis of ['x', 'y', 'z'] as const) {
        expect(all[axis], `${kind} x${factor} ${axis}`).toBeCloseTo(base[axis] * factor, 6)
      }
    }
  })

  it('[View] a uniform scale takes the volume to the cube of the factor', () => {
    // Only the kinds `solidVolume` knows a formula for; the rest report zero.
    for (const kind of ['box', 'sphere', 'cylinder', 'cone'] as const) {
      const base = solidVolume(createSolid(kind, 's', 1))
      expect(base, kind).toBeGreaterThan(0)
      for (const factor of [0.5, 2]) {
        expect(solidVolume(scaled(kind, { x: factor, y: factor, z: factor })), `${kind} x${factor}`)
          .toBeCloseTo(base * factor ** 3, 6)
      }
    }
  })

  it('[View] scaling one axis of a box changes only that axis of its volume', () => {
    const base = solidVolume(createSolid('box', 's', 1))
    expect(solidVolume(scaled('box', { x: 3, y: 1, z: 1 }))).toBeCloseTo(base * 3, 6)
    expect(solidVolume(scaled('box', { x: 1, y: 3, z: 1 }))).toBeCloseTo(base * 3, 6)
    expect(solidVolume(scaled('box', { x: 1, y: 1, z: 3 }))).toBeCloseTo(base * 3, 6)
  })
})

describe('the size fields a kind really has', () => {
  it('[View] every field the panel offers changes the shape', () => {
    for (const kind of KINDS) {
      const base = extent(createSolid(kind, 's', 1))
      for (const field of sizeFieldsFor(kind)) {
        const solid = createSolid(kind, 's', 1)
        solid.size = { ...solid.size, [field]: solid.size[field] * 1.5 }
        const after = extent(solid)
        const moved = (['x', 'y', 'z'] as const).some((axis) => Math.abs(after[axis] - base[axis]) > 1e-6)
        expect(moved, `${kind}.${field} did nothing`).toBe(true)
      }
    }
  })

  it('[View] a round kind offers its radius rather than three axes that do nothing', () => {
    // A sphere is its radius: X, Y and Z would be three boxes to type into
    // that the geometry never reads, which is what made the axes look as if
    // they behaved differently from one another.
    expect(sizeFieldsFor('sphere')).toEqual(['radius'])
    expect(sizeFieldsFor('cylinder')).toEqual(['radius', 'y'])
    expect(sizeFieldsFor('cone')).toEqual(['radius', 'y'])
    expect(sizeFieldsFor('torus')).toEqual(['radius', 'tube'])
    expect(sizeFieldsFor('box')).toEqual(['x', 'y', 'z'])
    expect(sizeFieldsFor('plane')).toEqual(['x', 'y', 'z'])
    // An imported mesh has no parametric size at all.
    expect(sizeFieldsFor('mesh')).toEqual([])

    // And the ones left out really are ignored, which is why they are gone.
    for (const field of ['x', 'y', 'z'] as const) {
      const sphere = createSolid('sphere', 's', 1)
      const before = extent(sphere)
      sphere.size = { ...sphere.size, [field]: sphere.size[field] * 2 }
      expect(extent(sphere), `sphere.${field}`).toEqual(before)
    }
  })

  it('[View] a box of three different sides keeps each one on its own axis', () => {
    const solid = createSolid('box', 's', 1)
    solid.size = { ...solid.size, x: 10, y: 20, z: 40 }
    const size = extent(solid)
    expect(size.x).toBeCloseTo(10, 6)
    expect(size.y).toBeCloseTo(20, 6)
    expect(size.z).toBeCloseTo(40, 6)
  })
})
