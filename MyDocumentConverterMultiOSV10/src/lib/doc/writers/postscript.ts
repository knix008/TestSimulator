/**
 * PostScript writer: a small typesetter that lays the document out on pages
 * and embeds the fonts it used as Type 42 (TrueType) CID fonts, so Korean
 * and every other script come out of any Level 3 interpreter (Ghostscript,
 * printers, PS viewers) without a font installed on that machine.
 *
 * The fonts are the OFL-licensed Nanum families shipped with the app
 * (`public/fonts/`). Only the glyphs a document uses are embedded, so a
 * typical page stays a few hundred kilobytes. When no font loader is
 * available the writer falls back to the interpreter's Helvetica/Courier,
 * which cover Latin text only.
 *
 * PostScript itself has no notion of paragraphs or headings, so each block
 * is also recorded as a `%%mdcv-block:` comment carrying its AST; the
 * reader restores those exactly and falls back to text extraction for
 * PostScript written by other programs.
 */
import type { Block, Doc, Inline } from '../ast'
import { inlinesToText } from '../ast'
import type { WriterOptions } from '../options'
import { metaOf } from './render'
import { parseTrueType, type TrueTypeFont } from '../ttf'

export type FontLoader = (file: string) => Promise<Uint8Array | null>

export const POSTSCRIPT_FONT_FILES = {
  regular: 'NanumGothic-Regular.ttf',
  bold: 'NanumGothic-Bold.ttf',
  mono: 'NanumGothicCoding-Regular.ttf',
  monoBold: 'NanumGothicCoding-Bold.ttf',
} as const

type FontKey = keyof typeof POSTSCRIPT_FONT_FILES

const PAPER_PT: Record<string, [number, number]> = {
  A4: [595.28, 841.89], A3: [841.89, 1190.55], A5: [419.53, 595.28], Letter: [612, 792], Legal: [612, 1008], Tabloid: [792, 1224],
}

const BASE_FONTS: Record<FontKey, string> = { regular: 'Helvetica', bold: 'Helvetica-Bold', mono: 'Courier', monoBold: 'Courier-Bold' }

/** Helvetica's advance widths for ASCII 32–126 (from its AFM), for the base-font fallback. */
const HELVETICA_WIDTHS = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584]

/* --------------------------------------------------------------- fonts */

/** One font as the layout sees it: measures text, and remembers the glyphs it showed for the subset. */
class Face {
  /** Glyphs shown so far, each with the id it gets in the embedded subset (0 stays .notdef). */
  used = new Map<number, number>([[0, 0]])
  readonly key: FontKey
  readonly ttf: TrueTypeFont | null
  constructor(key: FontKey, ttf: TrueTypeFont | null) { this.key = key; this.ttf = ttf }

  width(text: string, size: number): number {
    let units = 0
    if (this.ttf) {
      for (const ch of text) {
        const gid = this.ttf.glyph(ch.codePointAt(0)!)
        units += this.ttf.advance(gid)
      }
      return (units / this.ttf.unitsPerEm) * size
    }
    // Base-font fallback: Courier is exactly 0.6 em; Helvetica from its metrics (bold runs a little wider).
    const mono = this.key === 'mono' || this.key === 'monoBold'
    for (const ch of text) {
      const code = ch.charCodeAt(0)
      units += mono ? 600 : (HELVETICA_WIDTHS[code - 32] ?? 556) * (this.key === 'bold' ? 1.06 : 1)
    }
    return (units / 1000) * size
  }

  /** The string operand for `show`: 2-byte glyph ids as hex, or a Latin-1 string for the base fonts. */
  encode(text: string): string {
    if (this.ttf) {
      let hex = ''
      for (const ch of text) {
        const gid = this.ttf.glyph(ch.codePointAt(0)!)
        let id = this.used.get(gid)
        if (id === undefined) { id = this.used.size; this.used.set(gid, id) }
        hex += id.toString(16).padStart(4, '0')
      }
      return `<${hex}>`
    }
    let out = ''
    for (const ch of text) {
      const code = ch.charCodeAt(0)
      if (ch === '(' || ch === ')' || ch === '\\') out += `\\${ch}`
      else if (code < 32 || code > 126) out += code < 256 ? `\\${code.toString(8).padStart(3, '0')}` : '?'
      else out += ch
    }
    return `(${out})`
  }
}

async function loadFaces(loadFont: FontLoader | undefined, bodyFont: 'gothic' | 'coding'): Promise<Record<FontKey, Face>> {
  const faces = {} as Record<FontKey, Face>
  for (const key of Object.keys(POSTSCRIPT_FONT_FILES) as FontKey[]) {
    let ttf: TrueTypeFont | null = null
    // With the monospace family as body font, the sans faces are the coding faces too.
    const file = bodyFont === 'coding' ? POSTSCRIPT_FONT_FILES[key === 'regular' ? 'mono' : key === 'bold' ? 'monoBold' : key] : POSTSCRIPT_FONT_FILES[key]
    if (loadFont) {
      try {
        const bytes = await loadFont(file)
        if (bytes && bytes.length > 0) ttf = parseTrueType(bytes)
      } catch {
        ttf = null
      }
    }
    faces[key] = new Face(key, ttf)
  }
  return faces
}

/** The Type 42 CID font definition for the glyphs a face showed. */
function defineFont(face: Face, name: string): string {
  if (!face.ttf) return `/${name} /${BASE_FONTS[face.key]} findfont definefont pop\n`
  const subset = face.ttf.subset(face.used)
  const strings = splitSfnts(subset)
  const count = face.used.size
  const [x0, y0, x1, y1] = face.ttf.bbox
  const lines = [
    `%%BeginResource: CIDFont ${name}`,
    `/${name}CID <<`,
    `  /CIDFontName /${name}CID`,
    '  /CIDFontType 2',
    '  /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >>',
    `  /FontBBox [${x0} ${y0} ${x1} ${y1}]`,
    '  /FontMatrix [1 0 0 1 0 0]',
    '  /PaintType 0',
    '  /GDBytes 2',
    `  /CIDCount ${count}`,
    '  /CIDMap 0',
    '  /sfnts [',
    ...strings.map((chunk) => hexLines(chunk)),
    '  ]',
    '>> /CIDFont defineresource pop',
    '%%EndResource',
    `/${name} /Identity-H [/${name}CID /CIDFont findresource] composefont pop`,
  ]
  return `${lines.join('\n')}\n`
}

/** The font file as sfnts strings: whole tables, with glyf split at glyph boundaries so no string passes 64 KB. */
function splitSfnts(font: Uint8Array): Uint8Array[] {
  const LIMIT = 65000
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength)
  const numTables = view.getUint16(4)
  const headerLength = 12 + numTables * 16
  const out: Uint8Array[] = []
  const tables: { name: string; offset: number; length: number }[] = []
  for (let index = 0; index < numTables; index += 1) {
    const at = 12 + index * 16
    tables.push({ name: String.fromCharCode(font[at], font[at + 1], font[at + 2], font[at + 3]), offset: view.getUint32(at + 8), length: view.getUint32(at + 12) })
  }
  tables.sort((a, b) => a.offset - b.offset)
  let cursor = 0
  const push = (end: number) => { if (end > cursor) { out.push(font.subarray(cursor, end)); cursor = end } }
  // Whole strings where possible: the directory, then each table; a table past the limit is cut in even pieces.
  const pieces = (end: number) => { while (end - cursor > LIMIT) push(cursor + LIMIT); push(end) }
  const loca = tables.find((table) => table.name === 'loca')
  pieces(headerLength)
  for (const table of tables) {
    const end = Math.min(font.length, (table.offset + table.length + 3) & ~3)
    if (table.name !== 'glyf' || !loca) { pieces(end); continue }
    // glyf: break only where a glyph starts (long loca offsets, as the subsetter writes them).
    const count = loca.length / 4 - 1
    let chunkStart = table.offset
    for (let gid = 1; gid <= count; gid += 1) {
      const at = table.offset + view.getUint32(loca.offset + gid * 4)
      if (at - chunkStart > LIMIT) {
        const prev = table.offset + view.getUint32(loca.offset + (gid - 1) * 4)
        const cut = prev > chunkStart ? prev : at
        push(cut)
        chunkStart = cut
      }
    }
    pieces(end)
  }
  pieces(font.length)
  return out
}

function hexLines(bytes: Uint8Array): string {
  const lines: string[] = ['<']
  let line = ''
  for (let index = 0; index < bytes.length; index += 1) {
    line += bytes[index].toString(16).padStart(2, '0')
    if (line.length >= 76) { lines.push(line); line = '' }
  }
  if (line) lines.push(line)
  lines.push('>')
  return lines.join('\n')
}

/* -------------------------------------------------------------- layout */

type Style = { bold: boolean; italic: boolean; mono: boolean; underline: boolean; strike: boolean; small: boolean; rise: number; color?: string }
type Piece = { text: string; style: Style; kind: 'word' | 'space' | 'char' | 'break' }
type Line = { pieces: Piece[]; width: number }
type Op = string

const PLAIN: Style = { bold: false, italic: false, mono: false, underline: false, strike: false, small: false, rise: 0 }

const isCjk = (ch: string) => {
  const code = ch.codePointAt(0)!
  return (code >= 0x1100 && code <= 0x11ff) || (code >= 0x2e80 && code <= 0xa4cf) || (code >= 0xac00 && code <= 0xd7af) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xfe30 && code <= 0xfe4f) || (code >= 0xff00 && code <= 0xffef) || (code >= 0x20000 && code <= 0x2ffff)
}

class Typesetter {
  ops: Op[][] = [[]]
  page = 0
  y: number
  notes: Block[][] = []
  headings: { level: number; text: string; page: number }[] = []
  readonly width: number
  readonly top: number
  readonly bottom: number
  readonly left: number
  readonly lineHeight: number

  readonly faces: Record<FontKey, Face>
  readonly paper: [number, number]
  readonly margin: number
  readonly size: number
  readonly comments: boolean

  /** Heading rules and code boxes; off gives plain text on the page. */
  decorations = true

  constructor(faces: Record<FontKey, Face>, paper: [number, number], margin: number, size: number, comments: boolean) {
    this.faces = faces; this.paper = paper; this.margin = margin; this.size = size; this.comments = comments
    this.left = margin
    this.width = paper[0] - margin * 2
    this.top = paper[1] - margin
    this.bottom = margin + 18
    this.y = this.top
    this.lineHeight = size * 1.5
  }

  face(style: Style): Face {
    if (style.mono) return style.bold ? this.faces.monoBold : this.faces.mono
    return style.bold ? this.faces.bold : this.faces.regular
  }

  fontSize(style: Style, base: number) {
    return style.small ? base * 0.75 : style.mono ? base * 0.92 : base
  }

  /** Font and colour currently set on the page; an op is emitted only on change. Pages start clean (save/restore). */
  fontState = ''
  colorState = ''

  emit(op: Op) { this.ops[this.page].push(op) }

  /** Selects a font (with an italic skew when asked) unless it is already current. */
  useFont(key: FontKey, size: number, italic: boolean) {
    const name = fontName(key)
    const state = `${name}|${fmt(size)}|${italic ? 1 : 0}`
    if (state === this.fontState) return
    this.fontState = state
    this.emit(italic ? `/${name} [${fmt(size)} 0 ${fmt(size * 0.21)} ${fmt(size)} 0 0] f` : `/${name} ${fmt(size)} f`)
  }

  useColor(color: string | undefined) {
    const state = color ?? '0 g'
    if (state === this.colorState) return
    this.colorState = state
    this.emit(color ? `${color} rc` : '0 g')
  }

  comment(text: string) { if (this.comments) this.emit(`%%mdcv-block: ${text}`) }

  newPage() {
    this.ops.push([])
    this.page += 1
    this.y = this.top
    this.fontState = ''
    this.colorState = ''
  }

  /** Reserves vertical room, starting a new page when the block would run off the bottom. */
  need(height: number) {
    if (this.y - height < this.bottom && this.y < this.top - 1) this.newPage()
  }

  space(points: number) {
    if (this.y < this.top - 1) this.y = Math.max(this.bottom, this.y - points)
  }

  /* ----- inline text → pieces */

  pieces(inlines: Inline[], style: Style = PLAIN, out: Piece[] = []): Piece[] {
    for (const inline of inlines) {
      switch (inline.t) {
        case 'str': this.words(inline.text, style, out); break
        case 'space': case 'softbreak': out.push({ text: ' ', style, kind: 'space' }); break
        case 'linebreak': out.push({ text: '', style, kind: 'break' }); break
        case 'emph': this.pieces(inline.c, { ...style, italic: true }, out); break
        case 'strong': this.pieces(inline.c, { ...style, bold: true }, out); break
        case 'strike': this.pieces(inline.c, { ...style, strike: true }, out); break
        case 'underline': this.pieces(inline.c, { ...style, underline: true }, out); break
        case 'smallcaps': this.words(inlinesToText(inline.c).toUpperCase(), { ...style, small: true }, out); break
        case 'sup': this.pieces(inline.c, { ...style, small: true, rise: 0.35 }, out); break
        case 'sub': this.pieces(inline.c, { ...style, small: true, rise: -0.2 }, out); break
        case 'code': this.words(inline.text, { ...style, mono: true }, out); break
        case 'math': this.words(inline.text, { ...style, italic: true }, out); break
        case 'link': this.pieces(inline.c, { ...style, underline: true, color: '0 0.25 0.65' }, out); break
        case 'image': this.words(`[${inlinesToText(inline.c) || inline.url}]`, { ...style, italic: true }, out); break
        case 'raw': if (inline.format === 'postscript') this.words(inline.text, style, out); break
        case 'note': {
          this.notes.push(inline.c)
          this.words(String(this.notes.length), { ...style, small: true, rise: 0.35 }, out)
          break
        }
        case 'span': this.pieces(inline.c, style, out); break
      }
    }
    return out
  }

  /** Splits text into breakable pieces: words, spaces, and single CJK characters (which may break anywhere). */
  words(text: string, style: Style, out: Piece[]) {
    let word = ''
    const flush = () => { if (word) { out.push({ text: word, style, kind: 'word' }); word = '' } }
    for (const ch of text) {
      if (ch === ' ' || ch === '\t' || ch === '\n') { flush(); out.push({ text: ' ', style, kind: 'space' }) }
      else if (isCjk(ch)) { flush(); out.push({ text: ch, style, kind: 'char' }) }
      else word += ch
    }
    flush()
  }

  measure(piece: Piece, base: number) {
    return this.face(piece.style).width(piece.text, this.fontSize(piece.style, base))
  }

  /** Greedy line breaking into the given width; a word longer than a line is cut. */
  breakLines(pieces: Piece[], width: number, base: number): Line[] {
    const lines: Line[] = []
    let current: Line = { pieces: [], width: 0 }
    const close = () => {
      while (current.pieces.length && current.pieces[current.pieces.length - 1].kind === 'space') {
        current.width -= this.measure(current.pieces.pop()!, base)
      }
      lines.push(current)
      current = { pieces: [], width: 0 }
    }
    for (let piece of pieces) {
      if (piece.kind === 'break') { close(); continue }
      if (piece.kind === 'space' && current.pieces.length === 0) continue
      let w = this.measure(piece, base)
      if (current.width + w > width + 0.01 && current.pieces.length) close()
      if (piece.kind === 'space' && current.pieces.length === 0) continue
      if (w > width && piece.kind === 'word') {
        // Cut an over-long word character by character.
        let part = ''
        for (const ch of piece.text) {
          const next = this.face(piece.style).width(part + ch, this.fontSize(piece.style, base))
          if (next > width && part) {
            current.pieces.push({ ...piece, text: part }); current.width += this.face(piece.style).width(part, this.fontSize(piece.style, base)); close(); part = ''
          }
          part += ch
        }
        piece = { ...piece, text: part }
        w = this.measure(piece, base)
      }
      current.pieces.push(piece)
      current.width += w
    }
    if (current.pieces.length || lines.length === 0) close()
    return lines
  }

  /** Draws lines from the current position; `align` places short lines, `x`/`width` bound the column. */
  drawLines(lines: Line[], base: number, x: number, width: number, align: 'left' | 'center' | 'right' = 'left', lineHeight = base * 1.5) {
    for (const line of lines) {
      this.need(lineHeight)
      this.y -= lineHeight
      let cx = x
      if (align === 'center') cx = x + (width - line.width) / 2
      else if (align === 'right') cx = x + width - line.width
      const baseline = this.y + lineHeight * 0.28
      this.drawLine(line, base, cx, baseline)
    }
  }

  drawLine(line: Line, base: number, x: number, baseline: number) {
    // Adjacent pieces with the same style are shown together.
    let run: Piece[] = []
    let cx = x
    const flush = () => {
      if (!run.length) return
      const style = run[0].style
      const text = run.map((piece) => piece.text).join('')
      const size = this.fontSize(style, base)
      const face = this.face(style)
      const w = face.width(text, size)
      const y = baseline + style.rise * base
      this.useFont(face.key, size, Boolean(style.italic))
      this.useColor(style.color)
      this.emit(`${fmt(cx)} ${fmt(y)} m ${face.encode(text)} s`)
      if (style.underline) this.emit(`0.5 setlinewidth ${fmt(cx)} ${fmt(y - size * 0.12)} m ${fmt(w)} 0 rlineto stroke`)
      if (style.strike) this.emit(`0.6 setlinewidth ${fmt(cx)} ${fmt(y + size * 0.3)} m ${fmt(w)} 0 rlineto stroke`)
      cx += w
      run = []
    }
    for (const piece of line.pieces) {
      if (run.length && !sameStyle(run[0].style, piece.style)) flush()
      run.push(piece)
    }
    flush()
  }

  /* ----- blocks */

  blocks(list: Block[], x = this.left, width = this.width, base = this.size) {
    for (const block of list) this.block(block, x, width, base)
  }

  block(block: Block, x: number, width: number, base: number) {
    switch (block.t) {
      case 'para': case 'plain': {
        const lines = this.breakLines(this.pieces(block.c), width, base)
        this.drawLines(lines, base, x, width)
        if (block.t === 'para') this.space(base * 0.6)
        return
      }
      case 'header': {
        const size = base * [1.9, 1.5, 1.25, 1.1, 1, 1][Math.min(block.level, 6) - 1]
        this.space(base * (block.level <= 2 ? 1.2 : 0.8))
        const lines = this.breakLines(this.pieces(block.c, { ...PLAIN, bold: true }), width, size)
        this.need(size * 1.5 * lines.length + base * 1.5)
        this.headings.push({ level: block.level, text: inlinesToText(block.c), page: this.page + 1 })
        this.drawLines(lines, size, x, width, 'left', size * 1.4)
        if (block.level === 1 && this.decorations) this.emit(`gsave 0.6 setlinewidth 0.55 g ${fmt(x)} ${fmt(this.y - 2)} m ${fmt(width)} 0 rlineto stroke grestore`)
        this.space(base * 0.5)
        return
      }
      case 'code': {
        const size = base * 0.9
        const lineHeight = size * 1.35
        const pieces: Piece[] = []
        const style: Style = { ...PLAIN, mono: true }
        block.text.replace(/\r\n?/g, '\n').split('\n').forEach((line, index) => {
          if (index) pieces.push({ text: '', style, kind: 'break' })
          // Code keeps its spaces: each character is its own piece so wrapping never eats indentation.
          for (const ch of line) pieces.push({ text: ch, style, kind: ch === ' ' ? 'word' : 'char' })
        })
        const lines = this.breakLines(pieces, width - 12, size)
        const chunk = lines.length * lineHeight + 10
        this.need(Math.min(chunk, this.top - this.bottom))
        // Background box per page segment, inserted before the segment's text so it lies underneath.
        let start = this.y
        let segment = this.ops[this.page].length
        let count = 0
        const closeBox = () => { if (this.decorations) this.ops[this.page].splice(segment, 0, `gsave 0.95 g ${fmt(x)} ${fmt(this.y)} ${fmt(width)} ${fmt(start - this.y)} rectfill grestore`) }
        this.y -= 4
        for (const line of lines) {
          if (this.y - lineHeight < this.bottom && count) { closeBox(); this.newPage(); start = this.y; segment = 0; count = 0; this.y -= 4 }
          this.y -= lineHeight
          count += 1
          this.drawLine(line, size, x + 6, this.y + lineHeight * 0.3)
        }
        this.y -= 6
        closeBox()
        this.space(base * 0.6)
        return
      }
      case 'quote': {
        const startPage = this.page
        const startY = this.y
        this.blocks(block.c, x + 16, width - 16, base)
        const endY = this.y + base * 0.6
        if (this.page === startPage) this.emit(`gsave 2 setlinewidth 0.7 g ${fmt(x + 4)} ${fmt(startY - 2)} m ${fmt(x + 4)} ${fmt(endY)} lineto stroke grestore`)
        else this.emit(`gsave 2 setlinewidth 0.7 g ${fmt(x + 4)} ${fmt(this.top)} m ${fmt(x + 4)} ${fmt(endY)} lineto stroke grestore`)
        return
      }
      case 'bullet': case 'ordered': {
        const indent = base * 1.6
        block.items.forEach((item, index) => {
          const task = block.t === 'bullet' ? block.tasks?.[index] ?? null : null
          const marker = block.t === 'bullet' ? (task === null ? '•' : '') : `${orderedLabel(block.start + index, block.style)}.`
          this.need(base * 1.5)
          const y = this.y
          const page = this.page
          this.blocks(item.length ? item : [{ t: 'plain', c: [] }], x + indent, width - indent, base)
          // The marker goes on the page where the item started, level with its first line.
          const baseline = y - base * 1.5 + base * 1.5 * 0.28
          if (task !== null) {
            // A drawn check box: the fonts have no ballot glyphs, and a box looks the same everywhere.
            const side = base * 0.75
            const bx = x + indent - side - base * 0.4
            const by = baseline - side * 0.1
            const ops = [`gsave 0.7 setlinewidth 0.25 g ${fmt(bx)} ${fmt(by)} ${fmt(side)} ${fmt(side)} rectstroke`]
            if (task) ops.push(`1 setlinewidth ${fmt(bx + side * 0.2)} ${fmt(by + side * 0.5)} m ${fmt(bx + side * 0.42)} ${fmt(by + side * 0.2)} lineto ${fmt(bx + side * 0.82)} ${fmt(by + side * 0.85)} lineto stroke`)
            this.ops[page].push(`${ops.join(' ')} grestore`)
          } else {
            const markerFace = this.face(PLAIN)
            const mw = markerFace.width(marker, base)
            // Self-contained (font and colour set inside gsave): it may land on an earlier page, after that page's text.
            this.ops[page].push(`gsave /${fontName('regular')} ${fmt(base)} f 0 g ${fmt(x + indent - mw - base * 0.4)} ${fmt(baseline)} m ${markerFace.encode(marker)} s grestore`)
          }
          if (!block.tight) this.space(base * 0.3)
        })
        this.space(base * 0.4)
        return
      }
      case 'deflist': {
        for (const item of block.items) {
          const lines = this.breakLines(this.pieces(item.term, { ...PLAIN, bold: true }), width, base)
          this.drawLines(lines, base, x, width)
          for (const def of item.defs) this.blocks(def, x + base * 1.8, width - base * 1.8, base)
        }
        this.space(base * 0.4)
        return
      }
      case 'hr': {
        this.need(base * 1.5)
        this.y -= base * 0.75
        this.emit(`gsave 0.6 setlinewidth 0.6 g ${fmt(x)} ${fmt(this.y)} m ${fmt(width)} 0 rlineto stroke grestore`)
        this.y -= base * 0.75
        return
      }
      case 'table': this.table(block, x, width, base); return
      case 'raw': if (block.format === 'postscript') this.emit(block.text); return
      case 'div': this.blocks(block.c, x, width, base); return
      case 'linebl': {
        const pieces: Piece[] = []
        block.lines.forEach((line, index) => { if (index) pieces.push({ text: '', style: PLAIN, kind: 'break' }); this.pieces(line, PLAIN, pieces) })
        this.drawLines(this.breakLines(pieces, width, base), base, x, width)
        this.space(base * 0.6)
        return
      }
    }
  }

  table(block: Extract<Block, { t: 'table' }>, x: number, width: number, base: number) {
    const size = base * 0.92
    const columns = Math.max(block.header.length, ...block.rows.map((row) => row.length), 1)
    const allRows = [block.header, ...block.rows].filter((row) => row.length)
    // Column widths follow the longest content, bounded so every column keeps at least an eighth of the table.
    const natural = Array.from({ length: columns }, (_, col) => Math.max(size * 3, ...allRows.map((row) => (row[col] ? this.breakLines(this.pieces(row[col]), Infinity, size)[0]?.width ?? 0 : 0) + 8)))
    const total = natural.reduce((sum, w) => sum + w, 0)
    const widths = total <= width ? natural.map((w) => w + ((width - total) * w) / total) : natural.map((w) => Math.max(width / (columns * 1.6), (w / total) * width))
    const scale = width / widths.reduce((sum, w) => sum + w, 0)
    const cols = widths.map((w) => w * scale)
    const pad = 4
    const lineHeight = size * 1.4

    const drawRow = (row: Inline[][], bold: boolean, isHeader: boolean) => {
      const cells = cols.map((w, col) => this.breakLines(this.pieces(row[col] ?? [], bold ? { ...PLAIN, bold: true } : PLAIN), w - pad * 2, size))
      const height = Math.max(1, ...cells.map((lines) => lines.length)) * lineHeight + pad * 2
      this.need(height)
      const top = this.y
      if (isHeader && this.decorations) this.emit(`gsave 0.9 g ${fmt(x)} ${fmt(top - height)} ${fmt(width)} ${fmt(height)} rectfill grestore`)
      let cx = x
      cells.forEach((lines, col) => {
        const align = block.aligns[col] ?? 'default'
        lines.forEach((line, index) => {
          let lx = cx + pad
          if (align === 'center') lx = cx + (cols[col] - line.width) / 2
          else if (align === 'right') lx = cx + cols[col] - pad - line.width
          this.drawLine(line, size, lx, top - pad - lineHeight * (index + 1) + lineHeight * 0.3)
        })
        cx += cols[col]
      })
      this.y = top - height
      this.emit(`gsave 0.4 setlinewidth 0.6 g ${fmt(x)} ${fmt(this.y)} m ${fmt(width)} 0 rlineto stroke grestore`)
    }

    // The header never sits alone at the bottom of a page: room for it and the first row is taken first.
    const rowHeight = (row: Inline[][]) => Math.max(1, ...cols.map((w, col) => this.breakLines(this.pieces(row[col] ?? []), w - pad * 2, size).length)) * lineHeight + pad * 2
    this.need((block.header.length ? rowHeight(block.header) : 0) + (block.rows[0] ? rowHeight(block.rows[0]) : lineHeight) + 2)
    this.emit(`gsave 0.8 setlinewidth 0.4 g ${fmt(x)} ${fmt(this.y)} m ${fmt(width)} 0 rlineto stroke grestore`)
    if (block.header.length) drawRow(block.header, true, true)
    for (const row of block.rows) drawRow(row, false, false)
    if (block.caption.length) {
      this.space(size * 0.4)
      this.drawLines(this.breakLines(this.pieces(block.caption, { ...PLAIN, italic: true, small: false }), width, size), size, x, width, 'center')
    }
    this.space(base * 0.7)
  }
}

const fontName = (key: FontKey) => ({ regular: 'MDCVSans', bold: 'MDCVSansBold', mono: 'MDCVMono', monoBold: 'MDCVMonoBold' })[key]

function sameStyle(a: Style, b: Style) {
  return a.bold === b.bold && a.italic === b.italic && a.mono === b.mono && a.underline === b.underline && a.strike === b.strike && a.small === b.small && a.rise === b.rise && a.color === b.color
}

function fmt(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '')
}

function orderedLabel(n: number, style?: string) {
  const alpha = (v: number) => { let s = ''; let k = v; while (k > 0) { k -= 1; s = String.fromCharCode(97 + (k % 26)) + s; k = Math.floor(k / 26) } return s }
  const roman = (v: number) => { const table: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]; let s = ''; let k = v; for (const [num, sym] of table) while (k >= num) { s += sym; k -= num } return s }
  switch (style) {
    case 'lower-alpha': return alpha(n)
    case 'upper-alpha': return alpha(n).toUpperCase()
    case 'lower-roman': return roman(n)
    case 'upper-roman': return roman(n).toUpperCase()
    default: return String(n)
  }
}

/** Non-ASCII escaped, so the file stays 7-bit clean as its DSC header promises. */
function ascii(text: string) {
  return text.replace(/[-￿]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

/* -------------------------------------------------------------- writer */

export async function writePostScript(doc: Doc, options: WriterOptions, loadFont?: FontLoader): Promise<Uint8Array> {
  const faces = await loadFaces(options.psEmbedFonts === false ? undefined : loadFont, options.psBodyFont === 'coding' ? 'coding' : 'gothic')
  const paperBase = PAPER_PT[options.pageSize] ?? PAPER_PT.A4
  const paper: [number, number] = options.landscape ? [paperBase[1], paperBase[0]] : [paperBase[0], paperBase[1]]
  const margin = Math.max(18, (options.marginMm / 25.4) * 72)
  const size = Math.max(6, options.bodyFontSize || 11)
  const meta = metaOf(doc, options)

  const body = new Typesetter(faces, paper, margin, size, true)
  body.decorations = options.psDecorations !== false
  if (options.standalone && (meta.title || meta.author || meta.date)) {
    body.y -= size * 2
    if (meta.title) body.drawLines(body.breakLines(body.pieces([{ t: 'str', text: meta.title }], { ...PLAIN, bold: true }), body.width, size * 2.2), size * 2.2, body.left, body.width, 'center', size * 2.2 * 1.3)
    if (meta.author) body.drawLines(body.breakLines(body.pieces([{ t: 'str', text: meta.author }]), body.width, size * 1.1), size * 1.1, body.left, body.width, 'center')
    if (meta.date) body.drawLines(body.breakLines(body.pieces([{ t: 'str', text: meta.date }]), body.width, size), size, body.left, body.width, 'center')
    body.y -= size * 2
  }
  let headingNumber: number[] = []
  for (const block of doc.blocks) {
    let out = block
    if (block.t === 'header' && options.numberSections) {
      headingNumber = headingNumber.slice(0, block.level)
      while (headingNumber.length < block.level) headingNumber.push(0)
      headingNumber[block.level - 1] += 1
      out = { ...block, c: [{ t: 'str', text: `${headingNumber.join('.')} ` }, ...block.c] }
    }
    body.comment(ascii(JSON.stringify(block)))
    body.block(out, body.left, body.width, size)
  }
  if (body.notes.length) {
    body.block({ t: 'hr' }, body.left, body.width, size)
    body.notes.forEach((note, index) => {
      body.block({ t: 'ordered', start: index + 1, items: [note], tight: true }, body.left, body.width, size * 0.9)
    })
  }

  // Table of contents: laid out separately and placed first; body page numbers shift by its
  // length, which is only known after a first layout, hence the second pass.
  let toc: Typesetter | null = null
  if (options.toc && body.headings.length) {
    const entries = body.headings.filter((heading) => heading.level <= options.tocDepth)
    const korean = /[\uac00-\ud7af]/.test(entries.map((entry) => entry.text).join('') + meta.title)
    const layoutToc = (offset: number) => {
      const t = new Typesetter(faces, paper, margin, size, false)
      t.block({ t: 'header', level: 1, c: [{ t: 'str', text: korean ? '차례' : 'Contents' }], id: '' }, t.left, t.width, size)
      for (const entry of entries) {
        const indent = (entry.level - 1) * size * 1.4
        const pageLabel = String(entry.page + offset)
        const pw = faces.regular.width(pageLabel, size)
        const lines = t.breakLines(t.pieces([{ t: 'str', text: entry.text }]), t.width - indent - pw - 12, size)
        t.drawLines(lines, size, t.left + indent, t.width - indent - pw - 12)
        t.useFont('regular', size, false)
        t.useColor(undefined)
        t.emit(`${fmt(t.left + t.width - pw)} ${fmt(t.y + size * 1.5 * 0.28)} m ${faces.regular.encode(pageLabel)} s`)
      }
      return t
    }
    toc = layoutToc(layoutToc(1).ops.length)
  }

  const pages = [...(toc ? toc.ops : []), ...body.ops]
  const pageText: string[] = []
  pages.forEach((ops, index) => {
    const number = index + 1
    pageText.push(`%%Page: ${number} ${number}`)
    pageText.push('%%BeginPageSetup\nsave\n%%EndPageSetup')
    for (const op of ops) pageText.push(op)
    // Footer: the page number, centred.
    const label = `- ${number} -`
    const face = faces.regular
    const w = face.width(label, size * 0.85)
    pageText.push(`/${fontName('regular')} ${fmt(size * 0.85)} f 0.4 g ${fmt((paper[0] - w) / 2)} ${fmt(margin * 0.5)} m ${face.encode(label)} s`)
    pageText.push('restore\nshowpage')
  })

  // Every glyph has been encoded now, so the fonts can be defined with exactly those glyphs.
  const out: string[] = []
  out.push('%!PS-Adobe-3.0')
  out.push(`%%Creator: My Document Converter`)
  if (meta.title) out.push(`%%Title: ${ascii(meta.title)}`)
  if (meta.author) out.push(`%%For: ${ascii(meta.author)}`)
  out.push(`%%Pages: ${pages.length}`)
  out.push(`%%BoundingBox: 0 0 ${Math.round(paper[0])} ${Math.round(paper[1])}`)
  out.push(`%%DocumentMedia: ${options.pageSize} ${Math.round(paper[0])} ${Math.round(paper[1])} 0 () ()`)
  out.push(`%%Orientation: ${options.landscape ? 'Landscape' : 'Portrait'}`)
  out.push('%%DocumentData: Clean7Bit')
  out.push('%%LanguageLevel: 3')
  out.push('%%EndComments')
  out.push(`%%mdcv-meta: ${ascii(JSON.stringify({ ...doc.meta, ...Object.fromEntries(Object.entries(meta).filter(([, value]) => value)) }))}`)
  out.push('%%BeginProlog')
  out.push('/f { selectfont } bind def /m { moveto } bind def /s { show } bind def /g { setgray } bind def /rc { setrgbcolor } bind def')
  // Only the faces that showed something are embedded.
  for (const key of Object.keys(POSTSCRIPT_FONT_FILES) as FontKey[]) if (faces[key].used.size > 1 || !faces[key].ttf) out.push(defineFont(faces[key], fontName(key)))
  out.push('%%EndProlog')
  out.push('%%BeginSetup')
  out.push(`<< /PageSize [${fmt(paper[0])} ${fmt(paper[1])}] >> setpagedevice`)
  out.push('%%EndSetup')
  // Not spread: a long document has more page ops than the call stack takes as arguments.
  for (const line of pageText) out.push(line)
  out.push('%%Trailer')
  out.push('%%EOF')
  return new TextEncoder().encode(`${out.join('\n')}\n`)
}
