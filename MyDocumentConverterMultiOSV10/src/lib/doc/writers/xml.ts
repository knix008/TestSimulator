/**
 * Writers for the XML document formats: DocBook 4 and 5, JATS (three
 * flavours), TEI, OPML, FictionBook 2 and InDesign ICML.
 */
import type { Block, Doc, Inline } from '../ast'
import { inlinesToText } from '../ast'
import { applyLineEnding, type WriterOptions } from '../options'
import { sectionize, type Section } from '../sections'
import { escapeXml as esc, metaOf } from './render'
import { writeMarkdown } from './markdown'

type Ctx = { options: WriterOptions; notes: number }

function indentXml(lines: string[]): string {
  return lines.join('\n')
}

/* ----------------------------------------------------------------- DocBook */

export function writeDocBook(doc: Doc, options: WriterOptions, version: 4 | 5 = 5): string {
  const ctx: Ctx = { options, notes: 0 }
  const v5 = version === 5
  const inl = (list: Inline[]): string => list.map((inline) => inline1(inline)).join('')
  const inline1 = (inline: Inline): string => {
    switch (inline.t) {
      case 'str': return esc(inline.text)
      case 'space': return ' '
      case 'softbreak': return '\n'
      case 'linebreak': return v5 ? '<?linebreak?>' : '<sbr/>'
      case 'emph': return `<emphasis>${inl(inline.c)}</emphasis>`
      case 'strong': return `<emphasis role="strong">${inl(inline.c)}</emphasis>`
      case 'strike': return `<emphasis role="strikethrough">${inl(inline.c)}</emphasis>`
      case 'underline': return `<emphasis role="underline">${inl(inline.c)}</emphasis>`
      case 'sup': return `<superscript>${inl(inline.c)}</superscript>`
      case 'sub': return `<subscript>${inl(inline.c)}</subscript>`
      case 'smallcaps': return `<emphasis role="smallcaps">${inl(inline.c)}</emphasis>`
      case 'span': return `<phrase>${inl(inline.c)}</phrase>`
      case 'code': return `<literal>${esc(inline.text)}</literal>`
      case 'math': return inline.display ? `<informalequation><mathphrase>${esc(inline.text)}</mathphrase></informalequation>` : `<inlineequation><mathphrase>${esc(inline.text)}</mathphrase></inlineequation>`
      case 'link': return inline.url.startsWith('#') ? `<link linkend="${esc(inline.url.slice(1))}">${inl(inline.c)}</link>` : v5 ? `<link xlink:href="${esc(inline.url)}">${inl(inline.c)}</link>` : `<ulink url="${esc(inline.url)}">${inl(inline.c)}</ulink>`
      case 'image': return `<inlinemediaobject><imageobject><imagedata fileref="${esc(inline.url)}"/></imageobject>${inline.c.length ? `<textobject><phrase>${inl(inline.c)}</phrase></textobject>` : ''}</inlinemediaobject>`
      case 'raw': return inline.format === 'docbook' ? inline.text : ''
      case 'note': return `<footnote>${blocks(inline.c)}</footnote>`
    }
  }
  const blocks = (list: Block[]): string => list.map(block1).filter(Boolean).join('\n')
  const block1 = (block: Block): string => {
    switch (block.t) {
      case 'para': return `<para>${inl(block.c)}</para>`
      case 'plain': return inl(block.c)
      case 'header': return `<bridgehead>${inl(block.c)}</bridgehead>`
      case 'code': return `<programlisting${block.lang ? ` language="${esc(block.lang)}"` : ''}>${esc(block.text)}</programlisting>`
      case 'quote': return `<blockquote>\n${blocks(block.c)}\n</blockquote>`
      case 'bullet': return `<itemizedlist>\n${block.items.map((item) => `<listitem>\n${blocks(item.map(asPara))}\n</listitem>`).join('\n')}\n</itemizedlist>`
      case 'ordered': return `<orderedlist${block.start !== 1 ? ` startingnumber="${block.start}"` : ''}${block.style && block.style !== 'decimal' ? ` numeration="${block.style === 'lower-alpha' ? 'loweralpha' : block.style === 'upper-alpha' ? 'upperalpha' : block.style === 'lower-roman' ? 'lowerroman' : 'upperroman'}"` : ''}>\n${block.items.map((item) => `<listitem>\n${blocks(item.map(asPara))}\n</listitem>`).join('\n')}\n</orderedlist>`
      case 'deflist': return `<variablelist>\n${block.items.map((item) => `<varlistentry>\n<term>${inl(item.term)}</term>\n<listitem>\n${item.defs.map((def) => blocks(def.map(asPara))).join('\n')}\n</listitem>\n</varlistentry>`).join('\n')}\n</variablelist>`
      case 'hr': return ''
      case 'table': {
        const cols = block.aligns.length
        const row = (cells: Inline[][]) => `<row>\n${cells.map((cell, k) => `<entry${block.aligns[k] !== 'default' ? ` align="${block.aligns[k]}"` : ''}>${inl(cell)}</entry>`).join('\n')}\n</row>`
        const lines = [block.caption.length ? '<table>' : '<informaltable>']
        if (block.caption.length) lines.push(`<title>${inl(block.caption)}</title>`)
        lines.push(`<tgroup cols="${cols}">`)
        for (let k = 0; k < cols; k += 1) lines.push(`<colspec colnum="${k + 1}" colname="col${k + 1}"/>`)
        if (block.header.length) lines.push('<thead>', row(block.header), '</thead>')
        lines.push('<tbody>', ...block.rows.map(row), '</tbody>', '</tgroup>', block.caption.length ? '</table>' : '</informaltable>')
        return lines.join('\n')
      }
      case 'raw': return block.format === 'docbook' ? block.text : ''
      case 'div': {
        const cls = block.attrs?.classes?.[0]
        if (cls && ['note', 'warning', 'tip', 'caution', 'important', 'sidebar', 'abstract'].includes(cls)) return `<${cls}>\n${blocks(block.c)}\n</${cls}>`
        return blocks(block.c)
      }
      case 'linebl': return `<literallayout>${block.lines.map((line) => inl(line)).join('\n')}</literallayout>`
    }
  }
  const asPara = (block: Block): Block => (block.t === 'plain' ? { t: 'para', c: block.c } : block)
  const section = (sec: Section, depth: number): string => {
    const tag = v5 ? 'section' : `sect${Math.min(depth, 5)}`
    const lines: string[] = []
    if (sec.title) {
      lines.push(`<${tag}${sec.id ? ` ${v5 ? 'xml:id' : 'id'}="${esc(sec.id)}"` : ''}>`, `<title>${inl(sec.title)}</title>`)
    }
    if (sec.blocks.length) lines.push(blocks(sec.blocks))
    for (const childSection of sec.children) lines.push(section(childSection, depth + 1))
    if (sec.title) lines.push(`</${tag}>`)
    return lines.join('\n')
  }
  const meta = metaOf(doc, options)
  const body = sectionize(doc.blocks).map((sec) => section(sec, 1)).join('\n')
  if (!options.standalone) return applyLineEnding(`${body}\n`, options)
  const head = v5
    ? ['<?xml version="1.0" encoding="utf-8"?>', '<article xmlns="http://docbook.org/ns/docbook" xmlns:xlink="http://www.w3.org/1999/xlink" version="5.0">', '<info>', `<title>${esc(meta.title)}</title>`, ...(meta.author ? ['<author>', `<personname>${esc(meta.author)}</personname>`, '</author>'] : []), ...(meta.date ? [`<date>${esc(meta.date)}</date>`] : []), '</info>']
    : ['<?xml version="1.0" encoding="utf-8"?>', '<!DOCTYPE article PUBLIC "-//OASIS//DTD DocBook XML V4.5//EN" "http://www.oasis-open.org/docbook/xml/4.5/docbookx.dtd">', '<article>', '<articleinfo>', `<title>${esc(meta.title)}</title>`, ...(meta.author ? ['<author>', `<othername>${esc(meta.author)}</othername>`, '</author>'] : []), ...(meta.date ? [`<date>${esc(meta.date)}</date>`] : []), '</articleinfo>']
  void ctx
  return applyLineEnding(`${indentXml([...head, body, '</article>'])}\n`, options)
}

/* -------------------------------------------------------------------- JATS */

export type JatsFlavor = 'archiving' | 'publishing' | 'articleauthoring'

export function writeJats(doc: Doc, options: WriterOptions, flavor: JatsFlavor = 'archiving'): string {
  let noteCount = 0
  const inl = (list: Inline[]): string => list.map(inline1).join('')
  const inline1 = (inline: Inline): string => {
    switch (inline.t) {
      case 'str': return esc(inline.text)
      case 'space': return ' '
      case 'softbreak': return '\n'
      case 'linebreak': return '<break/>'
      case 'emph': return `<italic>${inl(inline.c)}</italic>`
      case 'strong': return `<bold>${inl(inline.c)}</bold>`
      case 'strike': return `<strike>${inl(inline.c)}</strike>`
      case 'underline': return `<underline>${inl(inline.c)}</underline>`
      case 'sup': return `<sup>${inl(inline.c)}</sup>`
      case 'sub': return `<sub>${inl(inline.c)}</sub>`
      case 'smallcaps': return `<sc>${inl(inline.c)}</sc>`
      case 'span': return `<named-content content-type="span">${inl(inline.c)}</named-content>`
      case 'code': return `<monospace>${esc(inline.text)}</monospace>`
      case 'math': return inline.display ? `<disp-formula><tex-math><![CDATA[${inline.text}]]></tex-math></disp-formula>` : `<inline-formula><tex-math><![CDATA[${inline.text}]]></tex-math></inline-formula>`
      case 'link': return inline.url.startsWith('#') ? `<xref rid="${esc(inline.url.slice(1))}">${inl(inline.c)}</xref>` : `<ext-link ext-link-type="uri" xlink:href="${esc(inline.url)}">${inl(inline.c)}</ext-link>`
      case 'image': return `<inline-graphic mimetype="image" xlink:href="${esc(inline.url)}"/>`
      case 'raw': return inline.format === 'jats' ? inline.text : ''
      case 'note': { noteCount += 1; return `<fn id="fn${noteCount}"><label>${noteCount}</label>${blocks(inline.c)}</fn>` }
    }
  }
  const blocks = (list: Block[]): string => list.map(block1).filter(Boolean).join('\n')
  const block1 = (block: Block): string => {
    switch (block.t) {
      case 'para': return `<p>${inl(block.c)}</p>`
      case 'plain': return `<p>${inl(block.c)}</p>`
      case 'header': return `<sec><title>${inl(block.c)}</title></sec>`
      case 'code': return `<preformat${block.lang ? ` language="${esc(block.lang)}"` : ''}>${esc(block.text)}</preformat>`
      case 'quote': return `<disp-quote>\n${blocks(block.c)}\n</disp-quote>`
      case 'bullet': return `<list list-type="bullet">\n${block.items.map((item) => `<list-item>\n${blocks(item)}\n</list-item>`).join('\n')}\n</list>`
      case 'ordered': return `<list list-type="${block.style === 'lower-alpha' ? 'alpha-lower' : block.style === 'upper-alpha' ? 'alpha-upper' : block.style === 'lower-roman' ? 'roman-lower' : block.style === 'upper-roman' ? 'roman-upper' : 'order'}">\n${block.items.map((item) => `<list-item>\n${blocks(item)}\n</list-item>`).join('\n')}\n</list>`
      case 'deflist': return `<def-list>\n${block.items.map((item) => `<def-item>\n<term>${inl(item.term)}</term>\n<def>\n${item.defs.map(blocks).join('\n')}\n</def>\n</def-item>`).join('\n')}\n</def-list>`
      case 'hr': return ''
      case 'table': {
        const row = (cells: Inline[][], tag: string) => `<tr>${cells.map((cell, k) => `<${tag}${block.aligns[k] !== 'default' ? ` align="${block.aligns[k]}"` : ''}>${inl(cell)}</${tag}>`).join('')}</tr>`
        const lines = ['<table-wrap>']
        if (block.caption.length) lines.push(`<caption><p>${inl(block.caption)}</p></caption>`)
        lines.push('<table>')
        if (block.header.length) lines.push('<thead>', row(block.header, 'th'), '</thead>')
        lines.push('<tbody>', ...block.rows.map((cells) => row(cells, 'td')), '</tbody>', '</table>', '</table-wrap>')
        return lines.join('\n')
      }
      case 'raw': return block.format === 'jats' ? block.text : ''
      case 'div': return block.attrs?.classes?.includes('abstract') ? blocks(block.c) : `<boxed-text>\n${blocks(block.c)}\n</boxed-text>`
      case 'linebl': return `<p>${block.lines.map((line) => inl(line)).join('<break/>')}</p>`
    }
  }
  const section = (sec: Section): string => {
    const lines: string[] = []
    if (sec.title) lines.push(`<sec${sec.id ? ` id="${esc(sec.id)}"` : ''}>`, `<title>${inl(sec.title)}</title>`)
    if (sec.blocks.length) lines.push(blocks(sec.blocks))
    for (const childSection of sec.children) lines.push(section(childSection))
    if (sec.title) lines.push('</sec>')
    return lines.join('\n')
  }
  const meta = metaOf(doc, options)
  const body = sectionize(doc.blocks).map(section).join('\n')
  if (!options.standalone) return applyLineEnding(`${body}\n`, options)
  const dtd = flavor === 'publishing'
    ? '<!DOCTYPE article PUBLIC "-//NLM//DTD JATS (Z39.96) Journal Publishing DTD v1.3 20210610//EN" "https://jats.nlm.nih.gov/publishing/1.3/JATS-journalpublishing1-3.dtd">'
    : flavor === 'articleauthoring'
      ? '<!DOCTYPE article PUBLIC "-//NLM//DTD JATS (Z39.96) Article Authoring DTD v1.3 20210610//EN" "https://jats.nlm.nih.gov/articleauthoring/1.3/JATS-articleauthoring1-3.dtd">'
      : '<!DOCTYPE article PUBLIC "-//NLM//DTD JATS (Z39.96) Journal Archiving and Interchange DTD v1.3 20210610//EN" "https://jats.nlm.nih.gov/archiving/1.3/JATS-archivearticle1-3.dtd">'
  const [year, month, day] = (meta.date.match(/^(\d{4})-?(\d{2})?-?(\d{2})?/) ?? []).slice(1)
  const head = [
    '<?xml version="1.0" encoding="utf-8"?>', dtd,
    `<article xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:mml="http://www.w3.org/1998/Math/MathML" dtd-version="1.3" article-type="other">`,
    '<front>', '<journal-meta><journal-title-group/><issn/></journal-meta>', '<article-meta>',
    `<title-group><article-title>${esc(meta.title)}</article-title></title-group>`,
    ...(meta.author ? ['<contrib-group>', ...meta.author.split(/,\s*|;\s*/).map((name) => `<contrib contrib-type="author"><string-name>${esc(name)}</string-name></contrib>`), '</contrib-group>'] : []),
    ...(year ? [`<pub-date date-type="pub" iso-8601-date="${esc(meta.date)}">${day ? `<day>${day}</day>` : ''}${month ? `<month>${month}</month>` : ''}<year>${year}</year></pub-date>`] : []),
    '</article-meta>', '</front>', '<body>',
  ]
  return applyLineEnding(`${indentXml([...head, body, '</body>', '</article>'])}\n`, options)
}

/* --------------------------------------------------------------------- TEI */

export function writeTei(doc: Doc, options: WriterOptions): string {
  const inl = (list: Inline[]): string => list.map(inline1).join('')
  const inline1 = (inline: Inline): string => {
    switch (inline.t) {
      case 'str': return esc(inline.text)
      case 'space': return ' '
      case 'softbreak': return '\n'
      case 'linebreak': return '<lb/>'
      case 'emph': return `<hi rend="italic">${inl(inline.c)}</hi>`
      case 'strong': return `<hi rend="bold">${inl(inline.c)}</hi>`
      case 'strike': return `<hi rend="strikethrough">${inl(inline.c)}</hi>`
      case 'underline': return `<hi rend="underline">${inl(inline.c)}</hi>`
      case 'sup': return `<hi rend="superscript">${inl(inline.c)}</hi>`
      case 'sub': return `<hi rend="subscript">${inl(inline.c)}</hi>`
      case 'smallcaps': return `<hi rend="smallcaps">${inl(inline.c)}</hi>`
      case 'span': return `<seg>${inl(inline.c)}</seg>`
      case 'code': return `<code>${esc(inline.text)}</code>`
      case 'math': return `<formula notation="TeX">${esc(inline.text)}</formula>`
      case 'link': return `<ref target="${esc(inline.url)}">${inl(inline.c)}</ref>`
      case 'image': return `<figure><graphic url="${esc(inline.url)}"/>${inline.c.length ? `<head>${inl(inline.c)}</head>` : ''}</figure>`
      case 'raw': return inline.format === 'tei' ? inline.text : ''
      case 'note': return `<note place="foot">${blocks(inline.c)}</note>`
    }
  }
  const blocks = (list: Block[]): string => list.map(block1).filter(Boolean).join('\n')
  const block1 = (block: Block): string => {
    switch (block.t) {
      case 'para': return `<p>${inl(block.c)}</p>`
      case 'plain': return `<p>${inl(block.c)}</p>`
      case 'header': return `<head>${inl(block.c)}</head>`
      case 'code': return `<eg${block.lang ? ` rend="${esc(block.lang)}"` : ''}>${esc(block.text)}</eg>`
      case 'quote': return `<quote>\n${blocks(block.c)}\n</quote>`
      case 'bullet': return `<list rend="bulleted">\n${block.items.map((item) => `<item>\n${blocks(item)}\n</item>`).join('\n')}\n</list>`
      case 'ordered': return `<list rend="numbered">\n${block.items.map((item) => `<item>\n${blocks(item)}\n</item>`).join('\n')}\n</list>`
      case 'deflist': return `<list type="gloss">\n${block.items.map((item) => `<label>${inl(item.term)}</label>\n<item>\n${item.defs.map(blocks).join('\n')}\n</item>`).join('\n')}\n</list>`
      case 'hr': return '<milestone unit="undefined" rend="separator"/>'
      case 'table': {
        const row = (cells: Inline[][], role: string) => `<row${role ? ` role="${role}"` : ''}>${cells.map((cell) => `<cell>${inl(cell)}</cell>`).join('')}</row>`
        const lines = ['<table>']
        if (block.caption.length) lines.push(`<head>${inl(block.caption)}</head>`)
        if (block.header.length) lines.push(row(block.header, 'label'))
        lines.push(...block.rows.map((cells) => row(cells, '')), '</table>')
        return lines.join('\n')
      }
      case 'raw': return block.format === 'tei' ? block.text : ''
      case 'div': return `<div type="${esc(block.attrs?.classes?.[0] ?? 'div')}">\n${blocks(block.c)}\n</div>`
      case 'linebl': return `<lg>\n${block.lines.map((line) => `<l>${inl(line)}</l>`).join('\n')}\n</lg>`
    }
  }
  const section = (sec: Section, depth: number): string => {
    const lines: string[] = []
    if (sec.title) lines.push(`<div type="level${depth}"${sec.id ? ` xml:id="${esc(sec.id)}"` : ''}>`, `<head>${inl(sec.title)}</head>`)
    if (sec.blocks.length) lines.push(blocks(sec.blocks))
    for (const childSection of sec.children) lines.push(section(childSection, depth + 1))
    if (sec.title) lines.push('</div>')
    return lines.join('\n')
  }
  const meta = metaOf(doc, options)
  const body = sectionize(doc.blocks).map((sec) => section(sec, 1)).join('\n')
  if (!options.standalone) return applyLineEnding(`${body}\n`, options)
  const head = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<TEI xmlns="http://www.tei-c.org/ns/1.0">',
    '<teiHeader>', '<fileDesc>', '<titleStmt>', `<title>${esc(meta.title)}</title>`, ...(meta.author ? [`<author>${esc(meta.author)}</author>`] : []), '</titleStmt>',
    '<publicationStmt><p>Produced by My Document Converter.</p></publicationStmt>', '<sourceDesc><p>Born digital.</p></sourceDesc>', '</fileDesc>',
    ...(meta.date ? ['<profileDesc>', `<creation><date>${esc(meta.date)}</date></creation>`, '</profileDesc>'] : []),
    '</teiHeader>', '<text>', '<body>',
  ]
  return applyLineEnding(`${indentXml([...head, body, '</body>', '</text>', '</TEI>'])}\n`, options)
}

/* -------------------------------------------------------------------- OPML */

export function writeOpml(doc: Doc, options: WriterOptions): string {
  const meta = metaOf(doc, options)
  const outline = (sec: Section, depth: number): string => {
    const title = sec.title ? inlinesToText(sec.title) : ''
    const note = sec.blocks.length ? writeMarkdown({ meta: {}, blocks: sec.blocks }, { ...options, standalone: false }).trim() : ''
    const pad = '  '.repeat(depth)
    const attrs = ` text="${esc(title)}"${note ? ` _note="${esc(note).replace(/\n/g, '&#10;')}"` : ''}`
    if (!sec.children.length) return `${pad}<outline${attrs}/>`
    return `${pad}<outline${attrs}>\n${sec.children.map((childSection) => outline(childSection, depth + 1)).join('\n')}\n${pad}</outline>`
  }
  const body = sectionize(doc.blocks).map((sec) => outline(sec, 2)).join('\n')
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<opml version="2.0">',
    '  <head>',
    `    <title>${esc(meta.title)}</title>`,
    ...(meta.date ? [`    <dateModified>${esc(meta.date)}</dateModified>`] : []),
    ...(meta.author ? [`    <ownerName>${esc(meta.author)}</ownerName>`] : []),
    '  </head>',
    '  <body>',
    body,
    '  </body>',
    '</opml>',
  ]
  return applyLineEnding(`${lines.join('\n')}\n`, options)
}

/* --------------------------------------------------------------------- FB2 */

export function writeFb2(doc: Doc, options: WriterOptions): string {
  let noteCount = 0
  const notes: string[] = []
  const inl = (list: Inline[]): string => list.map(inline1).join('')
  const inline1 = (inline: Inline): string => {
    switch (inline.t) {
      case 'str': return esc(inline.text)
      case 'space': return ' '
      case 'softbreak': return ' '
      case 'linebreak': return ' '
      case 'emph': return `<emphasis>${inl(inline.c)}</emphasis>`
      case 'strong': return `<strong>${inl(inline.c)}</strong>`
      case 'strike': return `<strikethrough>${inl(inline.c)}</strikethrough>`
      case 'underline': return `<emphasis>${inl(inline.c)}</emphasis>`
      case 'sup': return `<sup>${inl(inline.c)}</sup>`
      case 'sub': return `<sub>${inl(inline.c)}</sub>`
      case 'smallcaps': case 'span': return inl(inline.c)
      case 'code': return `<code>${esc(inline.text)}</code>`
      case 'math': return `<code>${esc(inline.text)}</code>`
      case 'link': return `<a l:href="${esc(inline.url)}">${inl(inline.c)}</a>`
      case 'image': return `<image l:href="${esc(inline.url.startsWith('#') ? inline.url : `#${inline.url}`)}" alt="${esc(inlinesToText(inline.c))}"/>`
      case 'raw': return inline.format === 'fb2' ? inline.text : ''
      case 'note': { noteCount += 1; notes.push(`<section id="note${noteCount}"><title><p>${noteCount}</p></title>${blocks(inline.c)}</section>`); return `<a l:href="#note${noteCount}" type="note">[${noteCount}]</a>` }
    }
  }
  const blocks = (list: Block[]): string => list.map(block1).filter(Boolean).join('\n')
  const block1 = (block: Block): string => {
    switch (block.t) {
      case 'para': case 'plain': return `<p>${inl(block.c)}</p>`
      case 'header': return `<subtitle>${inl(block.c)}</subtitle>`
      case 'code': return block.text.split('\n').map((line) => `<p><code>${esc(line) || ' '}</code></p>`).join('\n')
      case 'quote': return `<cite>\n${blocks(block.c)}\n</cite>`
      case 'bullet': return block.items.map((item) => `<p>• ${item.map((inner) => (inner.t === 'para' || inner.t === 'plain' ? inl(inner.c) : block1(inner).replace(/<\/?p>/g, ''))).join(' ')}</p>`).join('\n')
      case 'ordered': return block.items.map((item, index) => `<p>${block.start + index}. ${item.map((inner) => (inner.t === 'para' || inner.t === 'plain' ? inl(inner.c) : block1(inner).replace(/<\/?p>/g, ''))).join(' ')}</p>`).join('\n')
      case 'deflist': return block.items.map((item) => `<p><strong>${inl(item.term)}</strong> ${item.defs.map((def) => def.map((inner) => (inner.t === 'para' || inner.t === 'plain' ? inl(inner.c) : '')).join(' ')).join(' ')}</p>`).join('\n')
      case 'hr': return '<empty-line/>'
      case 'table': {
        const row = (cells: Inline[][], tag: string) => `<tr>${cells.map((cell) => `<${tag}>${inl(cell)}</${tag}>`).join('')}</tr>`
        return `<table>\n${block.header.length ? `${row(block.header, 'th')}\n` : ''}${block.rows.map((cells) => row(cells, 'td')).join('\n')}\n</table>`
      }
      case 'raw': return block.format === 'fb2' ? block.text : ''
      case 'div': return block.attrs?.classes?.includes('abstract') ? `<annotation>\n${blocks(block.c)}\n</annotation>` : blocks(block.c)
      case 'linebl': return `<poem><stanza>\n${block.lines.map((line) => `<v>${inl(line)}</v>`).join('\n')}\n</stanza></poem>`
    }
  }
  const section = (sec: Section): string => {
    const lines: string[] = ['<section>']
    if (sec.title) lines.push(`<title><p>${inl(sec.title)}</p></title>`)
    if (sec.blocks.length) lines.push(blocks(sec.blocks))
    for (const childSection of sec.children) lines.push(section(childSection))
    lines.push('</section>')
    return lines.join('\n')
  }
  const meta = metaOf(doc, options)
  const body = sectionize(doc.blocks).map(section).join('\n')
  const [first, ...rest] = meta.author.split(' ')
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">',
    '<description>', '<title-info>', '<genre>unrecognised</genre>',
    ...(meta.author ? ['<author>', `<first-name>${esc(first)}</first-name>`, `<last-name>${esc(rest.join(' '))}</last-name>`, '</author>'] : []),
    `<book-title>${esc(meta.title)}</book-title>`,
    ...(meta.date ? [`<date>${esc(meta.date)}</date>`] : []),
    '<lang>en</lang>', '</title-info>',
    '<document-info><program-used>My Document Converter</program-used></document-info>',
    '</description>',
    '<body>', ...(meta.title ? [`<title><p>${esc(meta.title)}</p></title>`] : []), body, '</body>',
  ]
  if (notes.length) lines.push('<body name="notes">', ...notes, '</body>')
  lines.push('</FictionBook>')
  return applyLineEnding(`${lines.join('\n')}\n`, options)
}

/* -------------------------------------------------------------------- ICML */

export function writeIcml(doc: Doc, options: WriterOptions): string {
  const paraStyles = new Set<string>(['Paragraph'])
  const charStyles = new Set<string>()
  const meta = metaOf(doc, options)
  const style = (name: string) => { charStyles.add(name); return name }
  const run = (text: string, styles: string[]): string => {
    const name = styles.length ? styles.map(style).join(' > ') : '$ID/NormalCharacterStyle'
    return `<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/${esc(name)}"><Content>${esc(text)}</Content></CharacterStyleRange>`
  }
  const inl = (list: Inline[], styles: string[] = []): string => list.map((inline) => inline1(inline, styles)).join('')
  const inline1 = (inline: Inline, styles: string[]): string => {
    switch (inline.t) {
      case 'str': return run(inline.text, styles)
      case 'space': case 'softbreak': return run(' ', styles)
      case 'linebreak': return `<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/NormalCharacterStyle"><Content>&#x2028;</Content></CharacterStyleRange>`
      case 'emph': return inl(inline.c, [...styles, 'Italic'])
      case 'strong': return inl(inline.c, [...styles, 'Bold'])
      case 'strike': return inl(inline.c, [...styles, 'Strikeout'])
      case 'underline': return inl(inline.c, [...styles, 'Underline'])
      case 'sup': return inl(inline.c, [...styles, 'Superscript'])
      case 'sub': return inl(inline.c, [...styles, 'Subscript'])
      case 'smallcaps': return inl(inline.c, [...styles, 'SmallCaps'])
      case 'span': return inl(inline.c, styles)
      case 'code': return run(inline.text, [...styles, 'Code'])
      case 'math': return run(inline.text, [...styles, 'Math'])
      case 'link': return `<HyperlinkTextSource Self="htss-${Math.random().toString(36).slice(2, 8)}" Name="${esc(inline.url)}" Hidden="false">${inl(inline.c, [...styles, 'Link'])}</HyperlinkTextSource>`
      case 'image': return run(`[${inlinesToText(inline.c) || 'image'}: ${inline.url}]`, [...styles, 'Italic'])
      case 'raw': return inline.format === 'icml' ? inline.text : ''
      case 'note': return `<Footnote>${blocks(inline.c, 'Footnote')}</Footnote>`
    }
  }
  const para = (content: string, styleName: string) => { paraStyles.add(styleName); return `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/${esc(styleName)}">${content}<Br/></ParagraphStyleRange>` }
  const blocks = (list: Block[], base = 'Paragraph'): string => list.map((block) => block1(block, base)).filter(Boolean).join('\n')
  const block1 = (block: Block, base: string): string => {
    switch (block.t) {
      case 'para': case 'plain': return para(inl(block.c), base)
      case 'header': return para(inl(block.c), `Header${Math.min(block.level, 6)}`)
      case 'code': return block.text.split('\n').map((line) => para(run(line, ['Code']), 'CodeBlock')).join('\n')
      case 'quote': return blocks(block.c, 'Blockquote')
      case 'bullet': return block.items.map((item) => item.map((inner) => (inner.t === 'para' || inner.t === 'plain' ? para(inl(inner.c), 'Bullet') : block1(inner, 'Bullet'))).join('\n')).join('\n')
      case 'ordered': return block.items.map((item) => item.map((inner) => (inner.t === 'para' || inner.t === 'plain' ? para(inl(inner.c), 'NumList') : block1(inner, 'NumList'))).join('\n')).join('\n')
      case 'deflist': return block.items.map((item) => [para(inl(item.term, ['Bold']), 'DefListTerm'), ...item.defs.map((def) => blocks(def, 'DefListDef'))].join('\n')).join('\n')
      case 'hr': return para(run('* * *', []), 'HorizontalRule')
      case 'table': {
        const rows = [...(block.header.length ? [block.header] : []), ...block.rows]
        const cols = block.aligns.length
        const cells = rows.map((cells, rowIndex) => cells.map((cell, colIndex) => `<Cell Name="${colIndex}:${rowIndex}" AppliedCellStyle="CellStyle/$ID/[None]">${para(inl(cell, block.header.length && rowIndex === 0 ? ['Bold'] : []), block.header.length && rowIndex === 0 ? 'TableHeader' : 'TableCell')}</Cell>`).join('')).join('')
        return `<Table Self="table-${Math.random().toString(36).slice(2, 8)}" HeaderRowCount="${block.header.length ? 1 : 0}" BodyRowCount="${block.rows.length}" ColumnCount="${cols}">${Array.from({ length: rows.length }, (_, k) => `<Row Name="${k}"/>`).join('')}${Array.from({ length: cols }, (_, k) => `<Column Name="${k}" SingleColumnWidth="100"/>`).join('')}${cells}</Table>`
      }
      case 'raw': return block.format === 'icml' ? block.text : ''
      case 'div': return blocks(block.c, base)
      case 'linebl': return para(block.lines.map((line) => inl(line)).join('<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/NormalCharacterStyle"><Content>&#x2028;</Content></CharacterStyleRange>'), 'LineBlock')
    }
  }
  const body = [
    ...(options.standalone && meta.title ? [para(run(meta.title, ['Bold']), 'Title')] : []),
    ...(options.standalone && meta.author ? [para(run(meta.author, []), 'Author')] : []),
    blocks(doc.blocks),
  ].join('\n')
  const paraDefs = [...paraStyles].map((name) => `<ParagraphStyle Self="ParagraphStyle/${esc(name)}" Name="${esc(name)}"${name.startsWith('Header') ? ` PointSize="${Math.max(12, 26 - Number(name.slice(6)) * 2)}" FontStyle="Bold"` : name === 'CodeBlock' ? ' AppliedFont="Courier New"' : name === 'Bullet' ? ' BulletsAndNumberingListType="BulletList"' : name === 'NumList' ? ' BulletsAndNumberingListType="NumberedList"' : ''}/>`).join('\n')
  const charDefs = [...charStyles].map((name) => `<CharacterStyle Self="CharacterStyle/${esc(name)}" Name="${esc(name)}"${name.includes('Bold') ? ' FontStyle="Bold"' : ''}${name.includes('Italic') ? ' FontStyle="Italic"' : ''}${name.includes('Code') ? ' AppliedFont="Courier New"' : ''}${name.includes('Underline') || name.includes('Link') ? ' Underline="true"' : ''}${name.includes('Strikeout') ? ' StrikeThru="true"' : ''}${name.includes('Superscript') ? ' Position="Superscript"' : ''}${name.includes('Subscript') ? ' Position="Subscript"' : ''}${name.includes('SmallCaps') ? ' Capitalization="SmallCaps"' : ''}/>`).join('\n')
  const lines = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<?aid style="50" type="snippet" readerVersion="6.0" featureSet="513" product="8.0(370)" ?>',
    '<?aid SnippetType="InCopyInterchange"?>',
    '<Document DOMVersion="8.0" Self="pandoc-doc">',
    '<RootCharacterStyleGroup Self="pandoc-rcsg">', '<CharacterStyle Self="CharacterStyle/$ID/NormalCharacterStyle" Name="$ID/NormalCharacterStyle"/>', charDefs, '</RootCharacterStyleGroup>',
    '<RootParagraphStyleGroup Self="pandoc-rpsg">', '<ParagraphStyle Self="ParagraphStyle/$ID/NormalParagraphStyle" Name="$ID/NormalParagraphStyle"/>', paraDefs, '</RootParagraphStyleGroup>',
    '<Story Self="pandoc-story" AppliedTOCStyle="n" TrackChanges="false" StoryTitle="pandoc" AppliedNamedGrid="n">',
    '<StoryPreference OpticalMarginAlignment="true" OpticalMarginSize="12"/>',
    body,
    '</Story>',
    '</Document>',
  ]
  return applyLineEnding(`${lines.join('\n')}\n`, options)
}
