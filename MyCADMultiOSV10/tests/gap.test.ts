import { describe, expect, it } from 'vitest'
import { importFile } from '../src/core/fileTypes'
import { runCommandById } from '../src/core/commands'
import { createDocument } from '../src/core/model'
import {
  LAYOUT_A3, bendingStress, blockCoefficient, bookmarkRecord, cavitySize, conductorResistance,
  developedLength, draftAngleDeg, evalDynamic, fitClearance, helpLines, hermitePoint, imagePlanePositions,
  inferSnap, laminateThickness, latheGcode, layoutLength, localMetres, millimetresPerPixel, parseSkp,
  partTemplate, polylineBounds, polylineLength, ruleOfMixtures, rssStack, sectionModulus, shipDisplacement,
  skpSolid, smoothTriangle, studioBrightness, subdivideTriangles, textureRepeats, toolTilt, voltageDrop,
  waterplaneArea, worstCaseStack, writeSkp, lambert
} from '../src/core/gap'

describe('missing workbenches', () => {
  it('[Gap] Start, Image and Plot build the sizes they claim', () => {
    const part = partTemplate('body')
    expect(part.name).toBe('PartBody')
    expect(part.size).toMatchObject({ x: 100, y: 40, z: 60 })
    expect(imagePlanePositions(100, 60)).toHaveLength(18)
    expect(millimetresPerPixel(200, 50)).toBeCloseTo(0.25)
    const points = [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }, { x: 3, y: 0, z: 4 }]
    expect(polylineLength(points)).toBeCloseTo(7)
    expect(polylineBounds(points).max).toEqual({ x: 3, y: 0, z: 4 })
  })

  it('[Gap] Ship displacement uses L×B×T×Cb×density', () => {
    expect(shipDisplacement(10, 2, 1, 0.7)).toBeCloseTo(14350)
    expect(blockCoefficient(14, 10, 2, 1)).toBeCloseTo(0.7)
    expect(waterplaneArea(10, 2)).toBe(20)
    expect(() => shipDisplacement(10, 2, 1, 1.2)).toThrow(/방형 계수/)
  })

  it('[Gap] Web help reads a workbench and bookmarks only http addresses', () => {
    expect(helpLines('ship').join(' ')).toContain('배수량')
    expect(bookmarkRecord('https://www.freecad.org/api')).toContain('freecad.org')
    expect(() => bookmarkRecord('ftp://files.local/a')).toThrow(/http/)
  })

  it('[Gap] subdivision, Hermite and tolerancing match the closed form', () => {
    const divided = subdivideTriangles([0, 0, 0, 2, 0, 0, 0, 2, 0])
    expect(divided.length / 9).toBe(4)
    const [smoothed] = smoothTriangle({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 0, y: 2, z: 0 })
    expect(smoothed).toEqual({ x: 1, y: 1, z: 0 })
    const mid = hermitePoint(
      { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 0.5
    )
    expect(mid.x).toBeCloseTo(5)
    expect(mid.y).toBeCloseTo(0)
    expect(worstCaseStack([0.1, 0.2, 0.1])).toBeCloseTo(0.4)
    expect(rssStack([0.1, 0.2, 0.1])).toBeCloseTo(Math.sqrt(0.06))
    expect(fitClearance(10.1, 10)).toBeCloseTo(0.1)
  })

  it('[Gap] electrical, piping, structure, composites and mold use their formulas', () => {
    expect(voltageDrop(10, 1.68e-8, 50, 2.5e-6)).toBeCloseTo(3.36)
    expect(conductorResistance(1.68e-8, 50, 2.5e-6)).toBeCloseTo(0.336)
    expect(developedLength(1000, 100, 90)).toBeCloseTo(1000 + 50 * Math.PI)
    expect(developedLength(0, 50, 90)).toBeCloseTo(25 * Math.PI)
    expect(sectionModulus(10, 20)).toBeCloseTo(2000 / 3)
    expect(bendingStress(2000, 10, 20)).toBeCloseTo(3)
    expect(ruleOfMixtures(230, 3.5, 0.6)).toBeCloseTo(139.4)
    expect(laminateThickness(0.2, 8)).toBeCloseTo(1.6)
    expect(cavitySize(100, 0.5)).toBeCloseTo(100.5)
    const draft = draftAngleDeg(
      { x: Math.cos(Math.PI / 36), y: Math.sin(Math.PI / 36), z: 0 },
      { x: 0, y: 1, z: 0 }
    )
    expect(draft).toBeCloseTo(5)
    expect(draftAngleDeg({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toBeCloseTo(0)
  })

  it('[Gap] lathe g-code finishes on diameter and 5-axis tilt aims +Y to A90', () => {
    const gcode = latheGcode(40, 36, 20, 2)
    expect(gcode).toContain('G1 X38.000 Z0')
    expect(gcode).toContain('G1 X36.000 Z0')
    expect(gcode).toContain('G1 Z-20.000')
    expect(gcode.trim().endsWith('M30')).toBe(true)
    expect(toolTilt({ x: 0, y: 1, z: 0 })).toEqual({ a: 90, b: 0 })
    expect(lambert({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 0 })).toBeCloseTo(1)
    expect(studioBrightness({ x: 0, y: 1, z: 0 })).toBeGreaterThan(0)
    expect(studioBrightness({ x: 0, y: -1, z: 0 })).toBeLessThan(studioBrightness({ x: 0, y: 1, z: 0 }))
  })

  it('[Gap] SketchUp snap, formulas, geo, texture, layout and SKP text round-trip', () => {
    const endpoint = inferSnap({ x: 1, y: 0, z: 0 }, [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }], 2)
    expect(endpoint).toMatchObject({ kind: 'endpoint', point: { x: 0, y: 0, z: 0 } })
    const midpoint = inferSnap({ x: 5, y: 0.2, z: 0 }, [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }], 1)
    expect(midpoint.kind).toBe('midpoint')
    expect(midpoint.point.x).toBeCloseTo(5)
    expect(evalDynamic([{ name: 'LenX', formula: '100' }, { name: 'Copies', formula: 'LenX/50' }]).Copies).toBe(2)
    expect(localMetres(37, 127, 37.001, 127).north).toBeCloseTo(111.32)
    expect(millimetresPerPixel(200, 4000)).toBe(20)
    expect(textureRepeats(100, 40)).toBe(2.5)
    expect(layoutLength(1000, 5)).toBe(200)
    expect(LAYOUT_A3).toEqual({ width: 420, height: 297 })
    const text = writeSkp([{ name: 'Floor', points: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 0, z: 8 }, { x: 0, y: 0, z: 8 }] }])
    expect(parseSkp(text)[0].points).toHaveLength(4)
    const solid = skpSolid(text, 'floor')
    expect(solid.mesh?.positions.length).toBe(18)
    const opened = importFile('room.skp', 'SKP1\nface Floor 0,0,0 4000,0,0 4000,0,3000 0,0,3000\n')
    expect(opened.report[0]).toBe('1 faces')
    expect(opened.solids[0].mesh?.positions.length).toBe(18)
  })

  it('[Gap] every new command reports the same number as the function', () => {
    const doc = createDocument('doc', 'Gap')
    let n = 0
    const ctx = { doc, nextId: () => `id-${(n += 1)}` }
    expect(runCommandById('shipDisplacement', ctx)?.status).toBe('14350 kg')
    expect(runCommandById('elecDrop', ctx)?.status).toBe('3.36 V')
    expect(runCommandById('layScale', ctx)?.status).toBe('200 mm')
    expect(runCommandById('suDynamic', ctx)?.status).toBe('Copies 2')
    expect(runCommandById('latheTurn', ctx)?.download?.text).toContain('M30')
    expect(runCommandById('iasSubdivide', ctx)?.solids?.[0].mesh?.positions.length).toBe(36)
    expect(runCommandById('startPart', ctx)?.parameter).toMatchObject({ name: 'Width', value: 100 })
  })
})
