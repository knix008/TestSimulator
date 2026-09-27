// Neutral CAD interchange formats: STEP, IGES, PLY, OFF and Collada.
//
// These are the files other CAD systems hand over, so MyCAD reads them and
// writes the ones it can write faithfully. PLY is read and written as ASCII
// or as little- and big-endian binary. The binary body has to arrive as
// bytes: decoding it as text first destroys the floats.
//
// What each reader understands is stated with the reader; a file that goes
// beyond that still opens, with a report line saying what was taken from it.
import type { Solid } from './model'
import type { Wire } from './draftwb'

export interface MeshData {
  /** flat triangle list: x,y,z per corner */
  positions: number[]
  report: string[]
}

function meshSolid(id: string, name: string, positions: number[], color = '#8fb8ff'): Solid {
  return {
    id,
    name,
    kind: 'mesh',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    size: { x: 1, y: 1, z: 1, radius: 1, tube: 0.2 },
    color,
    metalness: 0.1,
    roughness: 0.5,
    visible: true,
    locked: false,
    mesh: { positions, normals: [] }
  }
}

/** Fan-triangulate a polygon given as a flat list of points. */
function fan(points: Array<[number, number, number]>, out: number[]): void {
  for (let i = 1; i + 1 < points.length; i++) {
    out.push(...points[0], ...points[i], ...points[i + 1])
  }
}

/* ────────────────────────────────── STEP ─────────────────────────────────── */

/**
 * STEP AP203/AP214 reader for the planar B-rep subset: it follows
 * ADVANCED_FACE → FACE_OUTER_BOUND → EDGE_LOOP → ORIENTED_EDGE → EDGE_CURVE →
 * VERTEX_POINT → CARTESIAN_POINT and triangulates each face from its loop.
 *
 * Curved surfaces keep their edge polygon, which is what their vertices
 * describe; a file with no faces at all falls back to its points, so a STEP
 * that only carries geometry still shows something.
 */
export function parseStep(text: string, id: string, name = 'step'): { solid: Solid; report: string[] } {
  const entities = new Map<number, { type: string; args: string }>()
  const pattern = /#(\d+)\s*=\s*([A-Z_0-9]+)\s*\(([\s\S]*?)\)\s*;/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    entities.set(Number(match[1]), { type: match[2], args: match[3] })
  }
  if (entities.size === 0) throw new Error('STEP 엔티티를 찾지 못했습니다.')

  const refs = (args: string): number[] => [...args.matchAll(/#(\d+)/g)].map((item) => Number(item[1]))
  const numbers = (args: string): number[] =>
    [...args.matchAll(/-?\d+\.?\d*(?:[eE][-+]?\d+)?/g)].map((item) => Number(item[0]))

  const pointOf = (ref: number): [number, number, number] | null => {
    const entity = entities.get(ref)
    if (!entity) return null
    if (entity.type === 'CARTESIAN_POINT') {
      const values = numbers(entity.args.slice(entity.args.indexOf('(')))
      return values.length >= 3 ? [values[0], values[1], values[2]] : null
    }
    if (entity.type === 'VERTEX_POINT') {
      for (const child of refs(entity.args)) {
        const point = pointOf(child)
        if (point) return point
      }
    }
    return null
  }

  /** Vertices of one edge loop, in order, without repeating the closing one. */
  const loopPoints = (loopRef: number): Array<[number, number, number]> => {
    const loop = entities.get(loopRef)
    if (!loop) return []
    if (loop.type === 'POLY_LOOP') {
      return refs(loop.args).map(pointOf).filter((p): p is [number, number, number] => p !== null)
    }
    if (loop.type !== 'EDGE_LOOP') return []
    const points: Array<[number, number, number]> = []
    for (const orientedRef of refs(loop.args)) {
      const oriented = entities.get(orientedRef)
      if (!oriented) continue
      const forward = !/\.F\./.test(oriented.args)
      const edgeRef = refs(oriented.args).find((ref) => entities.get(ref)?.type === 'EDGE_CURVE')
      const edge = edgeRef === undefined ? undefined : entities.get(edgeRef)
      if (!edge) continue
      const ends = refs(edge.args)
        .map((ref) => ({ ref, entity: entities.get(ref) }))
        .filter((item) => item.entity?.type === 'VERTEX_POINT')
      if (ends.length < 2) continue
      const start = pointOf(forward ? ends[0].ref : ends[1].ref)
      if (start) points.push(start)
    }
    return points
  }

  const positions: number[] = []
  let faces = 0
  for (const [, entity] of entities) {
    if (entity.type !== 'ADVANCED_FACE' && entity.type !== 'FACE_SURFACE') continue
    for (const boundRef of refs(entity.args)) {
      const bound = entities.get(boundRef)
      if (!bound || (bound.type !== 'FACE_OUTER_BOUND' && bound.type !== 'FACE_BOUND')) continue
      const loopRef = refs(bound.args)[0]
      const points = loopPoints(loopRef)
      if (points.length >= 3) {
        fan(points, positions)
        faces += 1
      }
    }
  }

  const report: string[] = []
  if (positions.length === 0) {
    // No usable faces: show the geometry that is there.
    const points: Array<[number, number, number]> = []
    for (const [ref, entity] of entities) {
      if (entity.type !== 'CARTESIAN_POINT') continue
      const point = pointOf(ref)
      if (point) points.push(point)
    }
    if (points.length === 0) throw new Error('STEP에서 형상을 찾지 못했습니다.')
    for (const [x, y, z] of points) {
      const s = 0.5
      positions.push(x - s, y, z - s, x + s, y, z - s, x, y + s, z + s)
    }
    report.push(`STEP: ${points.length} points (no planar faces)`)
  } else {
    report.push(`STEP: ${faces} faces, ${positions.length / 9} triangles`)
  }
  const product = /PRODUCT\s*\(\s*'([^']*)'/.exec(text)?.[1]
  if (product) report.push(`product: ${product}`)
  return { solid: meshSolid(id, product || name, positions), report }
}

/**
 * Write the solids as a STEP AP214 file: one closed shell per solid, with a
 * planar face per triangle. It is verbose, as STEP is, but any CAD system can
 * read it, and `parseStep` reads it back.
 */
export function toStep(
  solids: Array<{ name: string; mesh?: { positions: number[] } | undefined; position: { x: number; y: number; z: number } }>,
  triangles: (solid: unknown) => number[],
  /** Written into the header. Pass a fixed value to get a reproducible file. */
  stamp: Date = new Date()
): string {
  const lines: string[] = []
  let next = 1
  const id = () => `#${next++}`
  const body: string[] = []

  const point = (x: number, y: number, z: number) => {
    const ref = id()
    body.push(`${ref} = CARTESIAN_POINT ( 'NONE', ( ${x.toFixed(6)}, ${y.toFixed(6)}, ${z.toFixed(6)} ) ) ;`)
    return ref
  }
  const direction = (x: number, y: number, z: number) => {
    const ref = id()
    body.push(`${ref} = DIRECTION ( 'NONE', ( ${x.toFixed(6)}, ${y.toFixed(6)}, ${z.toFixed(6)} ) ) ;`)
    return ref
  }

  const shells: string[] = []
  for (const solid of solids) {
    const coords = triangles(solid)
    const faceRefs: string[] = []
    for (let i = 0; i + 8 < coords.length; i += 9) {
      const corners: string[] = []
      const vertexRefs: string[] = []
      for (let c = 0; c < 3; c++) {
        const px = coords[i + c * 3]
        const py = coords[i + c * 3 + 1]
        const pz = coords[i + c * 3 + 2]
        const pointRef = point(px, py, pz)
        const vertexRef = id()
        body.push(`${vertexRef} = VERTEX_POINT ( 'NONE', ${pointRef} ) ;`)
        corners.push(pointRef)
        vertexRefs.push(vertexRef)
      }
      const edgeRefs: string[] = []
      for (let c = 0; c < 3; c++) {
        const from = vertexRefs[c]
        const to = vertexRefs[(c + 1) % 3]
        const lineRef = id()
        const vectorRef = id()
        const dirRef = direction(1, 0, 0)
        body.push(`${vectorRef} = VECTOR ( 'NONE', ${dirRef}, 1.0 ) ;`)
        body.push(`${lineRef} = LINE ( 'NONE', ${corners[c]}, ${vectorRef} ) ;`)
        const edgeRef = id()
        body.push(`${edgeRef} = EDGE_CURVE ( 'NONE', ${from}, ${to}, ${lineRef}, .T. ) ;`)
        const orientedRef = id()
        body.push(`${orientedRef} = ORIENTED_EDGE ( 'NONE', *, *, ${edgeRef}, .T. ) ;`)
        edgeRefs.push(orientedRef)
      }
      const loopRef = id()
      body.push(`${loopRef} = EDGE_LOOP ( 'NONE', ( ${edgeRefs.join(', ')} ) ) ;`)
      const boundRef = id()
      body.push(`${boundRef} = FACE_OUTER_BOUND ( 'NONE', ${loopRef}, .T. ) ;`)
      const axisRef = id()
      const originRef = point(coords[i], coords[i + 1], coords[i + 2])
      const normalRef = direction(0, 0, 1)
      const refDirRef = direction(1, 0, 0)
      body.push(`${axisRef} = AXIS2_PLACEMENT_3D ( 'NONE', ${originRef}, ${normalRef}, ${refDirRef} ) ;`)
      const planeRef = id()
      body.push(`${planeRef} = PLANE ( 'NONE', ${axisRef} ) ;`)
      const faceRef = id()
      body.push(`${faceRef} = ADVANCED_FACE ( 'NONE', ( ${boundRef} ), ${planeRef}, .T. ) ;`)
      faceRefs.push(faceRef)
    }
    if (faceRefs.length === 0) continue
    const shellRef = id()
    body.push(`${shellRef} = CLOSED_SHELL ( '${solid.name}', ( ${faceRefs.join(', ')} ) ) ;`)
    const brepRef = id()
    body.push(`${brepRef} = MANIFOLD_SOLID_BREP ( '${solid.name}', ${shellRef} ) ;`)
    shells.push(brepRef)
  }

  const productName = solids[0]?.name ?? 'MyCAD'
  lines.push('ISO-10303-21;')
  lines.push('HEADER;')
  lines.push("FILE_DESCRIPTION ( ( 'MyCAD export' ), '2;1' );")
  lines.push(`FILE_NAME ( '${productName}', '${stamp.toISOString()}', ( 'MyCAD' ), ( '' ), 'MyCAD', 'MyCAD', '' );`)
  lines.push("FILE_SCHEMA ( ( 'AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }' ) );")
  lines.push('ENDSEC;')
  lines.push('DATA;')
  lines.push(`#0 = PRODUCT ( '${productName}', '${productName}', '', ( ) ) ;`)
  lines.push(...body)
  lines.push('ENDSEC;')
  lines.push('END-ISO-10303-21;')
  return lines.join('\n')
}

/* ────────────────────────────────── IGES ─────────────────────────────────── */

/**
 * IGES reader for the wireframe entities: 110 (line), 116 (point) and 106
 * (copious data / polyline). Surfaces are skipped, and the report says so.
 */
export function parseIges(text: string, id: string): { wires: Wire[]; report: string[] } {
  const lines = text.split(/\r?\n/)
  const parameters: string[] = []
  const directory: string[] = []
  for (const line of lines) {
    const section = line[72]
    if (section === 'P') parameters.push(line.slice(0, 64).trim())
    if (section === 'D') directory.push(line.slice(0, 72))
  }
  const joined = parameters.join('')
  const records = joined.split(';').map((record) => record.trim()).filter(Boolean)
  const wires: Wire[] = []
  let points = 0
  let skipped = 0
  records.forEach((record, index) => {
    const fields = record.split(',').map((field) => field.trim())
    const type = Number(fields[0])
    const values = fields.slice(1).map(Number)
    if (type === 110 && values.length >= 6) {
      wires.push({
        id: `${id}-line-${index}`,
        name: `line ${wires.length + 1}`,
        closed: false,
        points: [
          { x: values[0], y: values[1], z: values[2] },
          { x: values[3], y: values[4], z: values[5] }
        ]
      })
      return
    }
    if (type === 116 && values.length >= 3) {
      points += 1
      return
    }
    if (type === 106 && values.length >= 5) {
      // Copious data: ip, n, then n triples (ip = 2 keeps z constant).
      const form = values[0]
      const count = values[1]
      const coords = values.slice(2)
      const step = form === 1 ? 3 : form === 2 ? 3 : 3
      const wirePoints: Wire['points'] = []
      for (let i = 0; i + 2 < coords.length && wirePoints.length < count; i += step) {
        wirePoints.push({ x: coords[i], y: coords[i + 1], z: coords[i + 2] })
      }
      if (wirePoints.length >= 2) {
        wires.push({ id: `${id}-poly-${index}`, name: `polyline ${wires.length + 1}`, closed: false, points: wirePoints })
      }
      return
    }
    skipped += 1
  })
  if (wires.length === 0 && points === 0) throw new Error('IGES에서 선이나 점을 찾지 못했습니다.')
  const report = [`IGES: ${wires.length} wires, ${points} points`]
  if (skipped > 0) report.push(`skipped ${skipped} entities (surfaces are not read)`)
  return { wires, report }
}

/**
 * Edges of a triangle soup, each one once: the wireframe of a solid, which is
 * what a wire-only format like IGES can carry.
 */
export function wireframeOf(triangles: number[], id = 'edge'): Wire[] {
  const seen = new Set<string>()
  const wires: Wire[] = []
  const key = (a: number[], b: number[]) => {
    const round = (value: number) => value.toFixed(4)
    const first = `${round(a[0])},${round(a[1])},${round(a[2])}`
    const second = `${round(b[0])},${round(b[1])},${round(b[2])}`
    return first < second ? `${first}|${second}` : `${second}|${first}`
  }
  for (let i = 0; i + 8 < triangles.length; i += 9) {
    const corners = [triangles.slice(i, i + 3), triangles.slice(i + 3, i + 6), triangles.slice(i + 6, i + 9)]
    for (let c = 0; c < 3; c++) {
      const a = corners[c]
      const b = corners[(c + 1) % 3]
      const hash = key(a, b)
      if (seen.has(hash)) continue
      seen.add(hash)
      wires.push({
        id: `${id}-${wires.length}`,
        name: `edge ${wires.length + 1}`,
        closed: false,
        points: [
          { x: a[0], y: a[1], z: a[2] },
          { x: b[0], y: b[1], z: b[2] }
        ]
      })
    }
  }
  return wires
}

/** A coordinate as IGES real notation: short, and never 25.000000000000004. */
function igesNumber(value: number): string {
  const text = value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
  return text === '-0' ? '0' : text
}

/**
 * Parameter data cut into the 64 columns a P line has room for. Every break
 * falls after a comma, so a reader that joins the lines back together sees the
 * record it was written from.
 */
function igesParameterLines(record: string): string[] {
  const out: string[] = []
  let rest = record
  while (rest.length > 64) {
    const cut = rest.lastIndexOf(',', 64)
    const at = cut > 0 ? cut + 1 : 64
    out.push(rest.slice(0, at))
    rest = rest.slice(at)
  }
  out.push(rest)
  return out
}

/** Write wires as an IGES file with one type 110 line entity per segment. */
export function toIges(wires: Wire[], stamp: Date = new Date()): string {
  const day = `${stamp.toISOString().slice(0, 10).replace(/-/g, '')}000000`
  const start: string[] = []
  const global: string[] = []
  const directory: string[] = []
  const parameter: string[] = []
  const pad = (text: string, section: string, index: number) =>
    `${text.padEnd(72).slice(0, 72)}${section}${String(index).padStart(7)}`

  start.push(pad('MyCAD IGES export', 'S', 1))
  const globals = [
    '1H,', '1H;', '4HMyCAD', '9Hmycad.igs', '5HMyCAD', '5HMyCAD', '32', '38', '6', '308', '15',
    '4HPART', '1.0', '2', '2HMM', '1', '0.08', `15H${day}`,
    '1E-7', '1000.0', '5HMyCAD', '5HMyCAD', '11', '0', `15H${day}`, ';'
  ].join(',')
  globals.match(/.{1,72}/g)?.forEach((chunk, index) => global.push(pad(chunk, 'G', index + 1)))

  let parameterLine = 1
  let directoryLine = 1
  let segments = 0
  for (const wire of wires) {
    for (let i = 0; i + 1 < wire.points.length; i++) {
      const a = wire.points[i]
      const b = wire.points[i + 1]
      const record = `110,${igesNumber(a.x)},${igesNumber(a.y)},${igesNumber(a.z)},${igesNumber(b.x)},${igesNumber(b.y)},${igesNumber(b.z)};`
      const rows = igesParameterLines(record)
      directory.push(pad(`     110${String(parameterLine).padStart(8)}       0       0       0       0       0       000000000D`, 'D', directoryLine))
      directory.push(pad(`     110       0       0${String(rows.length).padStart(8)}       0                               0D`, 'D', directoryLine + 1))
      rows.forEach((row, offset) => {
        parameter.push(`${row.padEnd(64)} ${String(directoryLine).padStart(7)}P${String(parameterLine + offset).padStart(7)}`)
      })
      directoryLine += 2
      parameterLine += rows.length
      segments += 1
    }
  }
  const terminate = pad(
    `S${String(start.length).padStart(6)}G${String(global.length).padStart(6)}D${String(directory.length).padStart(6)}P${String(parameter.length).padStart(6)}`,
    'T',
    1
  )
  if (segments === 0) throw new Error('내보낼 선이 없습니다.')
  return [...start, ...global, ...directory, ...parameter, terminate].join('\n')
}

/* ─────────────────────────────── PLY and OFF ─────────────────────────────── */

const PLY_SIZE: Record<string, number> = {
  char: 1, int8: 1, uchar: 1, uint8: 1,
  short: 2, int16: 2, ushort: 2, uint16: 2,
  int: 4, int32: 4, uint: 4, uint32: 4,
  float: 4, float32: 4, double: 8, float64: 8
}

function readPlyNumber(view: DataView, offset: number, type: string, little: boolean): number {
  switch (type) {
    case 'char':
    case 'int8':
      return view.getInt8(offset)
    case 'uchar':
    case 'uint8':
      return view.getUint8(offset)
    case 'short':
    case 'int16':
      return view.getInt16(offset, little)
    case 'ushort':
    case 'uint16':
      return view.getUint16(offset, little)
    case 'int':
    case 'int32':
      return view.getInt32(offset, little)
    case 'uint':
    case 'uint32':
      return view.getUint32(offset, little)
    case 'float':
    case 'float32':
      return view.getFloat32(offset, little)
    case 'double':
    case 'float64':
      return view.getFloat64(offset, little)
    default:
      throw new Error(`PLY 속성 형식을 읽을 수 없습니다: ${type}`)
  }
}

interface PlyProperty {
  name: string
  type: string
  list?: { count: string; index: string }
}

function plyHeader(text: string) {
  let format: 'ascii' | 'little' | 'big' = 'ascii'
  let vertexCount = 0
  let faceCount = 0
  let element = ''
  const vertexProps: PlyProperty[] = []
  const faceProps: PlyProperty[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('format binary_little_endian')) format = 'little'
    else if (line.startsWith('format binary_big_endian')) format = 'big'
    else if (line.startsWith('format ascii')) format = 'ascii'
    else if (line.startsWith('element vertex')) {
      element = 'vertex'
      vertexCount = Number(line.split(/\s+/)[2])
    } else if (line.startsWith('element face')) {
      element = 'face'
      faceCount = Number(line.split(/\s+/)[2])
    } else if (line.startsWith('element ')) element = ''
    else if (line.startsWith('property ') && (element === 'vertex' || element === 'face')) {
      const parts = line.split(/\s+/)
      const property: PlyProperty = parts[1] === 'list'
        ? { name: parts[4], type: parts[3], list: { count: parts[2], index: parts[3] } }
        : { name: parts[2], type: parts[1] }
      if (element === 'vertex') vertexProps.push(property)
      else faceProps.push(property)
    }
  }
  return { format, vertexCount, faceCount, vertexProps, faceProps }
}

function headerByteLength(bytes: Uint8Array): number {
  const marker = [101, 110, 100, 95, 104, 101, 97, 100, 101, 114]
  for (let i = 0; i + marker.length <= bytes.length; i++) {
    if (!marker.every((byte, index) => bytes[i + index] === byte)) continue
    let end = i + marker.length
    if (bytes[end] === 13) end += 1
    if (bytes[end] === 10) end += 1
    return end
  }
  return -1
}

function parsePlyBytes(bytes: Uint8Array, id: string, name: string): { solid: Solid; report: string[] } {
  const headerEnd = headerByteLength(bytes)
  if (headerEnd < 0) throw new Error('PLY 헤더를 찾지 못했습니다.')
  const header = plyHeader(new TextDecoder().decode(bytes.subarray(0, headerEnd)))
  if (header.format === 'ascii') return parsePly(new TextDecoder().decode(bytes), id, name)
  const little = header.format === 'little'
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = headerEnd
  const xIndex = header.vertexProps.findIndex((property) => property.name === 'x')
  const yIndex = header.vertexProps.findIndex((property) => property.name === 'y')
  const zIndex = header.vertexProps.findIndex((property) => property.name === 'z')
  const useNames = xIndex >= 0 && yIndex >= 0 && zIndex >= 0
  const vertices: Array<[number, number, number]> = []
  for (let i = 0; i < header.vertexCount; i++) {
    const values: number[] = []
    for (const property of header.vertexProps) {
      if (property.list) throw new Error('정점의 리스트 속성은 지원하지 않습니다.')
      values.push(readPlyNumber(view, offset, property.type, little))
      offset += PLY_SIZE[property.type]
    }
    vertices.push(useNames ? [values[xIndex], values[yIndex], values[zIndex]] : [values[0], values[1], values[2]])
  }
  const list = header.faceProps.find((property) => property.list)
  if (!list?.list) throw new Error('PLY 면 인덱스 목록이 없습니다.')
  const positions: number[] = []
  for (let i = 0; i < header.faceCount; i++) {
    const count = readPlyNumber(view, offset, list.list.count, little)
    offset += PLY_SIZE[list.list.count]
    const corners: Array<[number, number, number]> = []
    for (let corner = 0; corner < count; corner++) {
      const index = readPlyNumber(view, offset, list.list.index, little)
      offset += PLY_SIZE[list.list.index]
      if (vertices[index]) corners.push(vertices[index])
    }
    if (corners.length >= 3) fan(corners, positions)
  }
  if (offset > bytes.length) throw new Error('바이너리 PLY 본문이 잘렸습니다.')
  if (positions.length === 0) throw new Error('PLY에서 면을 찾지 못했습니다.')
  return {
    solid: meshSolid(id, name, positions),
    report: [`PLY binary ${header.format}: ${vertices.length} vertices, ${header.faceCount} faces`]
  }
}

/** Little-endian binary PLY: one vertex per corner and a triangle list. */
export function toBinaryPly(triangles: number[]): Uint8Array {
  if (triangles.length < 9 || triangles.length % 9 !== 0) throw new Error('PLY로 내보낼 삼각형이 없습니다.')
  const vertexCount = triangles.length / 3
  const faceCount = vertexCount / 3
  const header = new TextEncoder().encode([
    'ply',
    'format binary_little_endian 1.0',
    `element vertex ${vertexCount}`,
    'property float x',
    'property float y',
    'property float z',
    `element face ${faceCount}`,
    'property list uchar int vertex_index',
    'end_header',
    ''
  ].join('\n'))
  const body = new Uint8Array(vertexCount * 12 + faceCount * 13)
  const view = new DataView(body.buffer)
  let offset = 0
  for (let i = 0; i < triangles.length; i += 3) {
    view.setFloat32(offset, triangles[i], true)
    view.setFloat32(offset + 4, triangles[i + 1], true)
    view.setFloat32(offset + 8, triangles[i + 2], true)
    offset += 12
  }
  for (let face = 0; face < faceCount; face++) {
    view.setUint8(offset, 3)
    view.setInt32(offset + 1, face * 3, true)
    view.setInt32(offset + 5, face * 3 + 1, true)
    view.setInt32(offset + 9, face * 3 + 2, true)
    offset += 13
  }
  const bytes = new Uint8Array(header.length + body.length)
  bytes.set(header, 0)
  bytes.set(body, header.length)
  return bytes
}

/** PLY reader: ASCII, or little- and big-endian binary. Faces are triangulated. */
export function parsePly(input: string | Uint8Array, id: string, name = 'ply'): { solid: Solid; report: string[] } {
  if (typeof input !== 'string') return parsePlyBytes(input, id, name)
  const text = input
  if (/format\s+binary/i.test(text)) throw new Error('바이너리 PLY는 바이트로 열어야 합니다.')
  const lines = text.split(/\r?\n/)
  let vertexCount = 0
  let faceCount = 0
  let headerEnd = -1
  let properties = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (/^element vertex/.test(line)) vertexCount = Number(line.split(/\s+/)[2])
    if (/^element face/.test(line)) faceCount = Number(line.split(/\s+/)[2])
    if (/^property/.test(line) && faceCount === 0 && vertexCount > 0) properties += 1
    if (line === 'end_header') {
      headerEnd = i
      break
    }
  }
  if (headerEnd === -1) throw new Error('PLY 헤더를 찾지 못했습니다.')
  if (/format\s+binary/i.test(text)) throw new Error('PLY 는 ASCII 형식만 읽을 수 있습니다.')
  const body = lines.slice(headerEnd + 1).filter((line) => line.trim() !== '')
  const vertices: Array<[number, number, number]> = []
  for (let i = 0; i < vertexCount && i < body.length; i++) {
    const values = body[i].trim().split(/\s+/).map(Number)
    vertices.push([values[0], values[1], values[2]])
  }
  const positions: number[] = []
  for (let i = 0; i < faceCount; i++) {
    const row = body[vertexCount + i]
    if (!row) break
    const values = row.trim().split(/\s+/).map(Number)
    const corners = values.slice(1, 1 + values[0]).map((index) => vertices[index]).filter(Boolean)
    if (corners.length >= 3) fan(corners as Array<[number, number, number]>, positions)
  }
  if (positions.length === 0) throw new Error('PLY에서 면을 찾지 못했습니다.')
  return {
    solid: meshSolid(id, name, positions),
    report: [`PLY: ${vertices.length} vertices, ${faceCount} faces (${properties} properties)`]
  }
}

export function toPly(triangles: number[], name = 'mycad'): string {
  const vertexCount = triangles.length / 3
  const faceCount = vertexCount / 3
  const lines = [
    'ply',
    'format ascii 1.0',
    `comment MyCAD ${name}`,
    `element vertex ${vertexCount}`,
    'property float x',
    'property float y',
    'property float z',
    `element face ${faceCount}`,
    'property list uchar int vertex_index',
    'end_header'
  ]
  for (let i = 0; i < triangles.length; i += 3) {
    lines.push(`${triangles[i].toFixed(6)} ${triangles[i + 1].toFixed(6)} ${triangles[i + 2].toFixed(6)}`)
  }
  for (let i = 0; i < faceCount; i++) {
    lines.push(`3 ${i * 3} ${i * 3 + 1} ${i * 3 + 2}`)
  }
  return lines.join('\n')
}

/** OFF reader: the Geomview format, vertices then polygon faces. */
export function parseOff(text: string, id: string, name = 'off'): { solid: Solid; report: string[] } {
  const tokens = text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter((line) => line !== '')
  if (!/^(ST|C|N|4|n)*OFF$/i.test(tokens[0].trim())) throw new Error('OFF 파일이 아닙니다.')
  const counts = tokens[1].split(/\s+/).map(Number)
  const [vertexCount, faceCount] = counts
  const vertices: Array<[number, number, number]> = []
  for (let i = 0; i < vertexCount; i++) {
    const values = tokens[2 + i].split(/\s+/).map(Number)
    vertices.push([values[0], values[1], values[2]])
  }
  const positions: number[] = []
  for (let i = 0; i < faceCount; i++) {
    const row = tokens[2 + vertexCount + i]
    if (!row) break
    const values = row.split(/\s+/).map(Number)
    const corners = values.slice(1, 1 + values[0]).map((index) => vertices[index]).filter(Boolean)
    if (corners.length >= 3) fan(corners as Array<[number, number, number]>, positions)
  }
  if (positions.length === 0) throw new Error('OFF에서 면을 찾지 못했습니다.')
  return { solid: meshSolid(id, name, positions), report: [`OFF: ${vertexCount} vertices, ${faceCount} faces`] }
}

export function toOff(triangles: number[]): string {
  const vertexCount = triangles.length / 3
  const faceCount = vertexCount / 3
  const lines = ['OFF', `${vertexCount} ${faceCount} 0`]
  for (let i = 0; i < triangles.length; i += 3) {
    lines.push(`${triangles[i].toFixed(6)} ${triangles[i + 1].toFixed(6)} ${triangles[i + 2].toFixed(6)}`)
  }
  for (let i = 0; i < faceCount; i++) lines.push(`3 ${i * 3} ${i * 3 + 1} ${i * 3 + 2}`)
  return lines.join('\n')
}

/* ──────────────────────────────── Collada ────────────────────────────────── */

/**
 * Collada reader for triangle meshes: the position `float_array` of each
 * geometry and the index list of its `<triangles>` or `<polylist>`.
 */
export function parseDae(text: string, id: string, name = 'collada'): { solid: Solid; report: string[] } {
  const positions: number[] = []
  let meshes = 0
  const geometryPattern = /<geometry\b[\s\S]*?<\/geometry>/g
  for (const block of text.match(geometryPattern) ?? []) {
    const floats = /<float_array[^>]*>([\s\S]*?)<\/float_array>/.exec(block)
    if (!floats) continue
    const values = floats[1].trim().split(/\s+/).map(Number)
    const vertices: Array<[number, number, number]> = []
    for (let i = 0; i + 2 < values.length; i += 3) vertices.push([values[i], values[i + 1], values[i + 2]])
    const primitive = /<(triangles|polylist)\b[^>]*>([\s\S]*?)<\/\1>/.exec(block)
    if (!primitive) continue
    const inputs = (primitive[2].match(/<input\b[^>]*offset=/g) ?? []).length || 1
    const indices = /<p>([\s\S]*?)<\/p>/.exec(primitive[2])
    if (!indices) continue
    const list = indices[1].trim().split(/\s+/).map(Number)
    for (let i = 0; i + inputs * 2 < list.length; i += inputs * 3) {
      const a = vertices[list[i]]
      const b = vertices[list[i + inputs]]
      const c = vertices[list[i + inputs * 2]]
      if (a && b && c) positions.push(...a, ...b, ...c)
    }
    meshes += 1
  }
  if (positions.length === 0) throw new Error('Collada에서 삼각형을 찾지 못했습니다.')
  return { solid: meshSolid(id, name, positions), report: [`Collada: ${meshes} geometries, ${positions.length / 9} triangles`] }
}
