/**
 * Just enough TrueType to embed a font in PostScript: the tables that map
 * characters to glyphs and glyphs to widths, and a subsetter that keeps only
 * the glyphs a document uses. Everything here works on plain bytes, so it
 * runs unchanged in the browser, under Electron and in the Node tests.
 */

export type TrueTypeFont = {
  unitsPerEm: number
  numGlyphs: number
  bbox: [number, number, number, number]
  ascent: number
  descent: number
  /** Advance width of each glyph in font units. */
  advance: (gid: number) => number
  /** Glyph index for a code point, 0 (.notdef) when the font lacks it. */
  glyph: (codePoint: number) => number
  /** A compact font file holding only the mapped glyphs (old id → new id), renumbered; components are added to the map. */
  subset: (mapping: Map<number, number>) => Uint8Array
}

type Table = { offset: number; length: number }

function tag(view: DataView, offset: number) {
  return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3))
}

export function parseTrueType(bytes: Uint8Array): TrueTypeFont {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const version = view.getUint32(0)
  if (version !== 0x00010000 && version !== 0x74727565) throw new Error('Not a TrueType font (CFF/OpenType outlines cannot be embedded as Type 42)')
  const numTables = view.getUint16(4)
  const tables = new Map<string, Table>()
  for (let index = 0; index < numTables; index += 1) {
    const at = 12 + index * 16
    tables.set(tag(view, at), { offset: view.getUint32(at + 8), length: view.getUint32(at + 12) })
  }
  const need = (name: string) => {
    const table = tables.get(name)
    if (!table) throw new Error(`Font lacks the ${name} table`)
    return table
  }

  const head = need('head')
  const unitsPerEm = view.getUint16(head.offset + 18)
  const bbox: [number, number, number, number] = [view.getInt16(head.offset + 36), view.getInt16(head.offset + 38), view.getInt16(head.offset + 40), view.getInt16(head.offset + 42)]
  const indexToLocFormat = view.getInt16(head.offset + 50)
  const maxp = need('maxp')
  const numGlyphs = view.getUint16(maxp.offset + 4)
  const hhea = need('hhea')
  const ascent = view.getInt16(hhea.offset + 4)
  const descent = view.getInt16(hhea.offset + 6)
  const numberOfHMetrics = view.getUint16(hhea.offset + 34)
  const hmtx = need('hmtx')
  const advance = (gid: number) => {
    const index = Math.min(gid, numberOfHMetrics - 1)
    if (index < 0) return 0
    return view.getUint16(hmtx.offset + index * 4)
  }

  const cmap = parseCmap(view, need('cmap'))
  const glyph = (codePoint: number) => cmap.get(codePoint) ?? 0

  const loca = need('loca')
  const glyf = need('glyf')
  const glyphOffset = (gid: number) => (indexToLocFormat === 0 ? view.getUint16(loca.offset + gid * 2) * 2 : view.getUint32(loca.offset + gid * 4))

  /** Component glyphs of a composite glyph, with where each index sits so a subset can renumber it. */
  const components = (gid: number): { gid: number; at: number }[] => {
    const start = glyphOffset(gid)
    const end = glyphOffset(gid + 1)
    if (end - start < 10) return []
    const contours = view.getInt16(glyf.offset + start)
    if (contours >= 0) return []
    const out: { gid: number; at: number }[] = []
    let at = 10 // relative to the glyph start
    for (;;) {
      const flags = view.getUint16(glyf.offset + start + at)
      out.push({ gid: view.getUint16(glyf.offset + start + at + 2), at: at + 2 })
      at += 4
      at += flags & 0x0001 ? 4 : 2 // ARG_1_AND_2_ARE_WORDS
      if (flags & 0x0008) at += 2 // WE_HAVE_A_SCALE
      else if (flags & 0x0040) at += 4 // WE_HAVE_AN_X_AND_Y_SCALE
      else if (flags & 0x0080) at += 8 // WE_HAVE_A_TWO_BY_TWO
      if (!(flags & 0x0020)) break // MORE_COMPONENTS
    }
    return out
  }

  const leftSideBearing = (gid: number) => {
    if (gid < numberOfHMetrics) return view.getInt16(hmtx.offset + gid * 4 + 2)
    return view.getInt16(hmtx.offset + numberOfHMetrics * 4 + (gid - numberOfHMetrics) * 2)
  }

  /**
   * A compact font holding only the mapped glyphs, renumbered to their new
   * ids (the map is extended with any composite components it lacks). The
   * result is a small font even for a 17,000-glyph Hangul face: a page of
   * text needs a few hundred glyphs, so hmtx, loca and glyf shrink together.
   */
  const subset = (mapping: Map<number, number>): Uint8Array => {
    if (!mapping.has(0)) mapping.set(0, mapping.size)
    const queue = [...mapping.keys()]
    while (queue.length) {
      const gid = queue.pop()!
      if (gid < 0 || gid >= numGlyphs) continue
      for (const part of components(gid)) {
        if (!mapping.has(part.gid)) { mapping.set(part.gid, mapping.size); queue.push(part.gid) }
      }
    }
    const order = [...mapping.entries()].sort((a, b) => a[1] - b[1]).map(([old]) => old)
    const count = order.length
    const chunks: Uint8Array[] = []
    const offsets = new Uint32Array(count + 1)
    let total = 0
    order.forEach((old, index) => {
      offsets[index] = total
      const start = glyphOffset(old)
      const end = glyphOffset(old + 1)
      if (old >= numGlyphs || end <= start) return
      const length = (end - start + 3) & ~3
      const data = new Uint8Array(length)
      data.set(bytes.subarray(glyf.offset + start, glyf.offset + end))
      const dataView = new DataView(data.buffer)
      for (const part of components(old)) dataView.setUint16(part.at, mapping.get(part.gid) ?? 0)
      chunks.push(data)
      total += length
    })
    offsets[count] = total
    const newGlyf = new Uint8Array(total)
    let at = 0
    for (const chunk of chunks) { newGlyf.set(chunk, at); at += chunk.length }
    const newLoca = new Uint8Array(offsets.length * 4)
    const locaView = new DataView(newLoca.buffer)
    offsets.forEach((value, index) => locaView.setUint32(index * 4, value))
    const newHmtx = new Uint8Array(count * 4)
    const hmtxView = new DataView(newHmtx.buffer)
    order.forEach((old, index) => {
      hmtxView.setUint16(index * 4, old < numGlyphs ? advance(old) : 0)
      hmtxView.setInt16(index * 4 + 2, old < numGlyphs ? leftSideBearing(old) : 0)
    })
    const newHead = bytes.slice(head.offset, head.offset + head.length)
    new DataView(newHead.buffer).setInt16(50, 1) // long loca offsets
    new DataView(newHead.buffer).setUint32(8, 0) // checksum adjustment, recomputed below
    const newMaxp = bytes.slice(maxp.offset, maxp.offset + maxp.length)
    new DataView(newMaxp.buffer).setUint16(4, count)
    const newHhea = bytes.slice(hhea.offset, hhea.offset + hhea.length)
    new DataView(newHhea.buffer).setUint16(34, count)

    const out = new Map<string, Uint8Array>()
    for (const name of ['cvt ', 'fpgm', 'prep']) {
      const table = tables.get(name)
      if (table) out.set(name, bytes.slice(table.offset, table.offset + table.length))
    }
    out.set('head', newHead)
    out.set('hhea', newHhea)
    out.set('maxp', newMaxp)
    out.set('hmtx', newHmtx)
    out.set('loca', newLoca)
    out.set('glyf', newGlyf)
    return assemble(out)
  }

  return { unitsPerEm, numGlyphs, bbox, ascent, descent, advance, glyph, subset }
}

/** Builds a font file from tables: directory, then the tables 4-byte aligned, with checksums. */
function assemble(tables: Map<string, Uint8Array>): Uint8Array {
  const names = [...tables.keys()].sort()
  const headerLength = 12 + names.length * 16
  let size = headerLength
  for (const name of names) size += (tables.get(name)!.length + 3) & ~3
  const out = new Uint8Array(size)
  const view = new DataView(out.buffer)
  view.setUint32(0, 0x00010000)
  view.setUint16(4, names.length)
  const entrySelector = Math.floor(Math.log2(names.length))
  const searchRange = 2 ** entrySelector * 16
  view.setUint16(6, searchRange)
  view.setUint16(8, entrySelector)
  view.setUint16(10, names.length * 16 - searchRange)
  let offset = headerLength
  names.forEach((name, index) => {
    const data = tables.get(name)!
    const at = 12 + index * 16
    for (let k = 0; k < 4; k += 1) out[at + k] = name.charCodeAt(k)
    view.setUint32(at + 4, checksum(data))
    view.setUint32(at + 8, offset)
    view.setUint32(at + 12, data.length)
    out.set(data, offset)
    offset += (data.length + 3) & ~3
  })
  const headIndex = names.indexOf('head')
  if (headIndex >= 0) {
    const headOffset = view.getUint32(12 + headIndex * 16 + 8)
    view.setUint32(headOffset + 8, (0xb1b0afba - checksum(out)) >>> 0)
  }
  return out
}

function checksum(data: Uint8Array): number {
  let sum = 0
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const whole = data.length & ~3
  for (let at = 0; at < whole; at += 4) sum = (sum + view.getUint32(at)) >>> 0
  if (whole < data.length) {
    let last = 0
    for (let k = 0; k < 4; k += 1) last = (last << 8) | (whole + k < data.length ? data[whole + k] : 0)
    sum = (sum + (last >>> 0)) >>> 0
  }
  return sum
}

/** The Unicode cmap subtable: format 12 when present (full range), otherwise format 4 (BMP). */
function parseCmap(view: DataView, table: Table): Map<number, number> {
  const count = view.getUint16(table.offset + 2)
  let best: { offset: number; format: number; score: number } | null = null
  for (let index = 0; index < count; index += 1) {
    const at = table.offset + 4 + index * 8
    const platform = view.getUint16(at)
    const encoding = view.getUint16(at + 2)
    const offset = table.offset + view.getUint32(at + 4)
    const format = view.getUint16(offset)
    let score = 0
    if (format === 12 && (platform === 3 || platform === 0)) score = 3
    else if (format === 4 && platform === 3 && encoding === 1) score = 2
    else if (format === 4 && platform === 0) score = 1
    if (score && (!best || score > best.score)) best = { offset, format, score }
  }
  const map = new Map<number, number>()
  if (!best) return map
  if (best.format === 12) {
    const groups = view.getUint32(best.offset + 12)
    for (let index = 0; index < groups; index += 1) {
      const at = best.offset + 16 + index * 12
      const start = view.getUint32(at)
      const end = view.getUint32(at + 4)
      const gid = view.getUint32(at + 8)
      for (let code = start; code <= end && code - start < 65536; code += 1) map.set(code, gid + (code - start))
    }
    return map
  }
  const segCount = view.getUint16(best.offset + 6) / 2
  const ends = best.offset + 14
  const starts = ends + segCount * 2 + 2
  const deltas = starts + segCount * 2
  const ranges = deltas + segCount * 2
  for (let seg = 0; seg < segCount; seg += 1) {
    const end = view.getUint16(ends + seg * 2)
    const start = view.getUint16(starts + seg * 2)
    const delta = view.getInt16(deltas + seg * 2)
    const rangeOffset = view.getUint16(ranges + seg * 2)
    if (start === 0xffff) continue
    for (let code = start; code <= end; code += 1) {
      let gid: number
      if (rangeOffset === 0) gid = (code + delta) & 0xffff
      else {
        const at = ranges + seg * 2 + rangeOffset + (code - start) * 2
        if (at + 1 >= view.byteLength) continue
        gid = view.getUint16(at)
        if (gid !== 0) gid = (gid + delta) & 0xffff
      }
      if (gid) map.set(code, gid)
    }
  }
  return map
}
