// @ts-nocheck
import * as THREE from 'three'
import type { Solid } from './model'

export function solidGeometry(solid: Solid): THREE.BufferGeometry {
  if (solid.kind === 'mesh' && solid.mesh) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(solid.mesh.positions, 3))
    if (solid.mesh.normals.length === solid.mesh.positions.length) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(solid.mesh.normals, 3))
    } else {
      geometry.computeVertexNormals()
    }
    return geometry
  }
  const { x, y, z, radius, tube } = solid.size
  switch (solid.kind) {
    case 'sphere':
      return new THREE.SphereGeometry(radius, 24, 16)
    case 'cylinder':
      return new THREE.CylinderGeometry(radius, radius, y, 24)
    case 'cone':
      return new THREE.ConeGeometry(radius, y, 24)
    case 'torus':
      return new THREE.TorusGeometry(radius, tube, 12, 24)
    case 'plane':
      return new THREE.BoxGeometry(x, Math.max(0.4, y), z)
    default:
      return new THREE.BoxGeometry(x, y, z)
  }
}

export function toAsciiStl(solids: Solid[]): string {
  const lines = ['solid mycad']
  for (const solid of solids) {
    if (!solid.visible) continue
    const geometry = solidGeometry(solid)
    geometry.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(solid.position.x, solid.position.y, solid.position.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(solid.rotation.x),
        THREE.MathUtils.degToRad(solid.rotation.y),
        THREE.MathUtils.degToRad(solid.rotation.z)
      )),
      new THREE.Vector3(solid.scale.x, solid.scale.y, solid.scale.z)
    ))
    const position = geometry.getAttribute('position')
    const index = geometry.getIndex()
    const pushTri = (a: number, b: number, c: number) => {
      const ax = position.getX(a), ay = position.getY(a), az = position.getZ(a)
      const bx = position.getX(b), by = position.getY(b), bz = position.getZ(b)
      const cx = position.getX(c), cy = position.getY(c), cz = position.getZ(c)
      const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay)
      const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az)
      const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
      lines.push(`facet normal ${nx} ${ny} ${nz}`)
      lines.push('  outer loop')
      lines.push(`    vertex ${ax} ${ay} ${az}`)
      lines.push(`    vertex ${bx} ${by} ${bz}`)
      lines.push(`    vertex ${cx} ${cy} ${cz}`)
      lines.push('  endloop')
      lines.push('endfacet')
    }
    if (index) {
      for (let i = 0; i < index.count; i += 3) pushTri(index.getX(i), index.getX(i + 1), index.getX(i + 2))
    } else {
      for (let i = 0; i < position.count; i += 3) pushTri(i, i + 1, i + 2)
    }
    geometry.dispose()
  }
  lines.push('endsolid mycad')
  return lines.join('\n')
}

/** True when the byte length is exactly one binary STL: 80-byte header, count, 50 bytes per triangle. */
export function looksLikeBinaryStl(bytes: Uint8Array): boolean {
  if (bytes.length < 84) return false
  const count = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true)
  return count > 0 && bytes.length === 84 + count * 50
}

/** Little-endian binary STL. The face normal is skipped; vertices are kept. */
export function readBinaryStl(bytes: Uint8Array): number[] {
  if (!looksLikeBinaryStl(bytes)) throw new Error('바이너리 STL 길이가 삼각형 수와 맞지 않습니다.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint32(80, true)
  const positions: number[] = []
  for (let i = 0; i < count; i++) {
    const base = 84 + i * 50 + 12
    for (let v = 0; v < 9; v++) positions.push(view.getFloat32(base + v * 4, true))
  }
  return positions
}

/** Writes the public little-endian STL layout other mesh tools open. */
export function writeBinaryStl(positions: number[]): Uint8Array {
  if (positions.length < 9 || positions.length % 9 !== 0) throw new Error('STL로 내보낼 삼각형이 없습니다.')
  const count = positions.length / 9
  const bytes = new Uint8Array(84 + count * 50)
  const view = new DataView(bytes.buffer)
  const header = 'MyCAD binary STL'
  for (let i = 0; i < header.length; i++) bytes[i] = header.charCodeAt(i)
  view.setUint32(80, count, true)
  for (let triangle = 0; triangle < count; triangle++) {
    const origin = triangle * 9
    const ax = positions[origin]
    const ay = positions[origin + 1]
    const az = positions[origin + 2]
    const bx = positions[origin + 3]
    const by = positions[origin + 4]
    const bz = positions[origin + 5]
    const cx = positions[origin + 6]
    const cy = positions[origin + 7]
    const cz = positions[origin + 8]
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay)
    let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az)
    let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    const length = Math.hypot(nx, ny, nz) || 1
    const base = 84 + triangle * 50
    view.setFloat32(base, nx / length, true)
    view.setFloat32(base + 4, ny / length, true)
    view.setFloat32(base + 8, nz / length, true)
    for (let v = 0; v < 9; v++) view.setFloat32(base + 12 + v * 4, positions[origin + v], true)
  }
  return bytes
}

function meshFromTriangles(id: string, positions: number[]): Solid {
  return {
    id,
    name: 'mesh-1',
    kind: 'mesh',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    size: { x: 1, y: 1, z: 1, radius: 1, tube: 0.2 },
    color: '#8fb8ff',
    metalness: 0.1,
    roughness: 0.5,
    visible: true,
    locked: false,
    mesh: { positions, normals: [] }
  }
}

function isBytes(input: string | Uint8Array): input is Uint8Array {
  return typeof input !== 'string'
}

export function parseStl(input: string | Uint8Array, id: string): Solid {
  if (isBytes(input)) {
    if (looksLikeBinaryStl(input)) return meshFromTriangles(id, readBinaryStl(input))
    return parseStl(new TextDecoder().decode(input), id)
  }
  const text = input
  const positions: number[] = []
  const vertex = /vertex\s+([+-eE\d.]+)\s+([+-eE\d.]+)\s+([+-eE\d.]+)/g
  let match: RegExpExecArray | null
  while ((match = vertex.exec(text))) {
    positions.push(Number(match[1]), Number(match[2]), Number(match[3]))
  }
  if (positions.length < 9) throw new Error('STL에서 삼각형을 찾지 못했습니다.')
  return {
    id,
    name: 'mesh-1',
    kind: 'mesh',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    size: { x: 1, y: 1, z: 1, radius: 1, tube: 0.2 },
    color: '#8fb8ff',
    metalness: 0.1,
    roughness: 0.5,
    visible: true,
    locked: false,
    mesh: { positions, normals: [] }
  }
}
