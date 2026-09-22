/**
 * The program's own file: a `.mdcv` project.
 *
 * It keeps the source text, both formats and the writer options together so
 * a conversion can be reopened and repeated. It is JSON, so it is readable
 * by hand; the installer registers the extension with its own icon.
 */
import type { FormatId } from './doc/formats'
import { isFormatId } from './doc/formats'
import type { WriterOptions } from './doc/options'

export const PROJECT_EXTENSION = 'mdcv'

export type ProjectFile = {
  format: 'mdcv'
  version: 1
  name: string
  from: FormatId
  to: FormatId
  source: string
  /** Binary sources (a DOCX) are kept base64-encoded. */
  sourceBase64?: string
  sourceName?: string
  options: Partial<WriterOptions>
  savedAt: string
}

export function serializeProject(project: Omit<ProjectFile, 'format' | 'version' | 'savedAt'>): string {
  const file: ProjectFile = { format: 'mdcv', version: 1, savedAt: new Date().toISOString(), ...project }
  return `${JSON.stringify(file, null, 2)}\n`
}

export function parseProject(text: string): ProjectFile {
  const parsed = JSON.parse(text) as Partial<ProjectFile>
  if (parsed.format !== 'mdcv' || typeof parsed.source !== 'string' && typeof parsed.sourceBase64 !== 'string') {
    throw new Error('Not a My Document Converter project file')
  }
  return {
    format: 'mdcv',
    version: 1,
    name: typeof parsed.name === 'string' ? parsed.name : 'Untitled',
    from: isFormatId(parsed.from) ? parsed.from : 'markdown',
    to: isFormatId(parsed.to) ? parsed.to : 'html',
    source: typeof parsed.source === 'string' ? parsed.source : '',
    sourceBase64: typeof parsed.sourceBase64 === 'string' ? parsed.sourceBase64 : undefined,
    sourceName: typeof parsed.sourceName === 'string' ? parsed.sourceName : undefined,
    options: parsed.options && typeof parsed.options === 'object' ? parsed.options : {},
    savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
  }
}

export function isProjectName(name: string) {
  return name.toLowerCase().endsWith(`.${PROJECT_EXTENSION}`)
}
