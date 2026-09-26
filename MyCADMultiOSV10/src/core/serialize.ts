import { FILE_EXTENSION } from './buildInfo'
import { createDocument, type CadDocument, type Solid } from './model'

export interface MycadFile {
  format: 'mycad'
  version: 1
  document: Omit<CadDocument, 'dirty' | 'selection'>
}

export function serializeDocument(doc: CadDocument): string {
  const file: MycadFile = {
    format: 'mycad',
    version: 1,
    document: {
      id: doc.id,
      name: doc.name,
      filePath: doc.filePath,
      solids: doc.solids,
      sketches: doc.sketches ?? [],
      features: doc.features ?? [],
      parameters: doc.parameters ?? [],
      mates: doc.mates ?? [],
      section: doc.section === true,
      preset: doc.preset,
      shade: doc.shade
    }
  }
  return JSON.stringify(file, null, 2)
}

export function parseDocument(text: string, fallbackId: string): CadDocument {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    throw new Error(`파일을 읽을 수 없습니다: ${(error as Error).message}`)
  }
  if (!data || typeof data !== 'object') throw new Error('MyCAD 파일 형식이 아닙니다.')
  const raw = data as Partial<MycadFile>
  if (raw.format !== 'mycad' || !raw.document) throw new Error('MyCAD 파일 형식이 아닙니다.')
  const src = raw.document
  const doc = createDocument(src.id || fallbackId, src.name || 'Untitled')
  doc.filePath = src.filePath
  doc.preset = src.preset || 'iso'
  doc.shade = src.shade || 'shaded'
  doc.solids = Array.isArray(src.solids) ? src.solids.map(normalizeSolid) : []
  doc.sketches = Array.isArray(src.sketches) ? src.sketches : []
  doc.features = Array.isArray(src.features) ? src.features : []
  doc.parameters = Array.isArray(src.parameters) ? src.parameters : []
  doc.mates = Array.isArray(src.mates) ? src.mates : []
  doc.section = src.section === true
  doc.dirty = false
  return doc
}

function normalizeSolid(input: Solid): Solid {
  return {
    ...input,
    position: { ...input.position },
    rotation: { ...input.rotation },
    scale: { ...input.scale },
    size: { ...input.size },
    visible: input.visible !== false,
    locked: input.locked === true
  }
}

export function fileNameFromPath(filePath: string): string {
  const base = filePath.split(/[/\\]/).pop() || `untitled.${FILE_EXTENSION}`
  return base
}

export function ensureExtension(filePath: string): string {
  return filePath.toLowerCase().endsWith(`.${FILE_EXTENSION}`) ? filePath : `${filePath}.${FILE_EXTENSION}`
}
