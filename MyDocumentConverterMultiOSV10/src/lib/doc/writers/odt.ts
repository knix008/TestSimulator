/**
 * ODT writer: an OpenDocument text package written directly with JSZip.
 * Styles are declared once in styles.xml and content.xml refers to them, the
 * way LibreOffice writes its own files, so the result opens cleanly there.
 */
import JSZip from 'jszip'
import type { Block, Doc, Inline } from '../ast'
import { inlinesToText } from '../ast'
import { encodeEntities } from '../htmlParse'
import { metaOf } from './html'
import type { WriterOptions } from '../options'

const esc = encodeEntities

type State = { options: WriterOptions; notes: number }

/** The office:text content shared by the package and the flat XML. */
function odtBody(doc: Doc, options: WriterOptions): string[] {
  const state: State = { options, notes: 0 }
  const meta = metaOf(doc, options)
  const body: string[] = []
  if (options.standalone && meta.title) body.push(`<text:p text:style-name="Title">${esc(meta.title)}</text:p>`)
  if (options.standalone && meta.author) body.push(`<text:p text:style-name="Subtitle">${esc(meta.author)}</text:p>`)
  if (options.standalone && meta.date) body.push(`<text:p text:style-name="Subtitle">${esc(meta.date)}</text:p>`)
  if (options.toc) {
    body.push(`<text:table-of-content text:style-name="Sect1" text:name="Table of Contents1"><text:table-of-content-source text:outline-level="${options.tocDepth}"><text:index-title-template text:style-name="Contents_20_Heading">Contents</text:index-title-template></text:table-of-content-source><text:index-body><text:index-title text:style-name="Sect1" text:name="Table of Contents1_Head"><text:p text:style-name="Contents_20_Heading">Contents</text:p></text:index-title>${tocEntries(doc, options.tocDepth)}</text:index-body></text:table-of-content>`)
  }
  body.push(blocksOdt(doc.blocks, state))
  return body
}

/** OpenDocument as one flat XML file (`.fodt`): styles and content in a single document. */
export function writeOpenDocumentFlat(doc: Doc, options: WriterOptions): string {
  const meta = metaOf(doc, options)
  const styles = stylesXml(options)
  const officeStyles = /<office:styles>[\s\S]*?<\/office:styles>/.exec(styles)?.[0] ?? ''
  const fontDecls = /<office:font-face-decls>[\s\S]*?<\/office:font-face-decls>/.exec(styles)?.[0] ?? ''
  const pageLayout = /<style:page-layout[\s\S]*?<\/style:page-layout>/.exec(styles)?.[0] ?? ''
  const master = /<office:master-styles>[\s\S]*?<\/office:master-styles>/.exec(styles)?.[0] ?? ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document ${NAMESPACES} office:version="1.2" office:mimetype="application/vnd.oasis.opendocument.text">
 <office:meta>
  <meta:generator>My Document Converter</meta:generator>
  ${meta.title ? `<dc:title>${esc(meta.title)}</dc:title>` : ''}
  ${meta.author ? `<dc:creator>${esc(meta.author)}</dc:creator>` : ''}
 </office:meta>
 ${fontDecls}
 ${officeStyles}
${automaticStyles(options).replace(' </office:automatic-styles>', `  ${pageLayout}\n </office:automatic-styles>`)}
 ${master}
 <office:body>
  <office:text>
${odtBody(doc, options).join('\n')}
  </office:text>
 </office:body>
</office:document>
`
}

export async function writeOdt(doc: Doc, options: WriterOptions): Promise<Uint8Array> {
  const meta = metaOf(doc, options)
  const body = odtBody(doc, options)
  const zip = new JSZip()
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' })
  zip.file('META-INF/manifest.xml', `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
 <manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.text"/>
 <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
 <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
 <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`)
  zip.file('meta.xml', `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" office:version="1.2">
 <office:meta>
  <meta:generator>My Document Converter</meta:generator>
  ${meta.title ? `<dc:title>${esc(meta.title)}</dc:title>` : ''}
  ${meta.author ? `<dc:creator>${esc(meta.author)}</dc:creator>` : ''}
  <dc:date>${new Date().toISOString()}</dc:date>
 </office:meta>
</office:document-meta>`)
  zip.file('styles.xml', stylesXml(options))
  zip.file('content.xml', `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${NAMESPACES} office:version="1.2">
${automaticStyles(options)}
 <office:body>
  <office:text>
${body.join('\n')}
  </office:text>
 </office:body>
</office:document-content>`)
  const buffer = await zip.generateAsync({ type: 'uint8array', mimeType: 'application/vnd.oasis.opendocument.text' })
  return buffer
}

function automaticStyles(options: WriterOptions): string {
  return ` <office:automatic-styles>
  <style:style style:name="Bold" style:family="text"><style:text-properties fo:font-weight="bold" style:font-weight-asian="bold" style:font-weight-complex="bold"/></style:style>
  <style:style style:name="Italic" style:family="text"><style:text-properties fo:font-style="italic" style:font-style-asian="italic" style:font-style-complex="italic"/></style:style>
  <style:style style:name="Strike" style:family="text"><style:text-properties style:text-line-through-style="solid"/></style:style>
  <style:style style:name="Underline" style:family="text"><style:text-properties style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>
  <style:style style:name="Sup" style:family="text"><style:text-properties style:text-position="super 58%"/></style:style>
  <style:style style:name="Sub" style:family="text"><style:text-properties style:text-position="sub 58%"/></style:style>
  <style:style style:name="SmallCaps" style:family="text"><style:text-properties fo:font-variant="small-caps"/></style:style>
  <style:style style:name="Code" style:family="text"><style:text-properties style:font-name="Mono" fo:font-family="'${esc(options.monoFont || 'Consolas')}'" fo:background-color="#f2f2f2"/></style:style>
  <style:style style:name="Right" style:family="paragraph"><style:paragraph-properties fo:text-align="end"/></style:style>
  <style:style style:name="Center" style:family="paragraph"><style:paragraph-properties fo:text-align="center"/></style:style>
  <style:style style:name="CellHead" style:family="paragraph"><style:text-properties fo:font-weight="bold"/></style:style>
  <style:style style:name="TableCell" style:family="table-cell"><style:table-cell-properties fo:padding="0.08cm" fo:border="0.5pt solid #808080"/></style:style>
  <style:style style:name="TableHeadCell" style:family="table-cell"><style:table-cell-properties fo:padding="0.08cm" fo:border="0.5pt solid #808080" fo:background-color="#e7e6e6"/></style:style>
  <style:style style:name="Rule" style:family="paragraph"><style:paragraph-properties fo:border-bottom="0.5pt solid #999999" fo:margin-bottom="0.3cm"/></style:style>
 </office:automatic-styles>`
}

export const NAMESPACES = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"'

function stylesXml(options: WriterOptions): string {
  const sizes: Record<string, [number, number]> = { A4: [21, 29.7], A3: [29.7, 42], A5: [14.8, 21], Letter: [21.59, 27.94], Legal: [21.59, 35.56], Tabloid: [27.94, 43.18] }
  const [w, h] = sizes[options.pageSize] ?? sizes.A4
  const width = options.landscape ? h : w
  const height = options.landscape ? w : h
  const margin = (options.marginMm / 10).toFixed(2)
  const heading = (level: number, size: number) => `<style:style style:name="Heading_20_${level}" style:display-name="Heading ${level}" style:family="paragraph" style:parent-style-name="Heading" style:default-outline-level="${level}"><style:text-properties fo:font-size="${size}pt" fo:font-weight="bold" style:font-weight-asian="bold" ${level > 3 ? 'fo:font-style="italic"' : ''}/></style:style>`
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles ${NAMESPACES} office:version="1.2">
 <office:font-face-decls>
  <style:font-face style:name="Body" svg:font-family="'${esc(options.bodyFont || 'Liberation Serif')}'"/>
  <style:font-face style:name="Mono" svg:font-family="'${esc(options.monoFont || 'Liberation Mono')}'" style:font-pitch="fixed"/>
 </office:font-face-decls>
 <office:styles>
  <style:default-style style:family="paragraph"><style:paragraph-properties fo:orphans="2" fo:widows="2"/><style:text-properties style:font-name="Body" fo:font-size="${options.bodyFontSize}pt" fo:language="en" fo:country="US"/></style:default-style>
  <style:style style:name="Standard" style:family="paragraph" style:class="text"/>
  <style:style style:name="Text_20_body" style:display-name="Text body" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.25cm" fo:line-height="120%"/></style:style>
  <style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Text_20_body" style:class="text"><style:paragraph-properties fo:margin-top="0.42cm" fo:margin-bottom="0.21cm" fo:keep-with-next="always"/></style:style>
  ${heading(1, 18)}${heading(2, 16)}${heading(3, 14)}${heading(4, 12)}${heading(5, 11)}${heading(6, 11)}
  <style:style style:name="Title" style:family="paragraph" style:parent-style-name="Heading" style:class="chapter"><style:paragraph-properties fo:text-align="center" fo:margin-bottom="0.3cm"/><style:text-properties fo:font-size="26pt" fo:font-weight="bold"/></style:style>
  <style:style style:name="Subtitle" style:family="paragraph" style:parent-style-name="Heading" style:class="chapter"><style:paragraph-properties fo:text-align="center" fo:margin-bottom="0.5cm"/><style:text-properties fo:font-size="13pt"/></style:style>
  <style:style style:name="Preformatted_20_Text" style:display-name="Preformatted Text" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:background-color="#f2f2f2" fo:padding="0.1cm"/><style:text-properties style:font-name="Mono" fo:font-size="${Math.max(8, options.bodyFontSize - 1)}pt"/></style:style>
  <style:style style:name="Quotations" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:margin-left="1cm" fo:margin-right="1cm" fo:margin-bottom="0.25cm" fo:border-left="1.5pt solid #cccccc" fo:padding-left="0.3cm"/><style:text-properties fo:font-style="italic"/></style:style>
  <style:style style:name="List_20_Contents" style:display-name="List Contents" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-bottom="0.1cm"/></style:style>
  <style:style style:name="Caption" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="center" fo:margin-top="0.1cm" fo:margin-bottom="0.3cm"/><style:text-properties fo:font-style="italic" fo:font-size="${Math.max(8, options.bodyFontSize - 1)}pt"/></style:style>
  <style:style style:name="Contents_20_Heading" style:display-name="Contents Heading" style:family="paragraph" style:parent-style-name="Heading"><style:text-properties fo:font-size="16pt" fo:font-weight="bold"/></style:style>
  <style:style style:name="Internet_20_link" style:display-name="Internet link" style:family="text"><style:text-properties fo:color="#000080" style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>
  <text:list-style style:name="Bullets">
   ${[1, 2, 3, 4, 5].map((level) => `<text:list-level-style-bullet text:level="${level}" text:bullet-char="${['•', '◦', '▪', '•', '◦'][level - 1]}"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="${(level * 0.635 + 0.635).toFixed(3)}cm" fo:text-indent="-0.635cm" fo:margin-left="${(level * 0.635 + 0.635).toFixed(3)}cm"/></style:list-level-properties></text:list-level-style-bullet>`).join('')}
  </text:list-style>
  <text:list-style style:name="Numbering">
   ${[1, 2, 3, 4, 5].map((level) => `<text:list-level-style-number text:level="${level}" style:num-format="${level % 3 === 1 ? '1' : level % 3 === 2 ? 'a' : 'i'}" style:num-suffix="."><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="${(level * 0.635 + 0.635).toFixed(3)}cm" fo:text-indent="-0.635cm" fo:margin-left="${(level * 0.635 + 0.635).toFixed(3)}cm"/></style:list-level-properties></text:list-level-style-number>`).join('')}
  </text:list-style>
 </office:styles>
 <office:automatic-styles>
  <style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="${width}cm" fo:page-height="${height}cm" style:print-orientation="${options.landscape ? 'landscape' : 'portrait'}" fo:margin-top="${margin}cm" fo:margin-bottom="${margin}cm" fo:margin-left="${margin}cm" fo:margin-right="${margin}cm"/></style:page-layout>
 </office:automatic-styles>
 <office:master-styles>
  <style:master-page style:name="Standard" style:page-layout-name="pm1"/>
 </office:master-styles>
</office:document-styles>`
}

function tocEntries(doc: Doc, depth: number): string {
  return doc.blocks
    .filter((block): block is Extract<Block, { t: 'header' }> => block.t === 'header' && block.level <= depth)
    .map((block) => `<text:p text:style-name="Contents_20_${block.level}"><text:a xlink:type="simple" xlink:href="#${esc(block.id)}">${esc(inlinesToText(block.c))}</text:a></text:p>`)
    .join('')
}

function blocksOdt(blocks: Block[], state: State): string {
  return blocks.map((block) => blockOdt(block, state)).join('\n')
}

function blockOdt(block: Block, state: State): string {
  switch (block.t) {
    case 'para': return `<text:p text:style-name="Text_20_body">${inlinesOdt(block.c, state)}</text:p>`
    case 'plain': return `<text:p text:style-name="List_20_Contents">${inlinesOdt(block.c, state)}</text:p>`
    case 'header': return `<text:h text:style-name="Heading_20_${Math.min(block.level, 6)}" text:outline-level="${Math.min(block.level, 6)}">${block.id ? `<text:bookmark text:name="${esc(block.id)}"/>` : ''}${inlinesOdt(block.c, state)}</text:h>`
    case 'code': return block.text.split('\n').map((line) => `<text:p text:style-name="Preformatted_20_Text">${preserve(line)}</text:p>`).join('\n')
    case 'quote': return blocksOdt(block.c, state).replace(/text:style-name="Text_20_body"/g, 'text:style-name="Quotations"')
    case 'bullet': return listOdt(block.items, 'Bullets', state, block.tasks)
    case 'ordered': return listOdt(block.items, 'Numbering', state)
    case 'deflist': return block.items.map((item) => `<text:p text:style-name="Text_20_body"><text:span text:style-name="Bold">${inlinesOdt(item.term, state)}</text:span></text:p>${item.defs.map((def) => blocksOdt(def, state).replace(/text:style-name="Text_20_body"/g, 'text:style-name="Quotations"')).join('')}`).join('\n')
    case 'hr': return '<text:p text:style-name="Rule"/>'
    case 'table': {
      const width = block.aligns.length
      const cell = (inlines: Inline[], k: number, head: boolean) => `<table:table-cell table:style-name="${head ? 'TableHeadCell' : 'TableCell'}" office:value-type="string"><text:p text:style-name="${head ? 'CellHead' : block.aligns[k] === 'right' ? 'Right' : block.aligns[k] === 'center' ? 'Center' : 'Standard'}">${inlinesOdt(inlines, state)}</text:p></table:table-cell>`
      const rows: string[] = []
      if (block.header.length) rows.push(`<table:table-header-rows><table:table-row>${block.header.map((c, k) => cell(c, k, true)).join('')}</table:table-row></table:table-header-rows>`)
      rows.push(...block.rows.map((row) => `<table:table-row>${row.map((c, k) => cell(c, k, false)).join('')}</table:table-row>`))
      const caption = block.caption.length ? `<text:p text:style-name="Caption">${inlinesOdt(block.caption, state)}</text:p>` : ''
      return `<table:table table:name="Table${Math.random().toString(36).slice(2, 7)}"><table:table-column table:number-columns-repeated="${width}"/>${rows.join('')}</table:table>${caption}`
    }
    case 'raw': return ''
    case 'div': return blocksOdt(block.c, state)
    case 'linebl': return `<text:p text:style-name="Text_20_body">${block.lines.map((line) => inlinesOdt(line, state)).join('<text:line-break/>')}</text:p>`
  }
}

function listOdt(items: Block[][], style: string, state: State, tasks?: (boolean | null)[]): string {
  const rendered = items.map((item, index) => {
    const task = tasks?.[index]
    const prefix = task === undefined || task === null ? '' : task ? '☒ ' : '☐ '
    const content = item.map((block) => {
      if ((block.t === 'para' || block.t === 'plain') && prefix) return `<text:p text:style-name="List_20_Contents">${prefix}${inlinesOdt(block.c, state)}</text:p>`
      if (block.t === 'para') return `<text:p text:style-name="List_20_Contents">${inlinesOdt(block.c, state)}</text:p>`
      return blockOdt(block, state)
    }).join('')
    return `<text:list-item>${content}</text:list-item>`
  })
  return `<text:list text:style-name="${style}">${rendered.join('')}</text:list>`
}

function preserve(text: string): string {
  return esc(text).replace(/ {2,}/g, (spaces) => ` <text:s text:c="${spaces.length - 1}"/>`).replace(/\t/g, '<text:tab/>')
}

function inlinesOdt(inlines: Inline[], state: State): string {
  return inlines.map((inline) => inlineOdt(inline, state)).join('')
}

function span(style: string, inner: string) {
  return `<text:span text:style-name="${style}">${inner}</text:span>`
}

function inlineOdt(inline: Inline, state: State): string {
  switch (inline.t) {
    case 'str': return preserve(inline.text)
    case 'space': case 'softbreak': return ' '
    case 'linebreak': return '<text:line-break/>'
    case 'emph': return span('Italic', inlinesOdt(inline.c, state))
    case 'strong': return span('Bold', inlinesOdt(inline.c, state))
    case 'strike': return span('Strike', inlinesOdt(inline.c, state))
    case 'underline': return span('Underline', inlinesOdt(inline.c, state))
    case 'sup': return span('Sup', inlinesOdt(inline.c, state))
    case 'sub': return span('Sub', inlinesOdt(inline.c, state))
    case 'smallcaps': return span('SmallCaps', inlinesOdt(inline.c, state))
    case 'span': return inlinesOdt(inline.c, state)
    case 'code': return span('Code', preserve(inline.text))
    case 'math': return span('Italic', esc(inline.text))
    case 'link': return `<text:a xlink:type="simple" xlink:href="${esc(inline.url)}" text:style-name="Internet_20_link">${inlinesOdt(inline.c, state)}</text:a>`
    case 'image': return `<text:span text:style-name="Italic">[${esc(inlinesToText(inline.c) || 'image')}: ${esc(inline.url)}]</text:span>`
    case 'raw': return ''
    case 'note': {
      state.notes += 1
      return `<text:note text:id="ftn${state.notes}" text:note-class="footnote"><text:note-citation>${state.notes}</text:note-citation><text:note-body>${blocksOdt(inline.c, state)}</text:note-body></text:note>`
    }
  }
}
