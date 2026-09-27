import { describe, expect, it } from 'vitest'
import {
  annotationLabel, annotationSegments, buildOverlay, mergeBounds, midpoint,
  overlayBounds, overlayFramingKey, overlayScale, wireSegments
} from '../src/core/overlay'
import { dimensionAnnotation, draftCircle, draftLine, draftRectangle, makeWire, textAnnotation } from '../src/core/draftwb'
import { boundingBoxOf } from '../src/core/primitives'
import { createDocument, createSolid } from '../src/core/model'
import { runCommandById } from '../src/core/commands'

/** The segments of a flat position array, as point pairs. */
function spans(positions: number[]) {
  const out: { a: number[]; b: number[] }[] = []
  for (let i = 0; i < positions.length; i += 6) {
    out.push({ a: positions.slice(i, i + 3), b: positions.slice(i + 3, i + 6) })
  }
  return out
}

describe('overlay geometry', () => {
  it('[Draft] turns an open wire into one segment per span', () => {
    const wire = makeWire('w', 'Polyline', [
      { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 10, z: 0 }
    ], false)
    const positions = wireSegments(wire)
    expect(spans(positions)).toHaveLength(2)
    expect(positions.slice(0, 6)).toEqual([0, 0, 0, 10, 0, 0])
  })

  it('[Draft] closes a closed wire back to its first point', () => {
    const rect = draftRectangle('r', 60, 40)
    expect(rect.closed).toBe(true)
    expect(rect.points).toHaveLength(4)
    const positions = wireSegments(rect)
    // Four corners closed is four spans, not three.
    expect(spans(positions)).toHaveLength(4)
    const last = spans(positions)[3]
    expect(last.b).toEqual([rect.points[0].x, rect.points[0].y, rect.points[0].z])
  })

  it('[Draft] draws nothing for a wire that has no span', () => {
    expect(wireSegments(makeWire('w', 'Point', [{ x: 1, y: 2, z: 3 }]))).toEqual([])
    expect(wireSegments(makeWire('w', 'Empty', []))).toEqual([])
    // A two-point wire is one line however it is flagged.
    const pair = makeWire('w', 'Pair', [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }], true)
    expect(spans(wireSegments(pair))).toHaveLength(1)
  })

  it('[Draft] gives a dimension its span and a witness tick at each end', () => {
    const dim = dimensionAnnotation('d', { x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 })
    const parts = spans(annotationSegments(dim, 10))
    expect(parts).toHaveLength(3)
    // The span itself comes first.
    expect(parts[0].a).toEqual([0, 0, 0])
    expect(parts[0].b).toEqual([100, 0, 0])
    // Each tick is centred on its end and crosses the span, so it has no
    // extent along X and the requested length across it.
    for (const tick of parts.slice(1)) {
      expect(tick.b[0] - tick.a[0]).toBeCloseTo(0, 9)
      expect(Math.hypot(tick.b[0] - tick.a[0], tick.b[1] - tick.a[1], tick.b[2] - tick.a[2])).toBeCloseTo(10, 9)
    }
  })

  it('[Draft] still ticks a dimension that runs straight up', () => {
    // A vertical span is parallel to the axis the tick direction is normally
    // taken from, so it has to fall back to the other one.
    const dim = dimensionAnnotation('d', { x: 0, y: 0, z: 0 }, { x: 0, y: 50, z: 0 })
    const parts = spans(annotationSegments(dim, 8))
    expect(parts).toHaveLength(3)
    for (const tick of parts.slice(1)) {
      const length = Math.hypot(tick.b[0] - tick.a[0], tick.b[1] - tick.a[1], tick.b[2] - tick.a[2])
      expect(length).toBeCloseTo(8, 9)
      expect(tick.b[1] - tick.a[1]).toBeCloseTo(0, 9)
    }
  })

  it('[Draft] draws a note as text alone and a leader as one line', () => {
    const note = textAnnotation('t', { x: 4, y: 5, z: 6 }, 'Note')
    expect(annotationSegments(note, 10)).toEqual([])
    expect(annotationLabel(note, 9).at).toEqual({ x: 4, y: 5, z: 6 })
    const leader = { id: 'l', kind: 'leader' as const, text: 'A', a: { x: 0, y: 0, z: 0 }, b: { x: 10, y: 10, z: 0 }, value: 0 }
    expect(spans(annotationSegments(leader, 10))).toHaveLength(1)
    expect(annotationLabel(leader, 9).at).toEqual(midpoint(leader.a, leader.b))
  })

  it('[Draft] scales ticks and labels with the model, with a floor for a tiny one', () => {
    const small = overlayScale(1)
    const large = overlayScale(4000)
    expect(small.tick).toBeGreaterThan(0)
    expect(large.tick).toBeGreaterThan(small.tick)
    // A 4 m model gets annotations two hundred times the size of a 20 mm one.
    expect(large.label / small.label).toBeCloseTo(200, 6)
  })
})

describe('overlay framing', () => {
  it('[Draft] bounds the wires and the annotations together', () => {
    const wires = [draftRectangle('r', 60, 40)]
    const annotations = [dimensionAnnotation('d', { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 90 })]
    const box = overlayBounds(wires, annotations)
    expect(box.max.x).toBeCloseTo(30, 9)
    expect(box.max.z).toBeCloseTo(90, 9)
    expect(box.size.x).toBeCloseTo(60, 9)
  })

  it('[Draft] reports an empty box when there is nothing drawn', () => {
    const box = overlayBounds([], [])
    expect(box.min).toEqual({ x: 0, y: 0, z: 0 })
    expect(box.max).toEqual({ x: 0, y: 0, z: 0 })
    expect(overlayFramingKey([], [])).toBe('')
  })

  it('[Draft] frames a drawing that has no solid beside it', () => {
    // This is what the viewport does: without the merge a document holding
    // only a 200 mm circle would be framed as if it were empty.
    const solids = boundingBoxOf([])
    const circle = overlayBounds([draftCircle('c', 200)], [])
    const merged = mergeBounds(solids, circle)
    expect(merged.max.x).toBeCloseTo(200, 6)
    expect(merged.size.x).toBeGreaterThan(0)
  })

  it('[Draft] keeps the solids in frame when a small wire is added', () => {
    const box = boundingBoxOf([createSolid('box', 'b', 1)])
    const merged = mergeBounds(box, overlayBounds([draftLine('l', { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })], []))
    expect(merged.max.x).toBeCloseTo(Math.max(box.max.x, 1), 9)
    expect(merged.min.y).toBeCloseTo(Math.min(box.min.y, 0), 9)
  })

  it('[Draft] re-frames only when the drawing changes size', () => {
    const small = overlayFramingKey([draftRectangle('r', 60, 40)], [])
    const same = overlayFramingKey([draftRectangle('other-id', 60, 40)], [])
    const bigger = overlayFramingKey([draftRectangle('r', 600, 400)], [])
    expect(same).toBe(small)
    expect(bigger).not.toBe(small)
  })
})

describe('overlay from the command registry', () => {
  /** A document with a box in it, the way the window hands one to a command. */
  function context() {
    const doc = createDocument('d', 'Doc')
    doc.solids = [createSolid('box', 'box-1', 1)]
    doc.selection = ['box-1']
    let n = 0
    return { doc, nextId: () => `t${n++}` }
  }

  it.each([
    ['suRectangleTool', 4],
    ['suCircleTool', 48],
    ['suPolygonTool', 8],
    ['draftRect', 4]
  ])('[SketchUp] %s produces a drawable closed outline', (id, spanCount) => {
    const ctx = context()
    const effect = runCommandById(id, ctx)
    expect(effect?.extras?.wires?.length).toBeGreaterThan(0)
    const wire = effect!.extras!.wires!.at(-1)!
    expect(wire.closed).toBe(true)
    expect(spans(wireSegments(wire))).toHaveLength(spanCount)
  })

  it('[SketchUp] a section cut becomes overlay lines the viewport can draw', () => {
    const ctx = context()
    const plane = runCommandById('suSection', ctx)!
    ctx.doc.extras = { ...ctx.doc.extras, ...plane.extras }
    const cut = runCommandById('suSectionCut', ctx)!
    const wires = cut.extras!.wires!
    const overlay = buildOverlay(wires, [], 60)
    expect(overlay.wires.length).toBeGreaterThan(0)
    // Every vertex is a full x,y,z triple and every segment a pair of them.
    expect(overlay.wires.length % 6).toBe(0)
    expect(overlay.wires.every((value) => Number.isFinite(value))).toBe(true)
  })

  it('[Draft] a dimension carries its text into the overlay labels', () => {
    const annotations = [dimensionAnnotation('d', { x: 0, y: 0, z: 0 }, { x: 120, y: 0, z: 0 })]
    const overlay = buildOverlay([draftRectangle('r', 120, 80)], annotations, 120)
    expect(overlay.labels).toHaveLength(1)
    expect(overlay.labels[0].text).toBe('120.00 mm')
    expect(overlay.labels[0].at).toEqual({ x: 60, y: 0, z: 0 })
    expect(overlay.labels[0].size).toBeGreaterThan(0)
    expect(spans(overlay.wires)).toHaveLength(4)
    expect(spans(overlay.annotations)).toHaveLength(3)
  })
})
