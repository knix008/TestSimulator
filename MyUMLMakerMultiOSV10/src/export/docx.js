// A minimal Word (.docx, Office Open XML) writer for model documents: styles
// (title, headings 1–3 with outline levels for the table of contents, caption,
// table style), a bullet numbering, a TOC field Word refreshes on opening,
// tables with a repeating header row, PNG pictures, page breaks and a footer
// with the page number. The parts are zipped with the export ZIP writer.
// Pure: diagram pictures come from the caller as PNG bytes.
import { zip } from './files.js';

const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const x = (value) => String(value ?? '').replace(XML_INVALID, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
/** A4 with 2.54 cm margins: text width 9026 twips = 6.27 in. */
const PAGE = { w: 11906, h: 16838, margin: 1440 };
const TEXT_TWIPS = PAGE.w - PAGE.margin * 2;
const EMU_PER_PX = 9525;
const MAX_W = Math.round((TEXT_TWIPS / 1440) * 914400);
const MAX_H = Math.round(8.4 * 914400);

/** Runs of text; line breaks become <w:br/>. */
const runs = (text, rPr = '') => String(text ?? '').split(/\r?\n/).map((line, i) => `${i ? `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:br/></w:r>` : ''}<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${x(line)}</w:t></w:r>`).join('');
const para = (text, style = '', { rPr = '', pPr = '' } = {}) => `<w:p>${style || pPr ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${pPr}</w:pPr>` : ''}${runs(text, rPr)}</w:p>`;
const PAGE_BREAK = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

function tableXml(head, rows) {
  const cols = Math.max(1, head.length);
  // Column widths follow the longest text of each column (bounded), in twips.
  const weight = head.map((hText, c) => Math.min(40, Math.max(4, String(hText ?? '').length, ...rows.map((r) => Math.max(...String(r[c] ?? '').split('\n').map((l) => l.length))))));
  const sum = weight.reduce((a, b) => a + b, 0) || 1;
  const widths = weight.map((w) => Math.round((w / sum) * TEXT_TWIPS));
  const cell = (text, c, header) => `<w:tc><w:tcPr><w:tcW w:w="${widths[c]}" w:type="dxa"/>${header ? '<w:shd w:val="clear" w:color="auto" w:fill="DCE6F2"/>' : ''}</w:tcPr>${para(text, 'TableText', { rPr: header ? '<w:b/>' : '' })}</w:tc>`;
  const row = (cells, header) => `<w:tr>${header ? '<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>'}${Array.from({ length: cols }, (_, c) => cell(cells[c] ?? '', c, header)).join('')}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblStyle w:val="ReportTable"/><w:tblW w:w="${TEXT_TWIPS}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${row(head, true)}${rows.map((r) => row(r, false)).join('')}</w:tbl>${para('', 'TableGap')}`;
}

function imageXml(rid, id, name, width, height) {
  let cx = Math.max(1, Math.round(width * EMU_PER_PX));
  let cy = Math.max(1, Math.round(height * EMU_PER_PX));
  const factor = Math.min(1, MAX_W / cx, MAX_H / cy);
  cx = Math.round(cx * factor);
  cy = Math.round(cy * factor);
  return `<w:p><w:pPr><w:pStyle w:val="Figure"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="${x(name)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="image${id}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function tocXml(block, headings) {
  const begin = '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>';
  const end = '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
  const entries = headings.length ? headings.map((hd) => ({ style: `TOC${hd.level}`, text: hd.text })) : [{ style: 'TOC1', text: block.hint }];
  const body = entries.map((e, i) => `<w:p><w:pPr><w:pStyle w:val="${e.style}"/></w:pPr>${i === 0 ? begin : ''}${runs(e.text)}${i === entries.length - 1 ? end : ''}</w:p>`).join('');
  return `${para(block.title, 'TOCHeading')}${body}${para(block.hint, 'Meta')}${PAGE_BREAK}`;
}

const STYLES = `${HEAD}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Malgun Gothic" w:cs="Calibri"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-US" w:eastAsia="ko-KR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="2400" w:after="200"/></w:pPr><w:rPr><w:b/><w:color w:val="1F3864"/><w:sz w:val="56"/><w:szCs w:val="56"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="600"/></w:pPr><w:rPr><w:color w:val="5F6B7A"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:pageBreakBefore/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="2" w:color="2F6FDE"/></w:pBdr><w:spacing w:before="240" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="1F3864"/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="2F6FDE"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="60"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:color w:val="5F6B7A"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Meta"><w:name w:val="Meta"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="5F6B7A"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="CoverInfo"><w:name w:val="Cover Info"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Figure"><w:name w:val="Figure"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:jc w:val="center"/><w:spacing w:before="120" w:after="40"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="center"/><w:spacing w:after="200"/></w:pPr><w:rPr><w:i/><w:color w:val="5F6B7A"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="200"/></w:pPr><w:rPr><w:b/><w:color w:val="1F3864"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TOC1"><w:name w:val="toc 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${TEXT_TWIPS}"/></w:tabs><w:spacing w:before="80" w:after="40"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TOC2"><w:name w:val="toc 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${TEXT_TWIPS}"/></w:tabs><w:spacing w:after="20"/><w:ind w:left="240"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="20" w:after="20" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="TableGap"><w:name w:val="Table Gap"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60" w:line="120" w:lineRule="exact"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:numPr><w:numId w:val="1"/></w:numPr><w:spacing w:after="20"/><w:ind w:left="720"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/></w:pPr><w:rPr><w:color w:val="5F6B7A"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
<w:style w:type="table" w:styleId="ReportTable"><w:name w:val="Report Table"/><w:basedOn w:val="TableNormal"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="B4BCC8"/><w:left w:val="single" w:sz="4" w:space="0" w:color="B4BCC8"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="B4BCC8"/><w:right w:val="single" w:sz="4" w:space="0" w:color="B4BCC8"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="B4BCC8"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="B4BCC8"/></w:tblBorders></w:tblPr></w:style>
</w:styles>`;

const NUMBERING = `${HEAD}<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
const SETTINGS = `${HEAD}<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:updateFields w:val="true"/><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
const FOOTER = `${HEAD}<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;

/**
 * The report (buildReport) as .docx bytes. image(diagram) → { png: Uint8Array, width, height } (CSS px) or null;
 * a missing picture leaves a note instead.
 */
export function reportDocx(report, { image = null, noPicture = '(no picture)', now = new Date() } = {}) {
  const media = [];
  const headings = report.blocks.filter((b) => b.kind === 'heading' && b.level <= 2);
  const body = [];
  let pictureId = 0;
  for (const b of report.blocks) {
    switch (b.kind) {
      case 'cover':
        body.push(para(b.title, 'Title'), para(b.subtitle, 'Subtitle'), ...b.rows.map(([k, v]) => `<w:p><w:pPr><w:pStyle w:val="CoverInfo"/></w:pPr>${runs(`${k}: `, '<w:b/>')}${runs(v)}</w:p>`), PAGE_BREAK);
        break;
      case 'toc': body.push(tocXml(b, headings)); break;
      case 'heading': {
        // The first chapter after the cover / contents page needs no extra page break.
        const previous = body[body.length - 1];
        const pPr = b.level === 1 && (previous === undefined || String(previous).endsWith(PAGE_BREAK)) ? '<w:pageBreakBefore w:val="0"/>' : '';
        body.push(para(b.text, `Heading${Math.min(3, b.level)}`, { pPr }));
        break;
      }
      case 'paragraph': body.push(para(b.text, b.style === 'meta' ? 'Meta' : '')); break;
      case 'list': body.push(...b.items.map((item) => para(item, 'ListParagraph'))); break;
      case 'table': body.push(tableXml(b.head, b.rows)); break;
      case 'pagebreak': body.push(PAGE_BREAK); break;
      case 'image': {
        let picture = null;
        if (typeof image === 'function') { try { picture = image(b.diagram); } catch { picture = null; } }
        if (picture?.png?.length) {
          pictureId += 1;
          const file = `media/image${pictureId}.png`;
          media.push({ rid: `rIdImg${pictureId}`, file, data: picture.png });
          body.push(imageXml(`rIdImg${pictureId}`, pictureId, b.caption, picture.width, picture.height));
        } else body.push(para(noPicture, 'Meta'));
        body.push(para(b.caption, 'Caption'));
        break;
      }
      default: break;
    }
  }
  const sect = `<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="${PAGE.w}" w:h="${PAGE.h}"/><w:pgMar w:top="${PAGE.margin}" w:right="${PAGE.margin}" w:bottom="${PAGE.margin}" w:left="${PAGE.margin}" w:header="708" w:footer="708" w:gutter="0"/><w:titlePg/></w:sectPr>`;
  const document = `${HEAD}<w:document ${NS}><w:body>${body.join('')}${sect}</w:body></w:document>`;
  const rels = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>${media.map((m) => `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${m.file}"/>`).join('')}</Relationships>`;
  const types = `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  const rootRels = `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
  const stamp = now.toISOString().replace(/\.\d+Z$/, 'Z');
  const core = `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(report.title)}</dc:title><dc:subject>${x(report.subtitle)}</dc:subject><dc:creator>${x(report.meta?.author || 'MyUMLMaker')}</dc:creator><cp:version>${x(report.meta?.version ?? '')}</cp:version><dc:language>${report.language === 'ko' ? 'ko-KR' : 'en-US'}</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified></cp:coreProperties>`;
  const app = `${HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>MyUMLMaker</Application></Properties>`;
  return zip([
    { name: '[Content_Types].xml', data: types },
    { name: '_rels/.rels', data: rootRels },
    { name: 'docProps/core.xml', data: core },
    { name: 'docProps/app.xml', data: app },
    { name: 'word/document.xml', data: document },
    { name: 'word/_rels/document.xml.rels', data: rels },
    { name: 'word/styles.xml', data: STYLES },
    { name: 'word/numbering.xml', data: NUMBERING },
    { name: 'word/settings.xml', data: SETTINGS },
    { name: 'word/footer1.xml', data: FOOTER },
    ...media.map((m) => ({ name: `word/${m.file}`, data: m.data })),
  ], now);
}

/** Reads a stored (uncompressed) ZIP: name → bytes. For tests and checks. */
export function unzipStored(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error('not a zip');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out = new Map();
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error('bad central directory');
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extra = view.getUint16(at + 30, true);
    const comment = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    const localName = view.getUint16(offset + 26, true);
    const localExtra = view.getUint16(offset + 28, true);
    const start = offset + 30 + localName + localExtra;
    out.set(name, bytes.subarray(start, start + size));
    at += 46 + nameLength + extra + comment;
  }
  return out;
}
