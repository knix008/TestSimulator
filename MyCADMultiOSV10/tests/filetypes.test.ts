import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FILE_TYPES, fileExtension, fileTypeFor, importCsv, importFile, openFilters, supportedExtensions
} from '../src/core/fileTypes'
import { solidVolume } from '../src/core/part'

const root = process.cwd()

function sample(name: string): string {
  return readFileSync(join(root, 'sample', name), 'utf8')
}

interface GeneratedTypes {
  generator: string
  types: Array<{ ext: string; name: string; ko: string; en: string; role: string; default: boolean; builtin?: boolean }>
}

describe('file types', () => {
  it('[File] the app, the installer script and package.json agree', () => {
    const generatedPath = join(root, 'build', 'file-types.json')
    expect(existsSync(generatedPath), 'npm run build:installer 를 실행하세요').toBe(true)
    const generated = JSON.parse(readFileSync(generatedPath, 'utf8')) as GeneratedTypes
    expect(generated.types.map((type) => type.ext)).toEqual(FILE_TYPES.map((type) => type.ext))
    for (const type of FILE_TYPES) {
      const match = generated.types.find((item) => item.ext === type.ext)
      expect(match, type.ext).toBeTruthy()
      expect(match!.name, type.ext).toBe(type.name)
      expect(match!.role, type.ext).toBe(type.role)
      expect(match!.ko, type.ext).toBe(type.description.ko)
      expect(match!.en, type.ext).toBe(type.description.en)
    }

    // The NSIS include must offer every user-selectable type.
    const nsh = readFileSync(join(root, 'build', 'installer-associations.nsh'), 'utf8')
    const selectable = generated.types.filter((type) => !type.builtin)
    expect(nsh).toContain(`!define MYCAD_ASSOC_COUNT ${selectable.length}`)
    for (const type of selectable) {
      expect(nsh, type.ext).toContain(`.${type.ext} — ${type.ko}`)
      expect(nsh, type.ext).toContain(`Software\\Classes\\${type.name}\\shell\\open\\command`)
      expect(nsh, type.ext).toContain(`Software\\Classes\\.${type.ext}\\OpenWithProgids`)
      expect(nsh, type.ext).toContain(`DeleteRegKey SHCTX "Software\\Classes\\${type.name}"`)
    }
    expect(nsh).toContain('MyCadAssocPageCreate')
    expect(nsh).toContain('MyCadWriteAssociations')
    expect(nsh).toContain('MyCadDeleteAssociations')

    // The installer script wires the page into the wizard.
    const installer = readFileSync(join(root, 'build', 'installer.nsh'), 'utf8')
    expect(installer).toContain('!include "installer-associations.nsh"')
    expect(installer).toContain('customPageAfterChangeDir')
    expect(installer).toContain('!insertmacro MyCadWriteAssociations')
    expect(installer).toContain('!insertmacro MyCadDeleteAssociations')

    // The document type ships with the application bundle.
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      build: { fileAssociations: Array<{ ext: string }>; extraResources: Array<{ from: string; to: string }> }
    }
    expect(pkg.build.fileAssociations.map((entry) => entry.ext)).toEqual(['mycad'])
    expect(pkg.build.extraResources.some((entry) => entry.to === 'file-icon.ico')).toBe(true)

    // The main process accepts exactly the same extensions.
    const main = readFileSync(join(root, 'electron', 'main.cjs'), 'utf8')
    for (const ext of supportedExtensions()) expect(main, ext).toContain(`'${ext}'`)
    expect(main).toContain("ipcMain.handle('read-path'")
    expect(main).toContain("app.on('open-file'")
  })

  it('[File] every control on the association page is inside the page', () => {
    // The MUI inner dialog is 300 x 140 dialog units. A control drawn past
    // that is simply not displayed, which is how half the list went missing
    // when the number of file types grew.
    const nsh = readFileSync(join(root, 'build', 'installer-associations.nsh'), 'utf8')
    const controls = [...nsh.matchAll(/NSD_Create(Checkbox|Button)\} (-?\d+)u (-?\d+)u (\d+)u (\d+)u/g)].map(
      (match) => ({
        kind: match[1],
        x: Number(match[2]),
        y: Number(match[3]),
        width: Number(match[4]),
        height: Number(match[5])
      })
    )
    const selectable = FILE_TYPES.filter((type) => type.ext !== 'mycad').length
    // One checkbox per selectable type, plus the two buttons.
    expect(controls.filter((control) => control.kind === 'Checkbox')).toHaveLength(selectable)
    expect(controls.filter((control) => control.kind === 'Button')).toHaveLength(2)
    for (const control of controls) {
      expect(control.x, JSON.stringify(control)).toBeGreaterThanOrEqual(0)
      expect(control.y, JSON.stringify(control)).toBeGreaterThanOrEqual(0)
      expect(control.x + control.width, JSON.stringify(control)).toBeLessThanOrEqual(300)
      expect(control.y + control.height, JSON.stringify(control)).toBeLessThanOrEqual(140)
    }
    // Nothing overlaps: every control has its own rectangle.
    for (let i = 0; i < controls.length; i++) {
      for (let j = i + 1; j < controls.length; j++) {
        const a = controls[i]
        const b = controls[j]
        const apart =
          a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y
        expect(apart, `${JSON.stringify(a)} overlaps ${JSON.stringify(b)}`).toBe(true)
      }
    }
  })

  it('[File] extensions resolve to their type', () => {
    expect(fileExtension('C:/models/part.STL')).toBe('stl')
    expect(fileTypeFor('part.stl')?.name).toBe('MyCAD.Stl')
    expect(fileTypeFor('drawing.dxf')?.kind).toBe('drawing')
    expect(fileTypeFor('nope.zip')).toBeUndefined()
    const filters = openFilters('ko')
    expect(filters[0].extensions).toEqual(supportedExtensions())
    expect(filters).toHaveLength(FILE_TYPES.length + 1)
  })

  it('[File] every sample opens through importFile', () => {
    const document = importFile('box.mycad', sample('box.mycad'))
    expect(document.document?.solids).toHaveLength(1)

    const stl = importFile('cube.stl', sample('cube.stl'))
    expect(stl.solids).toHaveLength(1)
    expect((stl.solids[0].mesh?.positions.length ?? 0) / 9).toBe(12)

    const obj = importFile('plate.obj', sample('plate.obj'))
    expect(obj.solids.map((item) => item.name)).toEqual(['Plate', 'Boss', 'Rib'])
    expect(solidVolume(obj.solids[0])).toBeGreaterThan(0)

    const dxf = importFile('profile.dxf', sample('profile.dxf'))
    expect(dxf.wires.length).toBe(24)

    const svg = importFile('profile.svg', sample('profile.svg'))
    expect(svg.wires.length).toBe(9)

    const scad = importFile('bracket.scad', sample('bracket.scad'))
    expect(scad.solids).toHaveLength(1)

    const ifc = importFile('building.ifc', sample('building.ifc'))
    expect(ifc.report.join('\n')).toContain('Level 1')

    const points = importFile('scan-points.asc', sample('scan-points.asc'))
    expect(points.report[0]).toBe('169 points')

    const gcode = importFile('pocket.nc', sample('pocket.nc'))
    expect(gcode.wires).toHaveLength(1)
    expect(gcode.wires[0].points.length).toBeGreaterThan(10)

    const macro = importFile('macro.mycadmacro', sample('macro.mycadmacro'))
    expect(macro.status).toContain('매크로')

    const addon = importFile('addon.mycadaddon', sample('addon-manifest.json'))
    expect(addon.addon?.id).toBe('hex-nuts')

    const csv = importCsv('spreadsheet.csv', sample('spreadsheet.csv'))
    expect(csv.values.values.B3).toBe(4000)
  })

  it('[File] unsupported files are rejected with a clear message', () => {
    expect(() => importFile('archive.zip', 'x')).toThrow(/지원하지 않는 파일 형식/)
    expect(() => importFile('empty.stl', 'solid x\nendsolid x')).toThrow()
    expect(() => importFile('empty.obj', '# nothing')).toThrow(/OBJ/)
  })
})
