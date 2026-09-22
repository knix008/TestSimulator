/**
 * EPUB 3 writer. The document is split into chapters at its top-level
 * headings, each chapter is an XHTML file written by the HTML writer, and
 * the package carries a navigation document so readers show a table of
 * contents.
 */
import JSZip from 'jszip'
import type { Block, Doc } from '../ast'
import { inlinesToText } from '../ast'
import { encodeEntities } from '../htmlParse'
import { htmlBody, metaOf, stylesheet } from './html'
import type { WriterOptions } from '../options'

const esc = encodeEntities

export async function writeEpub(doc: Doc, options: WriterOptions): Promise<Uint8Array> {
  const meta = metaOf(doc, options)
  const title = meta.title || 'Untitled'
  const chapters = splitChapters(doc.blocks)
  const identifier = `urn:uuid:${uuid()}`
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`)
  const css = `${stylesheet({ ...options, htmlStyle: options.htmlStyle === 'none' ? 'minimal' : options.htmlStyle })}\nbody { max-width: none; padding: 1em; }`
  zip.file('EPUB/style.css', css)

  const chapterOptions: WriterOptions = { ...options, standalone: false, toc: false, htmlMath: false }
  const files: { id: string; href: string; title: string }[] = []
  chapters.forEach((chapter, index) => {
    const id = `chapter${index + 1}`
    const href = `${id}.xhtml`
    const body = htmlBody({ meta: {}, blocks: chapter.blocks }, chapterOptions)
    zip.file(`EPUB/${href}`, xhtml(chapter.title || title, body))
    files.push({ id, href, title: chapter.title || (index === 0 ? title : `Chapter ${index + 1}`) })
  })
  if (options.standalone && (meta.title || meta.author)) {
    zip.file('EPUB/titlepage.xhtml', xhtml(title, `<section class="titlepage" style="text-align:center;margin-top:30%"><h1>${esc(title)}</h1>${meta.author ? `<p>${esc(meta.author)}</p>` : ''}${meta.date ? `<p>${esc(meta.date)}</p>` : ''}</section>`))
    files.unshift({ id: 'titlepage', href: 'titlepage.xhtml', title })
  }
  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
${files.filter((file) => file.id !== 'titlepage').map((file) => `<li><a href="${file.href}">${esc(file.title)}</a></li>`).join('\n')}
</ol></nav>
</body>
</html>`
  zip.file('EPUB/nav.xhtml', nav)
  zip.file('EPUB/package.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="en">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${identifier}</dc:identifier>
    <dc:title>${esc(title)}</dc:title>
    <dc:language>${/[가-힣]/.test(title) ? 'ko' : 'en'}</dc:language>
    ${meta.author ? `<dc:creator>${esc(meta.author)}</dc:creator>` : ''}
    ${meta.date ? `<dc:date>${esc(meta.date)}</dc:date>` : ''}
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
${files.map((file) => `    <item id="${file.id}" href="${file.href}" media-type="application/xhtml+xml"/>`).join('\n')}
  </manifest>
  <spine>
${files.map((file) => `    <itemref idref="${file.id}"/>`).join('\n')}
  </spine>
</package>`)
  return zip.generateAsync({ type: 'uint8array', mimeType: 'application/epub+zip' })
}

function xhtml(title: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
${xhtmlClean(body)}
</body>
</html>`
}

/** XHTML wants every void element self-closed and no bare `&`. */
function xhtmlClean(html: string): string {
  return html
    .replace(/<(br|hr|img|input)([^>]*?)(?<!\/)>/g, '<$1$2 />')
    .replace(/&(?![a-zA-Z#][\w]*;)/g, '&amp;')
    .replace(/<input([^>]*?) checked( |\/)/g, '<input$1 checked="checked"$2')
    .replace(/<input([^>]*?) disabled( |\/)/g, '<input$1 disabled="disabled"$2')
}

function splitChapters(blocks: Block[]): { title: string; blocks: Block[] }[] {
  const chapters: { title: string; blocks: Block[] }[] = []
  let current: { title: string; blocks: Block[] } | null = null
  for (const block of blocks) {
    if (block.t === 'header' && block.level === 1) {
      if (current && current.blocks.length) chapters.push(current)
      current = { title: inlinesToText(block.c), blocks: [block] }
      continue
    }
    if (!current) current = { title: '', blocks: [] }
    current.blocks.push(block)
  }
  if (current && current.blocks.length) chapters.push(current)
  if (!chapters.length) chapters.push({ title: '', blocks: [] })
  return chapters
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}
