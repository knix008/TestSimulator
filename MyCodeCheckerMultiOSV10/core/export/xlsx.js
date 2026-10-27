'use strict';

// SpreadsheetML (.xlsx) writer for the export document model.
//
// - A "Summary" sheet (title, meta, key/value cards, verdict badges, paragraphs, lists)
//   when the model has such content (opts.summarySheet === false turns it off).
// - One sheet per table block, named after the nearest heading above it
//   (unique, at most 31 characters, characters Excel rejects removed).
// - Shared strings, bold shaded header row, frozen header pane, auto filter,
//   header row repeated when printing, A4 landscape page setup,
//   column widths estimated from content (East Asian characters count as 2),
//   numeric cells stored as numbers.

const { zip } = require('./zip');
const { x, DECL, w3cdtf } = require('./xml');
const M = require('./model');

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml';
const MAX_CELL = 32767;

const STR = {
  en: { summary: 'Summary', table: 'Table', sheet: 'Sheet', charts: 'Charts' },
  ko: { summary: '요약', table: '표', sheet: '시트', charts: '차트' }, // 요약, 표, 시트
};

function colName(i) {
  let s = '';
  let n = i + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Excel sheet-name rules: no : \ / ? * [ ], not blank, no leading/trailing apostrophe, at most 31 characters, unique (case-insensitive). */
function sheetName(raw, used, fallback) {
  let base = String(raw == null ? '' : raw).replace(/[:\\/?*[\]\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '').trim();
  if (!base || base.toLowerCase() === 'history') base = fallback;
  const cut = (s, n) => {
    if (s.length <= n) return s;
    let t = s.slice(0, n);
    if (/[\ud800-\udbff]$/.test(t)) t = t.slice(0, -1);
    return t.trimEnd();
  };
  let name = cut(base, 31);
  let k = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${k++})`;
    name = cut(base, 31 - suffix.length) + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

function quoteSheet(name) { return `'${name.replace(/'/g, "''")}'`; }

class Styles {
  constructor() {
    this.fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    this.xfs = [];
    this.keys = new Map();
    this.xf('default', '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>');
  }

  fill(argb) {
    const xml = `<fill><patternFill patternType="solid"><fgColor rgb="${argb}"/><bgColor indexed="64"/></patternFill></fill>`;
    let i = this.fills.indexOf(xml);
    if (i < 0) { i = this.fills.length; this.fills.push(xml); }
    return i;
  }

  xf(key, xml) {
    if (!this.keys.has(key)) { this.keys.set(key, this.xfs.length); this.xfs.push(xml); }
    return this.keys.get(key);
  }

  // fonts: 0 normal, 1 bold, 2 title, 3 bold white, 4 muted small
  header() { return this.xf('header', `<xf numFmtId="0" fontId="1" fillId="${this.fill('FFEEF1F5')}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>`); }
  text(wrap) { return this.xf(`text${wrap ? 'w' : ''}`, `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top"${wrap ? ' wrapText="1"' : ''}/></xf>`); }
  number() { return this.xf('number', '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>'); }
  title() { return this.xf('title', '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>'); }
  heading() { return this.xf('heading', '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'); }
  muted(wrap) { return this.xf(`muted${wrap ? 'w' : ''}`, `<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top"${wrap ? ' wrapText="1"' : ''}/></xf>`); }
  plain(wrap) { return this.xf(`plain${wrap ? 'w' : ''}`, `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"${wrap ? ' wrapText="1"' : ''}/></xf>`); }
  key() { return this.xf('key', `<xf numFmtId="0" fontId="1" fillId="${this.fill('FFF4F6F9')}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>`); }
  badge(color) {
    const rgb = `FF${(M.normColor(color) || '#546e7a').slice(1).toUpperCase()}`;
    return this.xf(`badge${rgb}`, `<xf numFmtId="0" fontId="3" fillId="${this.fill(rgb)}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>`);
  }

  toXml() {
    const font = (extra) => `<font>${extra}<sz val="10"/><name val="Malgun Gothic"/><family val="2"/><charset val="129"/></font>`;
    const fonts = [font(''), font('<b/>'), '<font><b/><sz val="14"/><name val="Malgun Gothic"/><family val="2"/><charset val="129"/></font>', `<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Malgun Gothic"/><family val="2"/><charset val="129"/></font>`, '<font><sz val="9"/><color rgb="FF5B6876"/><name val="Malgun Gothic"/><family val="2"/><charset val="129"/></font>'];
    const side = (s) => `<${s} style="thin"><color rgb="FFB0BAC6"/></${s}>`;
    return `${DECL}<styleSheet xmlns="${MAIN}"><fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${this.fills.length}">${this.fills.join('')}</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>${side('left')}${side('right')}${side('top')}${side('bottom')}<diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`;
  }
}

class SharedStrings {
  constructor() { this.map = new Map(); this.list = []; this.count = 0; }
  id(s) {
    this.count++;
    let i = this.map.get(s);
    if (i == null) { i = this.list.length; this.map.set(s, i); this.list.push(s); }
    return i;
  }
  toXml() {
    return `${DECL}<sst xmlns="${MAIN}" count="${this.count}" uniqueCount="${this.list.length}">${this.list.map((s) => `<si><t xml:space="preserve">${x(s)}</t></si>`).join('')}</sst>`;
  }
}

/** A sheet under construction: rows of {v, s} cells. */
class Sheet {
  constructor(name) { this.name = name; this.rows = []; this.widths = []; this.freeze = false; this.filter = null; this.printTitles = false; this.landscape = true; }
  add(cells) { this.rows.push(cells); return this.rows.length; }
  measure(col, text) {
    let w = 0;
    for (const line of String(text).split('\n')) w = Math.max(w, M.displayWidth(line));
    this.widths[col] = Math.max(this.widths[col] || 0, w);
  }

  toXml(sst, selected) {
    const nCols = Math.max(1, ...this.rows.map((r) => r.length));
    const last = `${colName(nCols - 1)}${Math.max(1, this.rows.length)}`;
    const views = this.freeze
      ? `<sheetView workbookViewId="0"${selected ? ' tabSelected="1"' : ''}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>`
      : `<sheetView workbookViewId="0"${selected ? ' tabSelected="1"' : ''}/>`;
    const cols = [];
    for (let c = 0; c < nCols; c++) {
      const dw = this.widths[c] || 0;
      const width = Math.min(60, Math.max(this.minWidth || 8, Math.round((dw * 1.1 + 2.5) * 10) / 10));
      cols.push(`<col min="${c + 1}" max="${c + 1}" width="${width}" customWidth="1"/>`);
    }
    const rowsXml = this.rows.map((r, ri) => {
      const cells = r.map((cell, ci) => {
        if (!cell) return '';
        const ref = `${colName(ci)}${ri + 1}`;
        const s = cell.s ? ` s="${cell.s}"` : '';
        if (cell.n != null) return `<c r="${ref}"${s}><v>${cell.n}</v></c>`;
        if (cell.v == null || cell.v === '') return cell.s ? `<c r="${ref}"${s}/>` : '';
        return `<c r="${ref}"${s} t="s"><v>${sst.id(String(cell.v).slice(0, MAX_CELL))}</v></c>`;
      }).join('');
      const ht = r.height ? ` ht="${r.height}" customHeight="1"` : '';
      return `<row r="${ri + 1}"${ht}>${cells}</row>`;
    }).join('');
    const filter = this.filter ? `<autoFilter ref="${this.filter}"/>` : '';
    return `${DECL}<worksheet xmlns="${MAIN}" xmlns:r="${REL}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${last}"/><sheetViews>${views}</sheetViews><sheetFormatPr defaultRowHeight="16.5"/><cols>${cols.join('')}</cols><sheetData>${rowsXml}</sheetData>${filter}<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="${this.landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  }
}

function cellFor(v, styles, { wrapAuto = true } = {}) {
  const num = M.numericValue(v);
  if (num != null) return { n: num, s: styles.number() };
  const t = M.cellText(v);
  return { v: t, s: styles.text(wrapAuto && t.includes('\n')) };
}

function tableSheet(block, name, styles) {
  const sh = new Sheet(name);
  const n = M.tableWidth(block);
  const hasHead = (block.columns || []).some((c) => c !== '');
  if (hasHead) {
    const row = [];
    for (let c = 0; c < n; c++) { const t = M.cellText(block.columns[c]); row.push({ v: t, s: styles.header() }); sh.measure(c, `${t}  `); }
    sh.add(row);
    sh.freeze = true;
    sh.printTitles = true;
  }
  for (const r of block.rows || []) {
    const row = [];
    for (let c = 0; c < n; c++) {
      const v = r[c] == null ? '' : r[c];
      row.push(cellFor(v, styles));
      sh.measure(c, M.cellText(v));
    }
    sh.add(row);
  }
  if (hasHead) sh.filter = `A1:${colName(n - 1)}${Math.max(1, sh.rows.length)}`;
  return sh;
}

function summarySheet(m, name, styles) {
  const sh = new Sheet(name);
  sh.landscape = false;
  sh.minWidth = 12;
  const two = (a, b, sa, sb) => { sh.add([{ v: a, s: sa }, b == null ? null : { ...(M.numericValue(b) != null ? { n: M.numericValue(b) } : { v: b }), s: sb }]); sh.measure(0, a); if (b != null) sh.measure(1, M.cellText(b)); };
  if (m.title) { sh.add([{ v: m.title, s: styles.title() }]); const r = sh.rows[sh.rows.length - 1]; r.height = 24; }
  if (m.subtitle) sh.add([{ v: m.subtitle, s: styles.muted(false) }]);
  for (const [k, v] of m.meta) two(k, v, styles.muted(false), styles.plain(false));
  for (const b of m.blocks) {
    switch (b.type) {
      case 'h1': case 'h2': case 'h3': sh.add([]); sh.add([{ v: b.text, s: styles.heading() }]); break;
      case 'kv': for (const [k, v] of b.rows) two(k, v, styles.key(), M.numericValue(v) != null ? styles.number() : styles.text(true)); break;
      case 'badge': sh.add([{ v: b.text, s: styles.badge(b.color) }]); sh.measure(0, b.text); break;
      case 'p': sh.add([{ v: b.text, s: b.small ? styles.muted(false) : styles.plain(false) }]); break;
      case 'list': for (const it of b.items) sh.add([{ v: `• ${it}`, s: styles.plain(false) }]); break;
      default: break;
    }
  }
  // Long paragraphs would blow the first column up; cap what measure() saw.
  sh.widths[0] = Math.min(sh.widths[0] || 0, 36);
  sh.widths[1] = Math.min(Math.max(sh.widths[1] || 0, 20), 70);
  return sh;
}

// A sheet of pictures (the report charts), stacked down column B with a drawing part.
function chartSheet(images, name) {
  const XDR = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  let row = 1;
  const anchors = images.map((b, i) => {
    const cx = b.width * 9525;
    const cy = b.height * 9525;
    const at = row;
    row += Math.ceil(b.height / 20) + 2; // default rows are 20 px high
    return `<xdr:oneCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${at}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${i + 2}" name="Picture ${i + 1}" descr="${x(b.alt)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="${REL}" r:embed="rId${i + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
  });
  return {
    name,
    images,
    toXml: () => `${DECL}<worksheet xmlns="${MAIN}" xmlns:r="${REL}"><sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="2.7" customWidth="1"/></cols><sheetData/><pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><drawing r:id="rId1"/></worksheet>`,
    drawingXml: () => `${DECL}<xdr:wsDr xmlns:xdr="${XDR}" xmlns:a="${A}">${anchors.join('')}</xdr:wsDr>`,
  };
}

function hasSummaryContent(m) {
  return m.meta.length > 0 || m.blocks.some((b) => b.type === 'kv' || b.type === 'badge' || b.type === 'p' || b.type === 'list');
}

/**
 * Render a document model to an .xlsx Buffer.
 * @param {object} model see model.js
 * @param {{lang?:'en'|'ko', creator?:string, date?:Date, summarySheet?:boolean}} [opts]
 */
function toXlsx(model, opts = {}) {
  const m = M.normalize(model);
  const lang = M.detectLang(m, opts);
  const tr = STR[lang];
  const styles = new Styles();
  const sst = new SharedStrings();
  const used = new Set();
  const sheets = [];
  const tables = m.blocks.filter((b) => b.type === 'table');
  const withSummary = opts.summarySheet !== false && (hasSummaryContent(m) || !tables.length);
  if (withSummary) sheets.push(summarySheet(m, sheetName(tr.summary, used, tr.summary), styles));
  // Sheet name: table caption, else the heading (or verdict badge) since the previous table,
  // else the document title for the first table, else 'Table N'.
  let heading = '';
  let k = 0;
  for (const b of m.blocks) {
    if (/^h[123]$/.test(b.type)) { heading = b.text; continue; }
    if (b.type === 'badge' && !heading) { heading = b.text; continue; }
    if (b.type === 'image') { heading = ''; continue; }
    if (b.type !== 'table') continue;
    k++;
    sheets.push(tableSheet(b, sheetName(b.caption || heading || (k === 1 ? m.title : ''), used, `${tr.table} ${k}`), styles));
    heading = '';
  }
  const pictures = m.blocks.filter((b) => b.type === 'image');
  if (pictures.length) {
    // Right after the summary sheet (or first).
    const at = withSummary ? 1 : 0;
    sheets.splice(at, 0, chartSheet(pictures, sheetName(tr.charts, used, tr.charts)));
  }
  const defined = [];
  sheets.forEach((sh, i) => {
    if (sh.filter) {
      const [a, b] = sh.filter.split(':');
      const abs = (ref) => ref.replace(/^([A-Z]+)(\d+)$/, '$$$1$$$2');
      defined.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${x(`${quoteSheet(sh.name)}!${abs(a)}:${abs(b)}`)}</definedName>`);
    }
    if (sh.printTitles) defined.push(`<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${x(`${quoteSheet(sh.name)}!$1:$1`)}</definedName>`);
  });
  const sheetXml = sheets.map((sh, i) => sh.toXml(sst, i === 0));
  // Drawing parts of chart sheets: sheet rels -> drawingK.xml -> media.
  const extra = [];
  let drawingNo = 0;
  let mediaNo = 0;
  const drawingTypes = [];
  sheets.forEach((sh, i) => {
    if (!sh.images) return;
    drawingNo++;
    drawingTypes.push(`<Override PartName="/xl/drawings/drawing${drawingNo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
    extra.push({ name: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`, data: `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/drawing" Target="../drawings/drawing${drawingNo}.xml"/></Relationships>` });
    extra.push({ name: `xl/drawings/drawing${drawingNo}.xml`, data: sh.drawingXml() });
    const rels = sh.images.map((b, k) => { mediaNo++; extra.push({ name: `xl/media/image${mediaNo}.png`, data: b.png }); return `<Relationship Id="rId${k + 1}" Type="${REL}/image" Target="../media/image${mediaNo}.png"/>`; });
    extra.push({ name: `xl/drawings/_rels/drawing${drawingNo}.xml.rels`, data: `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>` });
  });
  const workbook = `${DECL}<workbook xmlns="${MAIN}" xmlns:r="${REL}"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map((sh, i) => `<sheet name="${x(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${defined.length ? `<definedNames>${defined.join('')}</definedNames>` : ''}<calcPr calcId="191029"/></workbook>`;
  const n = sheets.length;
  const when = w3cdtf(opts.date);
  const creator = opts.creator || 'MyCodeChecker';
  const files = [
    { name: '[Content_Types].xml', data: `${DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="${CT}.sheet.main+xml"/>${drawingTypes.join('')}${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${CT}.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="${CT}.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="${CT}.sharedStrings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId${n + 2}" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>` },
    ...sheetXml.map((data, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data })),
    ...extra,
    { name: 'xl/styles.xml', data: styles.toXml() },
    { name: 'xl/sharedStrings.xml', data: sst.toXml() },
    { name: 'docProps/core.xml', data: `${DECL}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(m.title)}</dc:title><dc:creator>${x(creator)}</dc:creator><cp:lastModifiedBy>${x(creator)}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${when}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${when}</dcterms:modified></cp:coreProperties>` },
    { name: 'docProps/app.xml', data: `${DECL}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>${x(opts.application || 'MyCodeChecker')}</Application><DocSecurity>0</DocSecurity><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${n}</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="${n}" baseType="lpstr">${sheets.map((s) => `<vt:lpstr>${x(s.name)}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts></Properties>` },
  ];
  return zip(files, { date: opts.date });
}

module.exports = { toXlsx, sheetName, colName, MIME: `${CT}.sheet` };
