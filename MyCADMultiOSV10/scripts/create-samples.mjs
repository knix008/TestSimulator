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

import { toBinaryPly, toIges, toOff, toPly, toStep } from '../src/core/cadformats.ts'
import { writeBinaryStl } from '../src/core/stl.ts'

const written = []

function write(name, text) {
  writeFileSync(join(out, name), text.endsWith('\n') ? text : `${text}\n`, 'utf8')
  written.push(name)
}

function writeBytes(name, bytes) {
  writeFileSync(join(out, name), bytes)
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

/** Ring of triangles between two rings of points (a tube wall or a rim). */
function skirt(lower, upper) {
  const out = []
  for (let i = 0; i < lower.length; i++) {
    const j = (i + 1) % lower.length
    out.push([lower[i], lower[j], upper[j]], [lower[i], upper[j], upper[i]])
  }
  return out
}

function ring(radius, y, segments, centre = [0, 0]) {
  return Array.from({ length: segments }, (unused, i) => {
    const angle = (Math.PI * 2 * i) / segments
    return [centre[0] + Math.cos(angle) * radius, y, centre[1] + Math.sin(angle) * radius]
  })
}

/** Solid cylinder: wall plus a fan for each cap. */
function cylinderTriangles(radius, height, y = 0, segments = 24, centre = [0, 0]) {
  const bottom = ring(radius, y, segments, centre)
  const top = ring(radius, y + height, segments, centre)
  const out = skirt(bottom, top)
  const bottomCentre = [centre[0], y, centre[1]]
  const topCentre = [centre[0], y + height, centre[1]]
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments
    out.push([bottomCentre, bottom[j], bottom[i]], [topCentre, top[i], top[j]])
  }
  return out
}

/** Triangles filling the band between two closed loops of the same length. */
function ringFace(inner, outer) {
  const out = []
  for (let i = 0; i < inner.length; i++) {
    const j = (i + 1) % inner.length
    out.push([inner[i], outer[i], outer[j]], [inner[i], outer[j], inner[j]])
  }
  return out
}

/** Points along a rectangle's outline, evenly spaced, starting bottom left. */
function rectangleLoop(width, depth, y, segments) {
  const x0 = -width / 2, x1 = width / 2
  const z0 = -depth / 2, z1 = depth / 2
  return Array.from({ length: segments }, (unused, i) => {
    const u = (i / segments) * 4
    if (u < 1) return [x0 + (x1 - x0) * u, y, z0]
    if (u < 2) return [x1, y, z0 + (z1 - z0) * (u - 1)]
    if (u < 3) return [x1 - (x1 - x0) * (u - 2), y, z1]
    return [x0, y, z1 - (z1 - z0) * (u - 3)]
  })
}

/**
 * Plate with a round hole through the middle: outer wall, hole wall and two
 * faces filled as a band between the outline and the hole. Closed, so its
 * volume is exactly (width * depth - hole area) * thickness.
 */
function plateWithHole(width, depth, thickness, radius, segments = 48) {
  const outerBottom = rectangleLoop(width, depth, 0, segments)
  const outerTop = rectangleLoop(width, depth, thickness, segments)
  const holeBottom = ring(radius, 0, segments)
  const holeTop = ring(radius, thickness, segments)
  return [
    ...skirt(outerBottom, outerTop),
    ...skirt(holeTop, holeBottom),
    ...ringFace(holeBottom, outerBottom).map(([a, b, c]) => [a, c, b]),
    ...ringFace(holeTop, outerTop)
  ]
}

/** Spur gear: toothed rim, centre bore, and faces filled between the two. */
function gearTriangles(teeth, rootRadius, tipRadius, thickness, bore = 8) {
  const profile = []
  for (let i = 0; i < teeth; i++) {
    const step = (Math.PI * 2) / teeth
    const base = i * step
    for (const [fraction, radius] of [[0, rootRadius], [0.22, tipRadius], [0.5, tipRadius], [0.72, rootRadius]]) {
      const angle = base + step * fraction
      profile.push([Math.cos(angle) * radius, 0, Math.sin(angle) * radius])
    }
  }
  const lift = (points, y) => points.map(([x, unused, z]) => [x, y, z])
  const profileTop = lift(profile, thickness)
  const boreBottom = ring(bore, 0, profile.length)
  const boreTop = ring(bore, thickness, profile.length)
  return [
    ...skirt(profile, profileTop),
    ...skirt(boreTop, boreBottom),
    ...ringFace(boreBottom, profile).map(([a, b, c]) => [a, c, b]),
    ...ringFace(boreTop, profileTop)
  ]
}

/** Triangles of a cap: the loop closed onto its centre point. */
function fanFace(loop, centre, upward) {
  return loop.map((point, i) => {
    const next = loop[(i + 1) % loop.length]
    return upward ? [centre, point, next] : [centre, next, point]
  })
}

/**
 * Ziggurat: a stepped pyramid of square tiers, walls and steps all filled, so
 * it stays a closed solid however many tiers it has.
 */
function steppedPyramidTriangles(base, tiers, tierHeight) {
  const widths = Array.from({ length: tiers + 1 }, (unused, i) => base * (1 - i / (tiers + 1)))
  const loopAt = (width, y) => rectangleLoop(width, width, y, 4)
  const out = [...fanFace(loopAt(widths[0], 0), [0, 0, 0], false)]
  let y = 0
  for (let i = 0; i < tiers; i++) {
    const lower = loopAt(widths[i], y)
    const upper = loopAt(widths[i], y + tierHeight)
    out.push(...skirt(lower, upper))
    // The step back to the next, narrower tier.
    out.push(...ringFace(loopAt(widths[i + 1], y + tierHeight), upper))
    y += tierHeight
  }
  out.push(...fanFace(loopAt(widths[tiers], y), [0, y, 0], true))
  return out
}

/** Unit normal of a triangle, for formats that carry them. */
function normalOf([a, b, c]) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
  const length = Math.hypot(...n) || 1
  return n.map((value) => value / length)
}

/** L-bracket with a rib and mounting holes: several features in one mesh. */
function bracketTriangles() {
  return [
    ...boxTriangles(70, 10, 50, [0, 0, 0]),
    ...boxTriangles(10, 55, 50, [-30, 10, 0]),
    ...boxTriangles(6, 34, 26, [-20, 10, 0]),
    ...cylinderTriangles(5, 12, 10, 16, [18, -14]),
    ...cylinderTriangles(5, 12, 10, 16, [18, 14])
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

// A five-tier ziggurat rather than a bare pyramid: steps, walls and two caps.
const ziggurat = steppedPyramidTriangles(60, 5, 9)

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
  solids: [
    meshSolid('sol-1', 'pad-sketch-1', plateWithHole(80, 50, 12, 9, 24), '#4cc2ff'),
    meshSolid('sol-2', 'pad-sketch-2', cylinderTriangles(14, 26, 12, 24, [24, 0]), '#7dcea0'),
    meshSolid('sol-3', 'pocket-sketch-3', boxTriangles(24, 6, 18, [-22, 9, 0]), '#f0a35e')
  ],
  sketches: [
    sketch('sketch-1', 'rect', 80, 50),
    sketch('sketch-2', 'circle', 28, 28, 6, 'xz'),
    sketch('sketch-3', 'polygon', 24, 18, 6),
    sketch('sketch-4', 'rect', 30, 12, 4, 'yz')
  ],
  features: [
    feature('feat-1', 'Sketch', 'sketch', [], { length: 0.4 }),
    feature('feat-2', 'Pad', 'pad', ['sol-1'], { length: 12 }),
    feature('feat-3', 'Boss', 'pad', ['sol-2'], { length: 26 }),
    feature('feat-4', 'Pocket', 'pocket', ['sol-3'], { length: 6 }),
    feature('feat-5', 'Hole', 'hole', ['sol-1'], { radius: 9 }),
    feature('feat-6', 'Fillet', 'fillet', ['sol-1'], { radius: 3 })
  ],
  parameters: [
    { name: 'Length', value: 80, formula: '' },
    { name: 'Width', value: 40, formula: 'Length / 2' },
    { name: 'Height', value: 50, formula: '' },
    { name: 'PadLength', value: 12, formula: 'Width / 4 + 2' },
    { name: 'BossRadius', value: 14, formula: 'Height / 4 + 1.5' },
    { name: 'HoleRadius', value: 9, formula: 'BossRadius - 5' },
    { name: 'FilletRadius', value: 3, formula: 'HoleRadius / 3' }
  ]
}))

// A bearing stand: plate, posts, bearing block, shaft, pulley and fasteners,
// so the assembly commands have a real tree and several mates to work through.
write('assembly.mycad', document('assembly', {
  solids: [
    solid({ id: 'sol-1', name: 'Base', size: { x: 120, y: 12, z: 80, radius: 20, tube: 6 }, position: { x: 0, y: 6, z: 0 }, color: '#9aa7b4' }),
    solid({ id: 'sol-2', name: 'Post', kind: 'cylinder', size: { x: 20, y: 60, z: 20, radius: 10, tube: 6 }, position: { x: -40, y: 42, z: 0 }, color: '#d6dee6' }),
    solid({ id: 'sol-3', name: 'Post-2', kind: 'cylinder', size: { x: 20, y: 60, z: 20, radius: 10, tube: 6 }, position: { x: 40, y: 42, z: 0 }, color: '#d6dee6' }),
    solid({ id: 'sol-4', name: 'Bearing block', size: { x: 40, y: 30, z: 40, radius: 20, tube: 6 }, position: { x: 0, y: 87, z: 0 }, color: '#8fb8ff' }),
    solid({ id: 'sol-5', name: 'Shaft', kind: 'cylinder', size: { x: 16, y: 140, z: 16, radius: 8, tube: 6 }, position: { x: 0, y: 87, z: 0 }, rotation: { x: 0, y: 0, z: 90 }, color: '#c0c6cc' }),
    solid({ id: 'sol-6', name: 'Pulley', kind: 'torus', size: { x: 60, y: 60, z: 60, radius: 26, tube: 8 }, position: { x: 62, y: 87, z: 0 }, rotation: { x: 0, y: 0, z: 90 }, color: '#f5d76e' }),
    solid({ id: 'sol-7', name: 'Cap', kind: 'sphere', size: { x: 24, y: 24, z: 24, radius: 12, tube: 6 }, position: { x: 0, y: 110, z: 0 }, color: '#f0a35e' }),
    solid({ id: 'sol-8', name: 'Bolt', kind: 'cylinder', size: { x: 10, y: 24, z: 10, radius: 5, tube: 6 }, position: { x: -48, y: 12, z: 28 }, color: '#6f7b87' }),
    solid({ id: 'sol-9', name: 'Bolt-2', kind: 'cylinder', size: { x: 10, y: 24, z: 10, radius: 5, tube: 6 }, position: { x: 48, y: 12, z: 28 }, color: '#6f7b87' }),
    solid({ id: 'sol-10', name: 'Bolt-3', kind: 'cylinder', size: { x: 10, y: 24, z: 10, radius: 5, tube: 6 }, position: { x: -48, y: 12, z: -28 }, color: '#6f7b87' }),
    solid({ id: 'sol-11', name: 'Bolt-4', kind: 'cylinder', size: { x: 10, y: 24, z: 10, radius: 5, tube: 6 }, position: { x: 48, y: 12, z: -28 }, color: '#6f7b87' })
  ],
  mates: [
    { id: 'mate-1', kind: 'coincidence', a: 'Base', b: 'Post', value: 0 },
    { id: 'mate-2', kind: 'offset', a: 'Post', b: 'Cap', value: 36 },
    { id: 'mate-3', kind: 'fix', a: 'Bearing block', b: 'Shaft', value: 0 },
    { id: 'mate-4', kind: 'angle', a: 'Shaft', b: 'Pulley', value: 90 },
    { id: 'mate-5', kind: 'offset', a: 'Post', b: 'Post-2', value: 80 },
    { id: 'mate-6', kind: 'offset', a: 'Base', b: 'Bearing block', value: 75 }
  ],
  parameters: [
    { name: 'PostHeight', value: 60, formula: '' },
    { name: 'CapRadius', value: 12, formula: 'PostHeight / 5' },
    { name: 'ShaftLength', value: 140, formula: '' },
    { name: 'PulleyRadius', value: 26, formula: 'ShaftLength / 5 - 2' },
    { name: 'BoltCount', value: 4, formula: '' }
  ],
  features: [
    feature('feat-1', 'Assembly', 'assembly', ['sol-1', 'sol-2', 'sol-3', 'sol-4'], { count: 4 }),
    feature('feat-2', 'Shaft', 'shaft', ['sol-5'], { length: 140, radius: 8 }),
    feature('feat-3', 'Bolt pattern', 'rectPattern', ['sol-8', 'sol-9', 'sol-10', 'sol-11'], { count: 4, length: 96 }),
    feature('feat-4', 'Mates', 'mate', ['sol-4', 'sol-5', 'sol-6'], { count: 6 })
  ]
}))

// A plate carrying a 4x3 linear grid of teeth and a ring of eight pins, which
// is what the pattern commands are meant to produce.
const patternTeeth = []
for (let row = 0; row < 3; row++) {
  for (let column = 0; column < 4; column++) {
    patternTeeth.push(solid({
      id: `sol-t${row}${column}`,
      name: row === 0 && column === 0 ? 'Tooth' : `Tooth-${row * 4 + column + 1}`,
      size: { x: 12, y: 24, z: 12, radius: 6, tube: 2 },
      position: { x: column * 30, y: 12, z: row * 30 },
      color: '#8fb8ff'
    }))
  }
}
const patternPins = Array.from({ length: 8 }, (unused, index) => {
  const angle = (Math.PI * 2 * index) / 8
  return solid({
    id: `sol-p${index}`,
    name: index === 0 ? 'Pin' : `Pin-${index + 1}`,
    kind: 'cylinder',
    size: { x: 10, y: 20, z: 10, radius: 5, tube: 2 },
    position: { x: 45 + Math.cos(angle) * 60, y: 10, z: 30 + Math.sin(angle) * 60 },
    rotation: { x: 0, y: (index * 360) / 8, z: 0 },
    color: '#f5d76e'
  })
})
write('patterns.mycad', document('patterns', {
  solids: [
    solid({ id: 'sol-1', name: 'Plate', size: { x: 240, y: 8, z: 200, radius: 20, tube: 6 }, position: { x: 45, y: 4, z: 30 }, color: '#9aa7b4' }),
    ...patternTeeth,
    ...patternPins
  ],
  features: [
    feature('feat-1', 'Plate', 'primitive', ['sol-1']),
    feature('feat-2', 'linearArray', 'pattern', patternTeeth.slice(1, 4).map((item) => item.id), { count: 4, length: 30 }),
    feature('feat-3', 'rectArray', 'rectPattern', patternTeeth.slice(4).map((item) => item.id), { count: 8, length: 30 }),
    feature('feat-4', 'polarArray', 'pattern', patternPins.map((item) => item.id), { count: 8, radius: 60 }),
    feature('feat-5', 'mirror', 'mirror', ['sol-t02', 'sol-t03'], { count: 2 })
  ],
  parameters: [
    { name: 'Pitch', value: 30, formula: '' },
    { name: 'Rows', value: 3, formula: '' },
    { name: 'Columns', value: 4, formula: '' },
    { name: 'PinCount', value: 8, formula: 'Rows + Columns + 1' }
  ]
}))

write('mesh-pyramid.mycad', document('mesh-pyramid', {
  solids: [
    meshSolid('sol-1', 'Stepped pyramid', ziggurat, '#f1948a'),
    { ...meshSolid('sol-2', 'Gear', gearTriangles(14, 22, 30, 8, 6), '#7dcea0'), position: { x: 100, y: 0, z: 0 } },
    { ...meshSolid('sol-3', 'Holed plate', plateWithHole(70, 45, 6, 8, 24), '#8fb8ff'), position: { x: -100, y: 0, z: 0 } }
  ],
  features: [
    feature('feat-1', 'Stepped pyramid', 'primitive', ['sol-1']),
    feature('feat-2', 'Gear', 'meshOp', ['sol-2'], { count: 14 }),
    feature('feat-3', 'Holed plate', 'meshOp', ['sol-3'], { radius: 8 })
  ]
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
// A fixed stamp keeps the generated samples byte-identical between runs.
const SAMPLE_STAMP = new Date('2026-01-01T00:00:00.000Z')
const flatten = (triangles) => triangles.flatMap((triangle) => triangle.flat())

// The cube stays as the smallest possible smoke test; the rest carry parts
// with holes, ribs and teeth, so importers meet real geometry.
const cubeTriangles = flatten(boxTriangles(40, 40, 40, [0, 0, 0]))
writeBytes('cube-binary.stl', writeBinaryStl(cubeTriangles))
const cubeStep = toStep([{ name: 'cube', position: { x: 0, y: 0, z: 0 } }], () => cubeTriangles, SAMPLE_STAMP)
write('cube.step', cubeStep)
write('cube.stp', cubeStep)

const bracketMesh = flatten(bracketTriangles())
write('bracket.step', toStep([{ name: 'bracket', position: { x: 0, y: 0, z: 0 } }], () => bracketMesh, SAMPLE_STAMP))

const plateMesh = flatten(plateWithHole(90, 60, 8, 12))
write('plate.ply', toPly(plateMesh, 'mount plate with five holes'))
writeBytes('plate-binary.ply', toBinaryPly(plateMesh))

const gearMesh = flatten(gearTriangles(18, 26, 34, 10, 8))
write('gear.off', toOff(gearMesh))
write('gear.stl', asciiStl('gear', gearTriangles(18, 26, 34, 10, 8)))
write('wedge.off', toOff(flatten(pyramidTriangles(50, 40))))
const igesWires = [
  {
    id: 'w1',
    name: 'outline',
    closed: true,
    points: [
      { x: -45, y: 0, z: -30 },
      { x: 45, y: 0, z: -30 },
      { x: 45, y: 0, z: 30 },
      { x: -45, y: 0, z: 30 },
      { x: -45, y: 0, z: -30 }
    ]
  },
  {
    id: 'w2',
    name: 'slot',
    closed: true,
    points: [
      { x: -10, y: 0, z: -8 },
      { x: 10, y: 0, z: -8 },
      { x: 10, y: 0, z: 8 },
      { x: -10, y: 0, z: 8 },
      { x: -10, y: 0, z: -8 }
    ]
  },
  // Four bolt circles, approximated as 12-segment polygons.
  ...[[-30, -18], [30, -18], [-30, 18], [30, 18]].map(([cx, cz], index) => ({
    id: `w-hole-${index}`,
    name: `hole ${index + 1}`,
    closed: true,
    points: Array.from({ length: 13 }, (unused, i) => {
      const angle = (Math.PI * 2 * i) / 12
      return { x: cx + Math.cos(angle) * 5, y: 0, z: cz + Math.sin(angle) * 5 }
    })
  }))
]
const igesText = toIges(igesWires, SAMPLE_STAMP)
write('profile.igs', igesText)
write('profile.iges', igesText)
write('assembly.dae', [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">',
  '  <asset><up_axis>Y_UP</up_axis></asset>',
  '  <library_geometries>',
  // Three parts in one file: a housing, a shaft and a cover plate.
  ...[
    ['housing', flatten(boxTriangles(60, 30, 40, [0, 0, 0]))],
    ['shaft', flatten(cylinderTriangles(6, 70, 8, 16, [0, 0]))],
    ['cover', flatten(plateWithHole(60, 40, 4, 9, 24))]
  ].flatMap(([name, mesh]) => {
    const count = mesh.length / 3
    return [
      `    <geometry id="${name}" name="${name}"><mesh>`,
      `      <source id="${name}-positions">`,
      `        <float_array id="${name}-array" count="${mesh.length}">${mesh.map((value) => value.toFixed(3)).join(' ')}</float_array>`,
      '      </source>',
      `      <vertices id="${name}-vertices"><input semantic="POSITION" source="#${name}-positions"/></vertices>`,
      `      <triangles count="${count / 3}" material="none">`,
      `        <input semantic="VERTEX" source="#${name}-vertices" offset="0"/>`,
      `        <p>${Array.from({ length: count }, (unused, i) => i).join(' ')}</p>`,
      '      </triangles>',
      '    </mesh></geometry>'
    ]
  }),
  '  </library_geometries>',
  '</COLLADA>'
].join('\n'))
write('pyramid.stl', asciiStl('stepped pyramid', ziggurat))

// Three named groups, with normals and v//vn faces, so the OBJ reader meets
// grouping, normal indices and a part that has a hole in it.
const objParts = [
  ['Plate', plateWithHole(80, 50, 6, 10, 24)],
  ['Boss', cylinderTriangles(9, 16, 6, 20, [0, 0])],
  ['Rib', boxTriangles(6, 20, 40, [-31, 16, 0])]
]
const objLines = ['# MyCAD sample OBJ: a holed plate with a boss and a stiffening rib']
let objVertex = 1
let objNormal = 1
for (const [name, triangles] of objParts) {
  objLines.push(`o ${name}`, `g ${name}`)
  for (const triangle of triangles) {
    for (const vertex of triangle) objLines.push(`v ${vertex.map((value) => value.toFixed(3)).join(' ')}`)
  }
  for (const triangle of triangles) objLines.push(`vn ${normalOf(triangle).map((value) => value.toFixed(4)).join(' ')}`)
  triangles.forEach((unused, index) => {
    const v = objVertex + index * 3
    const n = objNormal + index
    objLines.push(`f ${v}//${n} ${v + 1}//${n} ${v + 2}//${n}`)
  })
  objVertex += triangles.length * 3
  objNormal += triangles.length
}
write('plate.obj', objLines.join('\n'))

/* ───────────────────────────── 2D drawings ──────────────────────────────── */

// A gasket outline: chamfered outer profile, an inner window, a slot and the
// bolt circles, so the SVG reader meets polygons, a polyline and many circles.
const svgBolts = [[-60, -30], [0, -30], [60, -30], [-60, 30], [0, 30], [60, 30]]
write('profile.svg', [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-120 -80 240 160">',
  '<g id="outline">',
  '<polygon points="-70,-40 70,-40 80,-30 80,30 70,40 -70,40 -80,30 -80,-30" />',
  '<polygon points="-45,-20 45,-20 45,20 -45,20" />',
  '</g>',
  '<polyline points="-15,-6 15,-6 15,6 -15,6 -15,-6" />',
  ...svgBolts.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="5" />`),
  '</svg>'
].join('\n'))

const dxf = ['0', 'SECTION', '2', 'ENTITIES']
const dxfLoop = (points, layer) => {
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    dxf.push('0', 'LINE', '8', layer, '10', String(x1), '20', String(y1), '11', String(x2), '21', String(y2))
  }
}
// The same gasket as the SVG: outer profile with chamfers, window and slot.
dxfLoop([[-70, -40], [70, -40], [80, -30], [80, 30], [70, 40], [-70, 40], [-80, 30], [-80, -30]], 'OUTLINE')
dxfLoop([[-45, -20], [45, -20], [45, 20], [-45, 20]], 'WINDOW')
dxfLoop([[-15, -6], [15, -6], [15, 6], [-15, 6]], 'SLOT')
for (const [cx, cy] of [[-60, -30], [0, -30], [60, -30], [-60, 30], [0, 30], [60, 30]]) {
  dxf.push('0', 'CIRCLE', '8', 'HOLES', '10', String(cx), '20', String(cy), '40', '5')
}
// Centre marks on the middle hole, drawn on their own layer.
for (const [[x1, y1], [x2, y2]] of [[[-8, 0], [8, 0]], [[0, -8], [0, 8]]]) {
  dxf.push('0', 'LINE', '8', 'CENTRE', '10', String(x1), '20', String(y1), '11', String(x2), '21', String(y2))
}
dxf.push('0', 'ENDSEC', '0', 'EOF')
write('profile.dxf', dxf.join('\n'))

/* ───────────────────────────── other importers ──────────────────────────── */

write('bracket.scad', [
  '// MyCAD sample: the subset of OpenSCAD the importer understands.',
  '// A base plate with a boss and a post, with two bores taken back out.',
  'difference(){',
  '  union(){',
  '    cube([80,50,10]);',
  '    translate([10,10,10]) cylinder(h=24, r=12);',
  '    translate([55,15,10]) cube([20,20,30]);',
  '    translate([65,25,40]) sphere(9);',
  '  }',
  '  translate([10,10,0]) cylinder(h=40, r=6);',
  '  translate([65,25,0]) cylinder(h=20, r=5);',
  '}'
].join('\n'))

// A denser cloud, still exactly on a tilted plane so the fit stays meaningful.
const scanLines = ['# x y z scanned points on a tilted plane']
for (let i = 0; i <= 12; i++) {
  for (let j = 0; j <= 12; j++) {
    const x = i * 5
    const z = j * 5
    const y = 5 + x * 0.2 + z * 0.1
    scanLines.push(`${x.toFixed(2)} ${y.toFixed(2)} ${z.toFixed(2)}`)
  }
}
write('scan-points.asc', scanLines.join('\n'))

// The same cloud in the bare .xyz form, which has no header line.
write('scan-points.xyz', scanLines.filter((line) => !line.startsWith('#')).join('\n'))

/**
 * A four-storey building: every storey carries walls, a slab, columns, windows
 * and a door, and the roof sits on top — enough entities for the IFC importer
 * and the schedule to have something to count.
 */
function ifcBody() {
  const storeys = ['Basement', 'Level 1', 'Level 2', 'Roof Terrace']
  const lines = []
  let id = 10
  storeys.forEach((name, index) => {
    lines.push(`#${id++}=IFCBUILDINGSTOREY('0STOREY${String(index).padStart(14, '0')}',$,'${name}',$,$,$,$,$,.ELEMENT.,${index * 3000 - 3000});`)
  })
  const material = {
    IFCWALLSTANDARDCASE: 'Concrete', IFCSLAB: 'Concrete', IFCCOLUMN: 'Steel',
    IFCBEAM: 'Steel', IFCWINDOW: 'Aluminium', IFCDOOR: 'Oak', IFCROOF: 'Timber',
    IFCSTAIR: 'Concrete', IFCRAILING: 'Steel'
  }
  const place = (type, name, storey) => {
    lines.push(`#${id++}=${type}('${`${name}-${storey}`.padEnd(22, '0').slice(0, 22)}',$,'${name}','${type} ${storeys[storey]}',$,$,$,$,$);`)
    lines.push(`#${id++}=IFCPROPERTYSINGLEVALUE('Material',$,IFCLABEL('${material[type]}'),$);`)
  }
  storeys.forEach((unused, storey) => {
    place('IFCSLAB', 'Slab', storey)
    for (let i = 0; i < 4; i++) place('IFCWALLSTANDARDCASE', 'Wall', storey)
    for (let i = 0; i < 2; i++) place('IFCCOLUMN', 'Column', storey)
    place('IFCBEAM', 'Beam', storey)
    if (storey > 0) {
      place('IFCWINDOW', 'Window', storey)
      place('IFCSTAIR', 'Stair', storey)
    }
    if (storey === 1) place('IFCDOOR', 'Door', storey)
  })
  place('IFCROOF', 'Roof', storeys.length - 1)
  place('IFCRAILING', 'Railing', storeys.length - 1)
  return lines
}

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
  ...ifcBody(),
  'ENDSEC;',
  'END-ISO-10303-21;'
].join('\n'))

/* ───────────────────────────── CAM and tables ───────────────────────────── */

// Roughing pocket: four depth passes, each one spiralling inwards, then the
// bolt holes drilled with a peck cycle and a finishing tool.
const gcode = ['( MYCAD SAMPLE - pocket and drill )', 'G21', 'G90', 'G17', 'G94', 'G40 G49 G80', 'T1 M6', '( 12 MM ROUGHER )', 'S12000 M3', 'M8']
for (let pass = 1; pass <= 4; pass++) {
  const z = (-pass * 1.5).toFixed(3)
  gcode.push(`( PASS ${pass} )`)
  gcode.push('G0 X-30.000 Y-15.000 Z5.000')
  gcode.push(`G1 Z${z} F200`)
  for (const [inset, feed] of [[0, 600], [6, 600], [12, 500]]) {
    const x = (30 - inset).toFixed(3)
    const y = (15 - inset).toFixed(3)
    gcode.push(`G1 X${x} Y-${y} F${feed}`)
    gcode.push(`G1 X${x} Y${y}`)
    gcode.push(`G1 X-${x} Y${y}`)
    gcode.push(`G1 X-${x} Y-${y}`)
  }
  gcode.push('G0 Z5.000')
}
gcode.push('M9', 'M5', 'T2 M6', '( 5 MM DRILL )', 'S3000 M3', 'G43 H2')
for (const [x, y] of [[-24, -10], [24, -10], [24, 10], [-24, 10]]) {
  gcode.push(`G0 X${x.toFixed(3)} Y${y.toFixed(3)}`)
  gcode.push('G83 Z-8.000 R2.000 Q2.000 F120')
}
gcode.push('G80', 'G0 Z25.000', 'G28 G91 Z0', 'G90', 'M5', 'M30')
write('pocket.nc', gcode.join('\n'))

// A different program under the other extension: contouring with arcs.
const contour = ['( MYCAD SAMPLE - contour )', 'G21', 'G90', 'G17', 'T3 M6', '( 8 MM FINISHER )', 'S9000 M3', 'M8']
for (let pass = 1; pass <= 3; pass++) {
  const z = (-pass * 2).toFixed(3)
  contour.push(`( CONTOUR PASS ${pass} )`, 'G0 X-40.000 Y-25.000 Z2.000', `G1 Z${z} F180`)
  contour.push('G1 X32.000 Y-25.000 F700')
  contour.push('G3 X40.000 Y-17.000 I0.000 J8.000')
  contour.push('G1 X40.000 Y17.000')
  contour.push('G3 X32.000 Y25.000 I-8.000 J0.000')
  contour.push('G1 X-32.000 Y25.000')
  contour.push('G3 X-40.000 Y17.000 I0.000 J-8.000')
  contour.push('G1 X-40.000 Y-17.000')
  contour.push('G3 X-32.000 Y-25.000 I8.000 J0.000')
  contour.push('G0 Z10.000')
}
contour.push('M9', 'M5', 'M30')
write('profile.gcode', contour.join('\n'))

write('parameters.csv', [
  'Width,Height,Thickness,Area,Mass',
  '40,25,2,1000,0.0157',
  '80,50,4,4000,0.1256',
  '120,75,6,9000,0.4239',
  '160,100,8,16000,1.0048',
  '200,125,10,25000,1.9625'
].join('\n'))

write('design-table.csv', [
  '# CATIA style design table: one row per configuration',
  'Width,Height,Thickness',
  '40,25,2',
  '80,50,4',
  '120,75,6',
  '160,100,8',
  '200,125,10',
  '240,150,12'
].join('\n'))

write('spreadsheet.csv', [
  'Width,80',
  'Depth,50',
  'Area,=B1*B2',
  'Total,=sum(B1:B3)',
  'Thickness,6',
  'Volume,=B3*B5',
  'Density,0.00000785',
  'Mass,=B6*B7',
  'Cost,=B8*4200'
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
write('room.skp', [
  'SKP1',
  'face Floor 0,0,0 4000,0,0 4000,0,3000 0,0,3000',
  'face WallSouth 0,0,0 4000,0,0 4000,2700,0 0,2700,0',
  'face WallEast 4000,0,0 4000,0,3000 4000,2700,3000 4000,2700,0',
  'face WallNorth 4000,0,3000 0,0,3000 0,2700,3000 4000,2700,3000',
  'face WallWest 0,0,3000 0,0,0 0,2700,0 0,2700,3000'
].join('\n'))

/* ───────────────────────────── manifest + README ────────────────────────── */

const DESCRIPTIONS = {
  'box.mycad': '기본 박스 한 개 (파일 열기/저장 확인)',
  'primitives.mycad': '박스·구·원기둥·원뿔·토러스·평면 6종',
  'sketch-pad.mycad': '스케치 4개(3개 평면) + 패드/보스/포켓/홀/필렛 + 파라미터 수식',
  'assembly.mycad': '베어링 스탠드 11개 부품 + 구속 6개 + 파라미터 (어셈블리/BOM/관성)',
  'patterns.mycad': '4×3 선형 격자 12개 + 원형 패턴 핀 8개',
  'mesh-pyramid.mycad': '닫힌 메쉬 3개: 계단 피라미드·기어·구멍 플레이트',
  'bim-house.mycad': 'BIM 요소·층 정보가 든 건물 (수량 산출/IFC 내보내기)',
  'sketchup-scene.mycad': '그룹·태그·장면·단면 평면이 든 SketchUp 스타일 모델',
  'spreadsheet.mycad': '별칭과 수식이 든 스프레드시트',
  'sheetmetal-bracket.mycad': '시트메탈 월/플랜지 (전개도·성형성 검사)',
  'fem-beam.mycad': 'FEM 해석 컨테이너와 구속/하중이 든 외팔보',
  'kinematics-crank.mycad': '회전·직선 조인트가 든 크랭크 슬라이더',
  'cube.stl': 'ASCII STL 큐브 (STL 가져오기)',
  'cube-binary.stl': '바이너리 STL 큐브. ASCII 큐브와 같은 12개 삼각형',
  'cube.step': 'STEP AP214 큐브 (왕복 검증용 최소 예제)',
  'cube.stp': '같은 STEP 큐브의 .stp 확장자',
  'bracket.step': 'STEP L-브래킷: 리브 + 보스 2개 (면 1,500개 규모)',
  'plate.ply': 'PLY 마운트 플레이트: 90×60×8, 관통 구멍 Ø24',
  'plate-binary.ply': '같은 플레이트의 little-endian 바이너리 PLY',
  'gear.off': 'OFF 스퍼 기어: 이 18개 + 보어',
  'gear.stl': 'STL 스퍼 기어 (메쉬 감축·법선 정리 테스트)',
  'wedge.off': 'OFF 피라미드 (최소 예제)',
  'profile.igs': 'IGES 와이어프레임: 외곽 + 슬롯 + 볼트 원 4개',
  'profile.iges': '같은 IGES 와이어프레임의 .iges 확장자',
  'assembly.dae': 'Collada 3개 형상(하우징·샤프트·커버)이 든 어셈블리',
  'pyramid.stl': 'ASCII STL 계단식 피라미드 5단 (면 88개, 닫힌 솔리드)',
  'plate.obj': 'OBJ 그룹 3개(플레이트·보스·리브) + 법선 + v//vn 면',
  'profile.svg': 'SVG 가스켓 도면: 외곽·창·슬롯 + 볼트 원 6개',
  'profile.dxf': 'DXF 가스켓 도면: 레이어 5개, LINE 18 + CIRCLE 6',
  'bracket.scad': 'OpenSCAD 소스: 4개 형상 union + 보어 2개 difference',
  'scan-points.asc': '기울어진 평면 위 점군 169개 (평면/구/곡면 근사)',
  'building.ifc': 'IFC4 건물: 4개 층, 요소 41개 (IFC 가져오기)',
  'pocket.nc': 'G코드 포켓 가공: 4패스 + 펙 드릴링, 공구 2개',
  'parameters.csv': '파라미터 표 5구성 (CSV 읽기)',
  'design-table.csv': 'CATIA 디자인 테이블 6구성',
  'spreadsheet.csv': '수식 5개가 든 CSV 시트 (면적·부피·질량·원가)',
  'macro.mycadmacro': '매크로 스크립트 샘플',
  'macro.py': 'Python 매크로 (Part API, 불리언, 반복문)',
  'scan-points.xyz': '같은 점군의 XYZ 형식 (헤더 없음)',
  'profile.gcode': '윤곽 가공 .gcode: G2/G3 원호 3패스',
  'hex-nuts.mycadaddon': '설치용 애드온 패키지 (.mycadaddon 연결 테스트)',
  'addon-manifest.json': '애드온 매니페스트 (설치/실행 테스트)',
  'room.skp': 'SketchUp 면 교환 텍스트: 바닥과 벽 4면'
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
readme.push('', '## 사용법', '', '- `.mycad`: 파일 > 열기 로 불러옵니다.', '- `.stl`, `.ply`: ASCII와 바이너리 샘플이 있습니다. 바이너리는 글자로 열면 좌표가 깨집니다.', '- `.step`과 `.stp`, `.igs`와 `.iges`는 같은 내용의 두 확장자입니다.', '- `.skp`: 바닥과 벽이 있는 면 교환 텍스트입니다.', '- `.asc`: 점 워크벤치 > 점 가져오기 후 역설계 근사 명령.', '- `.scad`: OpenSCAD 워크벤치 > OpenSCAD 가져오기.', '- `.ifc`: 건축 메뉴 > IFC 관련 명령으로 확인.', '- `.csv`: 스프레드시트 / 지식공학(디자인 테이블).', '- `.nc`, `.svg`, `.dxf`, `.obj`: 내보내기 결과 비교용 기준 파일.')
write('README.md', readme.join('\n'))

console.log(`sample/: ${written.length} files`)
for (const name of written) console.log(`  ${name}`)
