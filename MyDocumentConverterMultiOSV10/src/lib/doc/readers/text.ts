/**
 * Readers for plain text, CSV/TSV, the native JSON document and Jupyter
 * notebooks: formats where the structure is either absent or already data.
 */
import type { Alignment, Block, Doc } from '../ast'
import { emptyDoc, textToInlines } from '../ast'
import { readMarkdown } from './markdown'

export function readPlain(source: string): Doc {
  const text = source.replace(/\r\n?/g, '\n')
  const blocks: Block[] = []
  for (const paragraph of text.split(/\n[ \t]*\n+/)) {
    const trimmed = paragraph.replace(/^\n+|\n+$/g, '')
    if (!trimmed.trim()) continue
    // Text indented on every line is treated as preformatted.
    const lines = trimmed.split('\n')
    if (lines.length > 1 && lines.every((line) => /^(?: {4}|\t)/.test(line))) {
      blocks.push({ t: 'code', text: lines.map((line) => line.replace(/^(?: {4}|\t)/, '')).join('\n') })
      continue
    }
    blocks.push({ t: 'para', c: textToInlines(trimmed) })
  }
  return { meta: {}, blocks }
}

export function readCsv(source: string, delimiter = ','): Doc {
  const rows = parseDelimited(source.replace(/\r\n?/g, '\n'), delimiter)
  if (!rows.length) return emptyDoc()
  const width = Math.max(...rows.map((row) => row.length))
  const pad = (row: string[]) => { const copy = [...row]; while (copy.length < width) copy.push(''); return copy.map((cell) => textToInlines(cell)) }
  const aligns: Alignment[] = Array.from({ length: width }, (_, k) => (rows.slice(1).every((row) => row[k] === undefined || row[k] === '' || /^-?[\d.,]+%?$/.test(row[k].trim())) && rows.length > 1 ? 'right' : 'default'))
  return {
    meta: {},
    blocks: [{ t: 'table', caption: [], aligns, header: pad(rows[0]), rows: rows.slice(1).map(pad) }],
  }
}

export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1 } else quoted = false
      } else cell += ch
      continue
    }
    if (ch === '"') { quoted = true; continue }
    if (ch === delimiter) { row.push(cell); cell = ''; continue }
    if (ch === '\n') {
      row.push(cell)
      cell = ''
      if (row.some((value) => value.trim() !== '')) rows.push(row)
      row = []
      continue
    }
    cell += ch
  }
  row.push(cell)
  if (row.some((value) => value.trim() !== '')) rows.push(row)
  return rows
}

/** The application's own JSON: the document model as it is. */
export function readJson(source: string): Doc {
  const parsed = JSON.parse(source) as unknown
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Doc).blocks)) {
    const doc = parsed as Doc
    return { meta: doc.meta && typeof doc.meta === 'object' ? doc.meta : {}, blocks: doc.blocks }
  }
  throw new Error('Not a document JSON: expected an object with a "blocks" array')
}

/** A Jupyter notebook: markdown cells become their content, code cells code blocks with outputs. */
export function readIpynb(source: string): Doc {
  const notebook = JSON.parse(source) as { cells?: { cell_type: string; source: string | string[]; outputs?: { output_type: string; text?: string | string[]; data?: Record<string, string | string[]> }[] }[]; metadata?: { kernelspec?: { language?: string }; language_info?: { name?: string } } }
  const language = notebook.metadata?.language_info?.name ?? notebook.metadata?.kernelspec?.language ?? 'python'
  const join = (value: string | string[] | undefined) => (Array.isArray(value) ? value.join('') : value ?? '')
  const blocks: Block[] = []
  for (const cell of notebook.cells ?? []) {
    const text = join(cell.source)
    if (cell.cell_type === 'markdown') blocks.push(...readMarkdown(text).blocks)
    else if (cell.cell_type === 'code') {
      blocks.push({ t: 'code', text, lang: language })
      for (const output of cell.outputs ?? []) {
        if (output.output_type === 'stream' && output.text) blocks.push({ t: 'code', text: join(output.text).replace(/\n$/, '') })
        else if (output.data) {
          if (output.data['text/markdown']) blocks.push(...readMarkdown(join(output.data['text/markdown'])).blocks)
          else if (output.data['text/plain']) blocks.push({ t: 'code', text: join(output.data['text/plain']).replace(/\n$/, '') })
        }
      }
    } else if (cell.cell_type === 'raw') blocks.push({ t: 'code', text })
  }
  return { meta: {}, blocks }
}
