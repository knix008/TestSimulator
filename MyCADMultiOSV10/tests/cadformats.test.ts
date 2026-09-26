import { describe, expect, it } from 'vitest'
import { parseDae, parseIges, parseOff, parsePly, parseStep, toIges, toOff, toPly, toStep } from '../src/core/cadformats'
import { createSolid } from '../src/core/model'
import { trianglePositions } from '../src/core/primitives'
import { FILE_TYPES, importFile, openFilters } from '../src/core/fileTypes'
import { EXPORT_FORMATS, runExport } from '../src/core/exporters'
import { activeDocument, createInitialState, reducer } from '../src/core/store'

/** Volume of a closed triangle soup, by the divergence theorem. */
function meshVolume(positions: number[]): number {
  let total = 0
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.slice(i, i + 9)
    total += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  return Math.abs(total)
}

const cube = () => {
  const solid = createSolid('box', 'box-1', 1)
  solid.size = { ...solid.size, x: 40, y: 40, z: 40 }
  return solid
}

describe('STEP', () => {
  it('[CAD] a cube survives the STEP round trip with its volume intact', () => {
    const solid = cube()
    const positions = trianglePositions(solid)
    const step = toStep([solid], () => positions)
    expect(step.startsWith('ISO-10303-21;')).toBe(true)
    expect(step).toContain('MANIFOLD_SOLID_BREP')
    expect(step).toContain('ADVANCED_FACE')
    expect(step.trimEnd().endsWith('END-ISO-10303-21;')).toBe(true)

    const back = parseStep(step, 'in-1')
    const read = back.solid.mesh?.positions ?? []
    expect(read.length).toBe(positions.length)
    // A 40 mm cube is 64 000 mm3, measured from the file that was written.
    expect(meshVolume(read)).toBeCloseTo(64000, 3)
    expect(meshVolume(read)).toBeCloseTo(meshVolume(positions), 6)
    expect(back.report[0]).toContain('faces')
  })

  it('[CAD] a STEP with only points still opens', () => {
    const text = [
      'ISO-10303-21;',
      'DATA;',
      "#1 = CARTESIAN_POINT ( 'NONE', ( 0.0, 0.0, 0.0 ) ) ;",
      "#2 = CARTESIAN_POINT ( 'NONE', ( 10.0, 0.0, 0.0 ) ) ;",
      "#3 = CARTESIAN_POINT ( 'NONE', ( 0.0, 10.0, 0.0 ) ) ;",
      'ENDSEC;',
      'END-ISO-10303-21;'
    ].join('\n')
    const result = parseStep(text, 'in-2')
    expect(result.report[0]).toContain('3 points')
    expect((result.solid.mesh?.positions.length ?? 0) / 9).toBe(3)
    expect(() => parseStep('nothing here', 'in-3')).toThrow()
  })
})

describe('IGES', () => {
  it('[CAD] wires round-trip through line entities', () => {
    const wires = [
      {
        id: 'w1',
        name: 'L',
        closed: false,
        points: [
          { x: 0, y: 0, z: 0 },
          { x: 30, y: 0, z: 0 },
          { x: 30, y: 20, z: 0 }
        ]
      }
    ]
    const iges = toIges(wires)
    const lines = iges.split('\n')
    expect(lines[0][72]).toBe('S')
    expect(lines.at(-1)?.[72]).toBe('T')
    const back = parseIges(iges, 'in')
    // Two segments come back as two lines with the same end points.
    expect(back.wires).toHaveLength(2)
    expect(back.wires[0].points[0]).toEqual({ x: 0, y: 0, z: 0 })
    expect(back.wires[1].points[1]).toEqual({ x: 30, y: 20, z: 0 })
    expect(back.report[0]).toContain('2 wires')
    expect(() => toIges([])).toThrow()
  })
})

describe('PLY and OFF', () => {
  it('[CAD] both mesh formats round-trip a cube', () => {
    const positions = trianglePositions(cube())
    const ply = parsePly(toPly(positions), 'in')
    expect(ply.solid.mesh?.positions).toHaveLength(positions.length)
    expect(meshVolume(ply.solid.mesh?.positions ?? [])).toBeCloseTo(64000, 3)

    const off = parseOff(toOff(positions), 'in')
    expect(off.solid.mesh?.positions).toHaveLength(positions.length)
    expect(meshVolume(off.solid.mesh?.positions ?? [])).toBeCloseTo(64000, 3)

    expect(toPly(positions).startsWith('ply')).toBe(true)
    expect(toOff(positions).startsWith('OFF')).toBe(true)
    expect(() => parsePly('ply\nformat binary_little_endian 1.0\nend_header\n', 'x')).toThrow()
    expect(() => parseOff('NOTOFF\n', 'x')).toThrow()
  })

  it('[CAD] polygon faces are triangulated on the way in', () => {
    const ply = [
      'ply',
      'format ascii 1.0',
      'element vertex 4',
      'property float x',
      'property float y',
      'property float z',
      'element face 1',
      'property list uchar int vertex_index',
      'end_header',
      '0 0 0',
      '10 0 0',
      '10 0 10',
      '0 0 10',
      '4 0 1 2 3'
    ].join('\n')
    expect((parsePly(ply, 'x').solid.mesh?.positions.length ?? 0) / 9).toBe(2)
    const off = ['OFF', '4 1 0', '0 0 0', '10 0 0', '10 0 10', '0 0 10', '4 0 1 2 3'].join('\n')
    expect((parseOff(off, 'x').solid.mesh?.positions.length ?? 0) / 9).toBe(2)
  })
})

describe('Collada', () => {
  it('[CAD] triangles come in with their positions', () => {
    const dae = [
      '<?xml version="1.0"?><COLLADA><library_geometries><geometry id="g"><mesh>',
      '<source><float_array count="9">0 0 0 10 0 0 0 10 0</float_array></source>',
      '<triangles count="1"><input semantic="VERTEX" offset="0"/><p>0 1 2</p></triangles>',
      '</mesh></geometry></library_geometries></COLLADA>'
    ].join('')
    const result = parseDae(dae, 'in')
    expect(result.solid.mesh?.positions).toEqual([0, 0, 0, 10, 0, 0, 0, 10, 0])
    expect(result.report[0]).toContain('1 geometries')
    expect(() => parseDae('<COLLADA/>', 'in')).toThrow()
  })
})

describe('the open dialog', () => {
  it('[File] offers every CAD format, not just MyCAD documents', () => {
    const extensions = FILE_TYPES.map((type) => type.ext)
    for (const ext of ['mycad', 'step', 'stp', 'igs', 'iges', 'ply', 'off', 'dae', 'stl', 'obj', 'dxf', 'svg']) {
      expect(extensions, ext).toContain(ext)
    }
    const filters = openFilters('ko')
    // The first filter takes everything, and each format has its own entry.
    expect(filters[0].extensions).toEqual(extensions)
    expect(filters).toHaveLength(FILE_TYPES.length + 1)
    expect(filters.some((filter) => filter.extensions[0] === 'step')).toBe(true)

    // And the importer really dispatches on them.
    const solid = cube()
    const step = toStep([solid], () => trianglePositions(solid))
    const imported = importFile('D:/cad/part.step', step, { id: 'i' })
    expect(imported.solids).toHaveLength(1)
    expect(imported.status).toContain('STEP')
    const ply = importFile('D:/cad/part.PLY', toPly(trianglePositions(solid)), { id: 'i' })
    expect(ply.solids[0].mesh?.positions).toHaveLength(trianglePositions(solid).length)
  })

  it('[File] the same formats can be exported again', () => {
    let state = createInitialState()
    state = reducer(state, { type: 'add-solid', kind: 'box' })
    const doc = activeDocument(state)
    for (const id of ['step', 'ply', 'off']) {
      const result = runExport(id, { doc, selectedOnly: false })
      expect(result.text.length, id).toBeGreaterThan(50)
      expect(result.name, id).toContain('.')
    }
    expect(EXPORT_FORMATS.map((format) => format.id)).toContain('iges')
    expect(EXPORT_FORMATS.length).toBeGreaterThanOrEqual(16)
  })
})
