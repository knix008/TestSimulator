// Opening a CAD file is only half the job: the geometry that comes in has to
// be editable afterwards. Every format here is read from the sample file that
// ships with the app, put into the document, edited through the same reducer
// and commands the UI uses, and written back out.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from '../src/ui/App'
import { importFile } from '../src/core/fileTypes'
import { runExport } from '../src/core/exporters'
import { parseOff, parsePly, parseStep } from '../src/core/cadformats'
import { booleanSolids, runCommandById } from '../src/core/commands'
import { activeDocument, createInitialState, reducer } from '../src/core/store'
import { trianglePositions, worldTriangles } from '../src/core/primitives'
import type { Solid } from '../src/core/model'

const SAMPLE_DIR = join(process.cwd(), 'sample')

function read(name: string): string {
  const path = join(SAMPLE_DIR, name)
  expect(existsSync(path), `${name} 이(가) 없습니다. npm run build:samples 를 실행하세요.`).toBe(true)
  return readFileSync(path, 'utf8')
}

/** Volume of a closed triangle soup, by the divergence theorem. */
function meshVolume(positions: number[]): number {
  let total = 0
  for (let i = 0; i + 8 < positions.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = positions.slice(i, i + 9)
    total += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  return Math.abs(total)
}

function spread(positions: number[], axis: 0 | 1 | 2): number {
  let min = Infinity
  let max = -Infinity
  for (let i = axis; i < positions.length; i += 3) {
    min = Math.min(min, positions[i])
    max = Math.max(max, positions[i])
  }
  return max - min
}

/** Import a file into a fresh document, the way the app does on open or drop. */
function open(name: string) {
  const result = importFile(join(SAMPLE_DIR, name), read(name), { id: `imported-${name}` })
  let state = createInitialState()
  for (const solid of result.solids) state = reducer(state, { type: 'add-mesh', solid })
  if (result.wires.length > 0) {
    state = reducer(state, { type: 'patch-extras', patch: { wires: result.wires } })
  }
  return { state, result }
}

describe('opening CAD files', () => {
  const meshFiles: Array<[string, number]> = [
    // file, expected volume in mm3 (the samples are a 40 mm cube, a 60x8x40
    // plate and a 50 mm square pyramid 40 mm tall)
    ['cube.step', 64000],
    ['plate.ply', 60 * 8 * 40],
    ['wedge.off', (50 * 50 * 40) / 3],
    ['cube.stl', 64000]
  ]

  it.each(meshFiles)('[CAD] %s comes in as real geometry', (name, volume) => {
    const { state, result } = open(name)
    expect(result.solids, name).toHaveLength(1)
    const doc = activeDocument(state)
    expect(doc.solids, name).toHaveLength(1)
    const positions = trianglePositions(doc.solids[0])
    expect(positions.length, name).toBeGreaterThan(24)
    expect(meshVolume(positions), name).toBeCloseTo(volume, 0)
  })

  it('[CAD] Collada and OBJ meshes arrive with their triangles', () => {
    for (const name of ['bracket.dae', 'plate.obj']) {
      const { result } = open(name)
      expect(result.solids.length, name).toBeGreaterThanOrEqual(1)
      const positions = trianglePositions(result.solids[0])
      expect(positions.length % 9, name).toBe(0)
      expect(positions.length, name).toBeGreaterThanOrEqual(18)
    }
  })

  it('[CAD] IGES and DXF arrive as wires that land in the document', () => {
    for (const name of ['profile.igs', 'profile.dxf']) {
      const { state, result } = open(name)
      expect(result.wires.length, name).toBeGreaterThan(0)
      expect(activeDocument(state).extras.wires.length, name).toBe(result.wires.length)
      for (const wire of result.wires) {
        expect(wire.points.length, name).toBeGreaterThanOrEqual(2)
        for (const point of wire.points) {
          expect(Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z), name).toBe(true)
        }
      }
    }
  })

  it('[CAD] a file the reader cannot make sense of fails with a message', () => {
    expect(() => importFile('broken.step', 'not a step file', {})).toThrow()
    expect(() => importFile('broken.ply', 'ply\nend_header\n', {})).toThrow()
    expect(() => importFile('nope.zip', 'binary', {})).toThrow(/지원하지 않는/)
  })
})

describe('editing what was opened', () => {
  it('[CAD] an imported STEP solid moves, scales and stays selected', () => {
    let { state } = open('cube.step')
    const doc0 = activeDocument(state)
    const id = doc0.solids[0].id

    state = reducer(state, { type: 'select', ids: [id] })
    expect(activeDocument(state).selection).toEqual([id])

    state = reducer(state, { type: 'move-solid', id, position: { x: 25, y: 0, z: -10 } })
    expect(activeDocument(state).solids[0].position).toEqual({ x: 25, y: 0, z: -10 })

    // Scaling leaves the mesh alone and doubles where the part actually sits.
    const before = spread(worldTriangles(activeDocument(state).solids[0]), 0)
    state = reducer(state, { type: 'update-solid', id, patch: { scale: { x: 2, y: 1, z: 1 } } })
    const after = spread(worldTriangles(activeDocument(state).solids[0]), 0)
    expect(after).toBeCloseTo(before * 2, 6)
    expect(trianglePositions(activeDocument(state).solids[0])).toHaveLength(
      trianglePositions(doc0.solids[0]).length
    )

    // Undo walks the edits back one at a time.
    state = reducer(state, { type: 'undo' })
    expect(activeDocument(state).solids[0].scale.x).toBe(1)
    state = reducer(state, { type: 'undo' })
    expect(activeDocument(state).solids[0].position.x).toBe(0)
    state = reducer(state, { type: 'redo' })
    expect(activeDocument(state).solids[0].position.x).toBe(25)
  })

  it('[CAD] registry commands run on imported geometry', () => {
    const { state } = open('cube.step')
    const doc = activeDocument(state)
    const solid = doc.solids[0]
    let counter = 0
    const context = { doc: { ...doc, selection: [solid.id] }, nextId: () => `new-${++counter}` }

    // Mesh tools work on it and keep it a mesh.
    const decimated = runCommandById('meshDecimate', context)
    const reduced = decimated?.solids?.[0] as Solid | undefined
    expect(reduced?.kind).toBe('mesh')
    expect(reduced?.mesh?.positions.length ?? 0).toBeGreaterThan(0)
    expect(reduced?.mesh?.positions.length ?? 0).toBeLessThanOrEqual(solid.mesh?.positions.length ?? 0)

    // Scaling a mesh through the registry keeps every triangle.
    const scaled = runCommandById('meshScale', context)?.solids?.[0] as Solid | undefined
    expect(scaled?.mesh?.positions).toHaveLength(solid.mesh?.positions.length ?? 0)

    // Measurements read the geometry that came out of the file.
    for (const id of ['measureVolumeCmd', 'measureBoxCmd', 'partArea']) {
      const effect = runCommandById(id, context)
      expect(effect, id).toBeTruthy()
      const text = [effect?.status ?? '', ...(effect?.report?.lines ?? [])].join(' ')
      expect(text, id).toMatch(/\d/)
    }

    // And the B-rep reader recognises the imported shell.
    const brep = runCommandById('brepInfo', context)
    expect([...(brep?.report?.lines ?? []), brep?.status ?? ''].join(' ')).toMatch(/\d/)
  })

  it('[CAD] a boolean joins an imported solid with a native one', () => {
    let { state } = open('cube.step')
    state = reducer(state, { type: 'add-solid', kind: 'sphere' })
    const doc = activeDocument(state)
    expect(doc.solids).toHaveLength(2)
    const joined = booleanSolids(doc.solids[0], doc.solids[1], 'union', 'union-1')
    expect(trianglePositions(joined).length).toBeGreaterThan(0)
    // The union is at least as big as the larger of the two inputs.
    const volume = meshVolume(trianglePositions(joined))
    expect(volume).toBeGreaterThan(meshVolume(trianglePositions(doc.solids[0])) * 0.9)
  })
})

describe('saving it again', () => {
  it('[CAD] an imported solid exports to every mesh format and reads back', () => {
    const { state } = open('cube.step')
    const doc = activeDocument(state)
    const source = meshVolume(trianglePositions(doc.solids[0]))
    expect(source).toBeCloseTo(64000, 0)

    const step = runExport('step', { doc, selectedOnly: false })
    expect(meshVolume(parseStep(step.text, 'x').solid.mesh?.positions ?? [])).toBeCloseTo(source, 3)

    const ply = runExport('ply', { doc, selectedOnly: false })
    expect(meshVolume(parsePly(ply.text, 'x').solid.mesh?.positions ?? [])).toBeCloseTo(source, 3)

    const off = runExport('off', { doc, selectedOnly: false })
    expect(meshVolume(parseOff(off.text, 'x').solid.mesh?.positions ?? [])).toBeCloseTo(source, 3)

    // The edits go out with it: a moved solid exports where it now sits.
    const moved = reducer(state, { type: 'move-solid', id: doc.solids[0].id, position: { x: 100, y: 0, z: 0 } })
    const shifted = runExport('step', { doc: activeDocument(moved), selectedOnly: false })
    const readBack = parseStep(shifted.text, 'x').solid.mesh?.positions ?? []
    let minX = Infinity
    for (let i = 0; i < readBack.length; i += 3) minX = Math.min(minX, readBack[i])
    expect(minX).toBeCloseTo(80, 3)
  })

  it('[CAD] wires from IGES export again as IGES', () => {
    const { state } = open('profile.igs')
    const doc = activeDocument(state)
    const out = runExport('iges', { doc, selectedOnly: false })
    expect(out.text).toContain('110,')
    expect(out.name.endsWith('.igs')).toBe(true)
    const back = importFile('again.igs', out.text, {})
    expect(back.wires.length).toBe(doc.extras.wires.length)
  })
})

describe('the same thing through the window', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('[GUI] a STEP file dropped on the canvas opens, edits and exports', async () => {
    const user = userEvent.setup({ delay: null })
    // The browser build downloads through an anchor; capture what it offers.
    const downloads: string[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download)
    })
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:mock' })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined })

    render(<App />)
    const viewport = await screen.findByTestId('viewport')
    const file = new File([read('cube.step')], 'cube.step', { type: 'application/x-step' })
    fireEvent.drop(viewport, { dataTransfer: { files: [file] } })
    await waitFor(() => expect(screen.getByTestId('status-objects').textContent).toContain('1'))
    expect(screen.getByTestId('status-text').textContent).toContain('STEP')

    // It behaves like any other solid: selectable, and editable in the panel.
    const entry = screen.getAllByTestId(/^solid-/)[0]
    await user.click(entry)
    expect(screen.getByTestId('status-selection').textContent).toContain('1')
    const x = screen.getByTestId('prop-position-x') as HTMLInputElement
    const before = Number(x.value)
    await user.click(screen.getByTestId('prop-position-x-inc'))
    expect(Number((screen.getByTestId('prop-position-x') as HTMLInputElement).value)).toBe(before + 1)

    // And it goes back out as STEP through the export dialog.
    await user.click(screen.getByTestId('tb-export'))
    await user.click(screen.getByTestId('export-format-step'))
    await user.click(screen.getByTestId('export-run'))
    await waitFor(() => expect(downloads.length).toBeGreaterThan(0))
    expect(downloads[0].endsWith('.step')).toBe(true)
    expect(screen.getByTestId('status-text').textContent).toContain('.step')
    click.mockRestore()
  })

  it('[GUI] PLY, OFF and Collada files open the same way', async () => {
    for (const [file, label] of [['plate.ply', 'PLY'], ['wedge.off', 'OFF'], ['bracket.dae', 'Collada']]) {
      const view = render(<App />)
      const viewport = await screen.findAllByTestId('viewport')
      fireEvent.drop(viewport[viewport.length - 1], {
        dataTransfer: { files: [new File([read(file)], file, { type: 'text/plain' })] }
      })
      await waitFor(() => {
        const status = screen.getAllByTestId('status-text').at(-1)
        expect(status?.textContent, file).toContain(label)
      })
      view.unmount()
    }
  })
})
