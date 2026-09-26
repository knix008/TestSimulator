import { describe, expect, it } from 'vitest'
import { draftSolid, groove, inertiaOf, rectangularPattern, referencePlane, shaft, shellSolid, solveMate, steppedHole, transformSolid, updateSketchFromParameters } from '../src/core/catia'
import { sketchesToDxf, sketchesToSvg } from '../src/core/drawing'
import { createSolid, type Solid } from '../src/core/model'
import { booleanSolids, filletBox, helixSolid, holeTool, linearPattern, loftSketches, makeSketch, mirrorSolid, padSketch, pipeSketch, polarPattern, revolveSketch, solidVolume, toObj, type Feature } from '../src/core/part'
import { buildPrintPages, selectionDistance } from '../src/core/print'
import { parseStl, toAsciiStl } from '../src/core/stl'
import { activeDocument, createInitialState, reducer } from '../src/core/store'
import { orbitForPreset } from '../src/core/viewnav'
import { femStress, sketchToGcode, WORKBENCHES } from '../src/core/workbenches'
import { compileOpenScad, femBar, forwardKinematics, inspectSolids, parseIfc, parsePoints, pocketGcode, pointCloudSolid, solveSketchConstraints, surfaceFromSketch, toIfc } from '../src/core/extended'

function feature(name: string, kind: Feature['kind']): Feature {
  return { id: 'f', name, kind, solidIds: [], length: 12, angle: 90, count: 4, radius: 2 }
}

function sketch(shape: 'rect' | 'circle' | 'polygon' = 'rect') {
  return makeSketch({ id: 'sk', shape, width: 40, height: 24, plane: 'xy', sides: 6 })
}

function meshLength(solid: Solid) {
  return solid.mesh?.positions.length ?? 0
}

function expectMesh(solid: Solid) {
  expect(meshLength(solid)).toBeGreaterThan(8)
}

function boxState() {
  const state = reducer(createInitialState(), { type: 'add-solid', kind: 'box' })
  const solid = activeDocument(state).solids[0]
  return reducer(state, { type: 'select', ids: [solid.id] })
}

const checks: Record<string, () => void> = {
  box: () => expect(activeDocument(reducer(createInitialState(), { type: 'add-solid', kind: 'box' })).solids[0].kind).toBe('box'),
  cylinder: () => expect(activeDocument(reducer(createInitialState(), { type: 'add-solid', kind: 'cylinder' })).solids[0].kind).toBe('cylinder'),
  sphere: () => expect(activeDocument(reducer(createInitialState(), { type: 'add-solid', kind: 'sphere' })).solids[0].kind).toBe('sphere'),
  cone: () => expect(activeDocument(reducer(createInitialState(), { type: 'add-solid', kind: 'cone' })).solids[0].kind).toBe('cone'),
  torus: () => expect(activeDocument(reducer(createInitialState(), { type: 'add-solid', kind: 'torus' })).solids[0].kind).toBe('torus'),
  plane: () => expect(activeDocument(reducer(createInitialState(), { type: 'add-solid', kind: 'plane' })).solids[0].kind).toBe('plane'),
  sketchRect: () => {
    const next = sketch('rect')
    const state = reducer(createInitialState(), { type: 'apply-part', solids: [padSketch(next, 0.4, 'preview')], sketch: next, feature: feature('sketchRect', 'sketch') })
    expect(activeDocument(state).sketches[0].shape).toBe('rect')
    expectMesh(activeDocument(state).solids[0])
  },
  sketchCircle: () => {
    const next = sketch('circle')
    const state = reducer(createInitialState(), { type: 'apply-part', solids: [padSketch(next, 0.4, 'preview')], sketch: next, feature: feature('sketchCircle', 'sketch') })
    expect(activeDocument(state).sketches[0].shape).toBe('circle')
  },
  sketchPolygon: () => {
    const next = sketch('polygon')
    const state = reducer(createInitialState(), { type: 'apply-part', solids: [padSketch(next, 0.4, 'preview')], sketch: next, feature: feature('sketchPolygon', 'sketch') })
    expect(activeDocument(state).sketches[0].sides).toBe(6)
  },
  pad: () => expectMesh(padSketch(sketch(), 20, 'pad')),
  pocket: () => {
    const base = createSolid('box', 'base', 1)
    expectMesh(booleanSolids(base, padSketch(sketch(), 10, 'tool'), 'cut', 'pocket'))
  },
  revolve: () => expectMesh(revolveSketch(sketch(), 180, 'revolve')),
  groove: () => expectMesh(groove(createSolid('box', 'base', 1), sketch(), 90, 'groove')),
  loft: () => expectMesh(loftSketches(sketch(), makeSketch({ id: 'top', shape: 'circle', width: 16, height: 16 }), 30, 'loft')),
  pipe: () => expect(solidVolume(pipeSketch(sketch('circle'), 40, 'pipe'))).toBeGreaterThan(1),
  helix: () => expect(solidVolume(helixSolid(10, 6, 2, 'helix'))).toBeGreaterThan(1),
  fillet: () => expectMesh(filletBox(createSolid('box', 'base', 1), 2, 'fillet')),
  chamfer: () => expectMesh(filletBox(createSolid('box', 'base', 1), 2, 'chamfer', true)),
  draft: () => expectMesh(draftSolid(createSolid('box', 'base', 1), 8, 'draft')),
  shell: () => expectMesh(shellSolid(createSolid('box', 'base', 1), 2, 'shell')),
  mirror: () => {
    const base = createSolid('box', 'base', 1)
    expect(mirrorSolid(base, 'yz', 'mirror').position.x).not.toBe(base.position.x)
  },
  linearPattern: () => expect(linearPattern(createSolid('box', 'base', 1), 4, 30, 'x', (() => { let n = 0; return () => `p${n++}` })())).toHaveLength(3),
  polarPattern: () => expect(polarPattern(createSolid('box', 'base', 1), 6, 40, (() => { let n = 0; return () => `o${n++}` })())).toHaveLength(5),
  hole: () => {
    const base = createSolid('box', 'base', 1)
    expectMesh(booleanSolids(base, holeTool(8, 20, base.position, 'hole'), 'cut', 'hole'))
  },
  union: () => {
    const base = createSolid('box', 'a', 1)
    const tool = createSolid('sphere', 'b', 2)
    tool.position = { ...base.position }
    expectMesh(booleanSolids(base, tool, 'union', 'union'))
  },
  cut: () => {
    const base = createSolid('box', 'a', 1)
    const tool = createSolid('sphere', 'b', 2)
    tool.position = { ...base.position }
    expectMesh(booleanSolids(base, tool, 'cut', 'cut'))
  },
  common: () => {
    const base = createSolid('box', 'a', 1)
    const tool = createSolid('sphere', 'b', 2)
    tool.position = { ...base.position }
    expectMesh(booleanSolids(base, tool, 'common', 'common'))
  },
  coincidence: () => {
    const first = createSolid('box', 'a', 1)
    const second = createSolid('box', 'b', 2)
    const moved = solveMate(first, second, { id: 'm', kind: 'coincidence', a: first.id, b: second.id, value: 0 })
    expect(moved.position).toEqual(first.position)
  },
  offsetMate: () => {
    const first = createSolid('box', 'a', 1)
    const second = createSolid('box', 'b', 2)
    const moved = solveMate(first, second, { id: 'm', kind: 'offset', a: first.id, b: second.id, value: 25 })
    expect(moved.position.x).toBe(first.position.x + 25)
  },
  parameter: () => {
    const updated = updateSketchFromParameters(sketch(), [{ id: 'p', name: 'Width', formula: '80', value: 80 }])
    expect(updated.width).toBe(80)
  },
  measure: () => {
    let state = reducer(createInitialState(), { type: 'add-solid', kind: 'box' })
    state = reducer(state, { type: 'add-solid', kind: 'sphere' })
    const ids = activeDocument(state).solids.map((solid) => solid.id)
    state = reducer(state, { type: 'select', ids })
    expect(selectionDistance(activeDocument(state))).toBeGreaterThan(0)
  },
  translate: () => {
    const base = createSolid('box', 'base', 1)
    expect(transformSolid(base, 'translate', 'x', 15, 'move').position.x).toBe(base.position.x + 15)
  },
  rotateBody: () => {
    const base = createSolid('box', 'base', 1)
    expect(transformSolid(base, 'rotate', 'y', 45, 'spin').rotation.y).toBe(base.rotation.y + 45)
  },
  scaleBody: () => {
    const base = createSolid('box', 'base', 1)
    expect(transformSolid(base, 'scale', 'x', 2, 'grow').scale.x).toBe(base.scale.x * 2)
  },
  front: () => expect(orbitForPreset('front').polar).toBeCloseTo(Math.PI / 2),
  top: () => expect(orbitForPreset('top').polar).toBeLessThan(0.2),
  iso: () => expect(orbitForPreset('iso').azimuth).toBeCloseTo(Math.PI / 4),
  section: () => {
    const state = reducer(boxState(), { type: 'set-section', enabled: true })
    expect(activeDocument(state).section).toBe(true)
  },
  exportSvg: () => expect(sketchesToSvg([sketch('circle')])).toContain('<svg'),
  exportDxf: () => expect(sketchesToDxf([sketch()])).toContain('LINE'),
  print: () => expect(buildPrintPages([activeDocument(createInitialState())], 'doc-1', 'current', [], false)).toHaveLength(1),
  importStl: () => {
    const solid = parseStl(toAsciiStl([createSolid('box', 'base', 1)]), 'imported')
    expect(solid.kind).toBe('mesh')
    expectMesh(solid)
  },
  exportStl: () => expect(toAsciiStl([createSolid('box', 'base', 1)])).toContain('facet normal'),
  exportObj: () => expect(toObj([createSolid('box', 'base', 1)])).toContain('v '),
  updatePart: () => {
    const wide = sketch()
    const narrow = makeSketch({ ...wide, width: 10 })
    const before = padSketch(narrow, 12, 'old')
    const featurePad = { ...feature('pad', 'pad'), length: 12, solidIds: ['sol-1'] }
    const rebuilt = reducer(createInitialState(), {
      type: 'apply-part',
      solids: [before],
      sketch: narrow,
      feature: featurePad
    })
    const doc = activeDocument(rebuilt)
    const updated = updateSketchFromParameters(doc.sketches[0], [{ id: 'w', name: 'Width', formula: '80', value: 80 }])
    const solid = padSketch(updated, 12, doc.solids[0].id)
    const next = reducer(rebuilt, { type: 'recompute-part', sketches: [updated], solid, replaceId: doc.solids[0].id })
    expect(solidVolume(activeDocument(next).solids[0])).toBeGreaterThan(solidVolume(before))
  },
  inertia: () => expect(inertiaOf(createSolid('box', 'base', 1)).volume).toBeGreaterThan(0),
  femCheck: () => {
    expect(femStress(250, 1000)).toBe(4)
    expect(femStress(0)).toBe(0)
  },
  exportGcode: () => {
    const gcode = sketchToGcode(40, 20)
    expect(gcode).toContain('G21')
    expect(gcode).toContain('G1')
    expect(gcode.trim().endsWith('M30')).toBe(true)
    expect(gcode.split('\n').some((line) => line.startsWith('G2 ') || line.startsWith('G3'))).toBe(false)
  },
  refPlane: () => expect(referencePlane('xy', 18, 'storey').position.y).toBe(18),
  shaft: () => expectMesh(shaft(sketch(), 360, 'shaft')),
  rectPattern: () => expect(rectangularPattern(createSolid('box', 'base', 1), 3, 2, 20, 20, (() => { let n = 0; return () => `r${n++}` })()).length).toBeGreaterThan(1),
  counterbore: () => expectMesh(steppedHole(createSolid('box', 'wall', 1), 'counterbore', 8, 12, 'bore')),
  countersink: () => expectMesh(steppedHole(createSolid('box', 'wall', 1), 'countersink', 8, 12, 'sink')),
  solveConstraints: () => {
    const solved = solveSketchConstraints(
      [{ x: 0, y: 4 }, { x: 12, y: -3 }, { x: 0, y: 0 }, { x: 3, y: 4 }],
      [{ kind: 'horizontal', a: 0, b: 1 }, { kind: 'distance', a: 0, b: 1, value: 30 }, { kind: 'equal', a: 2, b: 3 }]
    )
    expect(solved[0].y).toBeCloseTo(solved[1].y)
    expect(Math.hypot(solved[1].x - solved[0].x, solved[1].y - solved[0].y)).toBeCloseTo(30)
    expect(Math.hypot(solved[3].x - solved[2].x, solved[3].y - solved[2].y)).toBeCloseTo(Math.hypot(solved[1].x - solved[0].x, solved[1].y - solved[0].y))
  },
  importPoints: () => {
    const points = parsePoints('0 0 0\n10 0 5')
    expect(points).toHaveLength(2)
    expect(pointCloudSolid(points, 'cloud').mesh?.positions.length).toBe(36)
  },
  surfaceFill: () => expect(surfaceFromSketch(sketch(), 'sheet').name.startsWith('Surface.')).toBe(true),
  robotPose: () => {
    const flat = forwardKinematics([10, 0], [0, 0])
    const up = forwardKinematics([10], [90])
    expect(flat.x).toBeCloseTo(10)
    expect(up.y).toBeCloseTo(10)
  },
  importOpenScad: () => {
    const cube = compileOpenScad('translate([10,0,0]) cube([20,10,8]);')
    expect(cube.size.x).toBe(20)
    expect(cube.size.y).toBe(8)
    expect(cube.position.x).toBe(10)
    const fused = compileOpenScad('union(){ cube(16); translate([4,0,0]) cube(16); }')
    expect(meshLength(fused)).toBeGreaterThan(8)
  },
  inspect: () => {
    const first = createSolid('box', 'a', 1)
    const second = createSolid('box', 'b', 2)
    const report = inspectSolids(first, second)
    expect(report.centerDistance).toBeGreaterThan(0)
    expect(report.volumeDelta).toBe(0)
  },
  pocketPath: () => {
    const gcode = pocketGcode(40, 20, 6, 3, 1)
    expect(gcode.match(/G1 Z-/g)?.length).toBe(3)
    expect(gcode).toContain('G1 Z-3')
    expect(gcode.trim().endsWith('M30')).toBe(true)
  },
  exportIfc: () => {
    const text = toIfc([createSolid('box', 'wall', 1)])
    expect(text).toContain('IFC4')
    expect(parseIfc(text).products).toEqual(['WALL'])
  },
  femBar: () => {
    const bar = femBar(100, 10, 1000, 200000)
    expect(bar.stress).toBe(100)
    expect(bar.displacement).toBeCloseTo(0.05)
    expect(bar.reaction).toBeCloseTo(1000)
    expect(femBar(0, 10, 1000, 200000).displacement).toBe(0)
  }
}

describe('freecad behavior', () => {
  for (const [tool, check] of Object.entries(checks)) {
    it(`[FreeCAD] ${tool} changes the model`, check)
  }

  it('[FreeCAD] every workbench tool has a behavior check', () => {
    const covered = new Set(Object.keys(checks))
    const missing = WORKBENCHES.flatMap((bench) => bench.tools.filter((tool) => !covered.has(tool)))
    expect(missing).toEqual([])
  })
})
