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

export function parseStl(text: string, id: string): Solid {
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
