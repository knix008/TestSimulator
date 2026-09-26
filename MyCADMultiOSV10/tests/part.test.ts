import { describe, expect, it } from 'vitest'
import { createSolid } from '../src/core/model'
import { sketchesToDxf, sketchesToSvg } from '../src/core/drawing'
import { booleanSolids, helixSolid, linearPattern, loftSketches, makeSketch, mirrorSolid, padSketch, pipeSketch, polarPattern, rebuildFeatureSolid, revolveSketch, snap, solidVolume } from '../src/core/part'
import { femStress, sketchToGcode, WORKBENCHES } from '../src/core/workbenches'
import { activeDocument, createInitialState, reducer } from '../src/core/store'
import { parseDocument, serializeDocument } from '../src/core/serialize'

describe('part design', () => {
  it('[Part] pads a rectangle sketch into a solid mesh', () => {
    const sketch = makeSketch({ id: 's1', shape: 'rect', width: 20, height: 10, plane: 'xy' })
    const solid = padSketch(sketch, 12, 'pad-1')
    expect(solid.kind).toBe('mesh')
    expect(solid.mesh?.positions.length).toBeGreaterThan(20)
    expect(solidVolume(solid)).toBeGreaterThan(100)
  })

  it('[Part] revolves a sketch and snaps values to the grid', () => {
    const sketch = makeSketch({ id: 's2', shape: 'rect', width: 16, height: 8 })
    const solid = revolveSketch(sketch, 360, 'rev-1')
    expect(solid.mesh?.positions.length).toBeGreaterThan(30)
    expect(snap(23, 10)).toBe(20)
    expect(snap(5, 0)).toBe(5)
  })

  it('[Part] unions, cuts, mirrors, and patterns bodies', () => {
    const box = createSolid('box', 'a', 1)
    const tool = createSolid('sphere', 'b', 2)
    tool.position = { x: 10, y: 20, z: 0 }
    const fused = booleanSolids(box, tool, 'union', 'u')
    const cut = booleanSolids(box, tool, 'cut', 'c')
    expect(fused.mesh?.positions.length).toBeGreaterThan(10)
    expect(cut.mesh?.positions.length).toBeGreaterThan(10)
    const mirrored = mirrorSolid(box, 'yz', 'm')
    expect(mirrored.position.x).not.toBe(box.position.x)
    expect(linearPattern(box, 4, 30, 'x', (() => { let n = 0; return () => `p${n++}` })())).toHaveLength(3)
    expect(polarPattern(box, 6, 40, (() => { let n = 0; return () => `o${n++}` })())).toHaveLength(5)
  })

  it('[Part] records a feature in history and reloads it', () => {
    const sketch = makeSketch({ id: 'sketch', shape: 'circle', width: 18, height: 18 })
    const solid = padSketch(sketch, 8, 'temp')
    const feature = { id: 'f', name: 'pad', kind: 'pad' as const, solidIds: [] as string[], length: 8, angle: 0, count: 1, radius: 0 }
    let state = reducer(createInitialState(), { type: 'apply-part', solids: [solid], sketch, feature })
    expect(activeDocument(state).features).toHaveLength(1)
    expect(activeDocument(state).sketches[0].shape).toBe('circle')
    const saved = serializeDocument(activeDocument(state))
    state = reducer(state, { type: 'undo' })
    expect(activeDocument(state).solids).toHaveLength(0)
    const loaded = parseDocument(saved, 'doc')
    expect(loaded.features[0].kind).toBe('pad')
    expect(loaded.solids[0].kind).toBe('mesh')
  })

  it('[Part] lofts two sketches, pipes a profile, and recomputes a pad', () => {
    const wide = makeSketch({ id: 'a', shape: 'rect', width: 30, height: 20 })
    const narrow = makeSketch({ id: 'b', shape: 'circle', width: 12, height: 12 })
    const loft = loftSketches(wide, narrow, 40, 'loft')
    const pipe = pipeSketch(narrow, 50, 'pipe')
    expect(loft.mesh?.positions.length).toBeGreaterThan(30)
    expect(solidVolume(pipe)).toBeGreaterThan(10)
    const dxf = sketchesToDxf([wide, narrow])
    const svg = sketchesToSvg([wide, narrow])
    expect(dxf).toContain('LINE')
    expect(dxf).toContain('CIRCLE')
    expect(svg).toContain('<svg')
    const feature = { id: 'f', name: 'pad', kind: 'pad' as const, solidIds: ['sol-1'], length: 10, angle: 0, count: 1, radius: 0 }
    const rebuilt = rebuildFeatureSolid(feature, [{ ...wide, width: 80 }])
    expect(solidVolume(rebuilt!)).toBeGreaterThan(solidVolume(padSketch(wide, 10, 'old')))
    const helix = helixSolid(12, 8, 3, 'helix')
    expect(solidVolume(helix)).toBeGreaterThan(1)
    expect(WORKBENCHES.map((item) => item.id)).toContain('fem')
    expect(sketchToGcode(20, 10)).toContain('G21')
    expect(femStress(100)).toBe(10)
  })
})
