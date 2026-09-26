// Every format the document can be written to, in one registry, so the Export
// dialog, the File menu and the tests all see the same list.
import type { CadDocument, Solid } from './model'
import { selectedSolids } from './model'
import { serializeDocument } from './serialize'
import { toAsciiStl } from './stl'
import { solidVolume, toObj } from './part'
import { sketchesToDxf, sketchesToSvg } from './drawing'
import { createPage, pageToDxf, pageToSvg as drawingPageToSvg, projectionGroup } from './techdraw'
import { exportIfc, describeElement, makeLevels } from './archwb'
import { sheetToCsv } from './spreadsheet'
import { TOOL_LIBRARY, pocketOperation, postProcess, profileOperation } from './camwb'
import { boundingBoxOf, trianglePositions, worldTriangles } from './primitives'
import { toIges, toOff, toPly, toStep, wireframeOf } from './cadformats'

export interface ExportContext {
  doc: CadDocument
  /** export only the selected solids where the format supports it */
  selectedOnly: boolean
}

export interface ExportFormat {
  id: string
  ext: string
  label: { ko: string; en: string }
  mime: string
  /** what the format captures, shown in the dialog */
  scope: { ko: string; en: string }
  build: (context: ExportContext) => string
}

function pick(context: ExportContext): Solid[] {
  const chosen = context.selectedOnly ? selectedSolids(context.doc) : context.doc.solids.filter((solid) => solid.visible)
  return chosen.length > 0 ? chosen : context.doc.solids
}

export const EXPORT_FORMATS: ExportFormat[] = [
  {
    id: 'mycad',
    ext: 'mycad',
    label: { ko: 'MyCAD 문서', en: 'MyCAD document' },
    mime: 'application/x-mycad',
    scope: { ko: '문서 전체(피처·파라미터 포함)', en: 'Whole document with features and parameters' },
    build: (context) => serializeDocument(context.doc)
  },
  {
    id: 'stl',
    ext: 'stl',
    label: { ko: 'STL 메쉬', en: 'STL mesh' },
    mime: 'model/stl',
    scope: { ko: '삼각형 메쉬', en: 'Triangle mesh' },
    build: (context) => toAsciiStl(pick(context))
  },
  {
    id: 'obj',
    ext: 'obj',
    label: { ko: 'OBJ 메쉬', en: 'OBJ mesh' },
    mime: 'model/obj',
    scope: { ko: '삼각형 메쉬 + 객체 이름', en: 'Triangle mesh with object names' },
    build: (context) => toObj(pick(context))
  },
  {
    id: 'step',
    ext: 'step',
    label: { ko: 'STEP (AP214)', en: 'STEP (AP214)' },
    mime: 'application/x-step',
    scope: { ko: '평면 면으로 된 B-rep 솔리드', en: 'B-rep solids with planar faces' },
    build: (context) => toStep(pick(context), (solid) => worldTriangles(solid as Solid))
  },
  {
    id: 'ply',
    ext: 'ply',
    label: { ko: 'PLY 메쉬', en: 'PLY mesh' },
    mime: 'model/mesh',
    scope: { ko: '삼각형 메쉬 (ASCII)', en: 'Triangle mesh (ASCII)' },
    build: (context) => toPly(pick(context).flatMap((solid) => worldTriangles(solid)), context.doc.name)
  },
  {
    id: 'off',
    ext: 'off',
    label: { ko: 'OFF 메쉬', en: 'OFF mesh' },
    mime: 'model/mesh',
    scope: { ko: '삼각형 메쉬 (Geomview)', en: 'Triangle mesh (Geomview)' },
    build: (context) => toOff(pick(context).flatMap((solid) => worldTriangles(solid)))
  },
  {
    id: 'iges',
    ext: 'igs',
    label: { ko: 'IGES 와이어프레임', en: 'IGES wireframe' },
    mime: 'model/iges',
    scope: { ko: '드래프트 와이어를 선 엔티티로', en: 'Draft wires as line entities' },
    // Draft wires if the document has any; otherwise the edges of the solids,
    // so a model without 2D geometry still exports something usable.
    build: (context) => toIges(
      context.doc.extras.wires.length > 0
        ? context.doc.extras.wires
        : wireframeOf(pick(context).flatMap((solid) => worldTriangles(solid)))
    )
  },
  {
    id: 'svg',
    ext: 'svg',
    label: { ko: 'SVG 스케치', en: 'SVG sketch' },
    mime: 'image/svg+xml',
    scope: { ko: '스케치 윤곽', en: 'Sketch outlines' },
    build: (context) => sketchesToSvg(context.doc.sketches ?? [])
  },
  {
    id: 'dxf',
    ext: 'dxf',
    label: { ko: 'DXF 스케치', en: 'DXF sketch' },
    mime: 'image/vnd.dxf',
    scope: { ko: '스케치 윤곽', en: 'Sketch outlines' },
    build: (context) => sketchesToDxf(context.doc.sketches ?? [])
  },
  {
    id: 'drawingSvg',
    ext: 'svg',
    label: { ko: '도면 SVG (정면·평면·측면·아이소)', en: 'Drawing SVG (four views)' },
    mime: 'image/svg+xml',
    scope: { ko: 'TechDraw 투영 도면', en: 'TechDraw projection sheet' },
    build: (context) => drawingPageToSvg(createPage(context.doc.name, 'A4-landscape', projectionGroup(pick(context), 1), { author: 'MyCAD' }))
  },
  {
    id: 'drawingDxf',
    ext: 'dxf',
    label: { ko: '도면 DXF (정면·평면·측면·아이소)', en: 'Drawing DXF (four views)' },
    mime: 'image/vnd.dxf',
    scope: { ko: 'TechDraw 투영 도면', en: 'TechDraw projection sheet' },
    build: (context) => pageToDxf(createPage(context.doc.name, 'A4-landscape', projectionGroup(pick(context), 1)))
  },
  {
    id: 'ifc',
    ext: 'ifc',
    label: { ko: 'IFC4 건축 모델', en: 'IFC4 building model' },
    mime: 'application/x-step',
    scope: { ko: 'BIM 요소(없으면 솔리드를 벽으로)', en: 'BIM elements, or solids as walls' },
    build: (context) => {
      const elements = context.doc.extras.bimElements.length > 0
        ? context.doc.extras.bimElements
        : pick(context).map((solid) => describeElement(solid, 'wall'))
      const levels = context.doc.extras.levels.length > 0 ? context.doc.extras.levels : makeLevels(1)
      return exportIfc(elements, levels, context.doc.name)
    }
  },
  {
    id: 'gcode',
    ext: 'nc',
    label: { ko: 'G코드 (윤곽 + 포켓)', en: 'G-code (profile + pocket)' },
    mime: 'text/x-gcode',
    scope: { ko: '바운딩 박스 기준 2.5D 경로', en: '2.5D paths from the bounding box' },
    build: (context) => {
      const box = boundingBoxOf(pick(context))
      const width = Math.max(4, box.size.x)
      const depth = Math.max(4, box.size.z)
      const height = Math.max(1, box.size.y)
      const tool = TOOL_LIBRARY[0]
      return postProcess(
        [profileOperation(width, depth, height, tool, 1), pocketOperation(width, depth, Math.min(height, 4), tool, 1, 0.45)],
        'grbl',
        context.doc.name.toUpperCase()
      )
    }
  },
  {
    id: 'points',
    ext: 'asc',
    label: { ko: '점군 (ASC)', en: 'Point cloud (ASC)' },
    mime: 'text/plain',
    scope: { ko: '메쉬 정점', en: 'Mesh vertices' },
    build: (context) => {
      const lines = ['# x y z']
      for (const solid of pick(context)) {
        const positions = trianglePositions(solid)
        for (let i = 0; i + 2 < positions.length; i += 9) {
          lines.push([
            (positions[i] * solid.scale.x + solid.position.x).toFixed(4),
            (positions[i + 1] * solid.scale.y + solid.position.y).toFixed(4),
            (positions[i + 2] * solid.scale.z + solid.position.z).toFixed(4)
          ].join(' '))
        }
      }
      return lines.join('\n')
    }
  },
  {
    id: 'csv',
    ext: 'csv',
    label: { ko: '스프레드시트 CSV', en: 'Spreadsheet CSV' },
    mime: 'text/csv',
    scope: { ko: '시트 셀 값', en: 'Sheet cell values' },
    build: (context) => {
      const parameters: Record<string, number> = {}
      for (const parameter of context.doc.parameters ?? []) parameters[parameter.name] = parameter.value
      const csv = sheetToCsv(context.doc.extras.sheet, parameters)
      if (csv.trim() !== '') return csv
      // No spreadsheet yet: write the parameters and the solid dimensions.
      const rows = ['name,x,y,z,volume']
      for (const solid of pick(context)) {
        rows.push([
          solid.name,
          round(solid.size.x * solid.scale.x),
          round(solid.size.y * solid.scale.y),
          round(solid.size.z * solid.scale.z),
          round(solidVolume(solid))
        ].join(','))
      }
      for (const parameter of context.doc.parameters ?? []) rows.push(`${parameter.name},${parameter.value},,,`)
      return rows.join('\n')
    }
  },
  {
    id: 'macro',
    ext: 'mycadmacro',
    label: { ko: 'MyCAD 매크로', en: 'MyCAD macro' },
    mime: 'text/plain',
    scope: { ko: '문서를 다시 만드는 명령', en: 'Commands that rebuild the document' },
    build: (context) => {
      const lines = [`# ${context.doc.name} - generated by MyCAD`]
      for (const solid of pick(context)) {
        if (solid.kind === 'mesh') {
          lines.push(`# ${solid.name}: mesh with ${(solid.mesh?.positions.length ?? 0) / 9} triangles`)
          continue
        }
        if (solid.kind === 'box' || solid.kind === 'plane') {
          lines.push(`box(${round(solid.size.x)}, ${round(solid.size.y)}, ${round(solid.size.z)})`)
        } else if (solid.kind === 'sphere') {
          lines.push(`sphere(${round(solid.size.radius)})`)
        } else {
          lines.push(`${solid.kind}(${round(solid.size.radius)}, ${round(solid.size.y)})`)
        }
        lines.push(`move(${round(solid.position.x)}, ${round(solid.position.y)}, ${round(solid.position.z)})`)
      }
      return lines.join('\n')
    }
  },
  {
    id: 'python',
    ext: 'py',
    label: { ko: 'Python 스크립트', en: 'Python script' },
    mime: 'text/x-python',
    scope: { ko: 'Part API 로 문서를 재현', en: 'Rebuilds the document through the Part API' },
    build: (context) => {
      const lines = ['import Part', `doc = App.newDocument("${context.doc.name}")`]
      pick(context).forEach((solid, index) => {
        const variable = `shape${index + 1}`
        if (solid.kind === 'sphere') lines.push(`${variable} = Part.makeSphere(${round(solid.size.radius)})`)
        else if (solid.kind === 'cylinder') lines.push(`${variable} = Part.makeCylinder(${round(solid.size.radius)}, ${round(solid.size.y)})`)
        else if (solid.kind === 'cone') lines.push(`${variable} = Part.makeCone(${round(solid.size.radius)}, ${round(solid.size.y)})`)
        else if (solid.kind === 'torus') lines.push(`${variable} = Part.makeTorus(${round(solid.size.radius)}, ${round(solid.size.tube)})`)
        else lines.push(`${variable} = Part.makeBox(${round(solid.size.x)}, ${round(solid.size.y)}, ${round(solid.size.z)})`)
        lines.push(`obj${index + 1} = doc.addObject("Part::Feature", "${solid.name}")`)
        lines.push(`obj${index + 1}.Shape = ${variable}`)
      })
      lines.push('doc.recompute()')
      lines.push('print("objects", len(doc.Objects))')
      return lines.join('\n')
    }
  }
]

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

export function exportFormat(id: string): ExportFormat {
  const format = EXPORT_FORMATS.find((item) => item.id === id)
  if (!format) throw new Error(`알 수 없는 내보내기 형식: ${id}`)
  return format
}

export function exportFileName(doc: CadDocument, format: ExportFormat): string {
  const base = (doc.name || 'document').replace(/[\\/:*?"<>|]/g, '_')
  const suffix = format.id === 'drawingSvg' || format.id === 'drawingDxf' ? '-sheet' : ''
  return `${base}${suffix}.${format.ext}`
}

export function runExport(id: string, context: ExportContext): { name: string; text: string; format: ExportFormat } {
  const format = exportFormat(id)
  const text = format.build(context)
  if (!text || text.trim() === '') throw new Error(`${format.label.ko}: 내보낼 내용이 없습니다.`)
  return { name: exportFileName(context.doc, format), text, format }
}
