'use strict';

// WordprocessingML (.docx) writer for the export document model.
// A4 page, 2 cm margins, header with the title, footer with "Page N of M"
// (PAGE / NUMPAGES fields), Heading 1-3 styles (navigation pane / TOC ready),
// a bordered table style with a shaded header row that repeats on every page,
// East Asian font settings so Korean renders in Malgun Gothic.

const { zip } = require('./zip');
const { x, DECL, w3cdtf } = require('./xml');
const M = require('./model');

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const PAGE = { w: 11906, h: 16838, margin: 1134, header: 567, footer: 567 }; // twips, A4
const CONTENT_W = PAGE.w - PAGE.margin * 2;

const FONT_LATIN = 'Segoe UI';
const FONT_EA = '맑은 고딕'; // 맑은 고딕 (Malgun Gothic)

const STR = {
  en: { page: 'Page {n} of {N}' },
  ko: { page: '{N}쪽 중 {n}쪽' }, // {N}쪽 중 {n}쪽
};

function hex(color, dflt) {
  const c = M.normColor(color);
  return (c || dflt || '#000000').slice(1).toUpperCase();
}

/** Runs for a piece of text; newlines become <w:br/>. */
function runs(text, rPr = '') {
  const parts = String(text == null ? '' : text).split('\n');
  const rp = rPr ? `<w:rPr>${rPr}</w:rPr>` : '';
  return parts.map((p, i) => `<w:r>${rp}${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${x(p)}</w:t></w:r>`).join('');
}

function para(text, { style, jc, rPr, keepNext } = {}) {
  const ppr = [style ? `<w:pStyle w:val="${style}"/>` : '', keepNext ? '<w:keepNext/>' : '', jc ? `<w:jc w:val="${jc}"/>` : ''].join('');
  return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${runs(text, rPr)}</w:p>`;
}

function gridWidths(weights) {
  const n = weights.length;
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const min = Math.min(600, Math.floor(CONTENT_W / n));
  const rest = CONTENT_W - min * n;
  const w = weights.map((v) => min + Math.floor((rest * v) / total));
  w[n - 1] += CONTENT_W - w.reduce((a, b) => a + b, 0);
  return w;
}

function cell(text, width, { header, fill, align, bold } = {}) {
  const shd = fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '';
  const jc = align === 'right' ? '<w:jc w:val="right"/>' : align === 'center' ? '<w:jc w:val="center"/>' : '';
  const rPr = header || bold ? '<w:b/><w:bCs/>' : '';
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shd}</w:tcPr><w:p><w:pPr><w:pStyle w:val="TableText"/>${jc}</w:pPr>${runs(text, rPr)}</w:p></w:tc>`;
}

function tableXml(block) {
  const n = M.tableWidth(block);
  const widths = gridWidths(M.columnWeights(block));
  const align = M.columnAlign(block);
  const hasHead = (block.columns || []).some((c) => c !== '');
  const look = `<w:tblLook w:val="${hasHead ? '04A0' : '0480'}" w:firstRow="${hasHead ? 1 : 0}" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/>`;
  let out = `<w:tbl><w:tblPr><w:tblStyle w:val="ReportTable"/><w:tblW w:w="5000" w:type="pct"/><w:tblLayout w:type="fixed"/>${look}</w:tblPr>`;
  out += `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  if (hasHead) {
    out += `<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>${widths.map((w, i) => cell(block.columns[i] || '', w, { header: true, fill: 'EEF1F5', align: align[i] })).join('')}</w:tr>`;
  }
  const rows = block.rows && block.rows.length ? block.rows : [new Array(n).fill('').map((v, i) => (i ? '' : '—'))];
  for (const r of rows) {
    out += `<w:tr><w:trPr><w:cantSplit/></w:trPr>${widths.map((w, i) => cell(M.cellText(r[i]), w, { align: align[i] })).join('')}</w:tr>`;
  }
  out += '</w:tbl>';
  return out + '<w:p><w:pPr><w:pStyle w:val="Spacer"/></w:pPr></w:p>';
}

function kvXml(block) {
  const widths = gridWidths([35, 65]);
  let out = `<w:tbl><w:tblPr><w:tblStyle w:val="ReportTable"/><w:tblW w:w="5000" w:type="pct"/><w:tblLayout w:type="fixed"/><w:tblLook w:val="0080" w:firstRow="0" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>`;
  out += `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  for (const [k, v] of block.rows) {
    out += `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cell(k, widths[0], { fill: 'F4F6F9', bold: true })}${cell(v, widths[1])}</w:tr>`;
  }
  return out + '</w:tbl><w:p><w:pPr><w:pStyle w:val="Spacer"/></w:pPr></w:p>';
}

function bodyXml(m) {
  const out = [];
  if (m.title) out.push(para(m.title, { style: 'Title' }));
  if (m.subtitle) out.push(para(m.subtitle, { style: 'Subtitle' }));
  if (m.meta.length) out.push(`<w:p><w:pPr><w:pStyle w:val="Meta"/></w:pPr>${m.meta.map(([k, v], i) => `${i ? runs('  ·  ') : ''}${k ? runs(`${k}: `) : ''}${runs(v, '<w:b/><w:bCs/>')}`).join('')}</w:p>`);
  const blocks = m.blocks;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    switch (b.type) {
      case 'h1': out.push(para(b.text, { style: 'Heading1' })); break;
      case 'h2': out.push(para(b.text, { style: 'Heading2' })); break;
      case 'h3': out.push(para(b.text, { style: 'Heading3' })); break;
      case 'p': out.push(para(b.text, { style: b.small ? 'Small' : undefined })); break;
      case 'list': for (const it of b.items) out.push(`<w:p><w:pPr><w:pStyle w:val="ListBullet"/></w:pPr>${runs(`•\t${it}`)}</w:p>`); break;
      case 'badge': out.push(`<w:p><w:pPr><w:pStyle w:val="Badge"/></w:pPr>${runs(` ${b.text} `, `<w:b/><w:bCs/><w:color w:val="FFFFFF"/><w:shd w:val="clear" w:color="auto" w:fill="${hex(b.color, '#546e7a')}"/>`)}</w:p>`); break;
      case 'pagebreak': out.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>'); break;
      case 'kv': if (b.rows.length) out.push(kvXml(b)); break;
      case 'table':
        if (b.caption) out.push(para(b.caption, { style: 'Caption', keepNext: true }));
        out.push(tableXml(b));
        break;
      default: break;
    }
  }
  return out.join('');
}

function sectPr() {
  return `<w:sectPr><w:headerReference w:type="default" r:id="rId4"/><w:footerReference w:type="default" r:id="rId5"/><w:pgSz w:w="${PAGE.w}" w:h="${PAGE.h}"/><w:pgMar w:top="${PAGE.margin}" w:right="${PAGE.margin}" w:bottom="${PAGE.margin}" w:left="${PAGE.margin}" w:header="${PAGE.header}" w:footer="${PAGE.footer}" w:gutter="0"/><w:cols w:space="425"/></w:sectPr>`;
}

function rFonts() { return `<w:rFonts w:ascii="${FONT_LATIN}" w:hAnsi="${FONT_LATIN}" w:eastAsia="${FONT_EA}" w:cs="${FONT_LATIN}"/>`; }

function stylesXml(lang) {
  const border = (side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="B0BAC6"/>`;
  const pstyle = (id, name, { basedOn = 'Normal', next, pPr = '', rPr = '', q = true, link } = {}) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="${basedOn}"/>${next ? `<w:next w:val="${next}"/>` : ''}${link ? `<w:link w:val="${link}"/>` : ''}<w:uiPriority w:val="9"/>${q ? '<w:qFormat/>' : ''}${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}</w:style>`;
  return `${DECL}<w:styles xmlns:w="${W_NS}">
<w:docDefaults><w:rPrDefault><w:rPr>${rFonts()}<w:color w:val="1C2530"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="${lang === 'ko' ? 'ko-KR' : 'en-US'}" w:eastAsia="ko-KR" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
${pstyle('Title', 'Title', { next: 'Normal', pPr: '<w:spacing w:after="60"/>', rPr: '<w:b/><w:bCs/><w:sz w:val="40"/><w:szCs w:val="40"/>' })}
${pstyle('Subtitle', 'Subtitle', { next: 'Normal', pPr: '<w:spacing w:after="60"/>', rPr: '<w:color w:val="5B6876"/><w:sz w:val="24"/><w:szCs w:val="24"/>' })}
${pstyle('Heading1', 'heading 1', { next: 'Normal', pPr: '<w:keepNext/><w:keepLines/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/>', rPr: '<w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/>' })}
${pstyle('Heading2', 'heading 2', { next: 'Normal', pPr: '<w:keepNext/><w:keepLines/><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="2" w:color="D3DAE3"/></w:pBdr><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="1"/>', rPr: '<w:b/><w:bCs/><w:sz w:val="26"/><w:szCs w:val="26"/>' })}
${pstyle('Heading3', 'heading 3', { next: 'Normal', pPr: '<w:keepNext/><w:keepLines/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="2"/>', rPr: '<w:b/><w:bCs/><w:sz w:val="22"/><w:szCs w:val="22"/>' })}
${pstyle('Meta', 'Meta', { pPr: '<w:spacing w:after="200"/>', rPr: '<w:color w:val="5B6876"/><w:sz w:val="18"/><w:szCs w:val="18"/>' })}
${pstyle('Small', 'Small', { rPr: '<w:color w:val="5B6876"/><w:sz w:val="16"/><w:szCs w:val="16"/>' })}
${pstyle('Caption', 'caption', { next: 'Normal', pPr: '<w:keepNext/><w:spacing w:before="120" w:after="60"/>', rPr: '<w:b/><w:bCs/><w:sz w:val="18"/><w:szCs w:val="18"/>' })}
${pstyle('Badge', 'Badge', { pPr: '<w:keepNext/><w:spacing w:before="120" w:after="120"/>', rPr: '<w:sz w:val="24"/><w:szCs w:val="24"/>' })}
${pstyle('TableText', 'Table Text', { pPr: '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>', rPr: '<w:sz w:val="17"/><w:szCs w:val="17"/>' })}
${pstyle('Spacer', 'Spacer', { q: false, pPr: '<w:spacing w:after="0" w:line="120" w:lineRule="exact"/>', rPr: '<w:sz w:val="8"/><w:szCs w:val="8"/>' })}
${pstyle('ListBullet', 'List Bullet', { pPr: '<w:tabs><w:tab w:val="left" w:pos="360"/></w:tabs><w:spacing w:after="40"/><w:ind w:left="360" w:hanging="240"/>' })}
${pstyle('Header', 'header', { q: false, pPr: '<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="D3DAE3"/></w:pBdr><w:spacing w:after="0"/><w:jc w:val="right"/>', rPr: '<w:color w:val="5B6876"/><w:sz w:val="16"/><w:szCs w:val="16"/>' })}
${pstyle('Footer', 'footer', { q: false, pPr: '<w:spacing w:after="0"/><w:jc w:val="center"/>', rPr: '<w:color w:val="5B6876"/><w:sz w:val="16"/><w:szCs w:val="16"/>' })}
<w:style w:type="table" w:styleId="ReportTable"><w:name w:val="Report Table"/><w:basedOn w:val="TableNormal"/><w:uiPriority w:val="59"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:tblPr><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblStylePr w:type="firstRow"><w:rPr><w:b/><w:bCs/></w:rPr><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="EEF1F5"/></w:tcPr></w:tblStylePr></w:style>
</w:styles>`;
}

function headerXml(title) {
  return `${DECL}<w:hdr xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr>${runs(title || '')}</w:p></w:hdr>`;
}

function footerXml(lang) {
  const tpl = STR[lang].page;
  const field = (instr) => `<w:fldSimple w:instr=" ${instr} \\* MERGEFORMAT "><w:r><w:t>1</w:t></w:r></w:fldSimple>`;
  const parts = tpl.split(/(\{n\}|\{N\})/).filter(Boolean).map((p) => (p === '{n}' ? field('PAGE') : p === '{N}' ? field('NUMPAGES') : runs(p))).join('');
  return `${DECL}<w:ftr xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr>${parts}</w:p></w:ftr>`;
}

function settingsXml(lang) {
  return `${DECL}<w:settings xmlns:w="${W_NS}"><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat><w:themeFontLang w:val="${lang === 'ko' ? 'ko-KR' : 'en-US'}" w:eastAsia="ko-KR"/></w:settings>`;
}

function fontTableXml() {
  return `${DECL}<w:fonts xmlns:w="${W_NS}">
<w:font w:name="${FONT_LATIN}"><w:panose1 w:val="020B0502040204020203"/><w:charset w:val="00"/><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font>
<w:font w:name="${FONT_EA}"><w:altName w:val="Malgun Gothic"/><w:panose1 w:val="020B0503020000020004"/><w:charset w:val="81"/><w:family w:val="modern"/><w:pitch w:val="variable"/></w:font>
</w:fonts>`;
}

function coreXml(m, opts) {
  const when = w3cdtf(opts.date);
  const creator = opts.creator || 'MyCodeChecker';
  return `${DECL}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(m.title)}</dc:title>${m.subtitle ? `<dc:subject>${x(m.subtitle)}</dc:subject>` : ''}<dc:creator>${x(creator)}</dc:creator><cp:lastModifiedBy>${x(creator)}</cp:lastModifiedBy><dc:language>${opts.langTag}</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">${when}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${when}</dcterms:modified></cp:coreProperties>`;
}

function appXml(opts) {
  return `${DECL}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>${x(opts.application || 'MyCodeChecker')}</Application><DocSecurity>0</DocSecurity></Properties>`;
}

const CT = 'application/vnd.openxmlformats-officedocument.wordprocessingml';

/**
 * Render a document model to a .docx Buffer.
 * @param {object} model see model.js
 * @param {{lang?:'en'|'ko', creator?:string, date?:Date}} [opts]
 */
function toDocx(model, opts = {}) {
  const m = M.normalize(model);
  const lang = M.detectLang(m, opts);
  const o = { ...opts, langTag: lang === 'ko' ? 'ko-KR' : 'en-US' };
  const document = `${DECL}<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:body>${bodyXml(m)}${sectPr()}</w:body></w:document>`;
  const files = [
    { name: '[Content_Types].xml', data: `${DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${CT}.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="${CT}.styles+xml"/><Override PartName="/word/settings.xml" ContentType="${CT}.settings+xml"/><Override PartName="/word/fontTable.xml" ContentType="${CT}.fontTable+xml"/><Override PartName="/word/header1.xml" ContentType="${CT}.header+xml"/><Override PartName="/word/footer1.xml" ContentType="${CT}.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: 'word/document.xml', data: document },
    { name: 'word/_rels/document.xml.rels', data: `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R_NS}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${R_NS}/settings" Target="settings.xml"/><Relationship Id="rId3" Type="${R_NS}/fontTable" Target="fontTable.xml"/><Relationship Id="rId4" Type="${R_NS}/header" Target="header1.xml"/><Relationship Id="rId5" Type="${R_NS}/footer" Target="footer1.xml"/></Relationships>` },
    { name: 'word/styles.xml', data: stylesXml(lang) },
    { name: 'word/settings.xml', data: settingsXml(lang) },
    { name: 'word/fontTable.xml', data: fontTableXml() },
    { name: 'word/header1.xml', data: headerXml(m.title) },
    { name: 'word/footer1.xml', data: footerXml(lang) },
    { name: 'docProps/core.xml', data: coreXml(m, o) },
    { name: 'docProps/app.xml', data: appXml(o) },
  ];
  return zip(files, { date: opts.date });
}

module.exports = { toDocx, MIME: `${CT}.document`, PAGE_TWIPS: PAGE };
