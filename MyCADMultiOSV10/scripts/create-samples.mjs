// Generates the sample/ directory: one file per import path the app supports,
// so every workbench can be exercised without hand-made test data.
//
//   npm run build:samples
//
// The output is deterministic: running it twice produces identical files, and
// tests/samples.test.ts parses each file back with the application's own code.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const out = join(root, 'sample')

mkdirSync(out, { recursive: true })

import { toIges, toOff, toPly, toStep } from '../src/core/cadformats.ts'

const written = []

function write(name, text) {
  writeFileSync(join(out, name), text.endsWith('\n') ? text : `${text}\n`, 'utf8')
  written.push(name)
}

/* ────────────────────────────── helpers ─────────────────────────────────── */

function solid(overrides = {}) {
  return {
    id: 'sol-1',
    name: 'Box',
    kind: 'box',
    position: { x: 0, y: 20, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    size: { x: 40, y: 40, z: 40, radius: 20, tube: 6 },
    color: '#4cc2ff',
    metalness: 0.15,
    roughness: 0.45,
    visible: true,
    locked: false,
    ...overrides
  }
}

function meshSolid(id, name, triangles, color) {
  const positions = []
  const normals = []
  for (const [a, b, c] of triangles) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const length = Math.hypot(nx, ny, nz) || 1
    positions.push(...a, ...b, ...c)
    for (let i = 0; i < 3; i++) normals.push(nx / length, ny / length, nz / length)
  }
  return solid({
    id,
    name,
    kind: 'mesh',
    color: color || '#8fd18f',
    position: { x: 0, y: 0, z: 0 },
    size: { x: 1, y: 1, z: 1, radius: 1, tube: 0.2 },
    mesh: { positions, normals }
  })
}

function boxTriangles(w, h, d, offset = [0, 0, 0]) {
  const [ox, oy, oz] = offset
  const x0 = ox - w / 2, x1 = ox + w / 2
  const y0 = oy, y1 = oy + h
  const z0 = oz - d / 2, z1 = oz + d / 2
  const corner = (x, y, z) => [x, y, z]
  const quad = (a, b, c, e) => [[a, b, c], [a, c, e]]
  return [
    ...quad(corner(x0, y0, z0), corner(x1, y0, z0), corner(x1, y0, z1), corner(x0, y0, z1)),
    ...quad(corner(x0, y1, z0), corner(x0, y1, z1), corner(x1, y1, z1), corner(x1, y1, z0)),
    ...quad(corner(x0, y0, z0), corner(x0, y0, z1), corner(x0, y1, z1), corner(x0, y1, z0)),
    ...quad(corner(x1, y0, z0), corner(x1, y1, z0), corner(x1, y1, z1), corner(x1, y0, z1)),
    ...quad(corner(x0, y0, z0), corner(x0, y1, z0), corner(x1, y1, z0), corner(x1, y0, z0)),
    ...quad(corner(x0, y0, z1), corner(x1, y0, z1), corner(x1, y1, z1), corner(x0, y1, z1))
  ]
}

function pyramidTriangles(base, height) {
  const h = base / 2
  const corners = [[-h, 0, -h], [h, 0, -h], [h, 0, h], [-h, 0, h]]
  const apex = [0, height, 0]
  const sides = corners.map((corner, index) => [corner, corners[(index + 1) % 4], apex])
  return [...sides, [corners[0], corners[2], corners[1]], [corners[0], corners[3], corners[2]]]
}

function asciiStl(name, triangles) {
  const lines = [`solid ${name}`]
  for (const [a, b, c] of triangles) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const length = Math.hypot(nx, ny, nz) || 1
    lines.push(`  facet normal ${(nx / length).toFixed(6)} ${(ny / length).toFixed(6)} ${(nz / length).toFixed(6)}`)
    lines.push('    outer loop')
    for (const vertex of [a, b, c]) lines.push(`      vertex ${vertex[0].toFixed(4)} ${vertex[1].toFixed(4)} ${vertex[2].toFixed(4)}`)
    lines.push('    endloop')
    lines.push('  endfacet')
  }
  lines.push(`endsolid ${name}`)
  return lines.join('\n')
}

function document(name, body) {
  return JSON.stringify({
    format: 'mycad',
    version: 2,
    document: {
      id: `doc-${name}`,
      name,
      solids: [],
      sketches: [],
      features: [],
      parameters: [],
      mates: [],
      section: false,
      preset: 'iso',
      shade: 'shaded',
      ...body
    }
  }, null, 2)
}

function sketch(id, shape, width, height, sides = 6, plane = 'xy') {
  return { id, name: `sketch-${id}`, plane, shape, width, height, sides }
}

function feature(id, name, kind, solidIds, overrides = {}) {
  return { id, name, kind, solidIds, length: 0, angle: 0, count: 1, radius: 0, ...overrides }
}

function rectangleWire(id, name, width, height, y = 0) {
  const w = width / 2
  const h = height / 2
  return {
    id,
    name,
    closed: true,
    points: [
      { x: -w, y, z: -h }, { x: w, y, z: -h }, { x: w, y, z: h }, { x: -w, y, z: h }
    ]
  }
}

/* ───────────────────────────── .mycad documents ─────────────────────────── */

write('box.mycad', document('box', {
  solids: [solid()],
  features: [feature('feat-1', 'Box', 'primitive', ['sol-1'])]
}))

write('primitives.mycad', document('primitives', {
  solids: [
    solid({ id: 'sol-1', name: 'Box' }),
    solid({ id: 'sol-2', name: 'Sphere', kind: 'sphere', position: { x: 60, y: 22, z: 0 }, size: { x: 40, y: 40, z: 40, radius: 22, tube: 6 }, color: '#f0a35e' }),
    solid({ id: 'sol-3', name: 'Cylinder', kind: 'cylinder', position: { x: 120, y: 24, z: 0 }, size: { x: 40, y: 48, z: 40, radius: 16, tube: 6 }, color: '#7dcea0' }),
    solid({ id: 'sol-4', name: 'Cone', kind: 'cone', position: { x: 180, y: 24, z: 0 }, size: { x: 40, y: 48, z: 40, radius: 16, tube: 6 }, color: '#d98bff' }),
    solid({ id: 'sol-5', name: 'Torus', kind: 'torus', position: { x: 240, y: 22, z: 0 }, size: { x: 40, y: 40, z: 40, radius: 22, tube: 7 }, color: '#f5d76e' }),
    solid({ id: 'sol-6', name: 'Plane', kind: 'plane', position: { x: 120, y: 0, z: 120 }, size: { x: 200, y: 1, z: 200, radius: 20, tube: 6 }, color: '#aeb6bf' })
  ]
}))

write('sketch-pad.mycad', document('sketch-pad', {
  solids: [meshSolid('sol-1', 'pad-sketch-1', boxTriangles(40, 12, 30), '#4cc2ff')],
  sketches: [sketch('sketch-1', 'rect', 40, 30)],
  features: [
    feature('feat-1', 'Sketch', 'sketch', [], { length: 0.4 }),
    feature('feat-2', 'Pad', 'pad', ['sol-1'], { length: 12 })
  ],
  parameters: [
    { name: 'Width', value: 40, formula: '' },
    { name: 'Height', value: 30, formula: '' },
    { name: 'PadLength', value: 12, formula: 'Width / 4 + 2' }
  ]
}))

write('assembly.mycad', document('assembly', {
  solids: [
    solid({ id: 'sol-1', name: 'Base', size: { x: 120, y: 12, z: 80, radius: 20, tube: 6 }, position: { x: 0, y: 6, z: 0 }, color: '#9aa7b4' }),
    solid({ id: 'sol-2', name: 'Post', kind: 'cylinder', size: { x: 20, y: 60, z: 20, radius: 10, tube: 6 }, position: { x: 0, y: 42, z: 0 }, color: '#d6dee6' }),
    solid({ id: 'sol-3', name: 'Cap', kind: 'sphere', size: { x: 24, y: 24, z: 24, radius: 12, tube: 6 }, position: { x: 0, y: 78, z: 0 }, color: '#f0a35e' })
  ],
  mates: [
    { id: 'mate-1', kind: 'coincidence', a: 'Base', b: 'Post', value: 0 },
    { id: 'mate-2', kind: 'offset', a: 'Post', b: 'Cap', value: 36 }
  ],
  parameters: [
    { name: 'PostHeight', value: 60, formula: '' },
    { name: 'CapRadius', value: 12, formula: 'PostHeight / 5' }
  ],
  features: [feature('feat-1', 'Assembly', 'assembly', ['sol-1', 'sol-2', 'sol-3'], { count: 3 })]
}))

write('patterns.mycad', document('patterns', {
  solids: [
    solid({ id: 'sol-1', name: 'Tooth', size: { x: 12, y: 24, z: 12, radius: 6, tube: 2 }, position: { x: 0, y: 12, z: 0 } }),
    solid({ id: 'sol-2', name: 'Tooth-2', size: { x: 12, y: 24, z: 12, radius: 6, tube: 2 }, position: { x: 30, y: 12, z: 0 } }),
    solid({ id: 'sol-3', name: 'Tooth-3', size: { x: 12, y: 24, z: 12, radius: 6, tube: 2 }, position: { x: 60, y: 12, z: 0 } }),
    solid({ id: 'sol-4', name: 'Tooth-p2', size: { x: 12, y: 24, z: 12, radius: 6, tube: 2 }, position: { x: 0, y: 12, z: 40 }, rotation: { x: 0, y: 90, z: 0 } })
  ],
  features: [
    feature('feat-1', 'linearArray', 'pattern', ['sol-2', 'sol-3'], { count: 3, length: 30 }),
    feature('feat-2', 'polarArray', 'pattern', ['sol-4'], { count: 4, radius: 40 })
  ]
}))

write('mesh-pyramid.mycad', document('mesh-pyramid', {
  solids: [meshSolid('sol-1', 'Pyramid', pyramidTriangles(60, 45), '#f1948a')],
  features: [feature('feat-1', 'Pyramid', 'primitive', ['sol-1'])]
}))

write('bim-house.mycad', document('bim-house', {
  solids: [
    solid({ id: 'sol-1', name: 'Slab', size: { x: 6000, y: 200, z: 4000, radius: 20, tube: 6 }, position: { x: 0, y: 100, z: 0 }, color: '#c9c9c2' }),
    solid({ id: 'sol-2', name: 'Wall', size: { x: 6000, y: 2700, z: 200, radius: 20, tube: 6 }, position: { x: 0, y: 1550, z: -1900 }, color: '#d9d2c4' }),
    solid({ id: 'sol-3', name: 'Wall', size: { x: 6000, y: 2700, z: 200, radius: 20, tube: 6 }, position: { x: 0, y: 1550, z: 1900 }, color: '#d9d2c4' }),
    solid({ id: 'sol-4', name: 'Column', size: { x: 300, y: 2700, z: 300, radius: 20, tube: 6 }, position: { x: -2850, y: 1550, z: 0 }, color: '#bfc4c9' }),
    solid({ id: 'sol-5', name: 'Roof', size: { x: 6400, y: 150, z: 4400, radius: 20, tube: 6 }, position: { x: 0, y: 2950, z: 0 }, rotation: { x: 18, y: 0, z: 0 }, color: '#8c6b4f' })
  ],
  features: [feature('feat-1', 'Building', 'bim', ['sol-1', 'sol-2', 'sol-3', 'sol-4', 'sol-5'], { count: 5 })],
  extras: {
    levels: [
      { name: 'Level 1', elevation: 0, height: 3000 },
      { name: 'Level 2', elevation: 3000, height: 3000 }
    ],
    bimElements: [
      { id: 'slab-sol-1', kind: 'slab', name: 'Slab', level: 'Level 1', material: 'Concrete', length: 6000, width: 4000, height: 200, solidId: 'sol-1' },
      { id: 'wall-sol-2', kind: 'wall', name: 'Wall', level: 'Level 1', material: 'Concrete', length: 6000, width: 200, height: 2700, solidId: 'sol-2' },
      { id: 'wall-sol-3', kind: 'wall', name: 'Wall', level: 'Level 1', material: 'Concrete', length: 6000, width: 200, height: 2700, solidId: 'sol-3' },
      { id: 'column-sol-4', kind: 'column', name: 'Column', level: 'Level 1', material: 'Steel', length: 300, width: 300, height: 2700, solidId: 'sol-4' },
      { id: 'roof-sol-5', kind: 'roof', name: 'Roof', level: 'Level 2', material: 'Wood', length: 6400, width: 4400, height: 150, solidId: 'sol-5' }
    ],
    materialOf: { 'sol-1': 'concrete', 'sol-2': 'concrete', 'sol-3': 'concrete', 'sol-4': 'steel', 'sol-5': 'wood' }
  }
}))

write('sketchup-scene.mycad', document('sketchup-scene', {
  solids: [
    solid({ id: 'sol-1', name: 'Floor', size: { x: 400, y: 10, z: 400, radius: 20, tube: 6 }, position: { x: 0, y: 5, z: 0 }, color: '#c08a4e' }),
    solid({ id: 'sol-2', name: 'Table', size: { x: 120, y: 60, z: 80, radius: 20, tube: 6 }, position: { x: 0, y: 40, z: 0 }, color: '#d7c3a5' }),
    solid({ id: 'sol-3', name: 'Chair', size: { x: 45, y: 90, z: 45, radius: 20, tube: 6 }, position: { x: 110, y: 45, z: 0 }, color: '#9c5b4a' })
  ],
  features: [feature('feat-1', 'Room', 'assembly', ['sol-1', 'sol-2', 'sol-3'], { count: 3 })],
  extras: {
    wires: [rectangleWire('wire-1', 'FloorOutline', 400, 400, 10)],
    groups: [
      { id: 'group-1', name: 'Furniture', solidIds: ['sol-2', 'sol-3'], tag: 'Furniture', locked: false }
    ],
    tags: [
      { name: 'Untagged', visible: true, color: '#8fa0b0', dashes: 'solid' },
      { name: 'Structure', visible: true, color: '#7ec8ff', dashes: 'solid' },
      { name: 'Furniture', visible: true, color: '#f0a35e', dashes: 'dash' },
      { name: 'Site', visible: false, color: '#8fd18f', dashes: 'dot' }
    ],
    styleId: 'shaded',
    shadows: { enabled: true, timeOfDay: 15, dayOfYear: 172, latitude: 37.5, light: 80, dark: 45 },
    sectionPlanes: [
      { id: 'plane-1', name: 'Section 1', origin: { x: 0, y: 45, z: 0 }, normal: { x: 0, y: 1, z: 0 }, active: true, fill: true }
    ],
    scenes: [
      {
        name: 'Scene 1',
        camera: { eye: { x: 320, y: 220, z: 320 }, target: { x: 0, y: 40, z: 0 }, up: { x: 0, y: 1, z: 0 }, fieldOfView: 35, perspective: true, height: 300 },
        style: 'shaded',
        shadows: { enabled: true, timeOfDay: 15, dayOfYear: 172, latitude: 37.5, light: 80, dark: 45 },
        hiddenTags: ['Site']
      }
    ]
  }
}))

write('spreadsheet.mycad', document('spreadsheet', {
  solids: [solid({ id: 'sol-1', name: 'Plate', size: { x: 80, y: 10, z: 50, radius: 20, tube: 6 }, position: { x: 0, y: 5, z: 0 } })],
  parameters: [
    { name: 'Width', value: 80, formula: '' },
    { name: 'Depth', value: 50, formula: '' },
    { name: 'Area', value: 4000, formula: 'Width * Depth' }
  ],
  extras: {
    sheet: {
      name: 'Plate',
      cells: [
        { ref: 'A1', content: 'Width' },
        { ref: 'A2', content: 'Depth' },
        { ref: 'A3', content: 'Area' },
        { ref: 'A4', content: 'Total' },
        { ref: 'B1', content: '80', alias: 'Width' },
        { ref: 'B2', content: '50', alias: 'Depth' },
        { ref: 'B3', content: '=Width * Depth', alias: 'Area' },
        { ref: 'B4', content: '=sum(B1:B3)', alias: 'Total' }
      ]
    }
  }
}))

write('sheetmetal-bracket.mycad', document('sheetmetal-bracket', {
  solids: [
    solid({ id: 'sol-1', name: 'Wall1', size: { x: 100, y: 2, z: 60, radius: 20, tube: 6 }, position: { x: 50, y: 1, z: 0 }, color: '#b9c6d2' }),
    solid({ id: 'sol-2', name: 'Flange1', size: { x: 30, y: 2, z: 60, radius: 20, tube: 6 }, position: { x: 100, y: 16, z: 0 }, rotation: { x: 0, y: 0, z: 90 }, color: '#b9c6d2' })
  ],
  features: [feature('feat-1', 'SheetMetal', 'sheetMetal', ['sol-1', 'sol-2'], { count: 2 })],
  extras: {
    sheetMetal: {
      name: 'Bracket',
      parameters: { thickness: 2, bendRadius: 2, kFactor: 0.44, defaultBendAngle: 90 },
      walls: [
        { id: 'wall-1', name: 'Wall1', length: 100, width: 60, bendAngle: 0, bendRadius: 2 },
        { id: 'flange-1', name: 'Flange1', length: 30, width: 60, bendAngle: 90, bendRadius: 2 },
        { id: 'flange-2', name: 'Flange2', length: 20, width: 60, bendAngle: 90, bendRadius: 2 }
      ]
    }
  }
}))

write('fem-beam.mycad', document('fem-beam', {
  solids: [solid({ id: 'sol-1', name: 'Beam', size: { x: 400, y: 20, z: 40, radius: 20, tube: 6 }, position: { x: 0, y: 10, z: 0 }, color: '#9aa7b4' })],
  features: [feature('feat-1', 'Beam', 'primitive', ['sol-1'])],
  extras: {
    analysis: {
      id: 'analysis-1',
      name: 'Cantilever',
      materialId: 'steel',
      solver: 'internal',
      meshSize: 5,
      constraints: [
        { id: 'fix-1', kind: 'fixed', target: 'Beam', value: 0 },
        { id: 'force-1', kind: 'force', target: 'Beam', value: 1500, direction: 'y' }
      ]
    },
    materialOf: { 'sol-1': 'steel' }
  }
}))

write('kinematics-crank.mycad', document('kinematics-crank', {
  solids: [
    solid({ id: 'sol-1', name: 'Frame', size: { x: 120, y: 10, z: 40, radius: 20, tube: 6 }, position: { x: 0, y: 5, z: 0 }, color: '#8d949b' }),
    solid({ id: 'sol-2', name: 'Crank', size: { x: 60, y: 8, z: 12, radius: 20, tube: 6 }, position: { x: 30, y: 20, z: 0 }, color: '#f0a35e' }),
    solid({ id: 'sol-3', name: 'Slider', size: { x: 20, y: 20, z: 20, radius: 20, tube: 6 }, position: { x: 90, y: 20, z: 0 }, color: '#7dcea0' })
  ],
  features: [feature('feat-1', 'Mechanism', 'assembly', ['sol-1', 'sol-2', 'sol-3'], { count: 3 })],
  extras: {
    mechanism: {
      name: 'Crank slider',
      fixed: ['sol-1'],
      commands: ['joint-1'],
      joints: [
        { id: 'joint-1', kind: 'revolute', a: 'sol-1', b: 'sol-2', axis: 'y', origin: { x: 0, y: 20, z: 0 }, min: 0, max: 360, ratio: 1 },
        { id: 'joint-2', kind: 'prismatic', a: 'sol-1', b: 'sol-3', axis: 'x', origin: { x: 0, y: 20, z: 0 }, min: 0, max: 60, ratio: 1 }
      ]
    }
  }
}))

/* ───────────────────────────── mesh interchange ─────────────────────────── */

write('cube.stl', asciiStl('cube', boxTriangles(40, 40, 40, [0, 0, 0])))

// ── neutral CAD interchange formats ──────────────────────────────────────
const cubeTriangles = boxTriangles(40, 40, 40, [0, 0, 0]).flatMap((triangle) => triangle.flat())
// A fixed stamp keeps the generated samples byte-identical between runs.
const SAMPLE_STAMP = new Date('2026-01-01T00:00:00.000Z')
write('cube.step', toStep([{ name: 'cube', position: { x: 0, y: 0, z: 0 } }], () => cubeTriangles, SAMPLE_STAMP))
write('plate.ply', toPly(boxTriangles(60, 8, 40, [0, 0, 0]).flatMap((triangle) => triangle.flat()), 'plate'))
write('wedge.off', toOff(pyramidTriangles(50, 40).flatMap((triangle) => triangle.flat())))
write('profile.igs', toIges([
  {
    id: 'w1',
    name: 'profile',
    closed: true,
    points: [
      { x: 0, y: 0, z: 0 },
      { x: 60, y: 0, z: 0 },
      { x: 60, y: 0, z: 40 },
      { x: 0, y: 0, z: 40 },
      { x: 0, y: 0, z: 0 }
    ]
  }
], SAMPLE_STAMP))
write('bracket.dae', [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">',
  '  <asset><up_axis>Y_UP</up_axis></asset>',
  '  <library_geometries>',
  '    <geometry id="bracket" name="bracket"><mesh>',
  '      <source id="bracket-positions">',
  '        <float_array id="bracket-array" count="12">0 0 0  40 0 0  40 0 30  0 0 30</float_array>',
  '      </source>',
  '      <vertices id="bracket-vertices"><input semantic="POSITION" source="#bracket-positions"/></vertices>',
  '      <triangles count="2" material="none">',
  '        <input semantic="VERTEX" source="#bracket-vertices" offset="0"/>',
  '        <p>0 1 2 0 2 3</p>',
  '      </triangles>',
  '    </mesh></geometry>',
  '  </library_geometries>',
  '</COLLADA>'
].join('\n'))
write('pyramid.stl', asciiStl('pyramid', pyramidTriangles(60, 45)))

const objTriangles = boxTriangles(30, 30, 30)
const objLines = ['# MyCAD sample OBJ', 'o Cube']
const objVertices = []
for (const triangle of objTriangles) for (const vertex of triangle) objVertices.push(vertex)
for (const vertex of objVertices) objLines.push(`v ${vertex[0]} ${vertex[1]} ${vertex[2]}`)
for (let i = 1; i <= objVertices.length; i += 3) objLines.push(`f ${i} ${i + 1} ${i + 2}`)
write('plate.obj', objLines.join('\n'))

/* ───────────────────────────── 2D drawings ──────────────────────────────── */

write('profile.svg', [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-200 -200 400 400">',
  '<polygon points="-40,-15 40,-15 40,15 -40,15" />',
  '<circle cx="0" cy="0" r="8" />',
  '</svg>'
].join('\n'))

const dxf = ['0', 'SECTION', '2', 'ENTITIES']
const dxfRect = [[-40, -15], [40, -15], [40, 15], [-40, 15]]
for (let i = 0; i < dxfRect.length; i++) {
  const [x1, y1] = dxfRect[i]
  const [x2, y2] = dxfRect[(i + 1) % dxfRect.length]
  dxf.push('0', 'LINE', '8', 'OUTLINE', '10', String(x1), '20', String(y1), '11', String(x2), '21', String(y2))
}
dxf.push('0', 'CIRCLE', '8', 'HOLES', '10', '0', '20', '0', '40', '8')
dxf.push('0', 'ENDSEC', '0', 'EOF')
write('profile.dxf', dxf.join('\n'))

/* ───────────────────────────── other importers ──────────────────────────── */

write('bracket.scad', [
  '// MyCAD sample: the subset of OpenSCAD the importer understands.',
  'union(){',
  '  cube(30);',
  '  translate([20,0,0]) sphere(10);',
  '}'
].join('\n'))

const scanLines = ['# x y z scanned points on a tilted plane']
for (let i = 0; i <= 6; i++) {
  for (let j = 0; j <= 6; j++) {
    const x = i * 10
    const z = j * 10
    const y = 5 + x * 0.2 + z * 0.1
    scanLines.push(`${x.toFixed(2)} ${y.toFixed(2)} ${z.toFixed(2)}`)
  }
}
write('scan-points.asc', scanLines.join('\n'))

// The same cloud in the bare .xyz form, which has no header line.
write('scan-points.xyz', scanLines.filter((line) => !line.startsWith('#')).join('\n'))

write('building.ifc', [
  'ISO-10303-21;',
  'HEADER;',
  "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
  "FILE_NAME('MyCAD sample','1970-01-01T00:00:00.000Z',('MyCAD'),('MyCAD'),'MyCAD','MyCAD','');",
  "FILE_SCHEMA(('IFC4'));",
  'ENDSEC;',
  'DATA;',
  "#1=IFCPROJECT('0PROJECT0000000000000',$,'MyCAD sample',$,$,$,$,$,$);",
  "#2=IFCSITE('0SITE00000000000000000',$,'Site',$,$,$,$,$,.ELEMENT.,$,$,$,$,$);",
  "#3=IFCBUILDING('0BUILDING00000000000',$,'Building',$,$,$,$,$,.ELEMENT.,$,$,$);",
  "#10=IFCBUILDINGSTOREY('0STOREY00000000000000',$,'Level 1',$,$,$,$,$,.ELEMENT.,0);",
  "#11=IFCBUILDINGSTOREY('0STOREY00000000000001',$,'Level 2',$,$,$,$,$,.ELEMENT.,3000);",
  "#20=IFCWALLSTANDARDCASE('wall-1000000000000000',$,'Wall','wall Level 1',$,$,$,$,$);",
  "#21=IFCPROPERTYSINGLEVALUE('Material',$,IFCLABEL('Concrete'),$);",
  "#22=IFCSLAB('slab-1000000000000000',$,'Slab','slab Level 1',$,$,$,$,$);",
  "#23=IFCPROPERTYSINGLEVALUE('Material',$,IFCLABEL('Concrete'),$);",
  "#24=IFCWINDOW('window-10000000000000',$,'Window','window Level 1',$,$,$,$,$);",
  "#25=IFCPROPERTYSINGLEVALUE('Material',$,IFCLABEL('Aluminium'),$);",
  'ENDSEC;',
  'END-ISO-10303-21;'
].join('\n'))

/* ───────────────────────────── CAM and tables ───────────────────────────── */

const gcode = ['( MYCAD SAMPLE - pocket )', 'G21', 'G90', 'G17', 'G94', 'T1 M6', 'S12000 M3']
for (let pass = 1; pass <= 3; pass++) {
  const z = (-pass).toFixed(3)
  gcode.push('G0 X-17.000 Y-7.000 Z5.000')
  gcode.push(`G1 X-17.000 Y-7.000 Z${z} F200`)
  gcode.push(`G1 X17.000 Y-7.000 Z${z} F600`)
  gcode.push(`G1 X17.000 Y7.000 Z${z} F600`)
  gcode.push(`G1 X-17.000 Y7.000 Z${z} F600`)
  gcode.push(`G1 X-17.000 Y-7.000 Z${z} F600`)
}
gcode.push('M5', 'M30')
write('pocket.nc', gcode.join('\n'))
// Same toolpath under the other G-code extension the app accepts.
write('profile.gcode', gcode.join('\n'))

write('parameters.csv', [
  'Width,Height,Thickness,Area',
  '40,25,2,1000',
  '80,50,4,4000',
  '120,75,6,9000'
].join('\n'))

write('design-table.csv', [
  '# CATIA style design table: one row per configuration',
  'Width,Height,Thickness',
  '40,25,2',
  '80,50,4',
  '120,75,6'
].join('\n'))

write('spreadsheet.csv', [
  'Width,80',
  'Depth,50',
  'Area,=B1*B2',
  'Total,=sum(B1:B3)'
].join('\n'))

write('macro.mycadmacro', [
  '# MyCAD macro sample',
  'box(40, 20, 10)',
  'move(20, 0, 0)',
  'pad(sketch, 12)',
  'fillet(2)'
].join('\n'))

write('macro.py', [
  '# MyCAD Python macro - runs in the sandboxed interpreter',
  'import Part',
  'import math',
  '',
  'doc = App.newDocument("Bracket")',
  '',
  'def plate(width, depth, thickness):',
  '    return Part.makeBox(width, depth, thickness)',
  '',
  'base = plate(80, 50, 10)',
  'boss = Part.makeCylinder(12, 30)',
  'hole = Part.makeCylinder(6, 40)',
  'part = base + boss - hole',
  '',
  'obj = doc.addObject("Part::Feature", "Bracket")',
  'obj.Shape = part',
  'doc.recompute()',
  '',
  'print("volume", round(part.Volume, 1), "mm3")',
  'print("area", round(part.Area, 1), "mm2")',
  'for i in range(3):',
  '    print("hole", i + 1, "at", i * 20)'
].join('\n'))

const addonManifest = JSON.stringify({
  id: 'hex-nuts',
  name: { ko: '육각 너트', en: 'Hex nuts' },
  version: '1.0.0',
  author: 'MyCAD sample',
  description: { ko: '샘플 애드온: 육각 너트를 만듭니다.', en: 'Sample addon: makes a hex nut.' },
  kind: 'macro',
  requires: '1.0.0',
  commands: [
    {
      id: 'sampleHexNut',
      label: { ko: 'M10 너트', en: 'M10 nut' },
      icon: '⬡',
      macro: [
        'import Part',
        'body = Part.makePrism(6, 9, 8)',
        'bore = Part.makeCylinder(5, 12)',
        'nut = body - bore',
        'print("nut volume", round(nut.Volume, 1))',
        'Part.show(nut)'
      ].join('\n')
    }
  ]
}, null, 2)

// The same package under both names: the plain manifest, and the
// extension the installer associates with MyCAD.
write('addon-manifest.json', addonManifest)
write('hex-nuts.mycadaddon', addonManifest)

/* ───────────────────────────── manifest + README ────────────────────────── */

const DESCRIPTIONS = {
  'box.mycad': '기본 박스 한 개 (파일 열기/저장 확인)',
  'primitives.mycad': '박스·구·원기둥·원뿔·토러스·평면 6종',
  'sketch-pad.mycad': '스케치 + 패드 피처 + 파라미터 수식',
  'assembly.mycad': '3개 부품 + 구속(mate) + 파라미터 (어셈블리/BOM/관성)',
  'patterns.mycad': '선형/원형 패턴 결과',
  'mesh-pyramid.mycad': '메쉬 솔리드 (메쉬 평가·감축·세분 테스트)',
  'bim-house.mycad': 'BIM 요소·층 정보가 든 건물 (수량 산출/IFC 내보내기)',
  'sketchup-scene.mycad': '그룹·태그·장면·단면 평면이 든 SketchUp 스타일 모델',
  'spreadsheet.mycad': '별칭과 수식이 든 스프레드시트',
  'sheetmetal-bracket.mycad': '시트메탈 월/플랜지 (전개도·성형성 검사)',
  'fem-beam.mycad': 'FEM 해석 컨테이너와 구속/하중이 든 외팔보',
  'kinematics-crank.mycad': '회전·직선 조인트가 든 크랭크 슬라이더',
  'cube.stl': 'ASCII STL 큐브 (STL 가져오기)',
  'cube.step': 'STEP AP214 큐브 (STEP 가져오기/내보내기 왕복)',
  'plate.ply': 'PLY 메쉬 플레이트 (ASCII)',
  'wedge.off': 'OFF 메쉬 피라미드 (Geomview)',
  'profile.igs': 'IGES 와이어프레임 사각 프로파일',
  'bracket.dae': 'Collada 삼각형 메쉬 브래킷',
  'pyramid.stl': 'ASCII STL 사각뿔',
  'plate.obj': 'OBJ 메쉬',
  'profile.svg': 'SVG 프로파일 도면',
  'profile.dxf': 'DXF 프로파일 도면 (LINE + CIRCLE)',
  'bracket.scad': 'OpenSCAD 소스 (importOpenScad)',
  'scan-points.asc': '기울어진 평면 위 점군 49개 (평면/구/곡면 근사)',
  'building.ifc': 'IFC4 건물 (IFC 가져오기)',
  'pocket.nc': 'G코드 포켓 가공 (3패스)',
  'parameters.csv': '파라미터 표 (CSV 읽기)',
  'design-table.csv': 'CATIA 디자인 테이블 3구성',
  'spreadsheet.csv': '수식이 든 CSV 시트',
  'macro.mycadmacro': '매크로 스크립트 샘플',
  'macro.py': 'Python 매크로 (Part API, 불리언, 반복문)',
  'scan-points.xyz': '같은 점군의 XYZ 형식 (헤더 없음)',
  'profile.gcode': '같은 포켓 가공 경로의 .gcode 형식',
  'hex-nuts.mycadaddon': '설치용 애드온 패키지 (.mycadaddon 연결 테스트)',
  'addon-manifest.json': '애드온 매니페스트 (설치/실행 테스트)'
}

write('manifest.json', JSON.stringify({
  generator: 'scripts/create-samples.mjs',
  files: written.filter((name) => name !== 'manifest.json').map((name) => ({ name, description: DESCRIPTIONS[name] ?? '' }))
}, null, 2))

const readme = ['# sample', '', 'MyCAD 기능 테스트용 샘플 파일입니다. `npm run build:samples` 로 다시 만들 수 있고,', '`tests/samples.test.ts` 가 앱과 동일한 파서로 모든 파일을 읽어 검증합니다.', '', '| 파일 | 설명 |', '| --- | --- |']
for (const name of written) {
  if (name === 'manifest.json') continue
  readme.push(`| \`${name}\` | ${DESCRIPTIONS[name] ?? ''} |`)
}
readme.push('', '## 사용법', '', '- `.mycad`: 파일 > 열기 로 불러옵니다.', '- `.stl`: 파일 > STL 가져오기.', '- `.asc`: 점 워크벤치 > 점 가져오기 후 역설계 근사 명령.', '- `.scad`: OpenSCAD 워크벤치 > OpenSCAD 가져오기.', '- `.ifc`: 건축 메뉴 > IFC 관련 명령으로 확인.', '- `.csv`: 스프레드시트 / 지식공학(디자인 테이블).', '- `.nc`, `.svg`, `.dxf`, `.obj`: 내보내기 결과 비교용 기준 파일.')
write('README.md', readme.join('\n'))

console.log(`sample/: ${written.length} files`)
for (const name of written) console.log(`  ${name}`)
