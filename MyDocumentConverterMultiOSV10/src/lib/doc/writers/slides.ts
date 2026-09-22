/**
 * Slide shows: the HTML ones Pandoc writes (reveal.js, Slidy, Slideous, S5,
 * DZSlides) and PowerPoint. The document is cut into slides at the slide
 * level — the highest heading level that is followed by content — and a
 * horizontal rule also starts a new slide, the way Pandoc does it.
 */
import JSZip from 'jszip'
import type { Block, Doc, Inline } from '../ast'
import { inlinesToText } from '../ast'
import { encodeEntities } from '../htmlParse'
import { applyLineEnding, type WriterOptions } from '../options'
import { slideLevel, slidesAt } from '../sections'
import { blocksHtml, inlinesHtml, metaOf } from './html'

const esc = encodeEntities

export type HtmlSlideFormat = 'revealjs' | 'slidy' | 'slideous' | 's5' | 'dzslides'

type Slide = { title: Inline[] | null; id: string; blocks: Block[] }

function slidesOf(doc: Doc): { level: number; slides: Slide[] } {
  const level = slideLevel(doc.blocks)
  return { level, slides: slidesAt(doc.blocks, level) }
}

function slideBody(slide: Slide, level: number, options: WriterOptions, headingTag: 'h1' | 'h2' = 'h2'): string {
  const state = { options: { ...options, standalone: false, htmlSectionDivs: false }, notes: [] as string[], numbers: [] as number[] }
  const parts: string[] = []
  const sectionHeaders = slide.blocks.filter((block): block is Extract<Block, { t: 'header' }> => block.t === 'header' && block.level < level)
  const content = slide.blocks.filter((block) => !(block.t === 'header' && block.level < level))
  if (sectionHeaders.length && !content.length && slide.title) {
    parts.push(`<h1>${inlinesHtml(slide.title, state)}</h1>`)
  } else {
    if (slide.title) parts.push(`<${headingTag}>${inlinesHtml(slide.title, state)}</${headingTag}>`)
    parts.push(blocksHtml(content, state))
  }
  if (state.notes.length) parts.push(`<aside class="notes"><ol>${state.notes.map((note) => `<li>${note}</li>`).join('')}</ol></aside>`)
  return parts.filter(Boolean).join('\n')
}

const SLIDE_CSS = `
html, body { margin: 0; height: 100%; font-family: Georgia, "Malgun Gothic", serif; background: #ffffff; color: #1a1a1a; }
.slide { display: none; padding: 5vh 8vw; box-sizing: border-box; min-height: 100vh; font-size: 1.6em; line-height: 1.4; }
.slide.active { display: block; }
.slide h1 { font-size: 2.2em; text-align: center; margin-top: 30vh; }
.slide h2 { font-size: 1.6em; border-bottom: 2px solid #1a5fb4; padding-bottom: 0.2em; }
.slide pre { font-size: 0.6em; background: #f4f4f4; padding: 0.8em; overflow: auto; }
.slide table { border-collapse: collapse; } .slide th, .slide td { border: 1px solid #999; padding: 0.2em 0.6em; }
.slide img { max-width: 100%; }
.slide-counter { position: fixed; right: 1em; bottom: 0.6em; font-size: 0.8em; color: #888; }
@media print { .slide { display: block; page-break-after: always; } }
`

const SLIDE_JS = `
(function () {
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var counter = document.querySelector('.slide-counter');
  var current = Math.max(0, Math.min(slides.length - 1, parseInt(location.hash.slice(1) || '1', 10) - 1));
  function show(index) {
    current = Math.max(0, Math.min(slides.length - 1, index));
    slides.forEach(function (slide, k) { slide.classList.toggle('active', k === current); });
    if (counter) counter.textContent = (current + 1) + ' / ' + slides.length;
    history.replaceState(null, '', '#' + (current + 1));
  }
  document.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'PageDown' || event.key === 'ArrowDown') { show(current + 1); event.preventDefault(); }
    if (event.key === 'ArrowLeft' || event.key === 'PageUp' || event.key === 'ArrowUp') { show(current - 1); event.preventDefault(); }
    if (event.key === 'Home') show(0);
    if (event.key === 'End') show(slides.length - 1);
  });
  document.addEventListener('click', function (event) { if (!event.target.closest('a')) show(current + 1); });
  show(current);
})();
`

export function writeHtmlSlides(doc: Doc, options: WriterOptions, format: HtmlSlideFormat): string {
  const meta = metaOf(doc, options)
  const { level, slides } = slidesOf(doc)
  const title = esc(meta.title || 'Slides')
  const titleSlide = options.standalone && (meta.title || meta.author)
    ? { title: null, id: 'title-slide', blocks: [] as Block[], html: `<h1 class="title">${esc(meta.title)}</h1>${meta.author ? `<p class="author">${esc(meta.author)}</p>` : ''}${meta.date ? `<p class="date">${esc(meta.date)}</p>` : ''}` }
    : null
  const bodies = slides.map((slide) => ({ id: slide.id, html: slideBody(slide, level, options, format === 'revealjs' ? 'h2' : 'h1') }))
  const all = [...(titleSlide ? [{ id: titleSlide.id, html: titleSlide.html }] : []), ...bodies]
  let body: string
  let head: string
  switch (format) {
    case 'revealjs':
      body = `<div class="reveal">\n<div class="slides">\n${all.map((slide) => `<section${slide.id ? ` id="${esc(slide.id)}"` : ''}>\n${slide.html}\n</section>`).join('\n')}\n</div>\n</div>\n<script src="https://unpkg.com/reveal.js@^5/dist/reveal.js"></script>\n<script>Reveal.initialize({ hash: true, controls: true, progress: true, slideNumber: true, transition: 'slide' });</script>`
      head = `<link rel="stylesheet" href="https://unpkg.com/reveal.js@^5/dist/reset.css">\n<link rel="stylesheet" href="https://unpkg.com/reveal.js@^5/dist/reveal.css">\n<link rel="stylesheet" href="https://unpkg.com/reveal.js@^5/dist/theme/white.css" id="theme">`
      break
    case 'slidy':
      body = all.map((slide) => `<div class="slide"${slide.id ? ` id="${esc(slide.id)}"` : ''}>\n${slide.html}\n</div>`).join('\n')
      head = `<link rel="stylesheet" type="text/css" media="screen, projection, print" href="https://www.w3.org/Talks/Tools/Slidy2/styles/slidy.css" />\n<script src="https://www.w3.org/Talks/Tools/Slidy2/scripts/slidy.js" charset="utf-8" type="text/javascript"></script>`
      break
    case 'dzslides':
      body = `${all.map((slide) => `<section${slide.id ? ` id="${esc(slide.id)}"` : ''} class="slide">\n${slide.html}\n</section>`).join('\n')}\n<div class="slide-counter"></div>\n<script>${SLIDE_JS.replace(/\.slide\b/g, 'section.slide')}</script>`
      head = `<style>${SLIDE_CSS.replace(/\.slide\b/g, 'section.slide')}</style>`
      break
    default:
      // S5 and Slideous: self-contained, with the same small navigation script.
      body = `<div class="layout"><div id="controls"></div><div id="currentSlide"></div><div id="header"></div><div id="footer"><h1>${title}</h1></div></div>\n<div class="presentation">\n${all.map((slide) => `<div class="slide"${slide.id ? ` id="${esc(slide.id)}"` : ''}>\n${slide.html}\n</div>`).join('\n')}\n</div>\n<div class="slide-counter"></div>\n<script>${SLIDE_JS}</script>`
      head = `<meta name="version" content="${format === 's5' ? 'S5 1.1' : 'Slideous'}" />\n<style>${SLIDE_CSS}\n.layout { display: none; }</style>`
  }
  const html = `<!DOCTYPE html>\n<html lang="">\n<head>\n<meta charset="utf-8" />\n<meta name="generator" content="My Document Converter" />\n<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n<title>${title}</title>\n${meta.author ? `<meta name="author" content="${esc(meta.author)}" />\n` : ''}${head}\n${options.htmlMath && /class="math/.test(body) ? '<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js" async></script>\n' : ''}</head>\n<body>\n${body}\n</body>\n</html>\n`
  return applyLineEnding(html, options)
}

/* -------------------------------------------------------------------- PPTX */

function pptxEscape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

type Run = { text: string; bold?: boolean; italic?: boolean; code?: boolean; underline?: boolean; strike?: boolean; sup?: boolean; sub?: boolean; url?: string }
type Para = { runs: Run[]; level: number; bullet: 'none' | 'bullet' | 'number'; code?: boolean; heading?: boolean }

function runsOf(inlines: Inline[], style: Partial<Run> = {}): Run[] {
  const out: Run[] = []
  for (const inline of inlines) {
    switch (inline.t) {
      case 'str': out.push({ ...style, text: inline.text }); break
      case 'space': case 'softbreak': out.push({ ...style, text: ' ' }); break
      case 'linebreak': out.push({ ...style, text: '\n' }); break
      case 'emph': out.push(...runsOf(inline.c, { ...style, italic: true })); break
      case 'strong': out.push(...runsOf(inline.c, { ...style, bold: true })); break
      case 'strike': out.push(...runsOf(inline.c, { ...style, strike: true })); break
      case 'underline': out.push(...runsOf(inline.c, { ...style, underline: true })); break
      case 'sup': out.push(...runsOf(inline.c, { ...style, sup: true })); break
      case 'sub': out.push(...runsOf(inline.c, { ...style, sub: true })); break
      case 'smallcaps': case 'span': out.push(...runsOf(inline.c, style)); break
      case 'code': out.push({ ...style, text: inline.text, code: true }); break
      case 'math': out.push({ ...style, text: inline.text, italic: true }); break
      case 'link': out.push(...runsOf(inline.c, { ...style, url: inline.url })); break
      case 'image': out.push({ ...style, text: `[${inlinesToText(inline.c) || 'image'}: ${inline.url}]`, italic: true }); break
      case 'raw': break
      case 'note': out.push({ ...style, text: ` (${inlinesToText(inline.c.flatMap((block) => (block.t === 'para' || block.t === 'plain' ? block.c : [])))})` }); break
    }
  }
  return out
}

function parasOf(blocks: Block[], level = 0): Para[] {
  const out: Para[] = []
  for (const block of blocks) {
    switch (block.t) {
      case 'para': case 'plain': out.push({ runs: runsOf(block.c), level, bullet: level ? 'bullet' : 'none' }); break
      case 'header': out.push({ runs: runsOf(block.c, { bold: true }), level, bullet: 'none', heading: true }); break
      case 'code': for (const line of block.text.split('\n')) out.push({ runs: [{ text: line || ' ', code: true }], level, bullet: 'none', code: true }); break
      case 'quote': out.push(...parasOf(block.c, level + 1).map((para) => ({ ...para, runs: para.runs.map((run) => ({ ...run, italic: true })) }))); break
      case 'bullet': case 'ordered':
        for (const item of block.items) {
          const first = item[0]
          if (first && (first.t === 'para' || first.t === 'plain')) out.push({ runs: runsOf(first.c), level, bullet: block.t === 'bullet' ? 'bullet' : 'number' })
          out.push(...parasOf(first && (first.t === 'para' || first.t === 'plain') ? item.slice(1) : item, level + 1))
        }
        break
      case 'deflist':
        for (const item of block.items) {
          out.push({ runs: runsOf(item.term, { bold: true }), level, bullet: 'none' })
          for (const def of item.defs) out.push(...parasOf(def, level + 1))
        }
        break
      case 'hr': break
      case 'table': out.push({ runs: [{ text: `[table: ${block.rows.length} rows]`, italic: true }], level, bullet: 'none' }); break
      case 'raw': break
      case 'div': out.push(...parasOf(block.c, level)); break
      case 'linebl': out.push({ runs: block.lines.flatMap((line, index) => [...(index ? [{ text: '\n' }] : []), ...runsOf(line)]), level, bullet: 'none' }); break
    }
  }
  return out
}

function runXml(run: Run, size: number): string {
  const props = [`lang="en-US"`, `sz="${size * 100}"`, run.bold ? 'b="1"' : '', run.italic ? 'i="1"' : '', run.underline ? 'u="sng"' : '', run.strike ? 'strike="sngStrike"' : '', run.sup ? 'baseline="30000"' : '', run.sub ? 'baseline="-25000"' : ''].filter(Boolean).join(' ')
  const font = run.code ? '<a:latin typeface="Consolas"/>' : ''
  const link = run.url ? `<a:hlinkClick r:id="" action="ppaction://hlinkshowjump?jump=nextslide"/>` : ''
  void link
  if (run.text === '\n') return '<a:br/>'
  return `<a:r><a:rPr ${props}>${font}</a:rPr><a:t xml:space="preserve">${pptxEscape(run.text)}</a:t></a:r>`
}

function paraXml(para: Para, size: number): string {
  const bullet = para.bullet === 'bullet' ? '<a:buChar char="•"/>' : para.bullet === 'number' ? '<a:buAutoNum type="arabicPeriod"/>' : '<a:buNone/>'
  const marL = 342900 * (para.level + (para.bullet !== 'none' ? 1 : 0))
  const runs = para.runs.map((run) => runXml(run, para.code ? Math.max(10, size - 6) : para.heading ? size + 4 : size)).join('')
  return `<a:p><a:pPr marL="${marL}" indent="${para.bullet !== 'none' ? -285750 : 0}" lvl="${Math.min(para.level, 8)}">${bullet}</a:pPr>${runs || '<a:endParaRPr lang="en-US"/>'}</a:p>`
}

function tableXml(block: Extract<Block, { t: 'table' }>, index: number): string {
  const cols = block.aligns.length
  const colWidth = Math.floor(8229600 / Math.max(1, cols))
  const rows = [...(block.header.length ? [block.header] : []), ...block.rows]
  const cell = (inlines: Inline[], bold: boolean) => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p>${runsOf(inlines, bold ? { bold: true } : {}).map((run) => runXml(run, 14)).join('') || '<a:endParaRPr lang="en-US"/>'}</a:p></a:txBody><a:tcPr/></a:tc>`
  const rowXml = rows.map((cells, rowIndex) => `<a:tr h="370840">${cells.map((c) => cell(c, Boolean(block.header.length) && rowIndex === 0)).join('')}</a:tr>`).join('')
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${10 + index}" name="Table ${index}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="457200" y="${1600200 + index * 200000}"/><a:ext cx="8229600" cy="${370840 * rows.length}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="${block.header.length ? 1 : 0}" bandRow="1"/><a:tblGrid>${Array.from({ length: cols }, () => `<a:gridCol w="${colWidth}"/>`).join('')}</a:tblGrid>${rowXml}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
}

function slideXml(title: string, paras: Para[], tables: Extract<Block, { t: 'table' }>[], isTitleSlide: boolean, subtitle = ''): string {
  const bodySize = paras.length > 12 ? 14 : paras.length > 8 ? 16 : 20
  const titleShape = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="${isTitleSlide ? 'ctrTitle' : 'title'}"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"${isTitleSlide ? ' sz="4000" b="1"' : ' sz="3200" b="1"'}/><a:t>${pptxEscape(title)}</a:t></a:r></a:p></p:txBody></p:sp>`
  const bodyShape = isTitleSlide
    ? (subtitle ? `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Subtitle 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="subTitle" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="ctr"><a:buNone/></a:pPr><a:r><a:rPr lang="en-US" sz="2400"/><a:t>${pptxEscape(subtitle)}</a:t></a:r></a:p></p:txBody></p:sp>` : '')
    : (paras.length ? `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Content 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras.map((para) => paraXml(para, bodySize)).join('')}</p:txBody></p:sp>` : '')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${titleShape}${bodyShape}${tables.map((table, index) => tableXml(table, index)).join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
}

export async function writePptx(doc: Doc, options: WriterOptions): Promise<Uint8Array> {
  const meta = metaOf(doc, options)
  const { level, slides } = slidesOf(doc)
  const zip = new JSZip()
  const slideFiles: { xml: string; layout: number }[] = []
  if (options.standalone && (meta.title || meta.author)) slideFiles.push({ xml: slideXml(meta.title || ' ', [], [], true, [meta.author, meta.date].filter(Boolean).join(' · ')), layout: 1 })
  for (const slide of slides) {
    const sectionHeaders = slide.blocks.filter((block): block is Extract<Block, { t: 'header' }> => block.t === 'header' && block.level < level)
    const content = slide.blocks.filter((block) => !(block.t === 'header' && block.level < level))
    if (sectionHeaders.length && !content.length) { slideFiles.push({ xml: slideXml(inlinesToText(sectionHeaders[0].c), [], [], true), layout: 1 }); continue }
    const tables = content.filter((block): block is Extract<Block, { t: 'table' }> => block.t === 'table')
    slideFiles.push({ xml: slideXml(slide.title ? inlinesToText(slide.title) : ' ', parasOf(content.filter((block) => block.t !== 'table')), tables, false), layout: 2 })
  }
  if (!slideFiles.length) slideFiles.push({ xml: slideXml(meta.title || ' ', [], [], true), layout: 1 })

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slideLayouts/slideLayout2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${slideFiles.map((_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}</Types>`)
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`)
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${pptxEscape(meta.title)}</dc:title><dc:creator>${pptxEscape(meta.author)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`)
  zip.file('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>My Document Converter</Application><Slides>${slideFiles.length}</Slides></Properties>`)
  zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slideFiles.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${10 + index}"/>`).join('')}</p:sldIdLst><p:sldSz cx="9144000" cy="6858000" type="screen4x3"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr></p:defaultTextStyle></p:presentation>`)
  zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>${slideFiles.map((_, index) => `<Relationship Id="rId${10 + index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join('')}</Relationships>`)
  zip.file('ppt/presProps.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentationPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`)
  zip.file('ppt/viewProps.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:viewPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`)
  zip.file('ppt/tableStyles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`)
  const placeholder = (type: string, idx: string, x: number, y: number, cx: number, cy: number, name: string, id: number) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="${type}"${idx ? ` idx="${idx}"` : ''}/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`
  zip.file('ppt/slideMasters/slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${placeholder('title', '', 457200, 274638, 8229600, 1143000, 'Title Placeholder 1', 2)}${placeholder('body', '1', 457200, 1600200, 8229600, 4525963, 'Text Placeholder 2', 3)}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/><p:sldLayoutId id="2147483650" r:id="rId2"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr algn="l"><a:defRPr sz="3200" b="1"><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr marL="342900" indent="-342900"><a:buChar char="•"/><a:defRPr sz="2000"/></a:lvl1pPr><a:lvl2pPr marL="742950" indent="-285750"><a:buChar char="–"/><a:defRPr sz="1800"/></a:lvl2pPr><a:lvl3pPr marL="1143000" indent="-228600"><a:buChar char="•"/><a:defRPr sz="1600"/></a:lvl3pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`)
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`)
  const layout = (name: string, type: string, shapes: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="${type}" preserve="1"><p:cSld name="${name}"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
  zip.file('ppt/slideLayouts/slideLayout1.xml', layout('Title Slide', 'title', placeholder('ctrTitle', '', 685800, 2130425, 7772400, 1470025, 'Title 1', 2) + placeholder('subTitle', '1', 1371600, 3886200, 6400800, 1752600, 'Subtitle 2', 3)))
  zip.file('ppt/slideLayouts/slideLayout2.xml', layout('Title and Content', 'obj', placeholder('title', '', 457200, 274638, 8229600, 1143000, 'Title 1', 2) + placeholder('body', '1', 457200, 1600200, 8229600, 4525963, 'Content Placeholder 2', 3)))
  for (const index of [1, 2]) zip.file(`ppt/slideLayouts/_rels/slideLayout${index}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`)
  zip.file('ppt/theme/theme1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2><a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4><a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6><a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface="Malgun Gothic"/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface="Malgun Gothic"/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="25400"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="38100"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`)
  slideFiles.forEach((slide, index) => {
    zip.file(`ppt/slides/slide${index + 1}.xml`, slide.xml)
    zip.file(`ppt/slides/_rels/slide${index + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout${slide.layout}.xml"/></Relationships>`)
  })
  return zip.generateAsync({ type: 'uint8array', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
}
