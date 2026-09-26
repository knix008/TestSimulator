// The file formats MyCAD can open, in one place: the installer registers
// exactly these extensions with the operating system, and `importFile` is what
// the application runs when one of them is opened.
import type { CadDocument, Solid } from './model'
import { parseDocument } from './serialize'
import { parseDae, parseIges, parseOff, parsePly, parseStep } from './cadformats'
import { parseStl } from './stl'
import { parseObj } from './part'
import { parseDxfWires, parseSvgWires } from './drawing'
import { compileOpenScad, parsePoints, pointCloudSolid } from './extended'
import { importIfc } from './archwb'
import { parseCsv, evaluateSheet } from './spreadsheet'
import { parseDesignTable } from './knowledge'
import { runPython } from './python'
import { parseMacro } from './expressions'
import { createSolid } from './model'
import { makePrimitive } from './primitives'
import { parseManifest, type AddonManifest } from './addons'
import type { Wire } from './draftwb'

export type FileRole = 'Editor' | 'Viewer'

export interface FileTypeDef {
  /** extension without the dot */
  ext: string
  /** registry / bundle identifier */
  name: string
  description: { ko: string; en: string }
  mime: string
  role: FileRole
  kind: 'document' | 'mesh' | 'drawing' | 'points' | 'model' | 'script' | 'data' | 'toolpath'
}

export const FILE_TYPES: FileTypeDef[] = [
  { ext: 'mycad', name: 'MyCAD.Document', description: { ko: 'MyCAD 3D 문서', en: 'MyCAD 3D document' }, mime: 'application/x-mycad', role: 'Editor', kind: 'document' },
  { ext: 'stl', name: 'MyCAD.Stl', description: { ko: 'STL 메쉬', en: 'STL mesh' }, mime: 'model/stl', role: 'Viewer', kind: 'mesh' },
  { ext: 'obj', name: 'MyCAD.Obj', description: { ko: 'OBJ 메쉬', en: 'OBJ mesh' }, mime: 'model/obj', role: 'Viewer', kind: 'mesh' },
  { ext: 'dxf', name: 'MyCAD.Dxf', description: { ko: 'DXF 도면', en: 'DXF drawing' }, mime: 'image/vnd.dxf', role: 'Viewer', kind: 'drawing' },
  { ext: 'svg', name: 'MyCAD.Svg', description: { ko: 'SVG 도면', en: 'SVG drawing' }, mime: 'image/svg+xml', role: 'Viewer', kind: 'drawing' },
  { ext: 'scad', name: 'MyCAD.OpenScad', description: { ko: 'OpenSCAD 소스', en: 'OpenSCAD source' }, mime: 'text/x-scad', role: 'Viewer', kind: 'model' },
  { ext: 'ifc', name: 'MyCAD.Ifc', description: { ko: 'IFC 건축 모델', en: 'IFC building model' }, mime: 'application/x-step', role: 'Viewer', kind: 'model' },
  { ext: 'step', name: 'MyCAD.Step', description: { ko: 'STEP 모델 (AP203/214)', en: 'STEP model (AP203/214)' }, mime: 'application/x-step', role: 'Viewer', kind: 'model' },
  { ext: 'stp', name: 'MyCAD.StepAlt', description: { ko: 'STEP 모델', en: 'STEP model' }, mime: 'application/x-step', role: 'Viewer', kind: 'model' },
  { ext: 'igs', name: 'MyCAD.Iges', description: { ko: 'IGES 와이어프레임', en: 'IGES wireframe' }, mime: 'model/iges', role: 'Viewer', kind: 'drawing' },
  { ext: 'iges', name: 'MyCAD.IgesAlt', description: { ko: 'IGES 와이어프레임', en: 'IGES wireframe' }, mime: 'model/iges', role: 'Viewer', kind: 'drawing' },
  { ext: 'ply', name: 'MyCAD.Ply', description: { ko: 'PLY 메쉬', en: 'PLY mesh' }, mime: 'model/mesh', role: 'Viewer', kind: 'mesh' },
  { ext: 'off', name: 'MyCAD.Off', description: { ko: 'OFF 메쉬', en: 'OFF mesh' }, mime: 'model/mesh', role: 'Viewer', kind: 'mesh' },
  { ext: 'dae', name: 'MyCAD.Collada', description: { ko: 'Collada 메쉬', en: 'Collada mesh' }, mime: 'model/vnd.collada+xml', role: 'Viewer', kind: 'mesh' },
  { ext: 'asc', name: 'MyCAD.Points', description: { ko: '점군 (ASC)', en: 'Point cloud (ASC)' }, mime: 'text/plain', role: 'Viewer', kind: 'points' },
  { ext: 'xyz', name: 'MyCAD.PointsXyz', description: { ko: '점군 (XYZ)', en: 'Point cloud (XYZ)' }, mime: 'text/plain', role: 'Viewer', kind: 'points' },
  { ext: 'nc', name: 'MyCAD.Gcode', description: { ko: 'G코드 가공 경로', en: 'G-code toolpath' }, mime: 'text/x-gcode', role: 'Viewer', kind: 'toolpath' },
  { ext: 'gcode', name: 'MyCAD.GcodeAlt', description: { ko: 'G코드 가공 경로', en: 'G-code toolpath' }, mime: 'text/x-gcode', role: 'Viewer', kind: 'toolpath' },
  { ext: 'mycadmacro', name: 'MyCAD.Macro', description: { ko: 'MyCAD 매크로', en: 'MyCAD macro' }, mime: 'text/plain', role: 'Editor', kind: 'script' },
  { ext: 'mycadaddon', name: 'MyCAD.Addon', description: { ko: 'MyCAD 애드온', en: 'MyCAD addon' }, mime: 'application/json', role: 'Editor', kind: 'data' }
]

export function fileExtension(path: string): string {
  const base = path.split(/[/\\]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  return dot < 0 ? '' : base.slice(dot + 1).toLowerCase()
}

export function fileTypeFor(path: string): FileTypeDef | undefined {
  return FILE_TYPES.find((type) => type.ext === fileExtension(path))
}

export function supportedExtensions(): string[] {
  return FILE_TYPES.map((type) => type.ext)
}

/** Open dialog filters covering every format, plus one entry per format. */
export function openFilters(lang: 'ko' | 'en' = 'ko'): Array<{ name: string; extensions: string[] }> {
  return [
    { name: lang === 'ko' ? '지원하는 모든 파일' : 'All supported files', extensions: supportedExtensions() },
    ...FILE_TYPES.map((type) => ({ name: type.description[lang], extensions: [type.ext] }))
  ]
}

export interface ImportResult {
  /** a whole document replaces the current one */
  document?: CadDocument
  solids: Solid[]
  wires: Wire[]
  /** spreadsheet loaded from a CSV */
  sheet?: ReturnType<typeof parseCsv>
  addon?: AddonManifest
  report: string[]
  status: string
}

/**
 * Open a file the operating system handed us. Every branch maps to the parser
 * the corresponding workbench already uses, so a double-clicked file behaves
 * exactly like the matching import command.
 */
export function importFile(path: string, text: string, options: { id?: string } = {}): ImportResult {
  const type = fileTypeFor(path)
  const id = options.id ?? 'imported'
  const name = path.split(/[/\\]/).pop() ?? path
  if (!type) throw new Error(`지원하지 않는 파일 형식입니다: ${name}`)
  switch (type.ext) {
    case 'mycad': {
      const document = parseDocument(text, id)
      return { document, solids: [], wires: [], report: [`${document.name}: ${document.solids.length} objects`], status: `${name} 열기` }
    }
    case 'stl': {
      const solid = parseStl(text, id)
      solid.name = name.replace(/\.stl$/i, '')
      return { solids: [solid], wires: [], report: [`${solid.name}: ${(solid.mesh?.positions.length ?? 0) / 9} triangles`], status: `STL 가져오기 ${name}` }
    }
    case 'obj': {
      const solids = parseObj(text, id)
      if (solids.length === 0) throw new Error('OBJ에서 면을 찾지 못했습니다.')
      return { solids, wires: [], report: solids.map((solid) => `${solid.name}: ${(solid.mesh?.positions.length ?? 0) / 9} triangles`), status: `OBJ 가져오기 ${name}` }
    }
    case 'dxf': {
      const wires = parseDxfWires(text, id)
      if (wires.length === 0) throw new Error('DXF에서 선을 찾지 못했습니다.')
      return { solids: [], wires, report: [`${wires.length} wires`], status: `DXF 가져오기 ${name}` }
    }
    case 'svg': {
      const wires = parseSvgWires(text, id)
      if (wires.length === 0) throw new Error('SVG에서 도형을 찾지 못했습니다.')
      return { solids: [], wires, report: [`${wires.length} wires`], status: `SVG 가져오기 ${name}` }
    }
    case 'scad': {
      const solid = compileOpenScad(text)
      solid.id = id
      solid.name = name.replace(/\.scad$/i, '')
      return { solids: [solid], wires: [], report: [`${solid.name} compiled`], status: `OpenSCAD 가져오기 ${name}` }
    }
    case 'ifc': {
      const summary = importIfc(text)
      const report = [
        `storeys: ${summary.storeys.join(', ') || '-'}`,
        ...summary.products.map((product) => `${product.type} ${product.name}`)
      ]
      return { solids: [], wires: [], report, status: `IFC ${summary.products.length} products` }
    }
    case 'step':
    case 'stp': {
      const { solid, report } = parseStep(text, id, name.replace(/\.(step|stp)$/i, ''))
      return { solids: [solid], wires: [], report, status: `STEP 가져오기 ${name}` }
    }
    case 'igs':
    case 'iges': {
      const { wires, report } = parseIges(text, id)
      return { solids: [], wires, report, status: `IGES 가져오기 ${name}` }
    }
    case 'ply': {
      const { solid, report } = parsePly(text, id, name.replace(/\.ply$/i, ''))
      return { solids: [solid], wires: [], report, status: `PLY 가져오기 ${name}` }
    }
    case 'off': {
      const { solid, report } = parseOff(text, id, name.replace(/\.off$/i, ''))
      return { solids: [solid], wires: [], report, status: `OFF 가져오기 ${name}` }
    }
    case 'dae': {
      const { solid, report } = parseDae(text, id, name.replace(/\.dae$/i, ''))
      return { solids: [solid], wires: [], report, status: `Collada 가져오기 ${name}` }
    }
    case 'asc':
    case 'xyz': {
      const points = parsePoints(text)
      if (points.length === 0) throw new Error('점을 찾지 못했습니다.')
      const solid = pointCloudSolid(points, id)
      solid.name = name.replace(/\.(asc|xyz)$/i, '')
      return { solids: [solid], wires: [], report: [`${points.length} points`], status: `점군 ${points.length}개` }
    }
    case 'nc':
    case 'gcode': {
      const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
      const moves = lines.filter((line) => /^G[01]/i.test(line.trim())).length
      const wire = gcodeToWire(lines, id)
      return {
        solids: [],
        wires: wire ? [wire] : [],
        report: [`${lines.length} blocks`, `${moves} moves`, lines.slice(0, 5).join('  ')],
        status: `G코드 ${moves} moves`
      }
    }
    case 'mycadmacro': {
      // MyCAD macros are the compact command form; Python macros go through the
      // interpreter instead (see the Python workbench).
      const result = text.includes('import ') || text.includes('def ')
        ? (() => {
          const python = runPython(text)
          return { solids: python.solids, wires: python.wires, report: [...python.output, `steps ${python.steps}`] }
        })()
        : runSimpleMacro(text, id)
      return {
        solids: result.solids,
        wires: result.wires,
        report: result.report,
        status: `매크로 실행 · 솔리드 ${result.solids.length}개`
      }
    }
    case 'mycadaddon': {
      const addon = parseManifest(text)
      return { solids: [], wires: [], addon, report: [`${addon.name.ko} ${addon.version} (${addon.kind})`], status: `애드온 ${addon.name.ko}` }
    }
    default:
      throw new Error(`지원하지 않는 파일 형식입니다: ${name}`)
  }
}

/** CSV files are loaded into the spreadsheet rather than the 3D scene. */
export function importCsv(path: string, text: string) {
  const name = path.split(/[/\\]/).pop() ?? path
  const sheet = parseCsv(text, name)
  const values = evaluateSheet(sheet)
  let table: ReturnType<typeof parseDesignTable> | null = null
  try {
    table = parseDesignTable(text, name)
  } catch {
    table = null
  }
  return { sheet, values, table }
}

/** Turn the XY moves of a G-code program into a wire for the viewport. */
function gcodeToWire(lines: string[], id: string): Wire | null {
  const points: Array<{ x: number; y: number; z: number }> = []
  let current = { x: 0, y: 0, z: 0 }
  for (const line of lines) {
    if (!/^G[01]/i.test(line.trim())) continue
    const x = /X(-?\d+(?:\.\d+)?)/i.exec(line)
    const y = /Y(-?\d+(?:\.\d+)?)/i.exec(line)
    const z = /Z(-?\d+(?:\.\d+)?)/i.exec(line)
    current = {
      x: x ? Number(x[1]) : current.x,
      // G-code Y is the machine table, which maps to Z in the viewport.
      z: y ? Number(y[1]) : current.z,
      y: z ? Number(z[1]) : current.y
    }
    points.push({ ...current })
  }
  if (points.length < 2) return null
  return { id, name: 'Toolpath', closed: false, points }
}

/**
 * The compact macro form: one call per line, e.g. `box(40, 20, 10)` followed by
 * `move(20, 0, 0)`. Anything the runtime does not know is reported rather than
 * failing the whole file.
 */
export function runSimpleMacro(text: string, id: string): { solids: Solid[]; wires: Wire[]; report: string[] } {
  const commands = parseMacro(text)
  const solids: Solid[] = []
  const report: string[] = []
  const number = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)
  for (const command of commands) {
    const args = command.args
    const last = solids[solids.length - 1]
    switch (command.name) {
      case 'box': {
        const solid = createSolid('box', `${id}-${solids.length}`, solids.length + 1)
        solid.size = { ...solid.size, x: number(args[0], 40), y: number(args[1], 40), z: number(args[2], 40) }
        solid.position = { x: 0, y: solid.size.y / 2, z: 0 }
        solids.push(solid)
        break
      }
      case 'cylinder':
      case 'sphere':
      case 'cone':
      case 'torus': {
        const solid = createSolid(command.name, `${id}-${solids.length}`, solids.length + 1)
        solid.size = { ...solid.size, radius: number(args[0], 20), y: number(args[1], 40) }
        solid.position = { x: 0, y: solid.size.y / 2, z: 0 }
        solids.push(solid)
        break
      }
      case 'prism':
      case 'wedge':
      case 'pyramid':
      case 'tube': {
        solids.push(makePrimitive(command.name as 'prism', `${id}-${solids.length}`, {
          sides: number(args[0], 6), radius: number(args[1], 20), height: number(args[2], 30),
          width: number(args[0], 40), depth: number(args[2], 30), outer: number(args[0], 20), inner: number(args[1], 12)
        }))
        break
      }
      case 'move': {
        if (!last) break
        last.position = {
          x: last.position.x + number(args[0], 0),
          y: last.position.y + number(args[1], 0),
          z: last.position.z + number(args[2], 0)
        }
        break
      }
      case 'scale': {
        if (!last) break
        const factor = number(args[0], 1)
        last.scale = { x: last.scale.x * factor, y: last.scale.y * factor, z: last.scale.z * factor }
        break
      }
      case 'rotate': {
        if (!last) break
        last.rotation = { ...last.rotation, y: last.rotation.y + number(args[0], 0) }
        break
      }
      default:
        report.push(`· ${command.name}(${args.join(', ')}) — 적용되지 않음`)
        continue
    }
    report.push(`✔ ${command.name}(${args.join(', ')})`)
  }
  if (solids.length === 0) throw new Error('매크로가 형상을 만들지 않았습니다.')
  return { solids, wires: [], report }
}
