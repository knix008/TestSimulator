import { describe, expect, it } from 'vitest'
import { draftSolid, evaluateFormula, inertiaOf, rectangularPattern, referencePlane, shaft, solveMate, specTreeLines, updateSketchFromParameters } from '../src/core/catia'
import { createSolid } from '../src/core/model'
import { makeSketch } from '../src/core/part'

describe('catia', () => {
  it('[CATIA] evaluates parameters and updates a sketch like Knowledge Advisor', () => {
    const parameters = [
      { name: 'Width', value: 20, formula: '' },
      { name: 'Height', value: 0, formula: 'Width*2' }
    ]
    expect(evaluateFormula('Width*2+4', parameters)).toBe(44)
    const sketch = updateSketchFromParameters(makeSketch({ id: 's', width: 1, height: 1 }), parameters)
    expect(sketch.width).toBe(20)
    expect(sketch.height).toBe(40)
  })

  it('[CATIA] builds a shaft, draft, reference plane, and rectangular pattern', () => {
    const sketch = makeSketch({ id: 's', shape: 'rect', width: 12, height: 8 })
    const body = shaft(sketch, 180, 'shaft')
    expect(body.name.startsWith('Shaft')).toBe(true)
    expect(body.mesh?.positions.length).toBeGreaterThan(10)
    const box = createSolid('box', 'box', 1)
    const drafted = draftSolid(box, 8, 'draft')
    expect(drafted.name.startsWith('Draft')).toBe(true)
    expect(drafted.mesh?.positions.length).toBeGreaterThan(30)
    const plane = referencePlane('xy', 25, 'pl')
    expect(plane.position.y).toBe(25)
    expect(rectangularPattern(box, 2, 2, 30, 40, (() => { let n = 0; return () => `r${n++}` })())).toHaveLength(3)
  })

  it('[CATIA] solves assembly mates and reports inertia on the specification tree', () => {
    const first = createSolid('box', 'a', 1)
    const second = createSolid('box', 'b', 2)
    second.position = { x: 80, y: 0, z: 0 }
    const fixed = solveMate(first, second, { id: 'm', kind: 'coincidence', a: 'a', b: 'b', value: 0 })
    expect(fixed.position).toEqual(first.position)
    const offset = solveMate(first, second, { id: 'm2', kind: 'offset', a: 'a', b: 'b', value: 15 })
    expect(offset.position.x).toBe(first.position.x + 15)
    const inertia = inertiaOf(first)
    expect(inertia.volume).toBeGreaterThan(0)
    const lines = specTreeLines([{ name: 'Pad.1', kind: 'pad' }], [{ name: 'Width', value: 20, formula: '' }], [{ id: 'm', kind: 'coincidence', a: 'a', b: 'b', value: 0 }])
    expect(lines[0]).toBe('Part1')
    expect(lines.some((line) => line.includes('PartBody'))).toBe(true)
    expect(lines.some((line) => line.includes('Width'))).toBe(true)
  })
})
