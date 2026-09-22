// PostScript: the typesetter, the embedded (subset) TrueType fonts, the
// round trip through the structure comments, text extraction from foreign
// PostScript, and — the real proof — Ghostscript rendering every page
// without an error. Ghostscript runs as WebAssembly (a dev dependency), so
// nothing has to be installed on the machine.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readDocument, writeDocument } from '../src/lib/doc/convert.ts'
import { parseTrueType } from '../src/lib/doc/ttf.ts'
import { POSTSCRIPT_FONT_FILES } from '../src/lib/doc/writers/postscript.ts'
import { readPostScript } from '../src/lib/doc/readers/postscript.ts'
import { blocksToText } from '../src/lib/doc/ast.ts'

const check = (category, name, fn) => test(`${category} › ${name}`, fn)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fontDir = path.join(root, 'public', 'fonts')
const loadFont = async (file) => new Uint8Array(await fs.readFile(path.join(fontDir, file)))
const decode = (bytes) => new TextDecoder().decode(bytes)

const SAMPLE = `---
title: PostScript 시험 문서
author: SHKWON
---

# 첫 번째 제목 (Heading)

한글과 English 가 **섞인** 문단입니다. *기울임*, \`code\`, [링크](https://example.com), H~2~O, x^2^.

## 목록

- 하나
- 둘
  - 셋
- [x] 끝난 일
- [ ] 남은 일

1. first
2. second

\`\`\`js
function greet(name) { return 'Hello ' + name }
\`\`\`

| 열 A | 열 B |
|:-----|-----:|
| 가 | 1 |
| 나 | 2 |

> 인용문입니다.

각주[^1] 문장.

[^1]: 각주 내용.
`

const sample = () => readDocument({ format: 'markdown', text: SAMPLE })

/* --------------------------------------------------------------- fonts */

check('postscript:fonts', 'the four bundled Nanum fonts are TrueType and cover Hangul, Latin and box drawing', async () => {
  for (const file of Object.values(POSTSCRIPT_FONT_FILES)) {
    const font = parseTrueType(await loadFont(file))
    assert.ok(font.numGlyphs > 10000, `${file}: ${font.numGlyphs} glyphs`)
    assert.ok(font.glyph('가'.codePointAt(0)) > 0, `${file}: no 가`)
    assert.ok(font.glyph('A'.codePointAt(0)) > 0, `${file}: no A`)
    assert.ok(font.advance(font.glyph('A'.codePointAt(0))) > 0)
  }
  const license = await fs.readFile(path.join(fontDir, 'OFL.txt'), 'utf8')
  assert.ok(license.includes('SIL OPEN FONT LICENSE'))
})

check('postscript:fonts', 'a subset keeps only the used glyphs, renumbered, and stays a valid font', async () => {
  const font = parseTrueType(await loadFont(POSTSCRIPT_FONT_FILES.regular))
  const mapping = new Map([[0, 0]])
  for (const ch of '한글 Test 123') { const gid = font.glyph(ch.codePointAt(0)); if (!mapping.has(gid)) mapping.set(gid, mapping.size) }
  const bytes = font.subset(mapping)
  assert.ok(bytes.length < 60_000, `subset is ${bytes.length} bytes`)
  // The subset has no cmap (PostScript addresses glyphs by id), so its tables are read by hand.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tables = new Map()
  for (let index = 0; index < view.getUint16(4); index += 1) {
    const at = 12 + index * 16
    tables.set(String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]), { offset: view.getUint32(at + 8), length: view.getUint32(at + 12) })
  }
  for (const name of ['glyf', 'loca', 'hmtx', 'head', 'maxp', 'hhea']) assert.ok(tables.has(name), `no ${name}`)
  assert.equal(view.getUint16(tables.get('maxp').offset + 4), mapping.size)
  assert.equal(view.getUint16(tables.get('hhea').offset + 34), mapping.size)
  assert.equal(tables.get('loca').length, (mapping.size + 1) * 4)
  // Advance widths survive the renumbering.
  const gidT = font.glyph('T'.codePointAt(0))
  assert.equal(view.getUint16(tables.get('hmtx').offset + mapping.get(gidT) * 4), font.advance(gidT))
  // Glyph data is present for a Hangul syllable.
  const gid = mapping.get(font.glyph('한'.codePointAt(0)))
  const loca = tables.get('loca').offset
  assert.ok(view.getUint32(loca + (gid + 1) * 4) - view.getUint32(loca + gid * 4) > 20, 'empty glyph')
})

/* -------------------------------------------------------------- writer */

check('postscript:writer', 'a document becomes DSC-conformant Level 3 PostScript with embedded CID fonts', async () => {
  const output = await writeDocument(await sample(), 'postscript', { standalone: true }, { loadFont })
  const text = decode(output.bytes)
  assert.ok(text.startsWith('%!PS-Adobe-3.0\n'))
  assert.ok(/%%Pages: \d+/.test(text) && text.includes('%%LanguageLevel: 3') && text.includes('%%EOF'))
  assert.ok(text.includes('/CIDFontType 2') && text.includes('/sfnts [') && text.includes('composefont pop'))
  assert.ok(text.includes('/MDCVSans ') && text.includes('/MDCVSansBold ') && text.includes('/MDCVMono '), 'regular, bold and mono faces are used')
  assert.ok(!text.includes('/MDCVMonoBoldCID'), 'an unused face is not embedded')
  assert.ok(/[\x80-\xff]/.test(text) === false, 'output is 7-bit clean')
  assert.ok(text.includes('rectfill') && text.includes('rectstroke') && text.includes('showpage'))
  assert.ok(output.bytes.length < 400_000, `${output.bytes.length} bytes: subsetting failed`)
  assert.ok(output.preview.includes('<'), 'rendered preview')
})

check('postscript:writer', 'page size, orientation and margins follow the options', async () => {
  const doc = await sample()
  const a4 = decode((await writeDocument(doc, 'postscript', { pageSize: 'A4' }, { loadFont })).bytes)
  const letterLandscape = decode((await writeDocument(doc, 'postscript', { pageSize: 'Letter', landscape: true, marginMm: 10 }, { loadFont })).bytes)
  assert.ok(a4.includes('%%BoundingBox: 0 0 595 842') && a4.includes('/PageSize [595.28 841.89]'))
  assert.ok(letterLandscape.includes('%%BoundingBox: 0 0 792 612') && letterLandscape.includes('%%Orientation: Landscape'))
})

check('postscript:writer', 'a table of contents with page numbers comes first and long text flows over pages', async () => {
  const long = `# 제목\n\n${'긴 문단입니다. '.repeat(40)}\n\n`.repeat(12)
  const output = await writeDocument(await readDocument({ format: 'markdown', text: long }), 'postscript', { toc: true }, { loadFont })
  const text = decode(output.bytes)
  const pages = Number(/%%Pages: (\d+)/.exec(text)[1])
  assert.ok(pages >= 3, `${pages} pages`)
  const firstPage = text.slice(text.indexOf('%%Page: 1 1'), text.indexOf('%%Page: 2 2'))
  assert.ok(firstPage.includes('show'), 'the contents page draws text')
})

check('postscript:writer', 'without the bundled fonts the writer falls back to Helvetica and Courier', async () => {
  const output = await writeDocument(await sample(), 'postscript', {}, {})
  const text = decode(output.bytes)
  assert.ok(text.includes('/Helvetica findfont definefont') && text.includes('/Courier findfont definefont'))
  assert.ok(!text.includes('/sfnts'))
  assert.ok(text.includes('(Heading)'))
})

/* -------------------------------------------------------------- reader */

check('postscript:reader', 'our own PostScript reads back with every block intact', async () => {
  const doc = await sample()
  const output = await writeDocument(doc, 'postscript', {}, { loadFont })
  const back = await readDocument({ format: 'postscript', bytes: output.bytes })
  assert.deepEqual(back.blocks.map((block) => block.t), doc.blocks.map((block) => block.t))
  assert.equal(blocksToText(back.blocks), blocksToText(doc.blocks))
  assert.equal(back.meta.title, 'PostScript 시험 문서')
  const table = back.blocks.find((block) => block.t === 'table')
  assert.equal(table.rows.length, 2)
})

check('postscript:reader', 'PostScript from another program yields its text as headings and paragraphs', () => {
  const foreign = `%!PS-Adobe-2.0
/Helvetica-Bold findfont 20 scalefont setfont
72 720 moveto (Chapter One) show
/Helvetica findfont 11 scalefont setfont
72 690 moveto (The first line of the paragraph,) show
72 676 moveto (and its second line \\(with parens\\).) show
72 640 moveto (A second paragraph after a gap.) show
/T { moveto show } def
(Shown through a procedure.) 72 600 T
<48657820737472696E67> 72 580 moveto show
showpage
72 720 moveto (Page two text.) show
showpage
%%EOF
`
  const doc = readPostScript(foreign)
  const types = doc.blocks.map((block) => block.t)
  assert.equal(types[0], 'header')
  assert.equal(blocksToText([doc.blocks[0]]), 'Chapter One')
  const texts = doc.blocks.map((block) => blocksToText([block]))
  assert.ok(texts.some((text) => text.includes('first line of the paragraph, and its second line (with parens).')), texts.join(' | '))
  assert.ok(texts.some((text) => text === 'A second paragraph after a gap.'))
  assert.ok(texts.some((text) => text.includes('Shown through a procedure.')))
  assert.ok(texts.some((text) => text.includes('Hex string')))
  assert.ok(texts.some((text) => text.includes('Page two text.')))
})

/* ---------------------------------------------------------- ghostscript */

let ghostscript = null
async function gs(args, files) {
  if (!ghostscript) {
    const { default: create } = await import('@jspawn/ghostscript-wasm')
    const wasm = await fs.readFile(path.join(root, 'node_modules', '@jspawn', 'ghostscript-wasm', 'gs.wasm'))
    ghostscript = { create, wasm }
  }
  const mod = await ghostscript.create({
    instantiateWasm: (imports, done) => { WebAssembly.instantiate(ghostscript.wasm, imports).then((result) => done(result.instance)); return {} },
  })
  for (const [name, bytes] of Object.entries(files)) mod.FS.writeFile(`/${name}`, bytes)
  // The module writes straight to the process streams; they are caught while the (synchronous) run lasts.
  const captured = []
  const out = process.stdout.write.bind(process.stdout)
  const err = process.stderr.write.bind(process.stderr)
  process.stdout.write = (chunk) => { captured.push(String(chunk)); return true }
  process.stderr.write = (chunk) => { captured.push(String(chunk)); return true }
  let code
  try { code = mod.callMain(args) } finally { process.stdout.write = out; process.stderr.write = err }
  const messages = captured.join('').split('\n').filter(Boolean)
  const outputs = {}
  for (const name of mod.FS.readdir('/')) if (name.startsWith('out')) outputs[name] = mod.FS.readFile(`/${name}`)
  return { code, messages, outputs }
}

check('postscript:ghostscript', 'Ghostscript interprets the embedded-font output without errors and draws every page', async () => {
  const output = await writeDocument(await sample(), 'postscript', { standalone: true, toc: true }, { loadFont })
  const result = await gs(['-q', '-dNOPAUSE', '-dBATCH', '-dSAFER', '-sDEVICE=bbox', '/in.ps'], { 'in.ps': output.bytes })
  assert.equal(result.code, 0, result.messages.join('\n'))
  assert.ok(!result.messages.some((line) => /error|undefined|invalidfont/i.test(line)), result.messages.join('\n'))
  const boxes = result.messages.filter((line) => line.startsWith('%%BoundingBox:')).map((line) => line.split(/\s+/).slice(1).map(Number))
  const pages = Number(/%%Pages: (\d+)/.exec(decode(output.bytes))[1])
  assert.equal(boxes.length, pages, `${boxes.length} drawn pages for ${pages} declared`)
  for (const [x0, y0, x1, y1] of boxes) assert.ok(x1 - x0 > 300 && y1 - y0 > 200, `page content box ${x0} ${y0} ${x1} ${y1}`)
})

check('postscript:ghostscript', 'Ghostscript renders the page to an image with ink on it', async () => {
  const output = await writeDocument(await sample(), 'postscript', {}, { loadFont })
  const result = await gs(['-q', '-dNOPAUSE', '-dBATCH', '-dSAFER', '-sDEVICE=pgmraw', '-r36', '-sOutputFile=/out%d.pgm', '/in.ps'], { 'in.ps': output.bytes })
  assert.equal(result.code, 0, result.messages.join('\n'))
  const pgm = result.outputs['out1.pgm']
  assert.ok(pgm && pgm.length > 1000, `no image: ${Object.keys(result.outputs).join(', ')}`)
  // PGM: header "P5\nW H\n255\n" then one byte per pixel; count dark pixels.
  const header = /^P5\s+(?:#[^\n]*\n\s*)*(\d+)\s+(\d+)\s+255\s/.exec(new TextDecoder('latin1').decode(pgm.subarray(0, 120)))
  assert.ok(header, `PGM header: ${JSON.stringify(new TextDecoder('latin1').decode(pgm.subarray(0, 20)))}`)
  const start = header[0].length
  let dark = 0
  for (let index = start; index < pgm.length; index += 1) if (pgm[index] < 128) dark += 1
  const ratio = dark / (pgm.length - start)
  assert.ok(ratio > 0.01 && ratio < 0.5, `ink ratio ${ratio.toFixed(4)}`)
})

check('postscript:ghostscript', 'the base-font fallback also interprets cleanly', async () => {
  const output = await writeDocument(await sample(), 'postscript', {}, {})
  const result = await gs(['-q', '-dNOPAUSE', '-dBATCH', '-dSAFER', '-sDEVICE=nullpage', '/in.ps'], { 'in.ps': output.bytes })
  assert.equal(result.code, 0, result.messages.join('\n'))
  assert.ok(!result.messages.some((line) => /error/i.test(line)), result.messages.join('\n'))
})

/* ------------------------------------------------------------- options */

check('postscript:options', 'the PostScript options switch embedding, the body family and decorations', async () => {
  const doc = await sample()
  const plain = decode((await writeDocument(doc, 'postscript', { psEmbedFonts: false }, { loadFont })).bytes)
  assert.ok(!plain.includes('/sfnts') && plain.includes('/Helvetica findfont'), 'embedding off still embeds')
  const coding = decode((await writeDocument(doc, 'postscript', { psBodyFont: 'coding' }, { loadFont })).bytes)
  const gothic = decode((await writeDocument(doc, 'postscript', { psBodyFont: 'gothic' }, { loadFont })).bytes)
  assert.ok(coding.includes('/CIDFontType 2') && coding !== gothic, 'the body family makes no difference')
  const bare = decode((await writeDocument(doc, 'postscript', { psDecorations: false }, { loadFont })).bytes)
  assert.ok(!bare.includes('rectfill') && gothic.includes('rectfill'), 'decorations were not switched off')
  const big = decode((await writeDocument(doc, 'postscript', { bodyFontSize: 16 }, { loadFont })).bytes)
  assert.ok(big.includes('/MDCVSans 16 f'), 'body size ignored')
})
