import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseDocument, serializeDocument } from '../src/core/serialize'
import { parseStl } from '../src/core/stl'
import { compileOpenScad, parsePoints } from '../src/core/extended'
import { importIfc } from '../src/core/archwb'
import { evaluateSheet, parseCsv } from '../src/core/spreadsheet'
import { parseDesignTable } from '../src/core/knowledge'
import { parseMacro } from '../src/core/expressions'
import { runPython } from '../src/core/python'
import { addonCommands, installAddon, parseManifest } from '../src/core/addons'
import { fitPlane, meshInfo } from '../src/core/meshwb'
import { solidVolume } from '../src/core/part'
import { boundingBoxOf } from '../src/core/primitives'
import { schedule } from '../src/core/archwb'
import { runAnalysis } from '../src/core/femwb'
import { unfold, checkSheetPart } from '../src/core/sheetmetal'
import { simulate, degreesOfFreedom } from '../src/core/kinematics'
import { COMMAND_IDS, runCommandById } from '../src/core/commands'

const SAMPLE_DIR = join(process.cwd(), 'sample')

function read(name: string): string {
  const path = join(SAMPLE_DIR, name)
  expect(existsSync(path), `${name} 이(가) 없습니다. npm run build:samples 를 실행하세요.`).toBe(true)
  return readFileSync(path, 'utf8')
}

function openDocument(name: string) {
  return parseDocument(read(name), 'sample')
}

interface Manifest {
  generator: string
  files: Array<{ name: string; description: string }>
}

describe('sample files', () => {
  const manifest = JSON.parse(read('manifest.json')) as Manifest

  it('[Sample] manifest lists every generated file with a description', () => {
    expect(manifest.generator).toBe('scripts/create-samples.mjs')
    expect(manifest.files.length).toBeGreaterThanOrEqual(25)
    for (const entry of manifest.files) {
      expect(existsSync(join(SAMPLE_DIR, entry.name)), entry.name).toBe(true)
      expect(entry.description.length, entry.name).toBeGreaterThan(0)
    }
    const readme = read('README.md')
    for (const entry of manifest.files) expect(readme).toContain(entry.name)
  })

  it('[Sample] every .mycad file parses and round-trips', () => {
    const documents = manifest.files.filter((entry) => entry.name.endsWith('.mycad'))
    expect(documents.length).toBeGreaterThanOrEqual(12)
    for (const entry of documents) {
      const doc = openDocument(entry.name)
      expect(doc.name.length, entry.name).toBeGreaterThan(0)
      expect(doc.solids.length, entry.name).toBeGreaterThan(0)
      expect(doc.extras, entry.name).toBeTruthy()
      const again = parseDocument(serializeDocument(doc), 'again')
      expect(again.solids.length, entry.name).toBe(doc.solids.length)
      expect(again.extras.tags.length, entry.name).toBe(doc.extras.tags.length)
    }
  })

  it('[Sample] box and primitives carry usable solids', () => {
    const box = openDocument('box.mycad')
    expect(box.solids[0].kind).toBe('box')
    expect(solidVolume(box.solids[0])).toBeCloseTo(64000)

    const primitives = openDocument('primitives.mycad')
    expect(primitives.solids.map((solid) => solid.kind)).toEqual(['box', 'sphere', 'cylinder', 'cone', 'torus', 'plane'])
    expect(boundingBoxOf(primitives.solids).size.x).toBeGreaterThan(200)
  })

  it('[Sample] sketch-pad keeps the sketch, the pad feature and its formula', () => {
    const doc = openDocument('sketch-pad.mycad')
    expect(doc.sketches[0].shape).toBe('rect')
    expect(doc.features.map((item) => item.kind)).toContain('pad')
    expect(doc.parameters.find((item) => item.name === 'PadLength')?.formula).toBe('Width / 4 + 2')
    expect(meshInfo(doc.solids[0]).triangles).toBe(12)
  })

  it('[Sample] assembly holds mates and parts for the assembly commands', () => {
    const doc = openDocument('assembly.mycad')
    expect(doc.solids).toHaveLength(3)
    expect(doc.mates.map((mate) => mate.kind)).toEqual(['coincidence', 'offset'])
    const effect = runCommandById('asmBom', { doc, nextId: () => 'tmp' })
    expect(effect?.report?.lines.join('\n')).toContain('kg')
  })

  it('[Sample] mesh-pyramid is a closed mesh', () => {
    const info = meshInfo(openDocument('mesh-pyramid.mycad').solids[0])
    expect(info.triangles).toBe(6)
    expect(info.closed).toBe(true)
    expect(info.volume).toBeGreaterThan(0)
  })

  it('[Sample] bim-house schedules quantities and exports IFC', () => {
    const doc = openDocument('bim-house.mycad')
    const rows = schedule(doc.extras.bimElements)
    expect(rows.map((row) => row.kind).sort()).toEqual(['column', 'roof', 'slab', 'wall'])
    expect(rows.find((row) => row.kind === 'slab')?.unit).toBe('m2')
    const effect = runCommandById('bimExportIfc', { doc, nextId: () => 'tmp' })
    expect(effect?.download?.text).toContain('IFCWALLSTANDARDCASE')
  })

  it('[Sample] sketchup-scene restores groups, tags and scenes', () => {
    const doc = openDocument('sketchup-scene.mycad')
    expect(doc.extras.groups[0].tag).toBe('Furniture')
    expect(doc.extras.tags.find((tag) => tag.name === 'Site')?.visible).toBe(false)
    expect(doc.extras.scenes[0].hiddenTags).toEqual(['Site'])
    const effect = runCommandById('suSectionCut', { doc, nextId: () => 'tmp' })
    expect(effect?.extras?.wires?.length).toBe(doc.extras.wires.length + 1)
  })

  it('[Sample] spreadsheet document evaluates its formulas', () => {
    const doc = openDocument('spreadsheet.mycad')
    const values = evaluateSheet(doc.extras.sheet)
    expect(values.aliases.Area).toBe(4000)
    expect(values.aliases.Total).toBe(4130)
    expect(Object.keys(values.errors)).toHaveLength(0)
  })

  it('[Sample] sheetmetal bracket unfolds and passes the formability check', () => {
    const doc = openDocument('sheetmetal-bracket.mycad')
    const result = unfold(doc.extras.sheetMetal)
    expect(result.flatLength).toBeGreaterThan(150)
    expect(result.bends).toHaveLength(2)
    expect(checkSheetPart(doc.extras.sheetMetal).ok).toBe(true)
  })

  it('[Sample] fem-beam runs an analysis with its stored constraints', () => {
    const doc = openDocument('fem-beam.mycad')
    expect(doc.extras.analysis.constraints).toHaveLength(2)
    const report = runAnalysis(doc.extras.analysis, doc.solids[0])
    expect(report.lines.join('\n')).toContain('Safety factor')
    expect(report.worstSafety).toBeGreaterThan(0)
  })

  it('[Sample] kinematics-crank simulates and reports its degrees of freedom', () => {
    const doc = openDocument('kinematics-crank.mycad')
    const base = Object.fromEntries(doc.solids.map((solid) => [solid.id, { bodyId: solid.id, position: { ...solid.position }, rotation: { ...solid.rotation } }]))
    const start = simulate(doc.extras.mechanism, base, 0)
    const middle = simulate(doc.extras.mechanism, base, 0.5)
    expect(middle.find((pose) => pose.bodyId === 'sol-2')?.position.x)
      .not.toBe(start.find((pose) => pose.bodyId === 'sol-2')?.position.x)
    expect(degreesOfFreedom(doc.extras.mechanism, doc.solids.map((solid) => solid.id))).toBeLessThan(12)
  })

  it('[Sample] STL files import as meshes', () => {
    const cube = parseStl(read('cube.stl'), 'cube')
    expect(meshInfo(cube).triangles).toBe(12)
    expect(meshInfo(cube).closed).toBe(true)
    const pyramid = parseStl(read('pyramid.stl'), 'pyramid')
    expect(meshInfo(pyramid).triangles).toBe(6)
  })

  it('[Sample] OBJ, SVG and DXF drawings have the expected structure', () => {
    const obj = read('plate.obj')
    expect(obj.split('\n').filter((line) => line.startsWith('v ')).length).toBe(36)
    expect(obj.split('\n').filter((line) => line.startsWith('f ')).length).toBe(12)

    const svg = read('profile.svg')
    expect(svg).toContain('<svg')
    expect(svg).toContain('<polygon')
    expect(svg).toContain('<circle')

    const dxf = read('profile.dxf')
    expect(dxf.match(/^LINE$/gm)).toHaveLength(4)
    expect(dxf).toContain('CIRCLE')
    expect(dxf.trim().endsWith('EOF')).toBe(true)
  })

  it('[Sample] OpenSCAD source compiles to a solid', () => {
    const solid = compileOpenScad(read('bracket.scad'))
    expect(solid.mesh?.positions.length ?? 0).toBeGreaterThan(8)
    expect(solidVolume(solid)).toBeGreaterThan(0)
  })

  it('[Sample] scanned points fit a tilted plane', () => {
    const points = parsePoints(read('scan-points.asc'))
    expect(points).toHaveLength(49)
    const fit = fitPlane(points)
    expect(fit.rms).toBeLessThan(1e-6)
    expect(Math.abs(fit.normal.y)).toBeGreaterThan(0.9)
  })

  it('[Sample] IFC file imports products and storeys', () => {
    const summary = importIfc(read('building.ifc'))
    expect(summary.storeys).toEqual(['Level 1', 'Level 2'])
    expect(summary.products.map((product) => product.type)).toContain('IFCWALLSTANDARDCASE')
    expect(summary.products.map((product) => product.name)).toContain('Window')
  })

  it('[Sample] G-code has three depth passes and ends with M30', () => {
    const gcode = read('pocket.nc')
    expect(gcode.match(/Z-\d/g)?.length).toBeGreaterThanOrEqual(3)
    expect(gcode).toContain('G21')
    expect(gcode.trim().endsWith('M30')).toBe(true)
  })

  it('[Sample] CSV files load as sheets and design tables', () => {
    const sheet = parseCsv(read('spreadsheet.csv'), 'sample')
    const values = evaluateSheet(sheet)
    expect(values.values.B3).toBe(4000)
    expect(values.values.B4).toBe(4130)

    const parameters = parseCsv(read('parameters.csv'), 'parameters')
    expect(parameters.cells.some((cell) => cell.ref === 'D4')).toBe(true)

    const table = parseDesignTable(read('design-table.csv'), 'Sizes')
    expect(table.columns).toEqual(['Width', 'Height', 'Thickness'])
    expect(table.rows).toHaveLength(3)
    expect(table.rows[2]).toEqual([120, 75, 6])
  })

  it('[Sample] macro script parses into commands', () => {
    const commands = parseMacro(read('macro.mycadmacro'))
    expect(commands.map((command) => command.name)).toEqual(['box', 'move', 'pad', 'fillet'])
    expect(commands[0].args).toEqual([40, 20, 10])
  })

  it('[Sample] the Python macro runs and builds a solid', () => {
    const result = runPython(read('macro.py'))
    expect(result.solids).toHaveLength(1)
    expect(result.output[0]).toMatch(/^volume /)
    expect(result.output.filter((line) => line.startsWith('hole'))).toHaveLength(3)
    expect(solidVolume(result.solids[0])).toBeGreaterThan(0)
  })

  it('[Sample] the addon manifest installs and its command runs', () => {
    const manifest = parseManifest(read('addon-manifest.json'))
    expect(manifest.id).toBe('hex-nuts')
    const installed = installAddon([], manifest, 'file', '1.0.0', 0)
    const command = addonCommands(installed)[0]
    expect(command.id).toBe('sampleHexNut')
    const result = runPython(command.macro)
    expect(result.solids.length).toBeGreaterThan(0)
    expect(result.output.join(' ')).toContain('nut volume')
  })

  it('[Sample] every registry command runs on the assembly sample', () => {
    const doc = openDocument('assembly.mycad')
    const prepared = { ...doc, selection: doc.solids.map((solid) => solid.id) }
    const failures: string[] = []
    for (const id of COMMAND_IDS) {
      let counter = 0
      try {
        runCommandById(id, { doc: prepared, nextId: () => `tmp-${(counter += 1)}` })
      } catch (error) {
        // Commands that legitimately need an earlier step report a clear message.
        const message = (error as Error).message
        if (!/선택|필요|없습니다|먼저|겹치지|비어/.test(message)) failures.push(`${id}: ${message}`)
      }
    }
    expect(failures).toEqual([])
  })
})
