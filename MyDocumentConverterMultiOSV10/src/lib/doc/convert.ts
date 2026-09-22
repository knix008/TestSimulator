/**
 * The conversion pipeline: read(input) → Doc → write(output).
 *
 * Everything here is platform independent. The one thing a writer may need
 * from outside — rendering HTML to PDF — is passed in as `env`, so the same
 * code runs in the browser (where it is refused with a clear message) and on
 * the desktop (where Chromium does it).
 */
import type { Doc } from './ast'
import { uniqueHeadingIds } from './ast'
import { getFormat, type FormatId } from './formats'
import { normalizeOptions, type WriterOptions } from './options'
import { readMarkdown } from './readers/markdown'
import { readHtml } from './readers/html'
import { readAsciiDoc, readLatex, readMediaWiki, readOrg, readRst, readTextile } from './readers/markup'
import { readCsv, readIpynb, readJson, readPlain } from './readers/text'
import { readRtf } from './readers/rtf'
import { readCreole, readDokuWiki, readJira, readMuse, readTikiWiki, readTWiki, readVimwiki } from './readers/wiki'
import { readDocBook, readFb2, readJats, readOpml } from './readers/xml'
import { readMan, readMdoc } from './readers/roff'
import { readPostScript } from './readers/postscript'
import { writePostScript, type FontLoader } from './writers/postscript'
import { readDjot, readHaddock, readPod, readT2t, readTypst } from './readers/misc'
import { readBibtex, readCslJson, readEndnoteXml, readRis, writeBibtex, writeCslJson } from './biblio'
import { fromPandoc, readNative, toPandoc, writeNative } from './pandocAst'
import { writeMarkdown } from './writers/markdown'
import { htmlBody, htmlDocument, writeHtml } from './writers/html'
import { writeAsciiDoc, writeCsv, writeIpynb, writeLatex, writeMediaWiki, writeOrg, writePlain, writeRst, writeRtf, writeTextile } from './writers/markup'
import { writeDokuWiki, writeJira, writeMuse, writeXWiki, writeZimWiki } from './writers/wiki'
import { writeDocBook, writeFb2, writeIcml, writeJats, writeOpml, writeTei } from './writers/xml'
import { writeBeamer, writeContext, writeMan, writeMs, writeTexinfo } from './writers/typesetting'
import { writeAnsi, writeAsciiDocVariant, writeDjot, writeHaddock, writeHtml4, writeTypst } from './writers/misc'
import { writeHtmlSlides } from './writers/slides'

export type ConvertInput = { format: FormatId; text?: string; bytes?: Uint8Array }

export type ConvertOutput = {
  format: FormatId
  extension: string
  mime: string
  text?: string
  bytes?: Uint8Array
  /** HTML the preview pane can show for this output. */
  preview: string
}

export type ConvertEnv = {
  /** Renders a complete HTML document to PDF bytes. Absent in the browser build. */
  renderPdf?: (html: string, options: WriterOptions) => Promise<Uint8Array>
  /** Loads one of the bundled TrueType fonts (public/fonts) for the PostScript writer to embed. */
  loadFont?: FontLoader
}

export async function readDocument(input: ConvertInput): Promise<Doc> {
  const format = getFormat(input.format)
  if (format.read === 'binary') {
    const bytes = input.bytes ?? new TextEncoder().encode(input.text ?? '')
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    const binary = await import('./readers/binary')
    switch (format.id) {
      case 'docx': return finish(await binary.readDocx(buffer))
      case 'odt': return finish(await binary.readOdt(buffer))
      case 'epub': return finish(await binary.readEpub(buffer))
      default: throw new Error(`No reader for ${format.id}`)
    }
  }
  const text = input.text ?? (input.bytes ? new TextDecoder().decode(input.bytes) : '')
  switch (format.id) {
    case 'markdown': case 'gfm': case 'commonmark': case 'commonmark_x': case 'markdown_strict': case 'markdown_phpextra': case 'markdown_mmd':
      return finish(readMarkdown(text, format.id))
    case 'djot': return finish(readDjot(text))
    case 'html': return finish(readHtml(text))
    case 'plain': return finish(readPlain(text))
    case 'rst': return finish(readRst(text))
    case 'latex': return finish(readLatex(text))
    case 'org': return finish(readOrg(text))
    case 'textile': return finish(readTextile(text))
    case 'mediawiki': return finish(readMediaWiki(text))
    case 'asciidoc': return finish(readAsciiDoc(text))
    case 'typst': return finish(readTypst(text))
    case 'haddock': return finish(readHaddock(text))
    case 't2t': return finish(readT2t(text))
    case 'pod': return finish(readPod(text))
    case 'muse': return finish(readMuse(text))
    case 'dokuwiki': return finish(readDokuWiki(text))
    case 'tikiwiki': return finish(readTikiWiki(text))
    case 'twiki': return finish(readTWiki(text))
    case 'vimwiki': return finish(readVimwiki(text))
    case 'creole': return finish(readCreole(text))
    case 'jira': return finish(readJira(text))
    case 'man': return finish(readMan(text))
    case 'mdoc': return finish(readMdoc(text))
    case 'rtf': return finish(readRtf(text))
    case 'postscript': return finish(readPostScript(text))
    case 'fb2': return finish(readFb2(text))
    case 'docbook': return finish(readDocBook(text))
    case 'jats': case 'bits': return finish(readJats(text))
    case 'opml': return finish(readOpml(text))
    case 'bibtex': case 'biblatex': return finish(readBibtex(text))
    case 'csljson': return finish(readCslJson(text))
    case 'ris': return finish(readRis(text))
    case 'endnotexml': return finish(readEndnoteXml(text))
    case 'json': {
      const parsed = JSON.parse(text) as Record<string, unknown>
      return finish(parsed && typeof parsed === 'object' && 'pandoc-api-version' in parsed ? fromPandoc(parsed) : readJson(text))
    }
    case 'native': return finish(readNative(text))
    case 'csv': return finish(readCsv(text, ','))
    case 'tsv': return finish(readCsv(text, '\t'))
    case 'ipynb': return finish(readIpynb(text))
    default: throw new Error(`No reader for ${format.id}`)
  }
}

function finish(doc: Doc): Doc {
  return uniqueHeadingIds(doc)
}

export async function writeDocument(doc: Doc, target: FormatId, partial: Partial<WriterOptions> | undefined, env: ConvertEnv = {}): Promise<ConvertOutput> {
  const options = normalizeOptions(partial)
  const format = getFormat(target)
  const base = { format: format.id, extension: format.extensions[0], mime: format.mime }
  const textOut = (text: string, preview?: string): ConvertOutput => ({ ...base, text, preview: preview ?? sourcePreview(text) })
  const rendered = () => renderedPreview(doc, options)
  switch (format.id) {
    case 'markdown': return textOut(writeMarkdown(doc, options))
    case 'gfm': return textOut(writeMarkdown(doc, options, 'gfm'))
    case 'commonmark': return textOut(writeMarkdown(doc, options, 'commonmark'))
    case 'commonmark_x': return textOut(writeMarkdown(doc, options, 'commonmark_x'))
    case 'markdown_strict': return textOut(writeMarkdown(doc, options, 'markdown_strict'))
    case 'markdown_phpextra': return textOut(writeMarkdown(doc, options, 'markdown_phpextra'))
    case 'markdown_mmd': return textOut(writeMarkdown(doc, options, 'markdown_mmd'))
    case 'markua': return textOut(writeMarkdown(doc, options, 'markua'))
    case 'djot': return textOut(writeDjot(doc, options))
    case 'html': case 'html5': { const text = writeHtml(doc, options); return textOut(text, options.standalone ? text : htmlDocument(doc, text, { ...options, standalone: true })) }
    case 'html4': { const text = writeHtml4(doc, options); return textOut(text, options.standalone ? text : htmlDocument(doc, text, { ...options, standalone: true })) }
    case 'plain': return textOut(writePlain(doc, options))
    case 'ansi': { const text = writeAnsi(doc, options); return textOut(text, ansiPreview(text)) }
    case 'rst': return textOut(writeRst(doc, options))
    case 'latex': return textOut(writeLatex(doc, options))
    case 'beamer': return textOut(writeBeamer(doc, options))
    case 'context': return textOut(writeContext(doc, options))
    case 'texinfo': return textOut(writeTexinfo(doc, options))
    case 'org': return textOut(writeOrg(doc, options))
    case 'textile': return textOut(writeTextile(doc, options))
    case 'asciidoc': return textOut(writeAsciiDoc(doc, options))
    case 'asciidoctor': return textOut(writeAsciiDocVariant(doc, options, 'asciidoctor'))
    case 'asciidoc_legacy': return textOut(writeAsciiDocVariant(doc, options, 'asciidoc_legacy'))
    case 'typst': return textOut(writeTypst(doc, options))
    case 'haddock': return textOut(writeHaddock(doc, options))
    case 'muse': return textOut(writeMuse(doc, options))
    case 'mediawiki': return textOut(writeMediaWiki(doc, options))
    case 'dokuwiki': return textOut(writeDokuWiki(doc, options))
    case 'xwiki': return textOut(writeXWiki(doc, options))
    case 'zimwiki': return textOut(writeZimWiki(doc, options))
    case 'jira': return textOut(writeJira(doc, options))
    case 'man': return textOut(writeMan(doc, options))
    case 'ms': return textOut(writeMs(doc, options))
    case 'rtf': return textOut(writeRtf(doc, options), rendered())
    case 'opendocument': { const { writeOpenDocumentFlat } = await import('./writers/odt'); return textOut(writeOpenDocumentFlat(doc, options), rendered()) }
    case 'icml': return textOut(writeIcml(doc, options))
    case 'fb2': return textOut(writeFb2(doc, options))
    case 'revealjs': case 'slidy': case 'slideous': case 's5': case 'dzslides': { const text = writeHtmlSlides(doc, options, format.id); return textOut(text, text) }
    case 'docbook': case 'docbook5': return textOut(writeDocBook(doc, options, 5))
    case 'docbook4': return textOut(writeDocBook(doc, options, 4))
    case 'jats': case 'jats_archiving': return textOut(writeJats(doc, options, 'archiving'))
    case 'jats_publishing': return textOut(writeJats(doc, options, 'publishing'))
    case 'jats_articleauthoring': return textOut(writeJats(doc, options, 'articleauthoring'))
    case 'tei': return textOut(writeTei(doc, options))
    case 'opml': return textOut(writeOpml(doc, options))
    case 'bibtex': return textOut(writeBibtex(doc, options, 'bibtex'))
    case 'biblatex': return textOut(writeBibtex(doc, options, 'biblatex'))
    case 'csljson': return textOut(writeCslJson(doc, options))
    case 'json': return textOut(`${JSON.stringify(toPandoc(withMeta(doc, options)))}\n`)
    case 'native': return textOut(writeNative(withMeta(doc, options)))
    case 'csv': return textOut(writeCsv(doc, options, ','))
    case 'tsv': return textOut(writeCsv(doc, options, '\t'))
    case 'ipynb': return textOut(writeIpynb(doc, options, (blocks) => writeMarkdown({ meta: {}, blocks }, { ...options, standalone: false }, 'gfm')))
    case 'docx': {
      const { writeDocx } = await import('./writers/docx')
      return { ...base, bytes: await writeDocx(doc, options), preview: rendered() }
    }
    case 'odt': {
      const { writeOdt } = await import('./writers/odt')
      return { ...base, bytes: await writeOdt(doc, options), preview: rendered() }
    }
    case 'epub': case 'epub3': {
      const { writeEpub } = await import('./writers/epub')
      return { ...base, bytes: await writeEpub(doc, options), preview: rendered() }
    }
    case 'epub2': {
      const { writeEpub2 } = await import('./writers/misc')
      return { ...base, bytes: await writeEpub2(doc, options), preview: rendered() }
    }
    case 'pptx': {
      const { writePptx } = await import('./writers/slides')
      return { ...base, bytes: await writePptx(doc, options), preview: writeHtmlSlides(doc, options, 's5') }
    }
    case 'chunkedhtml': {
      const { writeChunkedHtml } = await import('./writers/misc')
      return { ...base, bytes: await writeChunkedHtml(doc, options), preview: rendered() }
    }
    case 'postscript': return { ...base, bytes: await writePostScript(doc, options, env.loadFont), preview: rendered() }
    case 'pdf': {
      const html = printableHtml(doc, options)
      if (!env.renderPdf) return { ...base, preview: html }
      return { ...base, bytes: await env.renderPdf(html, options), preview: html }
    }
    default:
      throw new Error(`No writer for ${format.id}`)
  }
}

/** The metadata overrides applied to the document itself, for the AST outputs. */
function withMeta(doc: Doc, options: WriterOptions): Doc {
  const meta = { ...doc.meta }
  if (options.title) meta.title = options.title
  if (options.author) meta.author = options.author
  if (options.date) meta.date = options.date
  return { ...doc, meta }
}

/** The HTML that the PDF writer and the print window lay out on paper. */
export function printableHtml(doc: Doc, options: WriterOptions): string {
  const body = htmlBody(doc, { ...options, standalone: true })
  const page = `@page { size: ${options.pageSize}${options.landscape ? ' landscape' : ''}; margin: ${options.marginMm}mm; }`
  const html = htmlDocument(doc, body, { ...options, standalone: true, htmlStyle: options.htmlStyle === 'none' ? 'print' : options.htmlStyle })
  return html.replace('</head>', `<style>${page}\nbody { max-width: none; padding: 0; margin: 0; }</style>\n</head>`)
}

function renderedPreview(doc: Doc, options: WriterOptions): string {
  return writeHtml(doc, { ...options, standalone: true, htmlStyle: options.htmlStyle === 'none' ? 'default' : options.htmlStyle })
}

function sourcePreview(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:12px 16px;font-family:Consolas,Menlo,"D2Coding",monospace;font-size:13px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;}</style></head><body>${escaped}</body></html>`
}

/** ANSI escapes shown as a terminal would show them. */
function ansiPreview(text: string): string {
  const colors: Record<string, string> = { 30: '#111', 31: '#dc2626', 32: '#16a34a', 33: '#ca8a04', 34: '#2563eb', 35: '#9333ea', 36: '#0891b2', 37: '#e5e7eb', 39: 'inherit' }
  let html = ''
  let open = 0
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  for (const part of escaped.split(/(\x1b\[[0-9;]*m)/)) {
    const match = /^\x1b\[([0-9;]*)m$/.exec(part)
    if (!match) { html += part; continue }
    const styles: string[] = []
    for (const code of match[1].split(';').map(Number)) {
      if (code === 1) styles.push('font-weight:bold')
      else if (code === 2) styles.push('opacity:.6')
      else if (code === 3) styles.push('font-style:italic')
      else if (code === 4) styles.push('text-decoration:underline')
      else if (code === 9) styles.push('text-decoration:line-through')
      else if (code >= 30 && code <= 39) styles.push(`color:${colors[code] ?? 'inherit'}`)
      else if (code === 0 || code === 22 || code === 23 || code === 24 || code === 29) { html += '</span>'.repeat(open); open = 0 }
    }
    if (styles.length) { html += `<span style="${styles.join(';')}">`; open += 1 }
  }
  html += '</span>'.repeat(open)
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:12px 16px;background:#0f172a;color:#e2e8f0;font-family:Consolas,Menlo,"D2Coding",monospace;font-size:13px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;}</style></head><body>${html}</body></html>`
}

export async function convert(input: ConvertInput, target: FormatId, options: Partial<WriterOptions> | undefined, env: ConvertEnv = {}): Promise<ConvertOutput> {
  const doc = await readDocument(input)
  return writeDocument(doc, target, options, env)
}
