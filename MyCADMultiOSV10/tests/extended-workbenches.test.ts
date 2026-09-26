import { describe, expect, it } from 'vitest'
import { createSolid, type Solid } from '../src/core/model'
import { solidVolume } from '../src/core/part'
import {
  boundingBoxOf, booleanFragments, compoundSolids, crossSections, makePrimitive,
  offsetSolid, surfaceArea, thicknessSolid, xorSolids
} from '../src/core/primitives'
import {
  draftArc, draftArray, draftBSpline, draftBezier, draftCircle, draftPolygon, draftRectangle,
  downgradeWire, filletWire, joinWires, makeWire, offsetWire, shapeString, splitWire,
  upgradeWire, wireArea, wireLength
} from '../src/core/draftwb'
import {
  approximateSurface, decimateMesh, fillHoles, fitPlane, fitSphere, flipNormals,
  harmonizeNormals, meshInfo, refineMesh, smoothMesh
} from '../src/core/meshwb'
import {
  billOfMaterials, createPage, hatchLines, pageToDxf, pageToSvg, projectSolids, projectionGroup
} from '../src/core/techdraw'
import { createSheet, evaluateSheet, parseCsv, setAlias, setCell, sheetToCsv } from '../src/core/spreadsheet'
import { evaluateExpression, expressionNames, parseMacro } from '../src/core/expressions'
import { MATERIALS, massProperties } from '../src/core/materials'
import { meshStats, modalFrequency, solveBar, solveBeam, solveTruss, thermalFlux, vonMises } from '../src/core/femwb'
import { TOOL_LIBRARY, jobStats, pocketOperation, postProcess, profileOperation } from '../src/core/camwb'
import { archWall, archWindow, exportIfc, importIfc, makeLevels, schedule, describeElement } from '../src/core/archwb'
import { extractBoundary, extrudeSurface, fillSurface, revolveSurface, splitSurface, sweepSurface, spline3d } from '../src/core/gsd'
import {
  addFlange, addWall, bendAllowance, bendDeduction, checkSheetPart, createSheetPart,
  flatPatternDxf, foldedSolids, minimumFlange, unfold
} from '../src/core/sheetmetal'
import { addJoint, clashCheck, createMechanism, degreesOfFreedom, simulate, sweptEnvelope } from '../src/core/kinematics'
import { applyDesignTable, applyRules, parseDesignTable, runChecks, solveFormulas } from '../src/core/knowledge'
import { bom, explodeAssembly, inertiaMatrix, measureBetween, solveConstraints } from '../src/core/assembly'
import {
  defaultCamera, defaultShadows, faceNormal, followMe, instanceSolids, makeComponentDefinition,
  moveCopies, paintSolid, pushPull, rotateCopies, softenEdges, solidTool, sunDirection,
  terrainFromScratch, text3d, walkCamera, zoomExtents
} from '../src/core/sketchup'
import { addRectangle, createSketch2D, degreesOfFreedom as sketchDof, solveSketch, sketchLoops } from '../src/core/sketcher'

function box(id = 'a', size = 40, at = { x: 0, y: size / 2, z: 0 }): Solid {
  const solid = createSolid('box', id, 1)
  solid.name = id
  solid.size = { ...solid.size, x: size, y: size, z: size }
  solid.position = { ...at }
  return solid
}

let counter = 0
const nextId = () => `t-${(counter += 1)}`

describe('expressions', () => {
  it('[Expressions] evaluates units, functions and precedence', () => {
    expect(evaluateExpression('10 mm + 2 cm')).toBe(30)
    expect(evaluateExpression('1 in')).toBeCloseTo(25.4)
    expect(evaluateExpression('2 + 3 * 4')).toBe(14)
    expect(evaluateExpression('(2 + 3) * 4')).toBe(20)
    expect(evaluateExpression('2 ^ 3 ^ 2')).toBe(512)
    expect(evaluateExpression('sqrt(16) * 3')).toBe(12)
    expect(evaluateExpression('sin(30)')).toBeCloseTo(0.5)
    expect(evaluateExpression('max(3, 7, 5) ^ 2')).toBe(49)
    expect(evaluateExpression('Width * 2', { Width: 21 })).toBe(42)
    expect(evaluateExpression('Width > 10 && Width < 100', { Width: 40 })).toBe(1)
    expect(evaluateExpression('10 / 0')).toBe(0)
  })

  it('[Expressions] rejects unknown names and broken syntax', () => {
    expect(() => evaluateExpression('Missing + 1')).toThrow()
    expect(() => evaluateExpression('2 +')).toThrow()
    expect(() => evaluateExpression('nope(2)')).toThrow()
    expect(expressionNames('Width * Height + sin(30)')).toEqual(['Width', 'Height'])
  })

  it('[Expressions] parses macro scripts with comments and expressions', () => {
    const commands = parseMacro('# header\nbox(40, 20, 10)\nmove(Width / 2, 0, 0)\n', { Width: 30 })
    expect(commands).toHaveLength(2)
    expect(commands[0]).toMatchObject({ name: 'box', args: [40, 20, 10], line: 2 })
    expect(commands[1].args[0]).toBe(15)
    expect(() => parseMacro('not a call')).toThrow()
  })
})

describe('spreadsheet', () => {
  it('[Spreadsheet] evaluates aliases, ranges and reports circular references', () => {
    let sheet = createSheet('Test')
    sheet = setCell(sheet, 'a1', '40', 'Width')
    sheet = setCell(sheet, 'A2', '25')
    sheet = setAlias(sheet, 'A2', 'Height')
    sheet = setCell(sheet, 'A3', '=Width * Height', 'Area')
    sheet = setCell(sheet, 'A4', '=sum(A1:A3)')
    const values = evaluateSheet(sheet)
    expect(values.aliases.Area).toBe(1000)
    expect(values.values.A4).toBe(1065)

    let broken = createSheet('Broken')
    broken = setCell(broken, 'A1', '=A2')
    broken = setCell(broken, 'A2', '=A1')
    expect(Object.keys(evaluateSheet(broken).errors).length).toBeGreaterThan(0)
  })

  it('[Spreadsheet] round-trips through CSV', () => {
    const sheet = parseCsv('Width,80\nDepth,50\nArea,=B1*B2', 'csv')
    const csv = sheetToCsv(sheet)
    expect(csv.split('\n')[0]).toBe('Width,80')
    expect(csv.split('\n')[2]).toBe('Area,4000')
  })
})

describe('sketcher', () => {
  it('[Sketcher] solves a constrained rectangle and counts DoF', () => {
    const sketch = createSketch2D('Rect')
    addRectangle(sketch, 'r', 40, 20)
    sketch.constraints.push({ id: 'd1', type: 'distanceX', points: [0, 1], value: 60 })
    const before = sketchDof(sketch)
    const result = solveSketch(sketch)
    expect(result.converged).toBe(true)
    expect(Math.abs(result.sketch.points[1].x - result.sketch.points[0].x)).toBeCloseTo(60, 2)
    expect(result.dof).toBeLessThanOrEqual(before)
  })

  it('[Sketcher] extracts closed loops for padding', () => {
    const sketch = createSketch2D('Loop')
    addRectangle(sketch, 'r', 30, 20)
    const loops = sketchLoops(sketch)
    expect(loops).toHaveLength(1)
    expect(loops[0].length).toBeGreaterThanOrEqual(4)
  })
})

describe('part primitives', () => {
  it('[Part] every primitive produces a mesh with volume', () => {
    for (const kind of ['wedge', 'prism', 'ellipsoid', 'tube', 'spiral', 'ring', 'pyramid'] as const) {
      const solid = makePrimitive(kind, nextId())
      expect(solid.kind, kind).toBe('mesh')
      expect(meshInfo(solid).triangles, kind).toBeGreaterThan(3)
      expect(solidVolume(solid), kind).toBeGreaterThan(0)
    }
  })

  it('[Part] XOR removes the shared volume and fragments split it in three', () => {
    const a = box('a', 40, { x: 0, y: 20, z: 0 })
    const b = box('b', 40, { x: 20, y: 20, z: 0 })
    const xor = xorSolids(a, b, nextId())
    expect(solidVolume(xor)).toBeGreaterThan(0)
    expect(solidVolume(xor)).toBeLessThan(solidVolume(a) + solidVolume(b))
    const pieces = booleanFragments(a, b, nextId)
    expect(pieces).toHaveLength(3)
    const total = pieces.reduce((acc, piece) => acc + solidVolume(piece), 0)
    expect(total).toBeGreaterThan(solidVolume(a))
  })

  it('[Part] thickness hollows and offset grows the shape', () => {
    const solid = box('a')
    const hollow = thicknessSolid(solid, 4, nextId())
    expect(solidVolume(hollow)).toBeLessThan(solidVolume(solid))
    expect(solidVolume(hollow)).toBeGreaterThan(0)
    const bigger = offsetSolid(solid, 5, nextId())
    expect(solidVolume(bigger)).toBeGreaterThan(solidVolume(solid))
  })

  it('[Part] cross-sections cut a box into segments and compound merges solids', () => {
    const sections = crossSections(box('a'), 'y', 4)
    expect(sections).toHaveLength(4)
    expect(sections.every((section) => section.segments.length > 0)).toBe(true)
    const merged = compoundSolids([box('a'), box('b', 40, { x: 80, y: 20, z: 0 })], nextId())
    expect(meshInfo(merged).triangles).toBe(24)
    expect(boundingBoxOf([merged]).size.x).toBeGreaterThan(90)
  })

  it('[Part] surface area of a 40 mm cube is 9600 mm²', () => {
    expect(surfaceArea(box('a'))).toBeCloseTo(9600, 3)
  })
})

describe('draft', () => {
  it('[Draft] wire length and area match the analytic values', () => {
    const rectangle = draftRectangle('r', 40, 30)
    expect(wireLength(rectangle)).toBeCloseTo(140)
    expect(wireArea(rectangle)).toBeCloseTo(1200)
    const circle = draftCircle('c', 20, 180)
    expect(wireLength(circle)).toBeCloseTo(2 * Math.PI * 20, 0)
    expect(wireArea(draftPolygon('p', 6, 10))).toBeCloseTo(259.8, 0)
  })

  it('[Draft] offset grows a loop, fillet adds points, upgrade closes wires', () => {
    const rectangle = draftRectangle('r', 40, 30)
    expect(wireArea(offsetWire(rectangle, 5))).toBeGreaterThan(wireArea(rectangle))
    expect(filletWire(rectangle, 4).points.length).toBeGreaterThan(rectangle.points.length)
    const open = makeWire('o', 'open', [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 10, z: 0 }], false)
    expect(upgradeWire(open).closed).toBe(true)
    expect(downgradeWire(rectangle)).toHaveLength(4)
    const [first, second] = splitWire(draftBSpline('s', [
      { x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 0 }, { x: 20, y: 0, z: 0 }
    ]), 4)
    expect(first.points.length + second.points.length).toBeGreaterThan(4)
  })

  it('[Draft] joins touching wires end to end', () => {
    const a = makeWire('a', 'a', [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }], false)
    const b = makeWire('b', 'b', [{ x: 10, y: 0, z: 0 }, { x: 10, y: 10, z: 0 }], false)
    expect(joinWires([a, b]).points).toHaveLength(3)
  })

  it('[Draft] arrays produce the documented placement counts', () => {
    expect(draftArray('ortho', { countX: 3, countY: 2, countZ: 1 })).toHaveLength(6)
    expect(draftArray('polar', { count: 6, radius: 40 })).toHaveLength(6)
    expect(draftArray('circular', { count: 4, rings: 2, radius: 30 })).toHaveLength(1 + 4 + 8)
    const path = draftArray('path', { count: 5, path: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }] })
    expect(path).toHaveLength(5)
    expect(path[4].position.x).toBeCloseTo(100)
    expect(draftArray('point', { points: [{ x: 1, y: 2, z: 3 }] })).toHaveLength(1)
  })

  it('[Draft] curves and text produce geometry', () => {
    expect(draftBezier('b', [{ x: 0, y: 0, z: 0 }, { x: 10, y: 20, z: 0 }, { x: 20, y: 0, z: 0 }], 16).points).toHaveLength(17)
    expect(draftArc('a', 10, 0, 90, 8).points).toHaveLength(9)
    expect(shapeString('CAD', 10, 'g')).toHaveLength(3)
  })
})

describe('mesh', () => {
  it('[Mesh] refine quadruples and decimate reduces triangle counts', () => {
    const solid = box('a')
    const base = meshInfo(solid).triangles
    expect(meshInfo(refineMesh(solid, nextId())).triangles).toBe(base * 4)
    expect(meshInfo(decimateMesh(solid, 0.5, nextId())).triangles).toBeLessThanOrEqual(base)
  })

  it('[Mesh] normals can be harmonized and flipped, holes get closed', () => {
    const solid = box('a')
    expect(meshInfo(harmonizeNormals(solid, nextId())).triangles).toBe(meshInfo(solid).triangles)
    expect(meshInfo(flipNormals(solid, nextId())).triangles).toBe(meshInfo(solid).triangles)
    const open: Solid = { ...solid, kind: 'mesh', mesh: { positions: [0, 0, 0, 10, 0, 0, 0, 10, 0], normals: [] } }
    expect(meshInfo(open).boundaryEdges).toBe(3)
    expect(meshInfo(fillHoles(open, nextId())).triangles).toBeGreaterThan(1)
    expect(meshInfo(smoothMesh(solid, 0.3, nextId())).triangles).toBe(meshInfo(solid).triangles)
  })

  it('[Mesh] fits planes, spheres and approximates a surface', () => {
    const planePoints = [
      { x: 0, y: 5, z: 0 }, { x: 10, y: 5, z: 0 }, { x: 10, y: 5, z: 10 }, { x: 0, y: 5, z: 10 }, { x: 5, y: 5, z: 5 }
    ]
    const plane = fitPlane(planePoints)
    expect(plane.rms).toBeLessThan(1e-9)
    expect(Math.abs(plane.normal.y)).toBeCloseTo(1, 6)

    const spherePoints = []
    for (let i = 0; i < 24; i++) {
      const theta = (i / 24) * Math.PI * 2
      for (const phi of [0.6, 1.2, 2.0]) {
        spherePoints.push({
          x: 10 + 20 * Math.sin(phi) * Math.cos(theta),
          y: -5 + 20 * Math.cos(phi),
          z: 3 + 20 * Math.sin(phi) * Math.sin(theta)
        })
      }
    }
    const sphere = fitSphere(spherePoints)
    expect(sphere.radius).toBeCloseTo(20, 1)
    expect(sphere.center.x).toBeCloseTo(10, 0)

    const surface = approximateSurface(planePoints, 4, nextId())
    expect(meshInfo(surface).triangles).toBe(32)
  })
})

describe('techdraw', () => {
  it('[TechDraw] projects solids and builds a page with a title block', () => {
    const solids = [box('a')]
    expect(projectSolids(solids, 'front').length).toBeGreaterThan(4)
    const views = projectionGroup(solids, 1)
    expect(views.map((view) => view.label)).toEqual(['front', 'top', 'right', 'iso'])
    const page = createPage('Sheet', 'A4-landscape', views, { author: 'Tester' })
    expect(page.widthMm).toBe(297)
    const svg = pageToSvg(page)
    expect(svg).toContain('<svg')
    expect(svg).toContain('author: Tester')
    expect(pageToDxf(page)).toContain('LINE')
  })

  it('[TechDraw] hatch lines stay inside the region and the BOM groups copies', () => {
    const lines = hatchLines(0, 0, 40, 20, 4, 45)
    expect(lines.length).toBeGreaterThan(3)
    const rows = billOfMaterials([box('a'), { ...box('b'), name: 'Box-2' }, { ...box('c'), name: 'Lid' }])
    expect(rows[0].quantity).toBeGreaterThan(0)
    expect(rows.some((row) => row.name === 'Lid')).toBe(true)
  })
})

describe('materials and FEM', () => {
  it('[Material] a 40 mm steel cube weighs 502.4 g', () => {
    const properties = massProperties(box('a'), 'steel')
    expect(properties.volume).toBeCloseTo(64000)
    expect(properties.mass).toBeCloseTo(502.4, 1)
    expect(properties.massKg).toBeCloseTo(0.5024, 4)
    expect(MATERIALS.length).toBeGreaterThanOrEqual(10)
  })

  it('[FEM] bar and beam results match the closed-form solution', () => {
    const bar = solveBar(100, 10, 1000, 'steel')
    expect(bar.stress).toBeCloseTo(100)
    expect(bar.displacement).toBeCloseTo(1000 / ((210000 * 10) / 100), 8)
    expect(bar.safetyFactor).toBeCloseTo(2.35, 2)
    expect(bar.yields).toBe(false)

    const beam = solveBeam({ length: 100, width: 10, height: 10, load: 1000, support: 'cantilever' })
    expect(beam.maxMoment).toBeCloseTo(100000)
    expect(beam.maxStress).toBeCloseTo(600)
    expect(beam.maxDeflection).toBeCloseTo(1.9048, 3)
    const simple = solveBeam({ length: 100, width: 10, height: 10, load: 1000, support: 'simple' })
    expect(simple.maxDeflection).toBeLessThan(beam.maxDeflection)
  })

  it('[FEM] truss, frequency, thermal and von Mises', () => {
    const truss = solveTruss(
      [[0, 0], [1000, 0], [500, 500]],
      [{ from: 0, to: 2, area: 200 }, { from: 1, to: 2, area: 200 }, { from: 0, to: 1, area: 200 }],
      [0, 1, 2, 3],
      { 5: -5000 }
    )
    expect(truss.displacements[5]).toBeLessThan(0)
    expect(truss.maxForce).toBeGreaterThan(0)
    expect(Math.abs(truss.memberForces[0])).toBeCloseTo(Math.abs(truss.memberForces[1]), 6)

    expect(modalFrequency(100, 10, 10, 'steel')).toBeGreaterThan(0)
    expect(thermalFlux(10, 1000, 80, 20, 'steel').flux).toBeCloseTo((50 * 60) / 0.01, 6)
    expect(vonMises(100, 0, 0)).toBeCloseTo(100)
    expect(meshStats(box('a'), 5).elements).toBeGreaterThan(100)
  })
})

describe('CAM', () => {
  it('[CAM] profile and pocket paths have one plunge per depth step', () => {
    const tool = TOOL_LIBRARY[0]
    const profile = profileOperation(40, 30, 5, tool, 1)
    expect(profile.moves.filter((move) => move.kind === 'plunge')).toHaveLength(5)
    const pocket = pocketOperation(40, 30, 4, tool, 1, 0.5)
    expect(pocket.moves.filter((move) => move.kind === 'plunge')).toHaveLength(4)
    const stats = jobStats([profile, pocket])
    expect(stats.cutLength).toBeGreaterThan(0)
    expect(stats.minutes).toBeGreaterThan(0)
  })

  it('[CAM] post processors emit the dialect specific preamble', () => {
    const operation = profileOperation(20, 20, 2, TOOL_LIBRARY[1], 1)
    const grbl = postProcess([operation], 'grbl', 'TEST')
    expect(grbl).toContain('G21')
    expect(grbl.trim().endsWith('M30')).toBe(true)
    expect(grbl).toContain('T2 M6')
    const marlin = postProcess([operation], 'marlin')
    expect(marlin.trim().endsWith('M2')).toBe(true)
    expect(marlin).not.toContain('M6')
    const fanuc = postProcess([operation], 'fanuc', 'PART')
    expect(fanuc.startsWith('%')).toBe(true)
    expect(fanuc).toContain('O0001 (PART)')
  })
})

describe('BIM', () => {
  it('[BIM] wall sizes, window cuts and schedules', () => {
    const wall = archWall('wall-1', 4000, 2700, 200)
    expect(wall.size).toMatchObject({ x: 4000, y: 2700, z: 200 })
    expect(wall.position.y).toBeCloseTo(1350)
    const before = solidVolume(wall)
    const result = archWindow(wall, 'win-1', 1200, 1400, 900)
    expect(solidVolume(result.wall)).toBeLessThan(before)
    expect(result.element.name).toBe('Window')

    const rows = schedule([
      describeElement(wall, 'wall'),
      describeElement(result.element, 'window'),
      describeElement(archWall('wall-2', 4000, 2700, 200), 'wall')
    ])
    expect(rows.find((row) => row.kind === 'wall')?.count).toBe(2)
    expect(rows.find((row) => row.kind === 'window')?.unit).toBe('ea')
  })

  it('[BIM] IFC export round-trips through the importer', () => {
    const wall = archWall('wall-1', 4000, 2700, 200)
    const text = exportIfc([describeElement(wall, 'wall')], makeLevels(2), 'Test')
    const summary = importIfc(text)
    expect(summary.storeys).toEqual(['Level 1', 'Level 2'])
    expect(summary.products[0].type).toBe('IFCWALLSTANDARDCASE')
  })
})

describe('GSD surfaces', () => {
  it('[GSD] extrude, revolve, sweep and fill create meshes', () => {
    const wire = draftRectangle('r', 40, 30)
    expect(meshInfo(extrudeSurface(wire, { x: 0, y: 0, z: 1 }, 20, nextId())).triangles).toBe(8)
    expect(meshInfo(revolveSurface(draftArc('a', 20, 0, 90, 8), 'y', 180, 12, nextId())).triangles).toBeGreaterThan(50)
    expect(meshInfo(sweepSurface(draftCircle('c', 5, 8), spline3d([
      { x: 0, y: 0, z: 0 }, { x: 20, y: 10, z: 0 }, { x: 40, y: 0, z: 0 }
    ], 4, 's'), nextId())).triangles).toBeGreaterThan(50)
    expect(meshInfo(fillSurface(draftCircle('c', 10, 16), nextId())).triangles).toBe(16)
  })

  it('[GSD] split keeps one side and boundary extraction finds free edges', () => {
    const solid = box('a')
    const half = splitSurface(solid, 'y', 0, 'below', nextId())
    expect(meshInfo(half).triangles).toBeLessThan(meshInfo(solid).triangles)
    const open: Solid = { ...solid, kind: 'mesh', mesh: { positions: [0, 0, 0, 10, 0, 0, 0, 10, 0], normals: [] } }
    expect(extractBoundary(open, 'b').points).toHaveLength(6)
  })
})

describe('sheet metal', () => {
  it('[SheetMetal] bend allowance and deduction follow the K-factor method', () => {
    expect(bendAllowance(2, 2, 90, 0.44)).toBeCloseTo((Math.PI / 2) * (2 + 0.88), 6)
    expect(bendDeduction(2, 2, 90, 0.44)).toBeCloseTo(2 * 4 * Math.tan(Math.PI / 4) - (Math.PI / 2) * 2.88, 6)
    expect(minimumFlange(2, 2)).toBeCloseTo(7)
  })

  it('[SheetMetal] unfolds a bracket, flags short flanges and exports a flat pattern', () => {
    let part = createSheetPart('Bracket')
    part = addWall(part, 'w1', 100, 60)
    part = addFlange(part, 'f1', 30, 90)
    part = addFlange(part, 'f2', 20, 90)
    const result = unfold(part)
    expect(result.bends).toHaveLength(2)
    expect(result.flatLength).toBeGreaterThan(150)
    expect(result.width).toBe(60)
    expect(checkSheetPart(part).ok).toBe(true)
    expect(foldedSolids(part, nextId)).toHaveLength(3)
    const dxf = flatPatternDxf(part)
    expect(dxf).toContain('BENDLINE')
    expect(dxf).toContain('OUTLINE')

    let bad = createSheetPart('Bad')
    bad = addWall(bad, 'w1', 100, 60)
    bad = addFlange(bad, 'f1', 3, 90)
    expect(checkSheetPart(bad).ok).toBe(false)
  })
})

describe('kinematics and assembly', () => {
  it('[DMU] joints remove degrees of freedom and drive the motion', () => {
    const frame = box('frame')
    const crank = box('crank', 20, { x: 30, y: 10, z: 0 })
    let mechanism = createMechanism('Crank')
    mechanism = { ...mechanism, fixed: [frame.id] }
    mechanism = addJoint(mechanism, {
      id: 'j1', kind: 'revolute', a: frame.id, b: crank.id, axis: 'y',
      origin: { x: 0, y: 10, z: 0 }, min: 0, max: 90, ratio: 1
    })
    expect(degreesOfFreedom(mechanism, [frame.id, crank.id])).toBe(1)
    const poses = simulate(mechanism, {
      [frame.id]: { bodyId: frame.id, position: { ...frame.position }, rotation: { x: 0, y: 0, z: 0 } },
      [crank.id]: { bodyId: crank.id, position: { ...crank.position }, rotation: { x: 0, y: 0, z: 0 } }
    }, 1)
    const moved = poses.find((pose) => pose.bodyId === crank.id)
    expect(moved?.rotation.y).toBeCloseTo(90)
    expect(moved?.position.z).toBeCloseTo(30, 3)
    const envelope = sweptEnvelope(mechanism, {
      [crank.id]: { bodyId: crank.id, position: { ...crank.position }, rotation: { x: 0, y: 0, z: 0 } }
    }, crank.id, 8)
    expect(envelope.max.z).toBeGreaterThan(envelope.min.z)
  })

  it('[DMU] clash detection separates clash, contact and clear pairs', () => {
    const results = clashCheck([
      box('a', 40, { x: 0, y: 20, z: 0 }),
      box('b', 40, { x: 20, y: 20, z: 0 }),
      box('c', 40, { x: 200, y: 20, z: 0 })
    ])
    expect(results).toHaveLength(3)
    expect(results[0].kind).toBe('clash')
    expect(results.find((result) => result.a === result.b)).toBeUndefined()
    expect(results[1].kind).toBe('clear')
  })

  it('[Assembly] constraints converge, explode spreads parts, BOM groups them', () => {
    const a = box('a')
    const b = box('b', 40, { x: 5, y: 20, z: 0 })
    const result = solveConstraints([a, b], [
      { id: 'fix', kind: 'fix', a: a.id, b: a.id, axis: 'x', value: 0 },
      { id: 'off', kind: 'offset', a: a.id, b: b.id, axis: 'x', value: 60 }
    ])
    expect(result.converged).toBe(true)
    expect(result.solids[1].position.x - result.solids[0].position.x).toBeCloseTo(60, 3)

    const exploded = explodeAssembly([a, b], 2)
    expect(boundingBoxOf(exploded).size.x).toBeGreaterThan(boundingBoxOf([a, b]).size.x)

    const parts = [a, { ...b, name: 'a-copy' }, { ...box('c'), name: 'Lid' }]
    const list = bom(parts)
    expect(list.totalKg).toBeGreaterThan(0)
    expect(list.rows.length).toBeLessThan(parts.length)

    const inertia = inertiaMatrix([a, b])
    expect(inertia.massKg).toBeGreaterThan(0)
    expect(inertia.ixx).toBeGreaterThan(0)
    expect(measureBetween(a, b).clearance).toBeLessThan(0)
  })

  it('[Knowledge] formulas, rules, checks and design tables', () => {
    const solved = solveFormulas([
      { name: 'Width', value: 80, formula: '' },
      { name: 'Height', value: 0, formula: 'Width / 2' },
      { name: 'Area', value: 0, formula: 'Width * Height' }
    ])
    expect(solved.find((item) => item.name === 'Height')?.value).toBe(40)
    expect(solved.find((item) => item.name === 'Area')?.value).toBe(3200)

    const rules = applyRules([{ name: 'Width', value: 80, formula: '' }], [{
      id: 'r1', name: 'Thick', when: 'Width > 60', then: ['Thickness = Width / 20'], otherwise: ['Thickness = 2']
    }])
    expect(rules.results[0].fired).toBe(true)
    expect(rules.parameters.find((item) => item.name === 'Thickness')?.value).toBe(4)

    const checks = runChecks([{ name: 'Width', value: 10, formula: '' }], [{
      id: 'c1', name: 'MinWidth', condition: 'Width >= 20', severity: 'warning', message: '너무 작습니다'
    }])
    expect(checks[0].passed).toBe(false)
    expect(checks[0].message).toBe('너무 작습니다')

    const table = parseDesignTable('Width,Height\n40,25\n80,50', 'Sizes')
    const applied = applyDesignTable([{ name: 'Width', value: 0, formula: '' }], table, 1)
    expect(applied.find((item) => item.name === 'Width')?.value).toBe(80)
    expect(applied.find((item) => item.name === 'Height')?.value).toBe(50)
  })
})

describe('SketchUp', () => {
  it('[SketchUp] push/pull extrudes along the face normal with the right volume', () => {
    const face = draftRectangle('r', 40, 30)
    expect(Math.abs(faceNormal(face).z)).toBeCloseTo(1, 6)
    const solid = pushPull(face, 10, nextId())
    expect(solidVolume(solid)).toBeCloseTo(40 * 30 * 10, 3)
    expect(meshInfo(solid).closed).toBe(true)
    const pushed = pushPull(face, -10, nextId())
    expect(solidVolume(pushed)).toBeCloseTo(12000, 3)
  })

  it('[SketchUp] follow me sweeps a profile and 3D text builds one solid per glyph', () => {
    const swept = followMe(draftCircle('c', 5, 12), [
      { x: -20, y: 0, z: 0 }, { x: 0, y: 15, z: 0 }, { x: 20, y: 0, z: 0 }
    ], nextId())
    expect(solidVolume(swept)).toBeGreaterThan(0)
    expect(text3d('AB', 20, 4, nextId)).toHaveLength(2)
    expect(() => text3d('   ', 20, 4, nextId)).toThrow()
  })

  it('[SketchUp] soften edges keeps the triangles and rewrites the normals', () => {
    const solid = box('a')
    const softened = softenEdges(solid, 45, nextId())
    expect(meshInfo(softened).triangles).toBe(meshInfo(solid).triangles)
    expect(softened.mesh?.normals.length).toBe(softened.mesh?.positions.length)
  })

  it('[SketchUp] components place instances with rotation and scale', () => {
    const definition = makeComponentDefinition('def', 'Chair', [box('a', 20, { x: 0, y: 10, z: 0 })])
    const instances = instanceSolids(definition, {
      id: 'i1', definitionId: 'def', name: 'Chair#1', position: { x: 100, y: 0, z: 0 },
      rotation: { x: 0, y: 90, z: 0 }, scale: { x: 2, y: 2, z: 2 }
    }, nextId)
    expect(instances).toHaveLength(1)
    expect(instances[0].position.x).toBeCloseTo(100)
    expect(instances[0].rotation.y).toBeCloseTo(90)
    expect(instances[0].scale.x).toBe(2)
  })

  it('[SketchUp] copies, paint, camera, shadows and terrain', () => {
    const solid = box('a')
    expect(moveCopies(solid, { x: 50, y: 0, z: 0 }, 3, nextId)).toHaveLength(3)
    expect(rotateCopies(solid, { x: 0, y: 20, z: 0 }, 45, 4, nextId)[3].rotation.y).toBeCloseTo(180)
    expect(paintSolid(solid, { name: 'Glass', color: '#bfe4f5', opacity: 0.4, texture: 'glass' }).color).toBe('#bfe4f5')

    const camera = zoomExtents(defaultCamera(), [solid])
    expect(camera.target).toMatchObject({ x: 0, y: 20, z: 0 })
    expect(Math.hypot(camera.eye.x - camera.target.x, camera.eye.y - camera.target.y, camera.eye.z - camera.target.z)).toBeGreaterThan(40)
    const walked = walkCamera(defaultCamera(), 50, 0)
    expect(walked.eye.y).toBeCloseTo(defaultCamera().eye.y)

    const sun = sunDirection({ ...defaultShadows(), timeOfDay: 12 })
    expect(sun.y).toBeGreaterThan(0)
    expect(Math.hypot(sun.x, sun.y, sun.z)).toBeCloseTo(1, 6)

    const terrain = terrainFromScratch(100, 100, 4, nextId())
    expect(meshInfo(terrain).triangles).toBe(32)
  })

  it('[SketchUp] solid tools mirror the boolean operations', () => {
    const a = box('a', 40, { x: 0, y: 20, z: 0 })
    const b = box('b', 40, { x: 20, y: 20, z: 0 })
    expect(solidTool('union', a, b, nextId)).toHaveLength(1)
    expect(solidVolume(solidTool('union', a, b, nextId)[0])).toBeGreaterThan(solidVolume(a))
    expect(solidVolume(solidTool('intersect', a, b, nextId)[0])).toBeLessThan(solidVolume(a))
    expect(solidTool('split', a, b, nextId)).toHaveLength(3)
  })
})
