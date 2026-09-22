/**
 * RTF reader: enough of the format to recover paragraphs, headings (by font
 * size), bold/italic/underline/strike runs, lists (by the \pntext or bullet
 * characters), hyperlinks and tables.
 */
import type { Block, Doc, Inline } from '../ast'
import { header, linebreak, space, str } from '../ast'

type Run = { text: string; bold: boolean; italic: boolean; underline: boolean; strike: boolean; sup: boolean; sub: boolean; mono: boolean; size: number; url?: string }
type Paragraph = { runs: Run[]; inTable: boolean; cellBreak: boolean; rowBreak: boolean; align: 'left' | 'center' | 'right'; indent: number }

export function readRtf(source: string): Doc {
  const paragraphs = parseRtfParagraphs(source)
  const blocks: Block[] = []
  let table: Inline[][][] | null = null
  let row: Inline[][] = []
  let cellRuns: Run[] = []
  const baseSize = mostCommonSize(paragraphs)
  for (const paragraph of paragraphs) {
    if (paragraph.inTable) {
      if (!table) table = []
      cellRuns.push(...paragraph.runs)
      if (paragraph.cellBreak) {
        row.push(runsToInlines(cellRuns))
        cellRuns = []
      }
      if (paragraph.rowBreak) {
        if (cellRuns.length) row.push(runsToInlines(cellRuns))
        cellRuns = []
        table.push(row)
        row = []
      }
      continue
    }
    if (table) {
      blocks.push(tableBlock(table))
      table = null
      row = []
    }
    const text = paragraph.runs.map((run) => run.text).join('').trim()
    if (!text) continue
    const size = paragraph.runs.length ? Math.max(...paragraph.runs.map((run) => run.size)) : baseSize
    const allBold = paragraph.runs.every((run) => run.bold || !run.text.trim())
    if (paragraph.runs.every((run) => run.mono || !run.text.trim()) && paragraph.runs.some((run) => run.mono)) {
      const last = blocks[blocks.length - 1]
      if (last && last.t === 'code') last.text += `\n${text}`
      else blocks.push({ t: 'code', text })
      continue
    }
    const bullet = /^[•·•◦▪\-–*]\s+/.exec(text)
    const number = /^(\d+)[.)]\s+/.exec(text)
    if (bullet || number) {
      const inlines = runsToInlines(stripLeading(paragraph.runs, (bullet ?? number)![0].length))
      const last = blocks[blocks.length - 1]
      const kind = bullet ? 'bullet' : 'ordered'
      if (last && last.t === kind) last.items.push([{ t: 'plain', c: inlines }])
      else blocks.push(kind === 'bullet' ? { t: 'bullet', items: [[{ t: 'plain', c: inlines }]], tight: true } : { t: 'ordered', start: Number(number?.[1] ?? 1), items: [[{ t: 'plain', c: inlines }]], tight: true })
      continue
    }
    if (size >= baseSize + 4 || (allBold && size > baseSize)) {
      const level = size >= baseSize + 12 ? 1 : size >= baseSize + 6 ? 2 : 3
      blocks.push(header(level, runsToInlines(paragraph.runs.map((run) => ({ ...run, bold: false })))))
      continue
    }
    if (paragraph.indent > 400 && paragraph.runs.every((run) => run.italic || !run.text.trim())) {
      blocks.push({ t: 'quote', c: [{ t: 'para', c: runsToInlines(paragraph.runs.map((run) => ({ ...run, italic: false }))) }] })
      continue
    }
    blocks.push({ t: 'para', c: runsToInlines(paragraph.runs) })
  }
  if (table) blocks.push(tableBlock(table))
  return { meta: readInfo(source), blocks }
}

function readInfo(source: string) {
  const meta: Record<string, string> = {}
  const title = /\{\\title ([^}]*)\}/.exec(source)
  const author = /\{\\author ([^}]*)\}/.exec(source)
  if (title) meta.title = title[1].trim()
  if (author) meta.author = author[1].trim()
  return meta
}

function tableBlock(rows: Inline[][][]): Block {
  const width = Math.max(1, ...rows.map((row) => row.length))
  const pad = (row: Inline[][]) => { while (row.length < width) row.push([]); return row }
  const [first, ...rest] = rows.map(pad)
  return { t: 'table', caption: [], aligns: Array.from({ length: width }, () => 'default' as const), header: first ?? [], rows: rest }
}

function stripLeading(runs: Run[], count: number): Run[] {
  let remaining = count
  const out: Run[] = []
  for (const run of runs) {
    if (remaining <= 0) { out.push(run); continue }
    if (run.text.length <= remaining) { remaining -= run.text.length; continue }
    out.push({ ...run, text: run.text.slice(remaining) })
    remaining = 0
  }
  return out
}

function mostCommonSize(paragraphs: Paragraph[]): number {
  const counts = new Map<number, number>()
  for (const paragraph of paragraphs) for (const run of paragraph.runs) counts.set(run.size, (counts.get(run.size) ?? 0) + run.text.length)
  let best = 24
  let bestCount = -1
  for (const [size, count] of counts) if (count > bestCount) { best = size; bestCount = count }
  return best
}

function runsToInlines(runs: Run[]): Inline[] {
  const out: Inline[] = []
  const pushText = (text: string, wrap: (inner: Inline[]) => Inline[]) => {
    const parts: Inline[] = []
    for (const piece of text.split(/(\n| +)/)) {
      if (!piece) continue
      if (piece === '\n') parts.push(linebreak)
      else if (/^ +$/.test(piece)) parts.push(space)
      else parts.push(str(piece))
    }
    out.push(...wrap(parts))
  }
  for (const run of runs) {
    if (!run.text) continue
    pushText(run.text, (inner) => {
      let result = inner
      if (run.mono) result = [{ t: 'code', text: run.text }]
      if (run.bold) result = [{ t: 'strong', c: result }]
      if (run.italic) result = [{ t: 'emph', c: result }]
      if (run.underline) result = [{ t: 'underline', c: result }]
      if (run.strike) result = [{ t: 'strike', c: result }]
      if (run.sup) result = [{ t: 'sup', c: result }]
      if (run.sub) result = [{ t: 'sub', c: result }]
      if (run.url) result = [{ t: 'link', c: result, url: run.url }]
      return result
    })
  }
  while (out.length && out[0].t === 'space') out.shift()
  while (out.length && out[out.length - 1].t === 'space') out.pop()
  return out
}

/* ---------------------------------------------------------------- tokenizer */

const SKIP_GROUPS = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'footer', 'headerl', 'headerr', 'footerl', 'footerr', 'xmlnstbl', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'mmathPr', 'pntxta', 'pntxtb', 'filetbl', 'revtbl', 'protusertbl', 'userprops', 'wgrffmtfilter', 'blipuid', 'panose', 'falt', 'fname', 'fldinst', 'shpinst', 'sp', 'sn', 'sv', 'nesttableprops', 'nonesttables', 'atrfstart', 'atrfend', 'atnid', 'atnauthor', 'annotation', 'pgdsctbl', 'mmath', 'ud', 'upr', 'listtext', 'fchars', 'lchars'])

function parseRtfParagraphs(source: string): Paragraph[] {
  const paragraphs: Paragraph[] = []
  type Group = { run: Run; skip: boolean; destination: string; fieldUrl?: string; inField?: boolean; fontMono: boolean }
  const fonts = new Map<number, boolean>()
  const fontTable = braceGroup(source, source.indexOf('{\\fonttbl'))
  for (const match of fontTable.matchAll(/\\f(\d+)\\(f\w+)[^;]*?([^;{}\\]+);/g)) {
    fonts.set(Number(match[1]), match[2] === 'fmodern' || /courier|consolas|mono|menlo/i.test(match[3]))
  }
  const baseRun = (): Run => ({ text: '', bold: false, italic: false, underline: false, strike: false, sup: false, sub: false, mono: false, size: 24 })
  let current: Paragraph = { runs: [], inTable: false, cellBreak: false, rowBreak: false, align: 'left', indent: 0 }
  const stack: Group[] = [{ run: baseRun(), skip: false, destination: '', fontMono: false }]
  let pendingUrl: string | undefined
  const top = () => stack[stack.length - 1]
  const emit = (text: string) => {
    const group = top()
    if (group.skip || !text) return
    if (group.destination === 'fldinst') {
      const link = /HYPERLINK\s+"?([^"\s]+)"?/i.exec(text)
      if (link) pendingUrl = link[1]
      return
    }
    const run = { ...group.run, text, url: group.fieldUrl ?? (group.inField ? pendingUrl : undefined) }
    const last = current.runs[current.runs.length - 1]
    if (last && sameStyle(last, run)) last.text += text
    else current.runs.push(run)
  }
  const endParagraph = (flags: Partial<Paragraph> = {}) => {
    paragraphs.push({ ...current, ...flags })
    current = { runs: [], inTable: current.inTable, cellBreak: false, rowBreak: false, align: current.align, indent: current.indent }
  }
  let i = 0
  let skipUnicodeBytes = 1
  let pendingSkip = 0
  while (i < source.length) {
    const ch = source[i]
    if (ch === '{') {
      const parent = top()
      stack.push({ run: { ...parent.run, text: '' }, skip: parent.skip, destination: '', fontMono: parent.fontMono, inField: parent.inField, fieldUrl: parent.fieldUrl })
      i += 1
      continue
    }
    if (ch === '}') {
      const closing = stack.pop()
      if (closing?.destination === 'field') pendingUrl = undefined
      if (stack.length === 0) break
      i += 1
      continue
    }
    if (ch === '\\') {
      const control = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(source.slice(i, i + 40))
      if (control) {
        const word = control[1]
        const param = control[2] !== undefined ? Number(control[2]) : undefined
        i += control[0].length
        const group = top()
        if (word === 'u' && param !== undefined) {
          const code = param < 0 ? param + 65536 : param
          emit(String.fromCodePoint(code))
          pendingSkip = skipUnicodeBytes
          continue
        }
        if (word === 'uc' && param !== undefined) { skipUnicodeBytes = param; continue }
        if (word === 'par') { endParagraph(); continue }
        if (word === 'line') { emit('\n'); continue }
        if (word === 'tab') { emit('\t'); continue }
        if (word === 'cell' || word === 'nestcell') { endParagraph({ inTable: true, cellBreak: true }); continue }
        if (word === 'row' || word === 'nestrow') { current.inTable = true; endParagraph({ inTable: true, rowBreak: true }); current.inTable = false; continue }
        if (word === 'intbl') { current.inTable = true; continue }
        if (word === 'pard') { current.inTable = false; current.align = 'left'; current.indent = 0; continue }
        if (word === 'plain') { Object.assign(group.run, baseRun(), { size: group.run.size }); continue }
        if (word === 'b') { group.run.bold = param !== 0; continue }
        if (word === 'i') { group.run.italic = param !== 0; continue }
        if (word === 'ul') { group.run.underline = param !== 0; continue }
        if (word === 'ulnone') { group.run.underline = false; continue }
        if (word === 'strike') { group.run.strike = param !== 0; continue }
        if (word === 'super') { group.run.sup = true; continue }
        if (word === 'sub') { group.run.sub = true; continue }
        if (word === 'nosupersub') { group.run.sup = false; group.run.sub = false; continue }
        if (word === 'fs' && param !== undefined) { group.run.size = param; continue }
        if (word === 'f' && param !== undefined) { group.run.mono = fonts.get(param) ?? false; continue }
        if (word === 'qc') { current.align = 'center'; continue }
        if (word === 'qr') { current.align = 'right'; continue }
        if (word === 'li' && param !== undefined) { current.indent = param; continue }
        if (word === 'field') { group.destination = 'field'; group.inField = true; continue }
        if (word === 'fldinst') { group.destination = 'fldinst'; continue }
        if (word === 'fldrslt') { group.fieldUrl = pendingUrl; continue }
        if (word === 'bullet') { emit('• '); continue }
        if (word === 'endash') { emit('–'); continue }
        if (word === 'emdash') { emit('—'); continue }
        if (word === 'lquote') { emit('‘'); continue }
        if (word === 'rquote') { emit('’'); continue }
        if (word === 'ldblquote') { emit('“'); continue }
        if (word === 'rdblquote') { emit('”'); continue }
        if (word === 'emspace' || word === 'enspace' || word === 'qmspace') { emit(' '); continue }
        if (word === 'pntext' || word === 'pn') { group.skip = true; continue }
        if (SKIP_GROUPS.has(word)) { group.skip = true; group.destination = word; continue }
        continue
      }
      const next = source[i + 1]
      if (next === "'") {
        const hex = source.slice(i + 2, i + 4)
        i += 4
        if (pendingSkip > 0) { pendingSkip -= 1; continue }
        emit(decodeCp1252(Number.parseInt(hex, 16)))
        continue
      }
      if (next === '*') {
        // A destination group we do not understand: skip it entirely.
        top().skip = true
        i += 2
        continue
      }
      if (next === '\\' || next === '{' || next === '}') { emit(next); i += 2; continue }
      if (next === '~') { emit(' '); i += 2; continue }
      if (next === '-' || next === '_') { i += 2; continue }
      if (next === '\n' || next === '\r') { endParagraph(); i += 2; continue }
      i += 2
      continue
    }
    if (ch === '\r' || ch === '\n') { i += 1; continue }
    if (pendingSkip > 0) { pendingSkip -= 1; i += 1; continue }
    emit(ch)
    i += 1
  }
  if (current.runs.length) paragraphs.push(current)
  return paragraphs
}

/** The text of the brace group starting at `open`, without the outer braces. */
function braceGroup(source: string, open: number): string {
  if (open < 0) return ''
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '\\') { i += 1; continue }
    if (source[i] === '{') depth += 1
    if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  return source.slice(open + 1)
}

function sameStyle(a: Run, b: Run) {
  return a.bold === b.bold && a.italic === b.italic && a.underline === b.underline && a.strike === b.strike && a.sup === b.sup && a.sub === b.sub && a.mono === b.mono && a.size === b.size && a.url === b.url
}

function decodeCp1252(code: number): string {
  const table: Record<number, string> = { 0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ' }
  return table[code] ?? String.fromCharCode(code)
}
