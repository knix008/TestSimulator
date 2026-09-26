import { describe, expect, it } from 'vitest'
import {
  arcCurve, basisFunctions, circleCurve, clampedKnots, curveLength, curvePoint, curveTangent,
  extrudeSurfaceNurbs, findSpan, insertKnot, makeCurve, makeSurface, point, revolveSurfaceNurbs,
  surfaceNormal, surfacePoint, tessellateCurve, tessellateSurface
} from '../src/core/nurbs'
import {
  brepArea, brepBox, brepEdges, brepFromSolid, brepPrism, brepVertices, brepVolume, chamferBrep,
  checkBrep, clipConvex, filletBrep, meanCurvatureIntegral, offsetConvex, steinerVolume, tessellateBrep
} from '../src/core/brep'
import { meshVolume, solveVolume, volumeMesh, volumeReport, elasticityMatrix } from '../src/core/fea'
import { runPython, parse, tokenize, PythonError } from '../src/core/python'
import {
  ADDON_CATALOG, addonCommands, addonReport, addonThemes, availableAddons, checkCompatibility,
  installAddon, parseManifest, sanitizeInstalled, setAddonEnabled, uninstallAddon
} from '../src/core/addons'
import { dragPosition, rayPlanePoint, snapPoint } from '../src/core/viewnav'
import { activeDocument, createInitialState, reducer } from '../src/core/store'
import { createSolid } from '../src/core/model'
import { findMaterial } from '../src/core/materials'
import { solidVolume } from '../src/core/part'

function meshTriangleVolume(positions: number[]): number {
  let volume = 0
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const ax = positions[i], ay = positions[i + 1], az = positions[i + 2]
    const bx = positions[i + 3], by = positions[i + 4], bz = positions[i + 5]
    const cx = positions[i + 6], cy = positions[i + 7], cz = positions[i + 8]
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  return volume
}

describe('NURBS', () => {
  it('[NURBS] basis functions form a partition of unity', () => {
    const knots = clampedKnots(6, 3)
    for (const u of [0, 0.13, 0.5, 0.77, 1]) {
      const span = findSpan(3, knots, 6, u)
      const values = basisFunctions(span, u, 3, knots)
      expect(values).toHaveLength(4)
      expect(values.reduce((acc, value) => acc + value, 0)).toBeCloseTo(1, 10)
      expect(values.every((value) => value >= -1e-12)).toBe(true)
    }
  })

  it('[NURBS] a clamped curve interpolates its end points and has a tangent', () => {
    const curve = makeCurve([point(0, 0, 0), point(10, 20, 0), point(30, -10, 0), point(40, 0, 0)], 3)
    expect(curvePoint(curve, 0)).toMatchObject({ x: 0, y: 0 })
    const end = curvePoint(curve, 1)
    expect(end.x).toBeCloseTo(40, 6)
    expect(end.y).toBeCloseTo(0, 6)
    const tangent = curveTangent(curve, 0.5)
    expect(Math.hypot(tangent.x, tangent.y, tangent.z)).toBeGreaterThan(0)
  })

  it('[NURBS] the rational circle is exact, unlike a polynomial one', () => {
    const circle = circleCurve({ x: 0, y: 0, z: 0 }, 25, 'y')
    for (const u of [0, 0.1, 0.25, 0.4, 0.5, 0.9]) {
      const at = curvePoint(circle, u)
      expect(Math.hypot(at.x, at.z)).toBeCloseTo(25, 6)
      expect(at.y).toBeCloseTo(0, 9)
    }
    expect(curveLength(circle, 2000)).toBeCloseTo(2 * Math.PI * 25, 1)
    const arc = arcCurve({ x: 0, y: 0, z: 0 }, 10, 0, 90, 'y')
    expect(curveLength(arc, 2000)).toBeCloseTo((Math.PI * 10) / 2, 2)
  })

  it('[NURBS] knot insertion keeps the curve shape', () => {
    const curve = makeCurve([point(0, 0, 0), point(10, 20, 0), point(30, -10, 0), point(40, 0, 0)], 3)
    const refined = insertKnot(curve, 0.5, 1)
    expect(refined.controls.length).toBe(curve.controls.length + 1)
    expect(refined.knots.length).toBe(curve.knots.length + 1)
    for (const u of [0.1, 0.3, 0.5, 0.8]) {
      const a = curvePoint(curve, u)
      const b = curvePoint(refined, u)
      expect(b.x).toBeCloseTo(a.x, 6)
      expect(b.y).toBeCloseTo(a.y, 6)
    }
  })

  it('[NURBS] surfaces evaluate, carry normals and tessellate', () => {
    const grid = [
      [point(0, 0, 0), point(0, 0, 20), point(0, 0, 40)],
      [point(20, 10, 0), point(20, 15, 20), point(20, 10, 40)],
      [point(40, 0, 0), point(40, 0, 20), point(40, 0, 40)]
    ]
    const surface = makeSurface(grid, 2, 2)
    const corner = surfacePoint(surface, 0, 0)
    expect(corner).toMatchObject({ x: 0, y: 0, z: 0 })
    const normal = surfaceNormal(surface, 0.5, 0.5)
    expect(Math.hypot(normal.x, normal.y, normal.z)).toBeCloseTo(1, 6)
    expect(tessellateSurface(surface, 4, 4).length).toBe(4 * 4 * 6 * 3)

    const revolved = revolveSurfaceNurbs(makeCurve([point(10, 0, 0), point(14, 20, 0), point(8, 40, 0)], 2), 9, 360)
    expect(tessellateSurface(revolved, 8, 8).length).toBeGreaterThan(100)
    const extruded = extrudeSurfaceNurbs(makeCurve([point(0, 0, 0), point(20, 0, 0)], 1), { x: 0, y: 1, z: 0 }, 10)
    const top = surfacePoint(extruded, 1, 1)
    expect(top.y).toBeCloseTo(10, 6)
    expect(tessellateCurve(circleCurve({ x: 0, y: 0, z: 0 }, 5), 12)).toHaveLength(13)
  })
})

describe('B-rep kernel', () => {
  it('[Brep] a box is a closed convex shell with Euler characteristic 2', () => {
    const box = brepBox(40, 40, 40)
    const check = checkBrep(box)
    expect(check).toMatchObject({ vertices: 8, edges: 12, faces: 6, eulerCharacteristic: 2, closed: true, convex: true })
    expect(brepVolume(box)).toBeCloseTo(64000, 6)
    expect(brepArea(box)).toBeCloseTo(9600, 6)
    // Σ L·θ / 2 for a cube: 12 edges × 40 mm × 90°
    expect(meanCurvatureIntegral(box)).toBeCloseTo((12 * 40 * (Math.PI / 2)) / 2, 6)
    expect(brepVertices(box)).toHaveLength(8)
    expect(brepEdges(box).every((edge) => Math.abs(edge.angle - Math.PI / 2) < 1e-9)).toBe(true)
  })

  it('[Brep] prisms are closed and their volume matches the polygon formula', () => {
    const prism = brepPrism(6, 20, 30)
    expect(checkBrep(prism)).toMatchObject({ faces: 8, closed: true, convex: true, eulerCharacteristic: 2 })
    expect(brepVolume(prism)).toBeCloseTo(6 * 0.5 * 20 * 20 * Math.sin(Math.PI / 3) * 30, 6)
  })

  it('[Brep] half-space clipping removes exactly the cut prism', () => {
    const box = brepBox(40, 40, 40)
    const clipped = clipConvex(box, { normal: { x: Math.SQRT1_2, y: Math.SQRT1_2, z: 0 }, offset: 35 * Math.SQRT1_2 })
    expect(brepVolume(clipped)).toBeCloseTo(64000 - 12.5 * 40, 6)
    expect(checkBrep(clipped).closed).toBe(true)
  })

  it('[Brep] chamfering a cube matches the analytic inclusion-exclusion volume', () => {
    const box = brepBox(40, 40, 40)
    const chamfered = chamferBrep(box, 5)
    // 12 prisms - 24 pairwise corner overlaps + 8 triple overlaps
    const expected = 64000 - (12 * 12.5 * 40 - 24 * (125 / 3) + 8 * 31.25)
    expect(brepVolume(chamfered)).toBeCloseTo(expected, 6)
    expect(chamfered.faces).toHaveLength(18)
    expect(checkBrep(chamfered)).toMatchObject({ closed: true, manifold: true, eulerCharacteristic: 2 })
  })

  it('[Brep] the rolling-ball fillet follows Steiner’s formula', () => {
    const box = brepBox(40, 40, 40)
    for (const radius of [2, 6, 10]) {
      const fillet = filletBrep(box, radius, 24)
      const tessellated = meshTriangleVolume(fillet.positions)
      const exact = steinerVolume(fillet.core, radius)
      expect(tessellated, `r=${radius}`).toBeGreaterThan(exact * 0.99)
      expect(tessellated, `r=${radius}`).toBeLessThanOrEqual(exact + 1e-6)
      expect(exact, `r=${radius}`).toBeLessThan(64000)
    }
    // The shrunk core of a cube is a smaller cube.
    expect(brepVolume(offsetConvex(box, -6))).toBeCloseTo(28 * 28 * 28, 6)
  })

  it('[Brep] a mesh solid is sewn back into planar faces', () => {
    const solid = createSolid('box', 'a', 1)
    solid.size = { ...solid.size, x: 30, y: 30, z: 30 }
    solid.position = { x: 0, y: 0, z: 0 }
    const brep = brepFromSolid(solid)
    expect(brep.faces).toHaveLength(6)
    expect(brepVolume(brep)).toBeCloseTo(27000, 3)
    expect(tessellateBrep(brep).length).toBe(6 * 2 * 9)
  })
})

describe('volume FEM', () => {
  it('[FEA] the voxel mesh fills the solid exactly', () => {
    const bar = createSolid('box', 'bar', 1)
    bar.size = { ...bar.size, x: 20, y: 100, z: 20 }
    bar.position = { x: 0, y: 50, z: 0 }
    const mesh = volumeMesh(bar, 6)
    expect(mesh.elementCount).toBeGreaterThan(50)
    expect(mesh.nodeCount).toBeGreaterThan(20)
    expect(meshVolume(mesh)).toBeCloseTo(20 * 100 * 20, 3)
    expect(mesh.elementCount % 5).toBe(0)
  })

  it('[FEA] a clamped bar elongates by FL/(EA)', () => {
    const bar = createSolid('box', 'bar', 1)
    bar.size = { ...bar.size, x: 20, y: 100, z: 20 }
    bar.position = { x: 0, y: 50, z: 0 }
    const steel = findMaterial('steel')
    const force = 10000
    const analytic = (force * 100) / (steel.youngsModulus * 400)
    const result = solveVolume(bar, {
      divisions: 6,
      materialId: 'steel',
      support: { kind: 'fixed', axis: 'y', side: 'min' },
      load: { kind: 'force', axis: 'y', side: 'max', force: { x: 0, y: force, z: 0 } }
    })
    expect(result.converged).toBe(true)
    expect(result.maxDisplacement).toBeGreaterThan(analytic * 0.85)
    expect(result.maxDisplacement).toBeLessThan(analytic * 1.25)
    // The nominal section stress is F/A; the peak sits near the clamp.
    expect(result.maxStress).toBeGreaterThan(force / 400 * 0.8)
    expect(result.vonMises).toHaveLength(result.mesh.elementCount)
    expect(volumeReport(result, 'steel').join('\n')).toContain('Safety factor')
  })

  it('[FEA] doubling the load doubles the displacement (linear elasticity)', () => {
    const block = createSolid('box', 'block', 1)
    block.size = { ...block.size, x: 30, y: 60, z: 30 }
    block.position = { x: 0, y: 30, z: 0 }
    const run = (force: number) => solveVolume(block, {
      divisions: 4,
      support: { kind: 'fixed', axis: 'y', side: 'min' },
      load: { kind: 'force', axis: 'y', side: 'max', force: { x: 0, y: force, z: 0 } }
    }).maxDisplacement
    const single = run(5000)
    const double = run(10000)
    expect(double / single).toBeCloseTo(2, 3)
  })

  it('[FEA] the elasticity matrix is symmetric with the right shear terms', () => {
    const D = elasticityMatrix(210000, 0.3)
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) expect(D[i][j]).toBeCloseTo(D[j][i], 9)
    expect(D[3][3]).toBeCloseTo(210000 / (2 * (1 + 0.3)), 6)
  })
})

describe('Python runtime', () => {
  it('[Python] tokenises indentation into indent and dedent tokens', () => {
    const tokens = tokenize('if x:\n    y = 1\nz = 2\n')
    expect(tokens.some((token) => token.kind === 'indent')).toBe(true)
    expect(tokens.some((token) => token.kind === 'dedent')).toBe(true)
    expect(parse('x = 1\n')).toHaveLength(1)
  })

  it('[Python] runs control flow, functions and the math module', () => {
    const result = runPython([
      'import math',
      'def area(r):',
      '    return math.pi * r * r',
      'total = 0',
      'for i in range(4):',
      '    if i % 2 == 0:',
      '        total = total + i',
      '    else:',
      '        total = total - 1',
      'values = [1, 2, 3]',
      'print("total", total)',
      'print("area", round(area(2), 3))',
      'print("len", len(values), values[-1])'
    ].join('\n'))
    expect(result.output).toEqual(['total 0', 'area 12.566', 'len 3 3'])
    expect(result.globals.total).toBe(0)
  })

  it('[Python] builds geometry through the Part API, including booleans', () => {
    const result = runPython([
      'import Part',
      'doc = App.newDocument("Macro")',
      'box = Part.makeBox(40, 20, 10)',
      'cyl = Part.makeCylinder(5, 40)',
      'part = box - cyl',
      'obj = doc.addObject("Part::Feature", "Part")',
      'obj.Shape = part',
      'doc.recompute()',
      'print(round(box.Volume, 1), round(part.Volume, 1))'
    ].join('\n'))
    expect(result.solids).toHaveLength(1)
    expect(solidVolume(result.solids[0])).toBeGreaterThan(0)
    const [boxVolume, cutVolume] = result.output[0].split(' ').map(Number)
    expect(boxVolume).toBeCloseTo(8000, 0)
    expect(cutVolume).toBeLessThan(boxVolume)
  })

  it('[Python] reports errors with a line number and stops runaway loops', () => {
    expect(() => runPython('x = ')).toThrow(PythonError)
    expect(() => runPython('print(missing)')).toThrow(/이름을 찾을 수 없습니다/)
    expect(() => runPython('import os')).toThrow(/모듈을 가져올 수 없습니다/)
    expect(() => runPython('while True:\n    x = 1\n', { maxSteps: 500 })).toThrow(/실행 단계/)
  })
})

describe('addon manager', () => {
  it('[Addons] the catalogue validates and installs', () => {
    expect(ADDON_CATALOG.length).toBeGreaterThanOrEqual(4)
    for (const manifest of ADDON_CATALOG) {
      expect(parseManifest(JSON.stringify(manifest)).id).toBe(manifest.id)
      expect(checkCompatibility(manifest, '1.0.0').ok).toBe(true)
    }
    const installed = installAddon([], ADDON_CATALOG[0], 'catalog', '1.0.0', 1)
    expect(installed).toHaveLength(1)
    expect(availableAddons(installed)).toHaveLength(ADDON_CATALOG.length - 1)
    expect(addonCommands(installed).length).toBeGreaterThan(0)
    expect(addonReport(installed)[0]).toContain(ADDON_CATALOG[0].name.ko)
  })

  it('[Addons] version and dependency rules are enforced', () => {
    expect(checkCompatibility({ ...ADDON_CATALOG[0], requires: '2.0.0' }, '1.0.0').ok).toBe(false)
    expect(checkCompatibility({ ...ADDON_CATALOG[0], dependencies: ['missing'] }, '1.0.0', []).ok).toBe(false)
    const installed = installAddon([], ADDON_CATALOG[0])
    expect(() => installAddon(installed, ADDON_CATALOG[0])).toThrow(/이미 설치/)
    const upgraded = installAddon(installed, { ...ADDON_CATALOG[0], version: '9.9.9' })
    expect(upgraded[0].manifest.version).toBe('9.9.9')
    const dependent = installAddon(upgraded, { ...ADDON_CATALOG[1], dependencies: [ADDON_CATALOG[0].id] })
    expect(() => uninstallAddon(dependent, ADDON_CATALOG[0].id)).toThrow(/사용 중/)
  })

  it('[Addons] enabling, disabling and themes', () => {
    let installed = installAddon([], ADDON_CATALOG.find((item) => item.kind === 'theme')!)
    expect(addonThemes(installed)).toHaveLength(1)
    installed = setAddonEnabled(installed, installed[0].manifest.id, false)
    expect(addonThemes(installed)).toHaveLength(0)
    expect(addonReport(installed)[0].startsWith('☐')).toBe(true)
  })

  it('[Addons] malformed manifests are rejected and bad entries skipped', () => {
    expect(() => parseManifest('{')).toThrow()
    expect(() => parseManifest('{"id":"x"}')).toThrow(/version/)
    expect(() => parseManifest('{"id":"x","version":"1.0.0","kind":"nope"}')).toThrow(/kind/)
    expect(sanitizeInstalled([{ manifest: { id: 'bad' } }, { manifest: ADDON_CATALOG[0], enabled: false }])).toHaveLength(1)
  })

  it('[Addons] an addon macro runs in the sandbox and makes geometry', () => {
    const installed = installAddon([], ADDON_CATALOG[0])
    const command = addonCommands(installed)[0]
    const result = runPython(command.macro)
    expect(result.solids.length).toBeGreaterThan(0)
    expect(result.output.join(' ')).toContain('gear')
  })
})

describe('mouse dragging', () => {
  it('[Drag] a ray meets the ground plane and snaps', () => {
    const hit = rayPlanePoint({ x: 0, y: 100, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 20, z: 0 }, { x: 0, y: 1, z: 0 })
    expect(hit).toMatchObject({ x: 0, y: 20, z: 0 })
    expect(rayPlanePoint({ x: 0, y: 100, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 20, z: 0 }, { x: 0, y: 1, z: 0 })).toBeNull()
    expect(snapPoint({ x: 12.4, y: 7.7, z: -3.2 }, 5)).toEqual({ x: 10, y: 10, z: -5 })
    expect(snapPoint({ x: 12.4, y: 7.7, z: -3.2 }, 0)).toEqual({ x: 12.4, y: 7.7, z: -3.2 })
  })

  it('[Drag] the dragged position follows the pointer on the ground plane', () => {
    const next = dragPosition({
      origin: { x: 30, y: 100, z: 10 },
      direction: { x: 0, y: -1, z: 0 },
      grabPoint: { x: 0, y: 20, z: 0 },
      offset: { x: 0, y: 0, z: 0 },
      cameraDirection: { x: 0, y: -1, z: 0 },
      vertical: false,
      snap: 0
    })
    expect(next).toMatchObject({ x: 30, y: 20, z: 10 })

    const vertical = dragPosition({
      origin: { x: 0, y: 40, z: 100 },
      direction: { x: 0, y: 0, z: -1 },
      grabPoint: { x: 0, y: 20, z: 0 },
      offset: { x: 0, y: 5, z: 0 },
      cameraDirection: { x: 0, y: 0, z: -1 },
      vertical: true,
      snap: 0
    })
    expect(vertical?.y).toBeCloseTo(45)
  })

  it('[Drag] the store moves the solid, keeps history and respects the lock', () => {
    let state = reducer(createInitialState(), { type: 'add-solid', kind: 'box' })
    const id = activeDocument(state).solids[0].id
    const before = activeDocument(state).solids[0].position
    state = reducer(state, { type: 'move-solid', id, position: { x: 100, y: 20, z: -40 } })
    expect(activeDocument(state).solids[0].position).toEqual({ x: 100, y: 20, z: -40 })
    expect(activeDocument(state).selection).toContain(id)
    state = reducer(state, { type: 'undo' })
    expect(activeDocument(state).solids[0].position).toEqual(before)

    state = reducer(state, { type: 'update-solid', id, patch: { locked: true } })
    const locked = reducer(state, { type: 'move-solid', id, position: { x: 999, y: 0, z: 0 } })
    expect(activeDocument(locked).solids[0].position).toEqual(before)
  })
})
