// FreeCAD Spreadsheet workbench: cells, aliases, formulas, CSV round-trip.
import { evaluateExpression, type Scope } from './expressions'

export interface Cell {
  ref: string
  content: string
  alias?: string
}

export interface Sheet {
  name: string
  cells: Cell[]
}

export function createSheet(name = 'Spreadsheet'): Sheet {
  return { name, cells: [] }
}

export function normalizeRef(ref: string): string {
  const match = /^([A-Za-z]+)(\d+)$/.exec(ref.trim())
  if (!match) throw new Error(`셀 주소가 아닙니다: ${ref}`)
  return `${match[1].toUpperCase()}${Number(match[2])}`
}

export function setCell(sheet: Sheet, ref: string, content: string, alias?: string): Sheet {
  const key = normalizeRef(ref)
  const cells = sheet.cells.filter((cell) => cell.ref !== key)
  cells.push({ ref: key, content, alias: alias || sheet.cells.find((cell) => cell.ref === key)?.alias })
  cells.sort((a, b) => compareRefs(a.ref, b.ref))
  return { ...sheet, cells }
}

export function setAlias(sheet: Sheet, ref: string, alias: string): Sheet {
  const key = normalizeRef(ref)
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) throw new Error(`별칭이 올바르지 않습니다: ${alias}`)
  return { ...sheet, cells: sheet.cells.map((cell) => (cell.ref === key ? { ...cell, alias } : cell)) }
}

export function getCell(sheet: Sheet, ref: string): Cell | undefined {
  return sheet.cells.find((cell) => cell.ref === normalizeRef(ref))
}

function compareRefs(a: string, b: string): number {
  const pa = /^([A-Z]+)(\d+)$/.exec(a)
  const pb = /^([A-Z]+)(\d+)$/.exec(b)
  if (!pa || !pb) return a.localeCompare(b)
  if (pa[1] !== pb[1]) return pa[1].localeCompare(pb[1])
  return Number(pa[2]) - Number(pb[2])
}

function columnIndex(letters: string): number {
  let value = 0
  for (const char of letters.toUpperCase()) value = value * 26 + (char.charCodeAt(0) - 64)
  return value
}

function columnLetters(index: number): string {
  let value = index
  let out = ''
  while (value > 0) {
    const rest = (value - 1) % 26
    out = String.fromCharCode(65 + rest) + out
    value = Math.floor((value - 1) / 26)
  }
  return out || 'A'
}

function expandRange(range: string): string[] {
  const match = /^([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)$/.exec(range.trim())
  if (!match) return []
  const c1 = columnIndex(match[1])
  const r1 = Number(match[2])
  const c2 = columnIndex(match[3])
  const r2 = Number(match[4])
  const refs: string[] = []
  for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
    for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) refs.push(`${columnLetters(c)}${r}`)
  }
  return refs
}

export interface SheetValues {
  values: Record<string, number>
  texts: Record<string, string>
  aliases: Record<string, number>
  errors: Record<string, string>
}

/**
 * Evaluate every cell. Formulas start with `=` and may reference cells (`A1`),
 * aliases, ranges inside functions (`=sum(A1:A4)`) and external parameters.
 */
export function evaluateSheet(sheet: Sheet, parameters: Scope = {}): SheetValues {
  const values: Record<string, number> = {}
  const texts: Record<string, string> = {}
  const aliases: Record<string, number> = {}
  const errors: Record<string, string> = {}
  const byRef = new Map(sheet.cells.map((cell) => [cell.ref, cell]))
  const aliasToRef = new Map(sheet.cells.filter((cell) => cell.alias).map((cell) => [cell.alias as string, cell.ref]))
  const resolving = new Set<string>()

  const valueOf = (ref: string): number => {
    const key = normalizeRef(ref)
    if (key in values) return values[key]
    if (resolving.has(key)) throw new Error(`순환 참조: ${key}`)
    const cell = byRef.get(key)
    if (!cell) return 0
    resolving.add(key)
    try {
      const value = evaluateCell(cell)
      values[key] = value
      return value
    } finally {
      resolving.delete(key)
    }
  }

  const evaluateCell = (cell: Cell): number => {
    const content = cell.content.trim()
    if (content === '') return 0
    if (!content.startsWith('=')) {
      const numeric = Number(content)
      if (Number.isFinite(numeric)) return numeric
      texts[cell.ref] = content
      return 0
    }
    let body = content.slice(1)
    body = body.replace(/\b([A-Za-z]+\d+):([A-Za-z]+\d+)\b/g, (_, from: string, to: string) =>
      expandRange(`${from}:${to}`).map((ref) => String(valueOf(ref))).join(', '))
    const scope: Scope = { ...parameters }
    for (const name of body.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) {
      if (/^[A-Za-z]+\d+$/.test(name)) {
        scope[name.toUpperCase()] = valueOf(name)
        scope[name] = scope[name.toUpperCase()]
      } else if (aliasToRef.has(name)) {
        scope[name] = valueOf(aliasToRef.get(name) as string)
      }
    }
    return evaluateExpression(body, scope)
  }

  for (const cell of sheet.cells) {
    try {
      const value = valueOf(cell.ref)
      if (cell.alias) aliases[cell.alias] = value
    } catch (error) {
      errors[cell.ref] = (error as Error).message
      values[cell.ref] = 0
    }
  }
  return { values, texts, aliases, errors }
}

export function sheetToCsv(sheet: Sheet, parameters: Scope = {}): string {
  const result = evaluateSheet(sheet, parameters)
  let maxColumn = 1
  let maxRow = 1
  for (const cell of sheet.cells) {
    const match = /^([A-Z]+)(\d+)$/.exec(cell.ref)
    if (!match) continue
    maxColumn = Math.max(maxColumn, columnIndex(match[1]))
    maxRow = Math.max(maxRow, Number(match[2]))
  }
  const rows: string[] = []
  for (let r = 1; r <= maxRow; r++) {
    const cells: string[] = []
    for (let c = 1; c <= maxColumn; c++) {
      const ref = `${columnLetters(c)}${r}`
      if (result.texts[ref] !== undefined) cells.push(quoteCsv(result.texts[ref]))
      else if (sheet.cells.some((cell) => cell.ref === ref)) cells.push(String(round(result.values[ref] ?? 0)))
      else cells.push('')
    }
    rows.push(cells.join(','))
  }
  return rows.join('\n')
}

function quoteCsv(text: string): string {
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

/** Parse a CSV into a sheet; a leading `name=value` comment row becomes an alias. */
export function parseCsv(text: string, name = 'Spreadsheet'): Sheet {
  let sheet = createSheet(name)
  const rows = text.split(/\r?\n/)
  rows.forEach((row, rowIndex) => {
    if (row.trim() === '') return
    const cells = splitCsvRow(row)
    cells.forEach((value, columnIndexZero) => {
      if (value.trim() === '') return
      const ref = `${columnLetters(columnIndexZero + 1)}${rowIndex + 1}`
      sheet = setCell(sheet, ref, value.trim())
    })
  })
  return sheet
}

function splitCsvRow(row: string): string[] {
  const out: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < row.length; i++) {
    const char = row[i]
    if (quoted) {
      if (char === '"' && row[i + 1] === '"') {
        current += '"'
        i += 1
      } else if (char === '"') quoted = false
      else current += char
      continue
    }
    if (char === '"') quoted = true
    else if (char === ',') {
      out.push(current)
      current = ''
    } else current += char
  }
  out.push(current)
  return out
}

/** Bind aliased cells to design parameters (FreeCAD spreadsheet → property link). */
export function sheetParameters(sheet: Sheet, parameters: Scope = {}): Array<{ name: string; value: number; formula: string }> {
  const result = evaluateSheet(sheet, parameters)
  return sheet.cells
    .filter((cell) => cell.alias)
    .map((cell) => ({ name: cell.alias as string, value: result.values[cell.ref] ?? 0, formula: cell.content }))
}
