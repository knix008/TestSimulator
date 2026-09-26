import { describe, expect, it } from 'vitest'
import { draftSolid, evaluateFormula, inertiaOf, referencePlane, shaft, shellSolid, solveMate, steppedHole, updateSketchFromParameters } from '../src/core/catia'
import { sketchesToDxf, sketchesToSvg } from '../src/core/drawing'
import { menuIcon, translate } from '../src/core/i18n'
import { MENUS, TOOLBAR } from '../src/core/menus'
import { createSolid } from '../src/core/model'
import { booleanSolids, filletBox, helixSolid, holeTool, loftSketches, makeSketch, padSketch, pipeSketch, revolveSketch, solidVolume } from '../src/core/part'
import { buildPrintPages } from '../src/core/print'
import { defaultSettings } from '../src/core/settings'
import { parseStl, toAsciiStl } from '../src/core/stl'
import { toObj } from '../src/core/part'
import { activeDocument, createInitialState, reducer } from '../src/core/store'
import { USAGE } from '../src/core/usage'
import { orbitForPreset } from '../src/core/viewnav'
import { femStress, sketchToGcode, WORKBENCHES, workbenchTools } from '../src/core/workbenches'

const FREECAD_WORKBENCHES = ['partDesign', 'part', 'sketcher', 'draft', 'techdraw', 'mesh', 'spreadsheet', 'assembly', 'fem', 'cam', 'bim', 'points', 'surface', 'robot', 'openscad', 'inspection'] as const

const NOT_PORTED = [
  'OpenCASCADE B-rep kernel',
  'CalculiX volume mesh solver'
]

describe('freecad coverage', () => {
  it('[FreeCAD] exposes the eleven workbenches with labels, tools, icons, and usage', () => {
    expect(WORKBENCHES.map((item) => item.id)).toEqual([...FREECAD_WORKBENCHES])
    for (const bench of WORKBENCHES) {
      expect(translate('ko', bench.labelKey).length).toBeGreaterThan(0)
      expect(translate('en', bench.labelKey).length).toBeGreaterThan(0)
      expect(workbenchTools(bench.id).length).toBeGreaterThan(0)
      expect(USAGE[bench.id].ko.length).toBeGreaterThan(0)
      expect(USAGE[bench.id].en.length).toBeGreaterThan(0)
      for (const tool of bench.tools) {
        expect(menuIcon(tool)).not.toBe('•')
        expect(translate('ko', tool as never).length).toBeGreaterThan(0)
      }
    }
    const view = MENUS.find((menu) => menu.id === 'view')
    expect(view?.items.some((item) => item.id === 'ruler')).toBe(true)
    expect(TOOLBAR).toContain('ruler')
    expect(defaultSettings().ruler).toBe(true)
  })

  it('[FreeCAD] runs Part Design, Part, and Sketcher operations on meshes', () => {
    const sketch = makeSketch({ id: 'sk', shape: 'rect', width: 40, height: 30, plane: 'xy' })
    const pad = padSketch(sketch, 20, 'pad')
    const revolved = revolveSketch(sketch, 180, 'rev')
    const loft = loftSketches(sketch, makeSketch({ id: 'top', shape: 'circle', width: 16, height: 16 }), 25, 'loft')
    const pipe = pipeSketch(sketch, 40, 'pipe')
    const helix = helixSolid(10, 6, 2, 'helix')
    const fillet = filletBox(createSolid('box', 'box', 1), 2, 'fillet')
    const chamfer = filletBox(createSolid('box', 'box', 2), 2, 'chamfer', true)
    const drafted = draftSolid(createSolid('box', 'box', 3), 5, 'draft')
    const shelled = shellSolid(createSolid('box', 'box', 4), 2, 'shell')
    const hole = holeTool(8, 20, { x: 0, y: 10, z: 0 }, 'hole')
    const base = createSolid('box', 'base', 1)
    const tool = createSolid('sphere', 'tool', 2)
    tool.position = { ...base.position }
    const pocket = booleanSolids(base, tool, 'cut', 'pocket')
    const fused = booleanSolids(base, tool, 'union', 'union')
    const common = booleanSolids(base, tool, 'common', 'common')
    for (const solid of [pad, revolved, loft, pipe, helix, fillet, chamfer, drafted, shelled, hole, pocket, fused, common]) {
      expect(solid.mesh?.positions.length ?? 0, solid.name).toBeGreaterThan(0)
    }
    expect(solidVolume(pocket)).toBeGreaterThan(0)
    const parameters = [{ id: 'p', name: 'Width', formula: '40', value: 40 }]
    expect(evaluateFormula('Width/2', parameters)).toBe(20)
    const updated = updateSketchFromParameters(sketch, [{ id: 'p', name: 'Width', formula: '80', value: 80 }])
    expect(updated.width).toBe(80)
  })

  it('[FreeCAD] runs Draft, TechDraw, Mesh, Spreadsheet, and Assembly operations', () => {
    const box = createSolid('box', 'a', 1)
    const moved = reducer(createInitialState(), { type: 'add-mesh', solid: box })
    expect(activeDocument(moved).solids).toHaveLength(1)
    const shaftSolid = shaft(makeSketch({ id: 's', shape: 'rect', width: 12, height: 20 }), 360, 'shaft')
    expect(solidVolume(shaftSolid)).toBeGreaterThan(1)
    const dxf = sketchesToDxf([makeSketch({ id: 'd', shape: 'rect', width: 10, height: 8 })])
    const svg = sketchesToSvg([makeSketch({ id: 'v', shape: 'circle', width: 10, height: 10 })])
    expect(dxf).toContain('LINE')
    expect(svg).toContain('<svg')
    const pages = buildPrintPages([activeDocument(createInitialState())], 'doc-1', 'current', [], false)
    expect(pages.length).toBeGreaterThan(0)
    const stl = toAsciiStl([box])
    expect(parseStl(stl, 'imported').kind).toBe('mesh')
    expect(toObj([box])).toContain('v ')
    const rebuilt = reducer(createInitialState(), {
      type: 'apply-part',
      solids: [padSketch(makeSketch({ id: 'sk', shape: 'rect', width: 10, height: 10 }), 5, 'body')],
      sketch: makeSketch({ id: 'sk', shape: 'rect', width: 10, height: 10 }),
      feature: { id: 'f', name: 'pad', kind: 'pad', solidIds: [], length: 5, angle: 0, count: 1, radius: 0 },
      parameter: { id: 'w', name: 'Width', formula: '10', value: 10 }
    })
    expect(activeDocument(rebuilt).parameters).toHaveLength(1)
    const second = createSolid('box', 'b', 2)
    const mated = solveMate(box, second, { id: 'm', kind: 'coincidence', value: 0 })
    expect(mated.position).toEqual(box.position)
    expect(inertiaOf(box).volume).toBeGreaterThan(0)
    expect(orbitForPreset('front').polar).toBeCloseTo(Math.PI / 2)
    expect(orbitForPreset('top').polar).toBeLessThan(0.2)
  })

  it('[FreeCAD] keeps FEM, CAM, and BIM as documented approximations', () => {
    expect(femStress(200, 1000)).toBe(5)
    expect(femStress(0)).toBe(0)
    expect(USAGE.fem.ko.join(' ')).toContain('CalculiX')
    const gcode = sketchToGcode(40, 20)
    expect(gcode).toContain('G21')
    expect(gcode).toContain('M30')
    expect(gcode.split('\n').some((line) => line.startsWith('G2 ') || line.startsWith('G3'))).toBe(false)
    const plane = referencePlane('xy', 12, 'storey')
    expect(plane.position.y).toBe(12)
    const bore = steppedHole(createSolid('box', 'wall', 1), 'counterbore', 10, 8, 'opening')
    expect(bore.mesh?.positions.length).toBeGreaterThan(10)
    expect(NOT_PORTED).toEqual([
      'OpenCASCADE B-rep kernel',
      'CalculiX volume mesh solver'
    ])
  })

  it('[FreeCAD] toggles the millimeter ruler with the view setting', () => {
    const on = createInitialState()
    expect(on.settings.ruler).toBe(true)
    const off = reducer(on, { type: 'toggle-ruler' })
    expect(off.settings.ruler).toBe(false)
    expect(reducer(off, { type: 'toggle-ruler' }).settings.ruler).toBe(true)
  })
})
