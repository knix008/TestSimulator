import { describe, expect, it } from 'vitest'
import { parsePly, toBinaryPly } from '../src/core/cadformats'
import { parseStl, toAsciiStl, writeBinaryStl } from '../src/core/stl'
import { createSolid } from '../src/core/model'
import { decodeBase64, importFile } from '../src/core/fileTypes'

function base64(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i])
  return btoa(text)
}

const triangle = [0, 0, 0, 1, 0, 0, 0, 2, 0]

describe('binary meshes', () => {
  it('[Binary] STL keeps vertex coordinates and ignores a solid header', () => {
    const bytes = writeBinaryStl(triangle)
    expect(bytes.length).toBe(84 + 50)
    expect(parseStl(bytes, 'bin').mesh?.positions).toEqual(triangle)
    const labeled = new Uint8Array(bytes)
    for (let i = 0; i < 5; i++) labeled[i] = 'solid'.charCodeAt(i)
    expect(parseStl(labeled, 'labeled').mesh?.positions).toEqual(triangle)
    const opened = importFile('mesh.stl', decodeBase64(base64(bytes)), { id: 'ipc' })
    expect(opened.report[0]).toBe('mesh: 1 triangles')
    expect(opened.solids[0].mesh?.positions[3]).toBe(1)
  })

  it('[Binary] an ASCII STL is still read when the bytes are not binary', () => {
    const ascii = new TextEncoder().encode([
      'solid t',
      'facet normal 0 0 1',
      'outer loop',
      'vertex 0 0 0',
      'vertex 1 0 0',
      'vertex 0 2 0',
      'endloop',
      'endfacet',
      'endsolid t'
    ].join('\n'))
    expect(parseStl(ascii, 'ascii').mesh?.positions).toEqual(triangle)
    const exported = new TextEncoder().encode(toAsciiStl([createSolid('box', 'box', 1)]))
    expect(parseStl(exported, 'box').mesh?.positions.length).toBeGreaterThan(8)
  })

  it('[Binary] little-endian PLY round-trips and a quad face becomes two triangles', () => {
    const parsed = parsePly(toBinaryPly(triangle), 'ply')
    expect(parsed.report[0]).toContain('binary little')
    expect(parsed.solid.mesh?.positions).toEqual(triangle)
    const header = new TextEncoder().encode([
      'ply',
      'format binary_little_endian 1.0',
      'element vertex 4',
      'property float s',
      'property float x',
      'property float y',
      'property float z',
      'element face 1',
      'property list uchar int vertex_indices',
      'end_header',
      ''
    ].join('\n'))
    const body = new Uint8Array(4 * 16 + 1 + 16)
    const view = new DataView(body.buffer)
    const corners = [0, 0, 0, 10, 0, 0, 10, 0, 10, 0, 0, 10]
    for (let i = 0; i < 4; i++) {
      const base = i * 16
      view.setFloat32(base, 9, true)
      view.setFloat32(base + 4, corners[i * 3], true)
      view.setFloat32(base + 8, corners[i * 3 + 1], true)
      view.setFloat32(base + 12, corners[i * 3 + 2], true)
    }
    view.setUint8(64, 4)
    for (let i = 0; i < 4; i++) view.setInt32(65 + i * 4, i, true)
    const bytes = new Uint8Array(header.length + body.length)
    bytes.set(header)
    bytes.set(body, header.length)
    const quad = parsePly(bytes, 'quad')
    expect(quad.solid.mesh?.positions.length).toBe(18)
    expect(quad.solid.mesh?.positions.slice(0, 3)).toEqual([0, 0, 0])
  })

  it('[Binary] big-endian PLY reads the same triangle', () => {
    const header = new TextEncoder().encode([
      'ply',
      'format binary_big_endian 1.0',
      'element vertex 3',
      'property float x',
      'property float y',
      'property float z',
      'element face 1',
      'property list uchar int vertex_index',
      'end_header',
      ''
    ].join('\n'))
    const body = new Uint8Array(3 * 12 + 13)
    const view = new DataView(body.buffer)
    triangle.forEach((value, index) => view.setFloat32(index * 4, value, false))
    view.setUint8(36, 3)
    view.setInt32(37, 0, false)
    view.setInt32(41, 1, false)
    view.setInt32(45, 2, false)
    const bytes = new Uint8Array(header.length + body.length)
    bytes.set(header)
    bytes.set(body, header.length)
    expect(parsePly(bytes, 'big').solid.mesh?.positions).toEqual(triangle)
    expect(() => parsePly('ply\nformat binary_little_endian 1.0\nend_header\n', 'text')).toThrow(/바이트/)
  })
})
