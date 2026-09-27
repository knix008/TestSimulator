import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseDocument, serializeDocument } from '../src/core/serialize'
import { parseStl } from '../src/core/stl'
import { parsePly } from '../src/core/cadformats'
import { importFile } from '../src/core/fileTypes'
import { parseSkp } from '../src/core/gap'
import { parseDxfWires, parseSvgWires } from '../src/core/drawing'
import { compileOpenScad, parsePoints } from '../src/core/extended'
import { importIfc } from '../src/core/archwb'
import { evaluateSheet, parseCsv } from '../src/core/spreadsheet'
import { parseDesignTable } from '../src/core/knowledge'
import { parseMacro } from '../src/core/expressions'
import { runPython } from '../src/core/python'
import { addonCommands, installAddon, parseManifest } from '../src/core/addons'
import { fitPlane, meshInfo } from '../src/core/meshwb'
import { parseObj, solidVolume } from '../src/core/part'
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

function readBytes(name: string): Uint8Array {
  const path = join(SAMPLE_DIR, name)
  expect(existsSync(path), `${name} 이(가) 없습니다. npm run build:samples 를 실행하세요.`).toBe(true)
  return new Uint8Array(readFileSync(path))
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
    // Four sketches across three work planes, and a feature tree to match.
    expect(doc.sketches.map((item) => item.shape)).toEqual(['rect', 'circle', 'polygon', 'rect'])
    expect([...new Set(doc.sketches.map((item) => item.plane))].sort()).toEqual(['xy', 'xz', 'yz'])
    expect(doc.features.map((item) => item.kind)).toContain('pad')
    expect(doc.features.map((item) => item.kind)).toContain('pocket')
    expect(doc.parameters.find((item) => item.name === 'PadLength')?.formula).toBe('Width / 4 + 2')
    // The padded body is a plate with a hole through it, and it is closed.
    const info = meshInfo(doc.solids[0])
    expect(info.triangles).toBe(192)
    expect(info.closed).toBe(true)
  })

  it('[Sample] patterns carries the grid and the ring it names', () => {
    const doc = openDocument('patterns.mycad')
    // Plate, a 4x3 grid of teeth and a ring of eight pins.
    expect(doc.solids).toHaveLength(21)
    expect(doc.solids.filter((item) => item.name.startsWith('Tooth'))).toHaveLength(12)
    expect(doc.solids.filter((item) => item.name.startsWith('Pin'))).toHaveLength(8)
    expect(doc.features.map((item) => item.kind)).toContain('rectPattern')
    expect(doc.parameters.find((item) => item.name === 'PinCount')?.value).toBe(8)
  })

  it('[Sample] assembly holds mates and parts for the assembly commands', () => {
    const doc = openDocument('assembly.mycad')
    // A bearing stand: plate, two posts, block, shaft, pulley, cap, four bolts.
    expect(doc.solids).toHaveLength(11)
    expect(doc.solids.map((item) => item.name)).toContain('Pulley')
    expect(doc.mates.map((mate) => mate.kind)).toEqual(['coincidence', 'offset', 'fix', 'angle', 'offset', 'offset'])
    expect(doc.parameters.find((item) => item.name === 'PulleyRadius')?.formula).toBe('ShaftLength / 5 - 2')
    const effect = runCommandById('asmBom', { doc, nextId: () => 'tmp' })
    expect(effect?.report?.lines.join('\n')).toContain('kg')
  })

  it('[Sample] mesh-pyramid holds three closed meshes', () => {
    const doc = openDocument('mesh-pyramid.mycad')
    expect(doc.solids).toHaveLength(3)
    const info = meshInfo(doc.solids[0])
    // Five tiers of 9 mm: 9 * (60^2 + 50^2 + 40^2 + 30^2 + 20^2).
    expect(info.triangles).toBe(88)
    expect(info.closed).toBe(true)
    expect(info.volume).toBeCloseTo(81000, 0)
    for (const solid of doc.solids) {
      expect(meshInfo(solid).closed, solid.name).toBe(true)
      expect(meshInfo(solid).triangles, solid.name).toBeGreaterThan(50)
    }
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
    // The stepped pyramid: walls, steps and both caps, so it is closed too.
    const pyramid = meshInfo(parseStl(read('pyramid.stl'), 'pyramid'))
    expect(pyramid.triangles).toBe(88)
    expect(pyramid.closed).toBe(true)
    expect(pyramid.volume).toBeCloseTo(81000, 0)
    // The gear is the big one: teeth, a bore and two faces.
    const gear = meshInfo(parseStl(read('gear.stl'), 'gear'))
    expect(gear.triangles).toBeGreaterThan(500)
    expect(gear.closed).toBe(true)
  })

  it('[Sample] binary STL and PLY match the ASCII samples', () => {
    const ascii = meshInfo(parseStl(read('cube.stl'), 'ascii'))
    const binary = meshInfo(parseStl(readBytes('cube-binary.stl'), 'binary'))
    expect(binary.triangles).toBe(12)
    expect(binary.triangles).toBe(ascii.triangles)
    expect(binary.closed).toBe(true)
    expect(binary.volume).toBeCloseTo(ascii.volume, 0)

    const plateAscii = parsePly(read('plate.ply'), 'ascii')
    const plateBinary = parsePly(readBytes('plate-binary.ply'), 'binary')
    expect(plateBinary.report[0]).toContain('binary little')
    expect(plateBinary.solid.mesh?.positions.length).toBe(plateAscii.solid.mesh?.positions.length)
    expect(meshInfo(plateBinary.solid).volume).toBeCloseTo(meshInfo(plateAscii.solid).volume, 0)
  })

  it('[Sample] STEP and IGES open under both extensions', () => {
    const step = importFile('cube.stp', read('cube.stp'))
    expect(step.solids).toHaveLength(1)
    expect(read('cube.stp')).toBe(read('cube.step'))

    const iges = importFile('profile.iges', read('profile.iges'))
    expect(iges.wires.length).toBeGreaterThan(0)
    expect(read('profile.iges')).toBe(read('profile.igs'))
  })

  it('[Sample] the SKP room has a floor and four walls', () => {
    const faces = parseSkp(read('room.skp'))
    expect(faces.map((face) => face.name)).toEqual(['Floor', 'WallSouth', 'WallEast', 'WallNorth', 'WallWest'])
    const opened = importFile('room.skp', read('room.skp'))
    expect(opened.solids[0].mesh?.positions.length).toBe(90)
  })

  it('[Sample] the OBJ file imports as three named, closed parts', () => {
    const obj = read('plate.obj')
    // Normals and v//vn faces, not just bare triangles.
    expect(obj.match(/^vn /gm)?.length).toBe(obj.match(/^f /gm)?.length)
    expect(obj).toContain('//')

    const parts = parseObj(obj, 'obj')
    expect(parts.map((part) => part.name)).toEqual(['Plate', 'Boss', 'Rib'])
    for (const part of parts) {
      const info = meshInfo(part)
      expect(info.closed, part.name).toBe(true)
      expect(info.volume, part.name).toBeGreaterThan(0)
    }
    // The plate has a hole in it, so it holds less than a solid block would.
    expect(meshInfo(parts[0]).volume).toBeLessThan(80 * 50 * 6)
  })

  it('[Sample] SVG and DXF carry the same gasket outline', () => {
    const svg = read('profile.svg')
    expect(svg).toContain('<svg')
    expect(svg).toContain('<polyline')
    const svgWires = parseSvgWires(svg, 'svg')
    // Outer profile, inner window, slot and six bolt circles.
    expect(svgWires).toHaveLength(9)
    expect(svgWires.filter((wire) => wire.name === 'Circle')).toHaveLength(6)

    const dxf = read('profile.dxf')
    expect(dxf.match(/^LINE$/gm)).toHaveLength(18)
    expect(dxf.match(/^CIRCLE$/gm)).toHaveLength(6)
    expect(dxf).toContain('CENTRE')
    expect(dxf.trim().endsWith('EOF')).toBe(true)
    const dxfWires = parseDxfWires(dxf, 'dxf')
    expect(dxfWires).toHaveLength(24)
    expect(dxfWires.filter((wire) => wire.closed)).toHaveLength(6)
  })

  it('[Sample] OpenSCAD source compiles to a solid', () => {
    const solid = compileOpenScad(read('bracket.scad'))
    // A union of four bodies with two bores cut out of it.
    expect(solid.mesh?.positions.length ?? 0).toBeGreaterThan(1000)
    const volume = solidVolume(solid)
    expect(volume).toBeGreaterThan(40000)
    expect(volume).toBeLessThan(80 * 50 * 10 + 24 * Math.PI * 144 + 20 * 20 * 30 + 4000)
  })

  it('[Sample] scanned points fit a tilted plane', () => {
    const points = parsePoints(read('scan-points.asc'))
    expect(points).toHaveLength(169)
    const fit = fitPlane(points)
    expect(fit.rms).toBeLessThan(1e-6)
    expect(Math.abs(fit.normal.y)).toBeGreaterThan(0.9)
  })

  it('[Sample] IFC file imports products and storeys', () => {
    const summary = importIfc(read('building.ifc'))
    expect(summary.storeys).toEqual(['Basement', 'Level 1', 'Level 2', 'Roof Terrace'])
    const types = summary.products.map((product) => product.type)
    expect(types).toContain('IFCWALLSTANDARDCASE')
    expect(types).toContain('IFCCOLUMN')
    expect(types).toContain('IFCROOF')
    expect(summary.products.map((product) => product.name)).toContain('Window')
    // Four storeys with walls, slabs, columns and openings on each.
    expect(summary.products.length).toBeGreaterThan(30)
  })

  it('[Sample] G-code has depth passes, a drill cycle and ends with M30', () => {
    const gcode = read('pocket.nc')
    expect(gcode.match(/Z-\d/g)?.length).toBeGreaterThanOrEqual(3)
    expect(gcode).toContain('G21')
    // Two tools and a peck-drilling cycle for the bolt holes.
    expect(gcode).toContain('T2 M6')
    expect(gcode.match(/^G83 /gm)).toHaveLength(4)
    expect(gcode.trim().endsWith('M30')).toBe(true)

    // The other extension carries a different program: contouring with arcs.
    const contour = read('profile.gcode')
    expect(contour).not.toBe(gcode)
    expect(contour.match(/^G3 /gm)?.length).toBeGreaterThanOrEqual(12)
    expect(contour.trim().endsWith('M30')).toBe(true)
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
    expect(table.rows).toHaveLength(6)
    expect(table.rows[2]).toEqual([120, 75, 6])
    expect(table.rows[5]).toEqual([240, 150, 12])
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
